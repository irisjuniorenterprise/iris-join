// lib/candidature.ts
//
// Référentiel et schéma de validation du formulaire de candidature —
// SOURCE UNIQUE partagée par le formulaire (client) et la route API
// (serveur). Aucune dépendance serveur : importable côté navigateur.
//
// Le contenu suit le document « candidatures_IRIS.pdf ». Les valeurs
// des choix (niveaux, sources, disponibilité…) sont stockées telles
// quelles dans Firestore : elles sont lisibles directement dans le
// dashboard admin et dans l'export CSV, sans table de correspondance.

import { z } from 'zod';
import { DEPARTMENT_KEYS, type DepartmentKey } from './interview';

/* ------------------------------------------------------------------ */
/* Choix                                                                */
/* ------------------------------------------------------------------ */

export const NIVEAUX_ETUDES = ['1re année', '2e année', '3e année'] as const;

/** Filières ENIS proposées au dépôt de candidature (Q4 — liste fermée). */
export const FILIERES = ['GI', 'GMMI', 'GG', 'GC', 'GB', 'GE', 'GEM'] as const;

/**
 * Départements dans l'ordre du document. Les clés (`value`) sont celles
 * utilisées partout ailleurs (créneaux, e-mails) : ne pas les modifier.
 */
export const DEPARTEMENT_OPTIONS: { value: DepartmentKey; label: string }[] = [
  { value: 'dev-co', label: 'Dev-Co' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'etudes', label: 'Études' },
  { value: 'it', label: 'IT' },
];

/** Nombre max de départements qu'un candidat peut classer par ordre de préférence. */
export const MAX_DEPARTEMENTS_CHOISIS = DEPARTMENT_KEYS.length;

export const SOURCES_CONNAISSANCE = [
  'Réseaux sociaux',
  'Bouche-à-oreille',
  'Un membre d’IRIS',
  'Un événement organisé par IRIS',
  'Mon établissement universitaire',
] as const;

export const NIVEAUX_LANGUE = ['Débutant', 'Intermédiaire', 'Avancé', 'Courant'] as const;

export const PARTICIPATION_FORMATIONS = [
  'Oui, systématiquement',
  'Oui, selon mes disponibilités',
  'Seulement pour les formations liées à mon département',
  'Occasionnellement',
  'Non',
] as const;

export const AUTRE_ENGAGEMENT_OPTIONS = [
  { value: 'oui', label: 'Oui' },
  { value: 'non', label: 'Non' },
] as const;

/* ------------------------------------------------------------------ */
/* Schéma                                                               */
/* ------------------------------------------------------------------ */

export const candidatureSchema = z
  .object({
    // Q1 — pas de < > & " / \ : le nom est repris tel quel dans les e-mails.
    nomPrenom: z
      .string()
      .trim()
      .min(3, 'Indiquez votre nom et prénom')
      .max(100, '100 caractères maximum')
      .regex(/^[^<>&"\\/]+$/, 'Caractères non autorisés dans le nom'),

    // Q3 (Q2, l'e-mail, vient de la connexion Google vérifiée)
    telephone: z.string().regex(/^[0-9]{8}$/, 'Numéro invalide (8 chiffres)'),

    // Q4 — liste fermée des filières ENIS.
    filiere: z.enum(FILIERES, { message: 'Choisissez votre filière' }),

    // Q5 — choix unique.
    niveauEtudes: z.enum(NIVEAUX_ETUDES),

    // Q6 — "choix multiple" au sens du document : le candidat peut
    // classer plusieurs départements par ordre de préférence (le 1er
    // cliqué est prioritaire). L'ordre du tableau EST l'ordre choisi ;
    // seul departements[0] est utilisé pour l'affectation aux créneaux
    // d'entretien (voir app/api/candidature/route.ts).
    departements: z
      .array(z.enum(DEPARTMENT_KEYS))
      .min(1, 'Choisissez au moins un département')
      .max(MAX_DEPARTEMENTS_CHOISIS)
      .refine((arr) => new Set(arr).size === arr.length, 'Département en double'),

    // Q7, Q8, Q9 — choix uniques. Les messages d'erreur sont affichés
    // par le formulaire (« Veuillez choisir une réponse »).
    sourceConnaissance: z.enum(SOURCES_CONNAISSANCE),
    niveauFrancais: z.enum(NIVEAUX_LANGUE),
    niveauAnglais: z.enum(NIVEAUX_LANGUE),
    participationFormations: z.enum(PARTICIPATION_FORMATIONS),

    // Q12 (+ précision obligatoire si « Oui »)
    autreEngagement: z.enum(['oui', 'non']),
    organisationTemps: z.string().trim().max(1500, '1500 caractères maximum'),

    // Q13, Q14 (réponses courtes) et Q15 (facultative)
    motivation: z
      .string()
      .trim()
      .min(5, 'Décrivez votre motivation en quelques mots')
      .max(400, '400 caractères maximum'),
    domaine: z
      .string()
      .trim()
      .min(2, 'Indiquez le domaine à développer')
      .max(150, '150 caractères maximum'),
    remarques: z.string().trim().max(1500, '1500 caractères maximum'),

    consentement: z.boolean().refine((v) => v === true, {
      message: 'Vous devez accepter pour continuer',
    }),
  })
  .superRefine((data, ctx) => {
    if (data.autreEngagement === 'oui' && data.organisationTemps.length < 10) {
      ctx.addIssue({
        code: 'custom',
        path: ['organisationTemps'],
        message: 'Expliquez comment vous organiserez votre temps (10 caractères min.)',
      });
    }
  });

export type CandidatureFormData = z.infer<typeof candidatureSchema>;

/**
 * Département pris en compte pour la réservation d'entretien : toujours
 * le premier choisi (ordre de préférence), jamais les suivants. Utilisé
 * côté serveur (route API) pour dériver le champ `departement` (unique)
 * lu par tout le système de créneaux (lib/slots-store.ts, api/creneaux,
 * api/reservation) sans avoir à modifier ces modules.
 */
export function departementPrincipal(departements: DepartmentKey[]): DepartmentKey {
  return departements[0];
}