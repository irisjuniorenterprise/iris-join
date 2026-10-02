// lib/candidature-excel.ts
//
// Lecture d'un classeur Excel (.xlsx) de candidats fourni par l'admin.
// SERVEUR UNIQUEMENT (dépend d'exceljs) : à appeler depuis une route API.
//
// En-têtes reconnus (peu importe l'ordre, la casse, les accents ou la
// position dans la feuille) :
//
//   Prénom | Nom | CIN | E-mail | Num de téléphone | Date de naissance |
//   Adresse | Niveau d'étude | Nationalité | Département
//
// Le fichier du registre IRIS JE place ces en-têtes en ligne 20, à partir
// de la colonne E, après plusieurs lignes de présentation : la ligne
// d'en-tête est donc DÉTECTÉE (toutes les feuilles, 60 premières lignes)
// au lieu d'être supposée en ligne 1.
//
// Les données sont nettoyées sans jamais bloquer l'import pour un champ
// secondaire : une valeur illisible devient `null` et ajoute un
// avertissement. Seule l'adresse e-mail est indispensable (clé unique
// d'une candidature) : sans e-mail valide, la ligne est écartée et
// listée dans `skipped` avec la raison.

import ExcelJS from 'exceljs';
import { FILIERES, NIVEAUX_ETUDES } from './candidature';
import { normalizeDepartment, type DepartmentKey } from './interview';

/* ------------------------------------------------------------------ */
/* Types                                                                */
/* ------------------------------------------------------------------ */

export type CandidateField =
  | 'prenom'
  | 'nom'
  | 'cin'
  | 'email'
  | 'telephone'
  | 'dateNaissance'
  | 'adresse'
  | 'niveauEtude'
  | 'nationalite'
  | 'departement';

export type Filiere = (typeof FILIERES)[number];
export type NiveauEtudes = (typeof NIVEAUX_ETUDES)[number];

export type ImportedCandidate = {
  /** Numéro de la ligne dans la feuille Excel (pour retrouver la source). */
  excelRow: number;
  prenom: string;
  nom: string;
  /** « Prénom Nom » — même format que le champ `nomPrenom` du formulaire. */
  nomPrenom: string;
  cin: string | null;
  email: string;
  /** 8 chiffres, sans indicatif. */
  telephone: string | null;
  /** Format ISO « AAAA-MM-JJ ». */
  dateNaissance: string | null;
  adresse: string | null;
  /** Filière extraite de « Niveau d'étude » (ex. « GB2 » → « GB »). */
  filiere: Filiere | null;
  /** Année extraite de « Niveau d'étude » (ex. « GB2 » → « 2e année »). */
  niveauEtudes: NiveauEtudes | null;
  /** Valeur d'origine de la colonne « Niveau d'étude ». */
  niveauEtudeBrut: string | null;
  nationalite: string | null;
  /** Clé canonique du département (« it », « etudes », « dev-co »…). */
  departement: DepartmentKey | null;
  /** Problèmes non bloquants (donnée manquante, corrigée ou illisible). */
  warnings: string[];
};

export type SkippedRow = {
  excelRow: number;
  reason: string;
  prenom: string;
  nom: string;
  email: string;
};

export type ParseResult = {
  sheetName: string;
  /** Numéro (1-based) de la ligne d'en-tête détectée. */
  headerRow: number;
  /** Numéro (1-based) de colonne de chaque champ, null si absent du fichier. */
  columns: Record<CandidateField, number | null>;
  rows: ImportedCandidate[];
  skipped: SkippedRow[];
  /** Lignes non vides lues sous l'en-tête (= rows + skipped). */
  totalRead: number;
};

/** Erreur « métier » : le message est destiné à être affiché à l'admin. */
export class ExcelImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExcelImportError';
  }
}

/* ------------------------------------------------------------------ */
/* Constantes                                                           */
/* ------------------------------------------------------------------ */

export const EXPECTED_HEADERS = [
  'Prénom',
  'Nom',
  'CIN',
  'E-mail',
  'Num de téléphone',
  'Date de naissance',
  'Adresse',
  "Niveau d'étude",
  'Nationalité',
  'Département',
] as const;

