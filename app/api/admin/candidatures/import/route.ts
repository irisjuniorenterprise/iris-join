// app/api/admin/candidatures/import/route.ts
//
// Import en masse de candidatures depuis un fichier Excel (.xlsx).
//   GET  → télécharge le modèle Excel (menus déroulants inclus).
//   POST → multipart/form-data { file, consent, dryRun?, notify?, allowNoDepartment? }
//          dryRun=true : valide seulement et renvoie le rapport ligne par ligne.
//          sinon       : enregistre les lignes valides.
//
// Deux formats de fichier sont acceptés (détectés automatiquement) :
//   • « modele »   : le modèle téléchargé ci-dessus (15 colonnes, feuille
//                    « Candidatures »), mêmes règles que le formulaire public ;
//   • « registre » : le registre des candidats d'IRIS JE — colonnes Prénom,
//                    Nom, CIN, E-mail, Num de téléphone, Date de naissance,
//                    Adresse, Niveau d'étude, Nationalité, Département, à
//                    n'importe quelle position de la feuille (voir
//                    lib/candidature-excel.ts). Le registre ne contient pas
//                    les réponses du questionnaire : elles restent absentes.
//
// Champs optionnels de POST (flexibilité pour l'admin) :
//   • overrides : JSON { "<n° de ligne Excel>": { "<champ>": "<valeur corrigée>" } }
//                 corrections saisies par l'admin dans le rapport (ex. e-mail mal
//                 écrit). Elles sont appliquées AVANT la validation : la ligne est
//                 re-contrôlée exactement comme si le fichier avait été corrigé.
//   • selected  : JSON [n° de ligne, …] — à l'import réel, seules ces lignes sont
//                 enregistrées (absent = toutes les lignes valides). Ignoré en dryRun.
//
// Réservé aux administrateurs (ADMIN_EMAILS). La règle « une candidature
// par e-mail » est respectée dans les deux formats.
import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { getAdminDb } from '@/lib/firebase-admin';
import { denyResponse, requireAdmin } from '@/lib/admin-auth';
import { sendCandidatureConfirmation } from '@/lib/email';
import { DEPARTMENT_LABELS, type DepartmentKey } from '@/lib/interview';
import { DEPARTEMENT_OPTIONS, departementPrincipal } from '@/lib/candidature';
import {
  ExcelImportError,
  extractCandidates,
  type CandidateField,
  type ParseResult,
} from '@/lib/candidature-excel';
import {
  IMPORT_COLUMNS,
  IMPORT_MAX_FILE_BYTES,
  IMPORT_MAX_ROWS,
  IMPORT_SHEET_NAME,
  buildRegistreCandidature,
  mapHeaders,
  parseImportRow,
  type ImportKey,
} from '@/lib/candidature-import';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const NO_STORE = { 'Cache-Control': 'no-store' };

type ImportFormat = 'modele' | 'registre';

type RowReport = {
  line: number;
  nomPrenom: string;
  email: string;
  status: 'ok' | 'duplicate' | 'error';
  /** Raisons du rejet (statuts « error » et « duplicate »). */
  errors: string[];
  /** Remarques sur une ligne importée (donnée manquante ou corrigée). */
  warnings: string[];
  /** Valeurs éditables de la ligne (après corrections de l'admin), par clé de champ. */
  fields: Record<string, string>;
  /** Clés des champs corrigés par l'admin (valeur différente de celle du fichier). */
  corrected: string[];
};

/** Champ éditable proposé à l'admin dans le rapport (décrit par le serveur). */
type FieldDef = {
  key: string;
  label: string;
  /** Liste fermée (menu déroulant). */
  options?: readonly string[];
  /** Texte long (zone de texte). */
  long?: boolean;
  hint?: string;
};

/** Corrections de l'admin : n° de ligne Excel → { champ → valeur }. */
type Overrides = Record<number, Record<string, string>>;

/** Une candidature prête à être écrite dans Firestore. */
type PendingCandidature = {
  line: number;
  email: string;
  nomPrenom: string;
  /** Document Firestore (hors email / dates / traçabilité, ajoutés à l'écriture). */
  doc: Record<string, unknown>;
  /** Libellé du département (null si le candidat n'en a pas : pas d'e-mail possible). */
  departementLabel: string | null;
  /** Champs corrigés par l'admin avant import (traçabilité). */
  corrected: string[];
};

