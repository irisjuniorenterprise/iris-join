// lib/interview.ts
//
// Référentiel partagé (client + serveur) pour la réservation d'entretien :
// départements et formatage des dates de créneaux. Aucune dépendance
// serveur ici — ce module peut être importé par les composants client.

export const DEPARTMENT_KEYS = ['it', 'marketing', 'etudes', 'dev-co'] as const;

export type DepartmentKey = (typeof DEPARTMENT_KEYS)[number];

/** Libellés d'affichage — source unique (formulaire, emails, créneaux). */
export const DEPARTMENT_LABELS: Record<DepartmentKey, string> = {
  it: 'IT',
  marketing: 'Marketing',
  etudes: 'Études',
  'dev-co': 'Développement Commercial',
};

const ALIASES: Record<string, DepartmentKey> = {
  it: 'it',
  marketing: 'marketing',
  etudes: 'etudes',
  'dev-co': 'dev-co',
  devco: 'dev-co',
  'dev co': 'dev-co',
  'dev. commercial': 'dev-co',
  'developpement commercial': 'dev-co',
  'developpement & communication': 'dev-co',
};

/**
 * Convertit une valeur stockée (clé du formulaire "it", ancien libellé
 * "Études", etc.) en clé canonique. Renvoie null si la valeur est inconnue.
 */
export function normalizeDepartment(raw: unknown): DepartmentKey | null {
  if (typeof raw !== 'string') return null;
  const clean = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
  return ALIASES[clean] ?? null;
}

/** Valeurs acceptées en base pour un département (clé + ancien libellé). */
export function departmentStoredValues(key: DepartmentKey): string[] {
  return Array.from(new Set([key, DEPARTMENT_LABELS[key]]));
}

/* ------------------------------------------------------------------ */
/* Dates                                                                */
/* ------------------------------------------------------------------ */

// Les dates de créneaux sont des "YYYY-MM-DD" sans heure : on les lit et
// on les formate en UTC pour qu'aucun décalage de fuseau ne change le jour.
const fmtWeekdayLong = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', timeZone: 'UTC' });
const fmtWeekdayShort = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', timeZone: 'UTC' });
const fmtMonthLong = new Intl.DateTimeFormat('fr-FR', { month: 'long', timeZone: 'UTC' });
const fmtMonthShort = new Intl.DateTimeFormat('fr-FR', { month: 'short', timeZone: 'UTC' });

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export type DayParts = {
  weekdayShort: string; // "Lun."
  dayNumber: string; // "12"
  monthShort: string; // "oct."
  long: string; // "Lundi 12 octobre"
};

export function getDayParts(date: string): DayParts {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) {
    return { weekdayShort: date, dayNumber: '', monthShort: '', long: date };
  }
  const dayNumber = String(d.getUTCDate());
  return {
    weekdayShort: capitalize(fmtWeekdayShort.format(d)),
    dayNumber,
    monthShort: fmtMonthShort.format(d),
    long: `${capitalize(fmtWeekdayLong.format(d))} ${dayNumber} ${fmtMonthLong.format(d)}`,
  };
}

/** "Lundi 12 octobre" — utilisé dans les emails et messages. */
export function formatDayLong(date: string): string {
  return getDayParts(date).long;
}