/** Nombre maximum de lignes de candidats lues par défaut (garde-fou). */
export const MAX_IMPORT_ROWS = 2000;

export type ParseOptions = {
  /** Plafond de lignes de candidats lues (défaut : MAX_IMPORT_ROWS). */
  maxRows?: number;
};

/** Zone où l'on cherche la ligne d'en-tête. */
const HEADER_SCAN_ROWS = 60;
const HEADER_SCAN_COLS = 40;

/** Variantes acceptées pour chaque en-tête, sous forme normalisée (voir `norm`). */
const HEADER_ALIASES: Record<CandidateField, string[]> = {
  prenom: ['prenom', 'prenoms', 'firstname'],
  nom: ['nom', 'nomdefamille', 'lastname'],
  cin: ['cin', 'numcin', 'cartedidentite', 'numerocin'],
  email: ['email', 'mail', 'courriel', 'adresseemail', 'adressemail'],
  telephone: [
    'numdetelephone',
    'numerodetelephone',
    'telephone',
    'tel',
    'numtel',
    'numtelephone',
    'gsm',
    'mobile',
  ],
  dateNaissance: ['datedenaissance', 'datenaissance', 'naissance', 'ddn'],
  adresse: ['adresse', 'ville', 'adresseville'],
  niveauEtude: ['niveaudetude', 'niveaudetudes', 'niveauetude', 'niveau', 'classe'],
  nationalite: ['nationalite'],
  departement: ['departement', 'departements', 'dept', 'departementsouhaite'],
};

const FIELDS = Object.keys(HEADER_ALIASES) as CandidateField[];

/** Un en-tête est retenu s'il contient au moins ces champs. */
const REQUIRED_FIELDS: CandidateField[] = ['email', 'prenom', 'nom'];

/* ------------------------------------------------------------------ */
/* Utilitaires de texte                                                 */
/* ------------------------------------------------------------------ */

/** « Num de téléphone » → « numdetelephone » (sans accents, espaces ni ponctuation). */
function norm(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Valeurs qui signifient « pas de donnée » dans les registres papier/Excel. */
function isPlaceholder(value: string): boolean {
  return /^[-–—_./\s]*$/.test(value) || /^(n\/?a|null|aucun|neant|néant)$/i.test(value);
}

/**
 * Convertit n'importe quelle valeur de cellule ExcelJS en texte brut :
 * texte, nombre, date, texte enrichi, lien hypertexte (cas fréquent des
 * e-mails), formule (on garde le résultat).
 */
function cellText(value: ExcelJS.CellValue | undefined): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    const v = value as unknown as Record<string, unknown>;
    if (Array.isArray(v.richText)) {
      return (v.richText as { text?: string }[]).map((part) => part.text ?? '').join('');
    }
    if (typeof v.text === 'string') return v.text; // lien hypertexte
    if ('result' in v) return cellText(v.result as ExcelJS.CellValue);
    if (typeof v.hyperlink === 'string') return v.hyperlink.replace(/^mailto:/i, '');
  }
  return '';
}