function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status, headers: NO_STORE });
}

/** Texte d'une cellule Excel (texte, nombre, lien hypertexte, texte riche, formule). */
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();
  const o = value as unknown as Record<string, unknown>;
  if (Array.isArray(o.richText)) {
    return (o.richText as { text: string }[]).map((t) => t.text).join('').trim();
  }
  if (typeof o.text === 'string') return o.text.trim(); // lien hypertexte (mailto:…)
  if (o.result !== undefined && o.result !== null) return cellText(o.result as ExcelJS.CellValue);
  return '';
}

function labelOf(department: DepartmentKey | null | undefined): string | null {
  return department ? DEPARTMENT_LABELS[department] : null;
}

/* ------------------------------------------------------------------ */
/* Corrections et sélection saisies par l'admin                         */
/* ------------------------------------------------------------------ */

const OVERRIDE_MAX_LENGTH = 2000;
const MAX_LINES_IN_PAYLOAD = 5000;

/** Champs éditables du format « modèle » (mêmes colonnes que le modèle Excel). */
const MODELE_FIELDS: FieldDef[] = IMPORT_COLUMNS.map((c) => ({
  key: c.key,
  label: c.header,
  hint: c.hint,
  ...(c.key !== 'departements' && c.options ? { options: c.options } : {}),
  ...(c.key === 'organisationTemps' || c.key === 'motivation' || c.key === 'remarques'
    ? { long: true }
    : {}),
}));

/** Champs éditables du format « registre » (dans l'ordre des colonnes du registre). */
const REGISTRE_FIELDS: (FieldDef & { key: CandidateField })[] = [
  { key: 'prenom', label: 'Prénom' },
  { key: 'nom', label: 'Nom' },
  { key: 'cin', label: 'CIN', hint: '8 chiffres' },
  { key: 'email', label: 'E-mail', hint: 'Adresse utilisée pour se connecter' },
  { key: 'telephone', label: 'Num de téléphone', hint: '8 chiffres' },
  { key: 'dateNaissance', label: 'Date de naissance', hint: 'JJ/MM/AAAA' },
  { key: 'adresse', label: 'Adresse' },
  { key: 'niveauEtude', label: "Niveau d'étude", hint: 'Filière + année (ex. GI2)' },
  { key: 'nationalite', label: 'Nationalité' },
  {
    key: 'departement',
    label: 'Département',
    options: DEPARTEMENT_OPTIONS.map((d) => d.label),
  },
];

/** Marqueur : donnée envoyée par le client illisible ou mal formée. */
const INVALID = Symbol('invalid');

/** Valeur JSON d'un champ de formulaire : `undefined` si absent, `invalid` si illisible. */
function readJsonField(value: FormDataEntryValue | null): unknown | typeof INVALID {
  if (value === null || value === '') return undefined;
  if (typeof value !== 'string') return INVALID;
  try {
    return JSON.parse(value);
  } catch {
    return INVALID;
  }
}

/** Numéros de ligne sélectionnés (null = pas de sélection : toutes les lignes valides). */
function toSelection(input: unknown): Set<number> | null | typeof INVALID {
  if (input === undefined) return null;
  if (input === INVALID || !Array.isArray(input) || input.length > MAX_LINES_IN_PAYLOAD) return INVALID;
  const lines = new Set<number>();
  for (const value of input) {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) return INVALID;
    lines.add(value);
  }
  return lines;
}

/** Nettoie les corrections : numéros de ligne valides, champs connus, valeurs texte bornées. */
function toOverrides(input: unknown, allowed: ReadonlySet<string>): Overrides | typeof INVALID {
  if (input === undefined) return {};
  if (input === INVALID || !input || typeof input !== 'object' || Array.isArray(input)) return INVALID;
  const entries = Object.entries(input as Record<string, unknown>);
  if (entries.length > MAX_LINES_IN_PAYLOAD) return INVALID;

  const out: Overrides = {};
  for (const [lineKey, fields] of entries) {
    const line = Number(lineKey);
    if (!Number.isInteger(line) || line < 1) return INVALID;
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return INVALID;

    const cleaned: Record<string, string> = {};
    for (const [key, value] of Object.entries(fields as Record<string, unknown>)) {
      if (!allowed.has(key)) continue; // champ inconnu : ignoré
      if (typeof value !== 'string') return INVALID;
      cleaned[key] = value.slice(0, OVERRIDE_MAX_LENGTH);
    }
    if (Object.keys(cleaned).length > 0) out[line] = cleaned;
  }
  return out;
}

