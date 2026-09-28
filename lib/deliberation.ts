// lib/deliberation.ts
//
// Référentiel partagé (client + serveur) pour l'espace de délibération :
// statuts possibles d'un résultat, libellés et types échangés entre les
// routes API, le dashboard admin et la page /resultats. Aucune dépendance
// serveur ici — importable par les composants client.

export const RESULT_STATUSES = ['accepted', 'rejected', 'absent'] as const;

export type ResultStatus = (typeof RESULT_STATUSES)[number];

/** Libellés côté admin (badges, filtres, boutons). */
export const RESULT_LABELS: Record<ResultStatus, string> = {
  accepted: 'Accepté',
  rejected: 'Non accepté',
  absent: 'Absent à l’entretien',
};

/** Longueur max du message personnalisé (affiché au candidat + ajouté à l'e-mail). */
export const RESULT_MESSAGE_MAX = 600;

/** Nombre max d'e-mails envoyés par requête (l'admin enchaîne les lots). */
export const SEND_CHUNK_SIZE = 8;

export function isResultStatus(value: unknown): value is ResultStatus {
  return typeof value === 'string' && (RESULT_STATUSES as readonly string[]).includes(value);
}

/**
 * Décision de délibération telle que vue par l'administration.
 * `email` est la clé du document (adresse en minuscules).
 */
export type AdminDecision = {
  email: string;
  status: ResultStatus;
  message: string;
  /** Tant que c'est faux, le candidat ne voit rien (brouillon). */
  published: boolean;
  publishedAt: string | null;
  emailSentAt: string | null;
  decidedAt: string | null;
  decidedBy: string | null;
};

/** Ce que le candidat a le droit de voir — jamais un brouillon. */
export type CandidateResult = {
  status: ResultStatus;
  message: string;
  departmentLabel: string | null;
  publishedAt: string | null;
};