function clean(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** « mohamed amine » / « HENI » → « Mohamed Amine » / « Heni » (tirets et apostrophes gérés). */
function titleCase(value: string): string {
  return value
    .toLocaleLowerCase('fr')
    .replace(/(^|[\s\-'’])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toLocaleUpperCase('fr'));
}

/* ------------------------------------------------------------------ */
/* Nettoyage champ par champ                                            */
/* ------------------------------------------------------------------ */

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/i;

/** Fautes de frappe fréquentes sur les domaines courants. */
const DOMAIN_FIXES: Record<string, string> = {
  'gmai.com': 'gmail.com',
  'gmial.com': 'gmail.com',
  'gamil.com': 'gmail.com',
  'gmail.con': 'gmail.com',
  'gmail.cm': 'gmail.com',
  'gmail.co': 'gmail.com',
  'gmil.com': 'gmail.com',
  'hotmail.con': 'hotmail.com',
  'hotmai.com': 'hotmail.com',
  'yahoo.con': 'yahoo.com',
  'outlok.com': 'outlook.com',
  'enis.com': 'enis.tn',
};

function cleanEmail(raw: string): { email: string | null; warning?: string } {
  const original = clean(raw);
  if (!original || isPlaceholder(original)) return { email: null };

  // Espaces parasites, virgule à la place du point (« gmail,com »), casse.
  let email = original.replace(/\s+/g, '').replace(/,/g, '.').replace(/\.{2,}/g, '.').toLowerCase();
  email = email.replace(/^mailto:/, '').replace(/[.;]+$/, '');

  const at = email.lastIndexOf('@');
  if (at > 0) {
    const domain = email.slice(at + 1);
    const fixed = DOMAIN_FIXES[domain];
    if (fixed) email = `${email.slice(0, at + 1)}${fixed}`;
  }

  if (!EMAIL_RE.test(email)) return { email: null };
  // Espaces ou majuscules seuls : correction silencieuse (aucun avertissement).
  return email === original.replace(/\s+/g, '').toLowerCase()
    ? { email }
    : { email, warning: `E-mail corrigé (« ${original} » → « ${email} »)` };
}

function cleanPhone(raw: string): { value: string | null; warning?: string } {
  const original = clean(raw);
  if (!original || isPlaceholder(original)) return { value: null, warning: 'Téléphone manquant' };

  // Excel stocke souvent les numéros en nombre (« 23856567.0 »).
  const asNumber = /^\d+\.0+$/.test(original) ? original.replace(/\.0+$/, '') : original;
  let digits = asNumber.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('216')) digits = digits.slice(3);
  if (digits.length === 13 && digits.startsWith('00216')) digits = digits.slice(5);

  if (/^[0-9]{8}$/.test(digits)) return { value: digits };
  return { value: null, warning: `Téléphone invalide (« ${original} »)` };
}

function cleanCin(raw: string): { value: string | null; warning?: string } {
  const original = clean(raw);
  if (!original || isPlaceholder(original)) return { value: null, warning: 'CIN manquant' };

  const asNumber = /^\d+\.0+$/.test(original) ? original.replace(/\.0+$/, '') : original;
  const digits = asNumber.replace(/\D/g, '');
  if (/^[0-9]{8}$/.test(digits)) return { value: digits };
  // Un zéro de tête perdu par Excel (CIN stocké en nombre) : 7 chiffres → on le restitue.
  if (/^[0-9]{7}$/.test(digits)) {
    return { value: digits.padStart(8, '0'), warning: 'CIN complété avec un zéro initial (7 chiffres dans le fichier)' };
  }
  return { value: null, warning: `CIN invalide (« ${original} »)` };
}

const MIN_BIRTH_YEAR = 1960;
const MAX_BIRTH_YEAR = 2015;

function isoDate(year: number, month: number, day: number): string | null {
  if (year < MIN_BIRTH_YEAR || year > MAX_BIRTH_YEAR) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    return null;
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function cleanBirthDate(value: ExcelJS.CellValue | undefined): { value: string | null; warning?: string } {
  if (value === null || value === undefined || value === '') {
    return { value: null, warning: 'Date de naissance manquante' };
  }

  // Cellule au format date : ExcelJS renvoie un Date à minuit UTC.
  if (value instanceof Date) {
    const iso = isoDate(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
    return iso ? { value: iso } : { value: null, warning: 'Date de naissance invraisemblable' };
  }

  const text = clean(cellText(value));
  if (!text || isPlaceholder(text)) return { value: null, warning: 'Date de naissance manquante' };

  // « 2005-03-18 » ou « 2005-03-18T00:00:00.000Z »
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text);
  if (m) {
    const iso = isoDate(+m[1], +m[2], +m[3]);
    if (iso) return { value: iso };
  }

  // « 18/03/2005 », « 18-03-2005 », « 18.03.2005 » (jour d'abord)
  m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(text);
  if (m) {
    const iso = isoDate(+m[3], +m[2], +m[1]);
    if (iso) return { value: iso };
  }

  // Saisie sans séparateurs, lue comme un nombre par Excel : « 4012006 » = 4/01/2006.
  const digits = text.replace(/\.0+$/, '');
  m = /^(\d{1,2})(\d{2})(\d{4})$/.exec(digits);
  if (m) {
    const iso = isoDate(+m[3], +m[2], +m[1]);
    if (iso) {
      return { value: iso, warning: `Date de naissance reconstituée (« ${digits} » → ${iso.split('-').reverse().join('/')})` };
    }
  }

  return { value: null, warning: `Date de naissance illisible (« ${text} »)` };
}

/** « GB2 », « ge2 », « GMMI1 », « gg1 » → filière + année. */
function cleanLevel(raw: string): {
  filiere: Filiere | null;
  niveauEtudes: NiveauEtudes | null;
  brut: string | null;
  warning?: string;
} {
  const original = clean(raw);
  if (!original || isPlaceholder(original)) {
    return { filiere: null, niveauEtudes: null, brut: null, warning: "Niveau d'étude manquant" };
  }

  const m = /^([a-z]{1,5})\s*[-_ ]?\s*([0-9])?$/i.exec(original);
  const code = m ? m[1].toUpperCase() : '';
  const filiere = (FILIERES as readonly string[]).includes(code) ? (code as Filiere) : null;
  const year = m && m[2] ? Number(m[2]) : null;
  const niveauEtudes = year && year >= 1 && year <= NIVEAUX_ETUDES.length ? NIVEAUX_ETUDES[year - 1] : null;

  const problems: string[] = [];
  if (!filiere) problems.push('filière non reconnue');
  if (!niveauEtudes) problems.push('année non précisée');
  return {
    filiere,
    niveauEtudes,
    brut: original,
    warning: problems.length ? `Niveau d'étude « ${original} » : ${problems.join(', ')}` : undefined,
  };
}

function cleanDepartment(raw: string): { value: DepartmentKey | null; warning?: string } {
  const original = clean(raw);
  if (!original || isPlaceholder(original)) return { value: null, warning: 'Département manquant' };

  // « ÉTUDE » (singulier) n'est pas dans les alias du portail → essai avec un « s ».
  const key = normalizeDepartment(original) ?? normalizeDepartment(`${original}s`);
  return key ? { value: key } : { value: null, warning: `Département inconnu (« ${original} »)` };
}

function cleanFree(raw: string, format: 'title' | 'first-upper' = 'first-upper'): string | null {
  const text = clean(raw);
  if (!text || isPlaceholder(text)) return null;
  if (format === 'title') return titleCase(text);
  return text.charAt(0).toLocaleUpperCase('fr') + text.slice(1);
}

/* ------------------------------------------------------------------ */
/* Détection de l'en-tête                                               */
/* ------------------------------------------------------------------ */

type HeaderMatch = {
  row: number;
  columns: Record<CandidateField, number | null>;
  matched: number;
};

function findHeader(sheet: ExcelJS.Worksheet): HeaderMatch | null {
  const lastRow = Math.min(sheet.rowCount, HEADER_SCAN_ROWS);
  let best: HeaderMatch | null = null;

  for (let r = 1; r <= lastRow; r++) {
    const row = sheet.getRow(r);
    const columns = Object.fromEntries(FIELDS.map((f) => [f, null])) as Record<CandidateField, number | null>;
    let matched = 0;

    for (let c = 1; c <= HEADER_SCAN_COLS; c++) {
      const label = norm(cellText(row.getCell(c).value));
      if (!label) continue;
      const field = FIELDS.find((f) => columns[f] === null && HEADER_ALIASES[f].includes(label));
      if (field) {
        columns[field] = c;
        matched++;
      }
    }

    if (REQUIRED_FIELDS.every((f) => columns[f] !== null) && (!best || matched > best.matched)) {
      best = { row: r, columns, matched };
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* Point d'entrée                                                       */
/* ------------------------------------------------------------------ */

/** Charge un .xlsx puis extrait les candidats (voir `extractCandidates`). */
export async function parseCandidatesWorkbook(
  input: ArrayBuffer | Uint8Array,
  options: ParseOptions = {},
): Promise<ParseResult> {
  const workbook = new ExcelJS.Workbook();
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input as ArrayBuffer);

  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new ExcelImportError('Fichier illisible : envoyez un classeur Excel au format .xlsx.');
  }

  return extractCandidates(workbook, options);
}

/**
 * Extrait les candidats d'un classeur DÉJÀ chargé (évite de relire le
 * fichier quand l'appelant l'a ouvert pour détecter son format).
 */
export function extractCandidates(workbook: ExcelJS.Workbook, options: ParseOptions = {}): ParseResult {
  const maxRows = options.maxRows ?? MAX_IMPORT_ROWS;

  // Première feuille contenant les en-têtes attendus (la feuille d'instructions
  // du registre est ignorée d'office : elle n'a pas ces colonnes).
  let found: { sheet: ExcelJS.Worksheet; header: HeaderMatch } | null = null;
  for (const sheet of workbook.worksheets) {
    const header = findHeader(sheet);
    if (header && (!found || header.matched > found.header.matched)) found = { sheet, header };
  }

  if (!found) {
    throw new ExcelImportError(
      `En-têtes introuvables. Le fichier doit contenir au minimum les colonnes « Prénom », « Nom » et « E-mail » ` +
        `(colonnes complètes attendues : ${EXPECTED_HEADERS.join(', ')}).`,
    );
  }

  const { sheet, header } = found;
  const col = header.columns;
  const rows: ImportedCandidate[] = [];
  const skipped: SkippedRow[] = [];
  const seenEmails = new Set<string>();
  let totalRead = 0;

  const get = (row: ExcelJS.Row, field: CandidateField): ExcelJS.CellValue | undefined =>
    col[field] ? row.getCell(col[field] as number).value : undefined;
  const text = (row: ExcelJS.Row, field: CandidateField): string => cellText(get(row, field));

  for (let r = header.row + 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const raw = Object.fromEntries(FIELDS.map((f) => [f, clean(text(row, f))])) as Record<CandidateField, string>;
    // Ligne entièrement vide (ou ne contenant que des tirets) : ignorée silencieusement.
    if (FIELDS.every((f) => !raw[f] || isPlaceholder(raw[f]))) continue;

    totalRead++;
    if (totalRead > maxRows) {
      throw new ExcelImportError(`Trop de lignes : ${maxRows} candidatures maximum par import.`);
    }

    const prenom = cleanFree(raw.prenom, 'title') ?? '';
    const nom = cleanFree(raw.nom, 'title') ?? '';
    const skip = (reason: string) =>
      skipped.push({ excelRow: r, reason, prenom, nom, email: raw.email });

    const mail = cleanEmail(raw.email);
    if (!mail.email) {
      skip(raw.email && !isPlaceholder(raw.email) ? `E-mail invalide (« ${raw.email} »)` : 'E-mail manquant');
      continue;
    }
    if (seenEmails.has(mail.email)) {
      skip('Doublon dans le fichier (même e-mail)');
      continue;
    }
    if (!prenom && !nom) {
      skip('Prénom et nom manquants');
      continue;
    }
    seenEmails.add(mail.email);

    const warnings: string[] = [];
    const push = (w?: string) => {
      if (w) warnings.push(w);
    };

    push(mail.warning);
    if (!prenom) push('Prénom manquant');
    if (!nom) push('Nom manquant');

    const phone = cleanPhone(raw.telephone);
    const cin = cleanCin(raw.cin);
    const birth = cleanBirthDate(get(row, 'dateNaissance'));
    const level = cleanLevel(raw.niveauEtude);
    const dept = cleanDepartment(raw.departement);
    [phone.warning, cin.warning, birth.warning, level.warning, dept.warning].forEach(push);

    rows.push({
      excelRow: r,
      prenom,
      nom,
      nomPrenom: [prenom, nom].filter(Boolean).join(' '),
      cin: cin.value,
      email: mail.email,
      telephone: phone.value,
      dateNaissance: birth.value,
      adresse: cleanFree(raw.adresse, 'title'),
      filiere: level.filiere,
      niveauEtudes: level.niveauEtudes,
      niveauEtudeBrut: level.brut,
      nationalite: cleanFree(raw.nationalite, 'title'),
      departement: dept.value,
      warnings,
    });
  }

  return { sheetName: sheet.name.trim(), headerRow: header.row, columns: col, rows, skipped, totalRead };
}