/** Texte affiché/éditable d'une cellule du registre (les dates deviennent « AAAA-MM-JJ »). */
function registreCellText(value: ExcelJS.CellValue | undefined): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return cellText(value ?? null);
}

function findSheet(wb: ExcelJS.Workbook, trimmedName: string): ExcelJS.Worksheet | undefined {
  return wb.worksheets.find((s) => s.name.trim() === trimmedName);
}

function readRegistreFields(
  sheet: ExcelJS.Worksheet,
  columns: Record<CandidateField, number | null>,
  line: number,
): Record<string, string> {
  const row = sheet.getRow(line);
  return Object.fromEntries(
    REGISTRE_FIELDS.map((f) => {
      const col = columns[f.key];
      return [f.key, col ? registreCellText(row.getCell(col).value) : ''];
    }),
  );
}

/**
 * Écrit les corrections de l'admin dans le classeur chargé en mémoire (jamais
 * sur le fichier d'origine), à l'endroit exact des cellules du registre. Le
 * lecteur (extractCandidates) relit ensuite le classeur et re-nettoie chaque
 * ligne comme d'habitude. Un champ dont la colonne n'existe pas dans le fichier
 * (ex. pas de colonne « Département ») est ajouté en fin de tableau.
 * Renvoie, par ligne, les champs dont la valeur a réellement changé.
 */
function applyRegistreOverrides(
  wb: ExcelJS.Workbook,
  parsed: ParseResult,
  overrides: Overrides,
): Record<number, string[]> {
  const corrections: Record<number, string[]> = {};
  const sheet = findSheet(wb, parsed.sheetName);
  if (!sheet) return corrections;

  const columns = { ...parsed.columns };
  let nextCol = Math.max(0, ...Object.values(columns).filter((c): c is number => c !== null)) + 1;
  const needed = new Set(Object.values(overrides).flatMap((o) => Object.keys(o)));
  for (const field of REGISTRE_FIELDS) {
    if (columns[field.key] === null && needed.has(field.key)) {
      columns[field.key] = nextCol;
      sheet.getRow(parsed.headerRow).getCell(nextCol).value = field.label;
      nextCol += 1;
    }
  }

  for (const [lineKey, changes] of Object.entries(overrides)) {
    const line = Number(lineKey);
    // Uniquement les lignes de données existantes : une correction ne crée jamais de ligne.
    if (line <= parsed.headerRow || line > sheet.rowCount) continue;

    const row = sheet.getRow(line);
    for (const [key, value] of Object.entries(changes)) {
      const col = columns[key as CandidateField];
      if (!col) continue;
      const cell = row.getCell(col);
      const next = value.trim();
      if (next === registreCellText(cell.value).trim()) continue;
      cell.value = next === '' ? null : next;
      (corrections[line] ??= []).push(key);
    }
  }
  return corrections;
}

/* ------------------------------------------------------------------ */
/* GET — modèle Excel                                                   */
/* ------------------------------------------------------------------ */

