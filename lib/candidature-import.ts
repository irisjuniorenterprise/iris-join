// lib/candidature-import.ts
//
// Import de candidatures depuis un fichier Excel (saisie par l'admin pour
// le compte de candidats ayant rempli le modèle .xlsx). Module PUR : il ne
// dépend ni d'Excel ni de Firebase — il reçoit des cellules déjà converties
// en texte et applique EXACTEMENT le même schéma que le formulaire public
// (candidatureSchema), pour que les données importées soient identiques.
//
// Deux formats sont pris en charge par la route d'import :
//   1. le MODÈLE (15 colonnes, feuille « Candidatures ») → parseImportRow ;
//   2. le REGISTRE des candidats d'IRIS JE (10 colonnes : Prénom, Nom, CIN,
//      E-mail, Num de téléphone, Date de naissance, Adresse, Niveau d'étude,
//      Nationalité, Département) → lib/candidature-excel.ts (lecture) puis
//      buildRegistreCandidature (validation) en bas de ce fichier.

import { z } from 'zod';
import {
  DEPARTEMENT_OPTIONS,
  FILIERES,
  MAX_DEPARTEMENTS_CHOISIS,
  NIVEAUX_ETUDES,
  NIVEAUX_LANGUE,
  PARTICIPATION_FORMATIONS,
  SOURCES_CONNAISSANCE,
  candidatureSchema,
  type CandidatureFormData,
} from './candidature';
import { normalizeDepartment, type DepartmentKey } from './interview';
// Import de TYPE uniquement : ce module reste pur (aucune dépendance à exceljs).
import type { ImportedCandidate } from './candidature-excel';

export const IMPORT_SHEET_NAME = 'Candidatures';
export const IMPORT_MAX_ROWS = 500;
export const IMPORT_MAX_FILE_BYTES = 2 * 1024 * 1024;

export type ImportKey =
  | 'nomPrenom'
  | 'email'
  | 'telephone'
  | 'filiere'
  | 'niveauEtudes'
  | 'departements'
  | 'sourceConnaissance'
  | 'niveauFrancais'
  | 'niveauAnglais'
  | 'participationFormations'
  | 'autreEngagement'
  | 'organisationTemps'
  | 'motivation'
  | 'domaine'
  | 'remarques';

export type ImportColumn = {
  key: ImportKey;
  header: string;
  /** Liste fermée (menu déroulant dans le modèle). */
  options?: readonly string[];
  /** Colonne facultative (peut être vide). */
  optional?: boolean;
  hint: string;
  width: number;
};

export const IMPORT_COLUMNS: ImportColumn[] = [
  { key: 'nomPrenom', header: 'Nom et prénom', hint: 'Texte, 3 caractères minimum', width: 26 },
  { key: 'email', header: 'E-mail', hint: 'Adresse Gmail/Google utilisée par le candidat pour se connecter', width: 30 },
  { key: 'telephone', header: 'Téléphone', hint: '8 chiffres (ex. 22123456)', width: 14 },
  { key: 'filiere', header: 'Filière', options: FILIERES, hint: 'Liste fermée', width: 12 },
  { key: 'niveauEtudes', header: "Niveau d'études", options: NIVEAUX_ETUDES, hint: 'Liste fermée', width: 16 },
  {
    key: 'departements',
    header: 'Départements (par ordre de préférence)',
    options: DEPARTEMENT_OPTIONS.map((d) => d.label),
    hint: 'Un ou plusieurs, séparés par une virgule. Le 1er est prioritaire (ex. IT, Marketing)',
    width: 34,
  },
  { key: 'sourceConnaissance', header: 'Comment avez-vous connu IRIS', options: SOURCES_CONNAISSANCE, hint: 'Liste fermée', width: 32 },
  { key: 'niveauFrancais', header: 'Niveau en français', options: NIVEAUX_LANGUE, hint: 'Liste fermée', width: 18 },
  { key: 'niveauAnglais', header: 'Niveau en anglais', options: NIVEAUX_LANGUE, hint: 'Liste fermée', width: 18 },
  { key: 'participationFormations', header: 'Participation aux formations', options: PARTICIPATION_FORMATIONS, hint: 'Liste fermée', width: 40 },
  { key: 'autreEngagement', header: 'Autre engagement', options: ['Oui', 'Non'], hint: 'Oui ou Non', width: 16 },
  { key: 'organisationTemps', header: 'Organisation du temps', optional: true, hint: 'Obligatoire (10 caractères min.) si « Autre engagement » = Oui', width: 40 },
  { key: 'motivation', header: 'Motivation', hint: '5 à 400 caractères', width: 50 },
  { key: 'domaine', header: 'Domaine à développer', hint: '2 à 150 caractères', width: 36 },
  { key: 'remarques', header: 'Remarques', optional: true, hint: 'Facultatif', width: 36 },
];

