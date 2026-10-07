// lib/service-window.ts
//
// Référentiel partagé (client + serveur) pour les fenêtres de
// disponibilité des deux services publics : le dépôt de candidature et
// la réservation d'entretien. Chaque service a sa propre période
// (date d'ouverture / date de fermeture), configurable par l'admin
// (voir lib/settings-store.ts, SERVEUR uniquement). Ce module ne
// contient que des types et des fonctions pures : il est importable
// aussi bien par les routes API que par les composants client.

export const SERVICE_KEYS = ['candidature', 'entretien'] as const;
export type ServiceKey = (typeof SERVICE_KEYS)[number];

/**
 * `opensAt` / `closesAt` sont des dates ISO (avec heure) ou `null`.
 * `null` signifie « pas de limite » : un `opensAt` nul veut dire que le
 * service est ouvert dès maintenant, un `closesAt` nul qu'il ne ferme
 * jamais automatiquement.
 */
export type ServiceWindow = {
  opensAt: string | null;
  closesAt: string | null;
};

export type ServiceWindows = Record<ServiceKey, ServiceWindow>;

export const DEFAULT_SERVICE_WINDOW: ServiceWindow = { opensAt: null, closesAt: null };

export const DEFAULT_SERVICE_WINDOWS: ServiceWindows = {
  candidature: { ...DEFAULT_SERVICE_WINDOW },
  entretien: { ...DEFAULT_SERVICE_WINDOW },
};

export type ServiceStatus =
  | { state: 'open' }
  | { state: 'not-started'; opensAt: string }
  | { state: 'closed'; closesAt: string };

/** Calcule l'état d'un service à un instant donné (maintenant par défaut). */
export function getServiceStatus(window: ServiceWindow, now: Date = new Date()): ServiceStatus {
  if (window.opensAt && now < new Date(window.opensAt)) {
    return { state: 'not-started', opensAt: window.opensAt };
  }
  if (window.closesAt && now > new Date(window.closesAt)) {
    return { state: 'closed', closesAt: window.closesAt };
  }
  return { state: 'open' };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Nombre de jours restants avant la fermeture d'un service, arrondi au jour
 * supérieur (il reste 1 jour ou moins → 1 = « dernier jour »).
 * - `null` : aucune date de fermeture (le service ne ferme jamais tout seul) ;
 * - `0`    : déjà fermé.
 */
export function daysUntilClose(window: ServiceWindow, now: Date = new Date()): number | null {
  if (!window.closesAt) return null;
  const closes = new Date(window.closesAt).getTime();
  if (Number.isNaN(closes)) return null;
  const diff = closes - now.getTime();
  return diff <= 0 ? 0 : Math.ceil(diff / DAY_MS);
}

export function isServiceOpen(window: ServiceWindow, now: Date = new Date()): boolean {
  return getServiceStatus(window, now).state === 'open';
}

/** Textes utilisés côté public (bannières) et admin (panneau des réglages). */
export const SERVICE_META: Record<
  ServiceKey,
  { title: string; noun: string; action: string }
> = {
  candidature: {
    title: 'Formulaire de candidature',
    noun: 'candidature',
    action: "l'envoi d'une candidature",
  },
  entretien: {
    title: "Réservation d'entretien",
    noun: 'entretien',
    action: "la réservation d'un entretien",
  },
};

const dateTimeFormatter = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Africa/Tunis',
});

/** "Lundi 12 octobre à 09:00" — utilisé dans les messages aux candidats. */
export function formatServiceDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return dateTimeFormatter.format(d);
}