export async function GET(request: Request) {
  const check = await requireAdmin(request);
  if (!check.ok) return denyResponse(check);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'IRIS Join';

  const sheet = wb.addWorksheet(IMPORT_SHEET_NAME, { views: [{ state: 'frozen', ySplit: 1 }] });
  const lists = wb.addWorksheet('Listes', { state: 'hidden' });
  const help = wb.addWorksheet('Instructions');

  sheet.columns = IMPORT_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  const head = sheet.getRow(1);
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.alignment = { vertical: 'middle', wrapText: true };
  head.height = 32;
  head.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A3969' } };
  });

  // Téléphone en texte pour ne pas perdre de zéro / passer en notation scientifique.
  const phoneIndex = IMPORT_COLUMNS.findIndex((c) => c.key === 'telephone') + 1;
  sheet.getColumn(phoneIndex).numFmt = '@';

  // Menus déroulants (listes dans la feuille cachée « Listes »).
  let listCol = 0;
  IMPORT_COLUMNS.forEach((col, idx) => {
    if (!col.options || col.key === 'departements') return;
    listCol += 1;
    col.options.forEach((opt, r) => {
      lists.getCell(r + 1, listCol).value = opt;
    });
    const letter = lists.getColumn(listCol).letter;
    const range = `Listes!$${letter}$1:$${letter}$${col.options.length}`;
    for (let row = 2; row <= IMPORT_MAX_ROWS + 1; row += 1) {
      sheet.getCell(row, idx + 1).dataValidation = {
        type: 'list',
        allowBlank: col.optional ?? false,
        formulae: [range],
        showErrorMessage: true,
        errorTitle: 'Valeur invalide',
        error: 'Choisissez une valeur dans la liste.',
      };
    }
  });

  help.columns = [
    { header: 'Colonne', key: 'c', width: 40 },
    { header: 'Règle', key: 'r', width: 90 },
  ];
  help.getRow(1).font = { bold: true };
  for (const col of IMPORT_COLUMNS) {
    help.addRow({ c: col.header + (col.optional ? ' (facultatif)' : ''), r: col.hint });
  }
  help.addRow({});
  help.addRow({ c: 'Important', r: `Une ligne = une candidature. ${IMPORT_MAX_ROWS} lignes maximum. Une seule candidature par e-mail.` });

  const buffer = await wb.xlsx.writeBuffer();
  return new Response(new Uint8Array(buffer as ArrayBuffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="modele-candidatures-iris.xlsx"',
      ...NO_STORE,
    },
  });
}

/* ------------------------------------------------------------------ */
/* POST — validation / import                                           */
/* ------------------------------------------------------------------ */