const COLUMN_BY_KEY = new Map(IMPORT_COLUMNS.map((c) => [c.key, c]));

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

/** Minuscules, sans accents, apostrophes et espaces normalisés. */
export function foldImport(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘`´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function matchOption<T extends string>(raw: string, options: readonly T[]): T | null {
  const wanted = foldImport(raw);
  return options.find((o) => foldImport(o) === wanted) ?? null;
}

function cleanPhone(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('216')) digits = digits.slice(3);
  if (digits.length === 13 && digits.startsWith('00216')) digits = digits.slice(5);
  return digits;
}

/** Associe les en-têtes de la 1re ligne aux colonnes attendues. */
export function mapHeaders(headers: string[]): {
  indexByKey: Map<ImportKey, number>;
  missing: string[];
} {
  const indexByKey = new Map<ImportKey, number>();
  const folded = headers.map(foldImport);
  for (const col of IMPORT_COLUMNS) {
    const i = folded.indexOf(foldImport(col.header));
    if (i >= 0) indexByKey.set(col.key, i);
  }
  const missing = IMPORT_COLUMNS.filter((c) => !c.optional && !indexByKey.has(c.key)).map(
    (c) => c.header,
  );
  return { indexByKey, missing };
}

/* ------------------------------------------------------------------ */
/* Validation d'une ligne                                               */
/* ------------------------------------------------------------------ */

export type ParsedRow = {
  email: string;
  data: CandidatureFormData | null;
  errors: string[];
};

const emailSchema = z.email();

export function parseImportRow(cells: Partial<Record<ImportKey, string>>): ParsedRow {
  const get = (key: ImportKey) => (cells[key] ?? '').trim();
  const label = (key: ImportKey) => COLUMN_BY_KEY.get(key)!.header;
  const errors: string[] = [];
  /** Champs déjà signalés ici : on masque l'erreur générique du schéma. */
  const flagged = new Set<string>();
  const flag = (key: ImportKey, message: string) => {
    flagged.add(key);
    errors.push(`${label(key)} : ${message}`);
  };

  // E-mail (comparé en minuscules, comme partout dans l'application).
  const email = get('email').toLowerCase();
  if (!email) flag('email', 'obligatoire');
  else if (!emailSchema.safeParse(email).success) flag('email', 'adresse invalide');

  // Listes fermées.
  const enumValue = <T extends string>(key: ImportKey, options: readonly T[]): T | '' => {
    const raw = get(key);
    if (!raw) {
      flag(key, 'obligatoire');
      return '';
    }
    const found = matchOption(raw, options);
    if (!found) {
      flag(key, `« ${raw} » non reconnu (attendu : ${options.join(' / ')})`);
      return '';
    }
    return found;
  };

  const filiere = enumValue('filiere', FILIERES);
  const sourceConnaissance = enumValue('sourceConnaissance', SOURCES_CONNAISSANCE);
  const niveauFrancais = enumValue('niveauFrancais', NIVEAUX_LANGUE);
  const niveauAnglais = enumValue('niveauAnglais', NIVEAUX_LANGUE);
  const participationFormations = enumValue('participationFormations', PARTICIPATION_FORMATIONS);

  // Niveau d'études : accepte aussi « 1 », « 2e », « 3ème année »…
  let niveauEtudes: string = '';
  {
    const raw = get('niveauEtudes');
    if (!raw) flag('niveauEtudes', 'obligatoire');
    else {
      const found = matchOption(raw, NIVEAUX_ETUDES);
      const digit = /^\s*([123])/.exec(raw)?.[1];
      niveauEtudes = found ?? (digit ? NIVEAUX_ETUDES[Number(digit) - 1] : '');
      if (!niveauEtudes) flag('niveauEtudes', `« ${raw} » non reconnu (attendu : ${NIVEAUX_ETUDES.join(' / ')})`);
    }
  }

  // Autre engagement : Oui / Non (yes/no acceptés).
  let autreEngagement: string = '';
  {
    const raw = foldImport(get('autreEngagement'));
    if (!raw) flag('autreEngagement', 'obligatoire');
    else if (['oui', 'yes', 'o', 'y', 'true', '1'].includes(raw)) autreEngagement = 'oui';
    else if (['non', 'no', 'n', 'false', '0'].includes(raw)) autreEngagement = 'non';
    else flag('autreEngagement', `« ${get('autreEngagement')} » non reconnu (attendu : Oui / Non)`);
  }

  // Départements : liste ordonnée, séparateurs , ; | / ou retour à la ligne.
  const departements: DepartmentKey[] = [];
  {
    const raw = get('departements');
    if (!raw) flag('departements', 'obligatoire');
    else {
      for (const part of raw.split(/[,;|/\n]+/).map((p) => p.trim()).filter(Boolean)) {
        const key = normalizeDepartment(part);
        if (!key) {
          flag('departements', `« ${part} » non reconnu (attendu : ${DEPARTEMENT_OPTIONS.map((d) => d.label).join(' / ')})`);
          break;
        }
        if (!departements.includes(key)) departements.push(key);
      }
      if (departements.length > MAX_DEPARTEMENTS_CHOISIS) {
        flag('departements', `${MAX_DEPARTEMENTS_CHOISIS} départements maximum`);
      }
    }
  }

  // Le reste est validé par le schéma du formulaire public.
  const parsed = candidatureSchema.safeParse({
    nomPrenom: get('nomPrenom'),
    telephone: cleanPhone(get('telephone')),
    filiere,
    niveauEtudes,
    departements,
    sourceConnaissance,
    niveauFrancais,
    niveauAnglais,
    participationFormations,
    autreEngagement,
    organisationTemps: get('organisationTemps'),
    motivation: get('motivation'),
    domaine: get('domaine'),
    remarques: get('remarques'),
    // Le consentement est attesté par l'admin dans la boîte de dialogue
    // d'import (case obligatoire, revérifiée côté serveur).
    consentement: true,
  });

  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? '') as ImportKey;
      if (flagged.has(key)) continue;
      const col = COLUMN_BY_KEY.get(key);
      errors.push(col ? `${col.header} : ${issue.message}` : issue.message);
    }
  }

  return {
    email,
    data: errors.length === 0 && parsed.success ? parsed.data : null,
    errors,
  };
}

/* ------------------------------------------------------------------ */
/* Format « registre » (fichier Excel des candidats d'IRIS JE)          */
/* ------------------------------------------------------------------ */

/** Valeur écrite à la place d'une donnée absente du registre. */
export const MISSING_VALUE = '-';

/**
 * Candidature issue du registre. Le registre ne contient PAS les réponses
 * du questionnaire du formulaire public (motivation, niveaux de langue,
 * source…) ni toujours le CIN, la date de naissance, etc. Pour que chaque
 * fiche du tableau de bord soit complète et lisible, toute valeur absente
 * est remplacée par un tiret (MISSING_VALUE) — jamais par une valeur
 * inventée. Seul le département reste absent s'il est inconnu : le système
 * de créneaux le lit et un tiret y serait traité comme invalide.
 */
export type RegistreCandidature = {
  nomPrenom: string;
  telephone: string;
  filiere: string;
  niveauEtudes: string;
  /** Département unique lu par le système de créneaux (voir lib/slots-store.ts). */
  departement?: DepartmentKey;
  /** Liste classée (ici : au plus le département du registre). */
  departements: DepartmentKey[];
  cin: string;
  /** « AAAA-MM-JJ » ou tiret. */
  dateNaissance: string;
  adresse: string;
  nationalite: string;
  // Questionnaire du formulaire public : absent du registre → tirets.
  sourceConnaissance: string;
  niveauFrancais: string;
  niveauAnglais: string;
  participationFormations: string;
  autreEngagement: string;
  organisationTemps: string;
  motivation: string;
  domaine: string;
  remarques: string;
};

export type RegistreRow = {
  email: string;
  data: RegistreCandidature | null;
  /** Bloquantes : la ligne n'est pas importée. */
  errors: string[];
  /** Informatives : la ligne est importée malgré une donnée manquante ou corrigée. */
  warnings: string[];
};

export type RegistreOptions = {
  /**
   * Importer aussi les candidats SANS département reconnu. Par défaut non :
   * un candidat sans département ne voit aucun créneau d'entretien
   * (« département invalide ») et ne peut pas renvoyer sa candidature
   * (une seule par e-mail) — il serait bloqué.
   */
  allowNoDepartment?: boolean;
};

const NO_DEPARTMENT_WARNING = /^Département (manquant|inconnu)/;

const orDash = (value: string | null | undefined): string => value?.trim() || MISSING_VALUE;

export function buildRegistreCandidature(
  candidate: ImportedCandidate,
  options: RegistreOptions = {},
): RegistreRow {
  const errors: string[] = [];
  let warnings = [...candidate.warnings];

  // Le nom est repris tel quel dans les e-mails : mêmes règles que le formulaire public.
  const name = candidatureSchema.shape.nomPrenom.safeParse(candidate.nomPrenom);
  if (!name.success) {
    errors.push(`Nom et prénom : ${name.error.issues[0]?.message ?? 'invalide'}`);
  }

  if (!candidate.departement) {
    if (!options.allowNoDepartment) {
      errors.push(
        'Département : manquant ou inconnu (sans département, le candidat ne pourrait pas réserver d’entretien)',
      );
      // L'erreur ci-dessus remplace l'avertissement équivalent.
      warnings = warnings.filter((w) => !NO_DEPARTMENT_WARNING.test(w));
    }
  }

  if (errors.length > 0) return { email: candidate.email, data: null, errors, warnings };

  const data: RegistreCandidature = {
    nomPrenom: name.success ? name.data : candidate.nomPrenom,
    telephone: orDash(candidate.telephone),
    filiere: orDash(candidate.filiere),
    niveauEtudes: orDash(candidate.niveauEtudes),
    departements: candidate.departement ? [candidate.departement] : [],
    cin: orDash(candidate.cin),
    dateNaissance: orDash(candidate.dateNaissance),
    adresse: orDash(candidate.adresse),
    nationalite: orDash(candidate.nationalite),
    sourceConnaissance: MISSING_VALUE,
    niveauFrancais: MISSING_VALUE,
    niveauAnglais: MISSING_VALUE,
    participationFormations: MISSING_VALUE,
    autreEngagement: MISSING_VALUE,
    organisationTemps: MISSING_VALUE,
    motivation: MISSING_VALUE,
    domaine: MISSING_VALUE,
    remarques: MISSING_VALUE,
  };
  if (candidate.departement) data.departement = candidate.departement;

  return { email: candidate.email, data, errors, warnings };
}