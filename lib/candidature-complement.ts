// lib/candidature-complement.ts
//
// Données qu'un candidat IMPORTÉ (fichier Excel de l'admin) peut compléter
// lui-même : l'import remplace toute donnée absente par un tiret
// (MISSING_VALUE). Ce module — sans dépendance serveur, donc importable côté
// navigateur — décrit ces champs, détecte ceux qui manquent et valide les
// réponses avec les MÊMES règles que le formulaire public (candidatureSchema).
//
// Le département n'est volontairement PAS ici : il conditionne la réservation
// d'entretien et se choisit avant les créneaux (voir SlotPicker).
import { z } from 'zod';
import {
  FILIERES,
  NIVEAUX_ETUDES,
  NIVEAUX_LANGUE,
  PARTICIPATION_FORMATIONS,
  SOURCES_CONNAISSANCE,
  candidatureSchema,
} from './candidature';

/** Valeur écrite par l'import à la place d'une donnée absente (voir lib/candidature-import.ts). */
export const MISSING_MARK = '-';

export type ComplementFieldKey =
  | 'telephone'
  | 'filiere'
  | 'niveauEtudes'
  | 'sourceConnaissance'
  | 'niveauFrancais'
  | 'niveauAnglais'
  | 'participationFormations'
  | 'autreEngagement'
  | 'organisationTemps'
  | 'motivation'
  | 'domaine';

export type ComplementField = {
  key: ComplementFieldKey;
  label: string;
  kind: 'text' | 'tel' | 'textarea' | 'select';
  options?: { value: string; label: string }[];
  maxLength?: number;
  placeholder?: string;
};

const opts = (values: readonly string[]) => values.map((v) => ({ value: v, label: v }));

/** Ordre = ordre d'affichage. */
export const COMPLEMENT_FIELDS: ComplementField[] = [
  { key: 'telephone', label: 'Téléphone', kind: 'tel', maxLength: 8, placeholder: '8 chiffres, ex. 20123456' },
  { key: 'filiere', label: 'Filière', kind: 'select', options: opts(FILIERES) },
  { key: 'niveauEtudes', label: "Niveau d'études", kind: 'select', options: opts(NIVEAUX_ETUDES) },
  { key: 'sourceConnaissance', label: 'Comment avez-vous connu IRIS ?', kind: 'select', options: opts(SOURCES_CONNAISSANCE) },
  { key: 'niveauFrancais', label: 'Niveau de français', kind: 'select', options: opts(NIVEAUX_LANGUE) },
  { key: 'niveauAnglais', label: "Niveau d'anglais", kind: 'select', options: opts(NIVEAUX_LANGUE) },
  {
    key: 'participationFormations',
    label: 'Participation aux formations',
    kind: 'select',
    options: opts(PARTICIPATION_FORMATIONS),
  },
  {
    key: 'autreEngagement',
    label: 'Avez-vous un autre engagement (club, stage, emploi…) ?',
    kind: 'select',
    options: [
      { value: 'oui', label: 'Oui' },
      { value: 'non', label: 'Non' },
    ],
  },
  {
    key: 'organisationTemps',
    label: 'Comment organiserez-vous votre temps ?',
    kind: 'textarea',
    maxLength: 1500,
    placeholder: 'Quelques lignes suffisent',
  },
  { key: 'motivation', label: 'Votre motivation', kind: 'textarea', maxLength: 400, placeholder: 'En quelques mots' },
  { key: 'domaine', label: 'Domaine que vous souhaitez développer', kind: 'text', maxLength: 150 },
];

const FIELD_BY_KEY = new Map(COMPLEMENT_FIELDS.map((f) => [f.key, f]));
export const isComplementKey = (key: string): key is ComplementFieldKey => FIELD_BY_KEY.has(key as ComplementFieldKey);

/** Vrai pour « donnée absente » : vide ou simple tiret (valeur des imports). */
export function isBlank(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  return typeof value === 'string' && /^[\s\-–—_.]*$/.test(value);
}

/**
 * Champs à demander pour une candidature donnée (document Firestore).
 * « organisationTemps » n'est demandé que si l'autre engagement est « oui »,
 * comme dans le formulaire public.
 */
export function getMissingKeys(data: Record<string, unknown>): ComplementFieldKey[] {
  const missing: ComplementFieldKey[] = [];
  for (const field of COMPLEMENT_FIELDS) {
    if (field.key === 'organisationTemps') continue;
    if (isBlank(data[field.key])) missing.push(field.key);
  }
  const engagement = data.autreEngagement;
  const needsOrganisation =
    engagement === 'oui' && (isBlank(data.organisationTemps) || String(data.organisationTemps).trim().length < 10);
  // Si l'engagement est lui-même manquant, le champ s'ajoute côté interface dès qu'on répond « oui ».
  if (needsOrganisation) missing.push('organisationTemps');
  return COMPLEMENT_FIELDS.map((f) => f.key).filter((k) => missing.includes(k));
}

/** Schéma de validation d'UNE réponse, repris du formulaire public. */
const fieldSchemas: Record<ComplementFieldKey, z.ZodType<string>> = {
  telephone: candidatureSchema.shape.telephone,
  filiere: candidatureSchema.shape.filiere,
  niveauEtudes: candidatureSchema.shape.niveauEtudes,
  sourceConnaissance: candidatureSchema.shape.sourceConnaissance,
  niveauFrancais: candidatureSchema.shape.niveauFrancais,
  niveauAnglais: candidatureSchema.shape.niveauAnglais,
  participationFormations: candidatureSchema.shape.participationFormations,
  autreEngagement: candidatureSchema.shape.autreEngagement,
  organisationTemps: z.string().trim().min(10, 'Expliquez en 10 caractères minimum').max(1500, '1500 caractères maximum'),
  motivation: candidatureSchema.shape.motivation,
  domaine: candidatureSchema.shape.domaine,
};

export type ComplementValidation =
  | { ok: true; values: Partial<Record<ComplementFieldKey, string>> }
  | { ok: false; errors: Partial<Record<ComplementFieldKey, string>> };

/**
 * Valide les réponses du candidat. Seules les clés listées dans `allowed`
 * (celles qui manquent réellement) sont acceptées : une donnée déjà renseignée
 * n'est JAMAIS écrasée. Les champs vides sont ignorés (l'aide est facultative).
 */
export function validateComplement(
  input: Record<string, unknown>,
  allowed: readonly ComplementFieldKey[],
): ComplementValidation {
  const values: Partial<Record<ComplementFieldKey, string>> = {};
  const errors: Partial<Record<ComplementFieldKey, string>> = {};

  for (const [key, raw] of Object.entries(input)) {
    if (!isComplementKey(key) || !allowed.includes(key)) continue;
    if (typeof raw !== 'string' || raw.trim() === '') continue;
    const parsed = fieldSchemas[key].safeParse(raw.trim());
    if (parsed.success) values[key] = parsed.data;
    else errors[key] = parsed.error.issues[0]?.message ?? 'Valeur invalide';
  }

  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, values };
}