export async function POST(request: Request) {
  const check = await requireAdmin(request);
  if (!check.ok) return denyResponse(check);

  const form = await request.formData().catch(() => null);
  if (!form) return fail('Requête invalide.');

  const file = form.get('file');
  if (!(file instanceof File)) return fail('Aucun fichier reçu.');
  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    return fail('Format non pris en charge : utilisez un fichier Excel .xlsx (le modèle ou le registre des candidats).');
  }
  if (file.size > IMPORT_MAX_FILE_BYTES) return fail('Fichier trop volumineux (2 Mo maximum).');

  const dryRun = form.get('dryRun') === 'true';
  const notify = form.get('notify') === 'true';
  const allowNoDepartment = form.get('allowNoDepartment') === 'true';
  if (!dryRun && form.get('consent') !== 'true') {
    return fail('Vous devez confirmer le consentement des candidats avant d’importer.');
  }

  // Sélection de lignes et corrections de l'admin (facultatives).
  const selection = toSelection(readJsonField(form.get('selected')));
  if (selection === INVALID) return fail('Sélection de lignes invalide.');
  const rawOverrides = readJsonField(form.get('overrides'));
  if (rawOverrides === INVALID) return fail('Corrections invalides.');

  const db = getAdminDb();
  if (!db) return fail('Base de données indisponible.', 500);

  // Lecture du classeur.
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(await file.arrayBuffer());
  } catch {
    return fail('Fichier illisible : est-ce bien un classeur Excel .xlsx valide ?');
  }
  if (wb.worksheets.length === 0) return fail('Le classeur ne contient aucune feuille.');

  // E-mails déjà candidats (une seule candidature par e-mail).
  const existingSnap = await db.collection('candidatures').select('email').get();
  const existing = new Set(
    existingSnap.docs.map((d) => String(d.data().email ?? '').trim().toLowerCase()),
  );

  const reports: RowReport[] = [];
  const toCreate: PendingCandidature[] = [];
  const seenInFile = new Set<string>();

  /** Contrôles communs aux deux formats : doublons en base puis dans le fichier. */
  const register = (report: RowReport, pending: PendingCandidature | null) => {
    if (pending) {
      if (existing.has(pending.email)) {
        report.status = 'duplicate';
        report.errors = ['Une candidature existe déjà avec cet e-mail.'];
      } else if (seenInFile.has(pending.email)) {
        report.status = 'duplicate';
        report.errors = ['E-mail en double dans le fichier (ligne ignorée).'];
      } else {
        seenInFile.add(pending.email);
        toCreate.push(pending);
      }
    }
    reports.push(report);
  };

  /* ---- Détection du format : modèle (en-têtes en ligne 1) sinon registre ---- */
  const templateSheet = wb.getWorksheet(IMPORT_SHEET_NAME) ?? wb.worksheets[0];
  const headerValues = (templateSheet.getRow(1).values as ExcelJS.CellValue[]).slice(1).map(cellText);
  const { indexByKey, missing } = mapHeaders(headerValues);
  const format: ImportFormat = missing.length === 0 ? 'modele' : 'registre';
  const fieldDefs: FieldDef[] = format === 'modele' ? MODELE_FIELDS : REGISTRE_FIELDS;

  const overrides = toOverrides(rawOverrides, new Set(fieldDefs.map((f) => f.key)));
  if (overrides === INVALID) return fail('Corrections invalides.');

  if (format === 'modele') {
    let rowCount = 0;
    for (let r = 2; r <= templateSheet.rowCount; r += 1) {
      const row = templateSheet.getRow(r);
      const original: Partial<Record<ImportKey, string>> = {};
      let empty = true;
      for (const [key, idx] of indexByKey) {
        const text = cellText(row.getCell(idx + 1).value);
        original[key] = text;
        if (text) empty = false;
      }
      if (empty) continue;

      rowCount += 1;
      if (rowCount > IMPORT_MAX_ROWS) {
        return fail(`Trop de lignes : ${IMPORT_MAX_ROWS} candidatures maximum par import.`);
      }

      // Corrections de l'admin : elles remplacent la valeur du fichier avant validation.
      const cells: Partial<Record<ImportKey, string>> = { ...original };
      const corrected: string[] = [];
      for (const [key, value] of Object.entries(overrides[r] ?? {})) {
        const next = value.trim();
        if (next !== (original[key as ImportKey] ?? '')) {
          cells[key as ImportKey] = next;
          corrected.push(key);
        }
      }

      const parsed = parseImportRow(cells);
      const report: RowReport = {
        line: r,
        nomPrenom: cells.nomPrenom ?? '',
        email: parsed.email,
        status: 'ok',
        errors: parsed.errors,
        warnings: [],
        fields: Object.fromEntries(IMPORT_COLUMNS.map((c) => [c.key, cells[c.key] ?? ''])),
        corrected,
      };

      if (parsed.errors.length > 0 || !parsed.data) {
        report.status = 'error';
        register(report, null);
        continue;
      }

      const departement = departementPrincipal(parsed.data.departements);
      register(report, {
        line: r,
        email: parsed.email,
        nomPrenom: parsed.data.nomPrenom,
        doc: { ...parsed.data, departement, source: 'import-admin' },
        departementLabel: labelOf(departement),
        corrected,
      });
    }
  } else {
    let extracted: ParseResult;
    let corrections: Record<number, string[]> = {};
    try {
      extracted = extractCandidates(wb, { maxRows: IMPORT_MAX_ROWS });
      if (Object.keys(overrides).length > 0) {
        // On écrit les corrections dans le classeur (en mémoire) puis on relit :
        // chaque ligne corrigée repasse par le nettoyage et la validation habituels.
        corrections = applyRegistreOverrides(wb, extracted, overrides);
        if (Object.keys(corrections).length > 0) {
          extracted = extractCandidates(wb, { maxRows: IMPORT_MAX_ROWS });
        }
      }
    } catch (err) {
      if (err instanceof ExcelImportError) {
        return fail(`${err.message} Vous pouvez aussi utiliser le modèle d’import fourni.`);
      }
      throw err;
    }

    const sheet = findSheet(wb, extracted.sheetName);
    const fieldsOf = (line: number): Record<string, string> =>
      sheet
        ? readRegistreFields(sheet, extracted.columns, line)
        : Object.fromEntries(REGISTRE_FIELDS.map((f) => [f.key, '']));

    // Lignes que le lecteur a écartées (e-mail manquant / invalide / doublon dans le fichier).
    for (const s of extracted.skipped) {
      register(
        {
          line: s.excelRow,
          nomPrenom: [s.prenom, s.nom].filter(Boolean).join(' '),
          email: s.email,
          status: s.reason.startsWith('Doublon') ? 'duplicate' : 'error',
          errors: [s.reason],
          warnings: [],
          fields: fieldsOf(s.excelRow),
          corrected: corrections[s.excelRow] ?? [],
        },
        null,
      );
    }

    for (const candidate of extracted.rows) {
      const built = buildRegistreCandidature(candidate, { allowNoDepartment });
      const corrected = corrections[candidate.excelRow] ?? [];
      const report: RowReport = {
        line: candidate.excelRow,
        nomPrenom: candidate.nomPrenom,
        email: built.email,
        status: built.data ? 'ok' : 'error',
        errors: built.errors,
        warnings: built.warnings,
        fields: fieldsOf(candidate.excelRow),
        corrected,
      };
      register(
        report,
        built.data
          ? {
              line: candidate.excelRow,
              email: built.email,
              nomPrenom: built.data.nomPrenom,
              // Le registre ne porte aucune réponse de questionnaire : on n'écrit que ce qu'il contient.
              doc: { ...built.data, consentement: true, source: 'import-registre' },
              departementLabel: labelOf(built.data.departement),
              corrected,
            }
          : null,
      );
    }

    reports.sort((a, b) => a.line - b.line);
  }

  if (reports.length === 0) return fail('Le fichier ne contient aucune candidature.');

  const summary = {
    format,
    total: reports.length,
    valid: toCreate.length,
    duplicates: reports.filter((x) => x.status === 'duplicate').length,
    errors: reports.filter((x) => x.status === 'error').length,
    withWarnings: reports.filter((x) => x.status === 'ok' && x.warnings.length > 0).length,
  };

  if (dryRun) {
    return NextResponse.json(
      { ok: true, dryRun: true, ...summary, fields: fieldDefs, rows: reports },
      { headers: NO_STORE },
    );
  }

  // Sélection de l'admin : seules les lignes cochées ET valides sont enregistrées.
  const toWrite = selection ? toCreate.filter((item) => selection.has(item.line)) : toCreate;
  if (selection && toWrite.length === 0) {
    return fail('Aucune candidature valide dans la sélection.');
  }

  // Enregistrement (par lots : limite Firestore de 500 écritures / batch).
  const now = new Date().toISOString();
  try {
    for (let i = 0; i < toWrite.length; i += 400) {
      const batch = db.batch();
      for (const item of toWrite.slice(i, i + 400)) {
        batch.set(db.collection('candidatures').doc(), {
          ...item.doc,
          email: item.email,
          createdAt: now,
          updatedAt: now,
          importedBy: check.email,
          // Traçabilité : champs corrigés à la main par l'admin pendant l'import.
          ...(item.corrected.length > 0 ? { importCorrectedFields: item.corrected } : {}),
        });
      }
      await batch.commit();
    }
  } catch (err) {
    console.error('[api/admin/candidatures/import] échec', err);
    return fail('Erreur serveur pendant l’enregistrement. Vérifiez la liste puis réessayez.', 500);
  }

  // E-mails de confirmation (ne bloquent jamais : l'import est déjà fait).
  // Un candidat sans département n'en reçoit pas : l'e-mail cite son département.
  let emailsSent = 0;
  if (notify) {
    const recipients = toWrite.filter((item) => item.departementLabel);
    for (let i = 0; i < recipients.length; i += 10) {
      const results = await Promise.allSettled(
        recipients
          .slice(i, i + 10)
          .map((item) =>
            sendCandidatureConfirmation(item.email, item.nomPrenom, item.departementLabel as string),
          ),
      );
      emailsSent += results.filter((x) => x.status === 'fulfilled').length;
    }
  }

  return NextResponse.json(
    {
      ok: true,
      dryRun: false,
      ...summary,
      fields: fieldDefs,
      created: toWrite.length,
      notSelected: toCreate.length - toWrite.length,
      emailsSent,
      rows: reports,
    },
    { headers: NO_STORE },
  );
}