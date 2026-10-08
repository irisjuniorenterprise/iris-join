// lib/settings-store.ts
//
// Persistance des fenêtres de disponibilité des services publics
// (candidature, entretien) — SERVEUR uniquement (utilise firebase-admin,
// jamais importé par un composant client). Un seul document Firestore
// (settings/serviceWindows) porte les deux périodes : simple à lire en
// un aller, simple à modifier depuis le panneau admin.
//
// Ce document est lu à CHAQUE affichage de page (accueil, /candidature,
// /entretien, pied de page) et à chaque appel d'API public (créneaux,
// réservation, candidature). Pour ne pas consommer le quota de lectures
// Firestore inutilement, la lecture est donc :
//  - gardée CACHE_TTL_MS en mémoire (le STATUT ouvert / fermé reste, lui,
//    recalculé à chaque requête avec l'heure actuelle) ;
//  - partagée entre les requêtes simultanées (une seule lecture en vol) ;
//  - remplacée par la dernière valeur connue si Firestore est indisponible
//    ou si le quota est dépassé.
// Une modification faite par l'admin est visible immédiatement sur cette
// instance et, au plus tard après CACHE_TTL_MS, sur les autres.
import { getAdminDb } from './firebase-admin';
import { CACHE_TAGS, dataCache, invalidate } from './data-cache';
import {
  DEFAULT_SERVICE_WINDOWS,
  SERVICE_KEYS,
  getServiceStatus,
  type ServiceKey,
  type ServiceStatus,
  type ServiceWindow,
  type ServiceWindows,
} from './service-window';

const SETTINGS_COLLECTION = 'settings';
const SERVICE_WINDOWS_DOC = 'serviceWindows';

/** Durée de validité du cache mémoire. */
const CACHE_TTL_MS = 30_000;

/** Délai avant de retenter Firestore après un échec (on sert la valeur en cache entre-temps). */
const ERROR_RETRY_MS = 5_000;

// Désactivé sous Vitest : les tests modifient la base entre deux cas et
// doivent toujours lire l'état réel.
const CACHE_ENABLED = process.env.NODE_ENV !== 'test';

let cache: { at: number; windows: ServiceWindows } | null = null;
let inflight: Promise<ServiceWindows> | null = null;

function isIsoDateTime(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(new Date(value).getTime());
}

function sanitizeWindow(raw: unknown): ServiceWindow {
  if (!raw || typeof raw !== 'object') return { opensAt: null, closesAt: null };
  const r = raw as Record<string, unknown>;
  return {
    opensAt: isIsoDateTime(r.opensAt) ? r.opensAt : null,
    closesAt: isIsoDateTime(r.closesAt) ? r.closesAt : null,
  };
}

/** Lecture directe de Firestore (1 lecture), sans cache. */
async function readServiceWindows(): Promise<ServiceWindows> {
  const db = getAdminDb();
  if (!db) return DEFAULT_SERVICE_WINDOWS;

  const snap = await db.collection(SETTINGS_COLLECTION).doc(SERVICE_WINDOWS_DOC).get();
  if (!snap.exists) return DEFAULT_SERVICE_WINDOWS;

  const data = snap.data() ?? {};
  return {
    candidature: sanitizeWindow(data.candidature),
    entretien: sanitizeWindow(data.entretien),
  };
}

/**
 * Lecture mise en cache PARTAGÉE entre toutes les instances (en plus du cache
 * mémoire ci-dessous) : au plus une lecture Firestore par minute au total,
 * au lieu d'une par instance serverless. Une modification admin l'invalide
 * immédiatement (voir `updateServiceWindow`).
 */
const readServiceWindowsShared = dataCache(readServiceWindows, ['service-windows'], {
  revalidate: 60,
  tags: [CACHE_TAGS.settings],
});

/** Vide le cache (utile après une modification, ou pour forcer une relecture). */
export function resetServiceWindowsCache(): void {
  cache = null;
  inflight = null;
}

/** Lit les deux fenêtres. Renvoie « pas de limite » des deux côtés si le document n'existe pas encore. */
export async function getServiceWindows(): Promise<ServiceWindows> {
  if (!CACHE_ENABLED) return readServiceWindows();

  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.windows;
  if (inflight) return inflight;

  inflight = readServiceWindowsShared()
    .then((windows) => {
      cache = { at: Date.now(), windows };
      return windows;
    })
    .catch((err) => {
      if (cache) {
        // Firestore illisible (quota dépassé, panne…) : on garde la dernière
        // valeur connue et on retentera dans quelques secondes seulement.
        console.warn('[settings-store] lecture impossible, dernière valeur connue utilisée', err);
        cache = { at: Date.now() - CACHE_TTL_MS + ERROR_RETRY_MS, windows: cache.windows };
        return cache.windows;
      }
      throw err;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

/** Met à jour la fenêtre d'UN service (l'autre n'est pas touchée) et renvoie l'état complet à jour. */
export async function updateServiceWindow(
  service: ServiceKey,
  window: ServiceWindow,
): Promise<ServiceWindows> {
  const db = getAdminDb();
  if (!db) throw new Error('Base de données indisponible.');

  const ref = db.collection(SETTINGS_COLLECTION).doc(SERVICE_WINDOWS_DOC);
  await ref.set(
    { [service]: window, updatedAt: new Date().toISOString() },
    { merge: true },
  );

  // Les valeurs en cache sont périmées : relecture immédiate de la valeur à jour.
  invalidate(CACHE_TAGS.settings);
  resetServiceWindowsCache();
  return getServiceWindows();
}

export type ServiceWindowState = { window: ServiceWindow; status: ServiceStatus };

/** Fenêtres + statut calculé (maintenant) pour les deux services — pratique pour pages et routes API. */
export async function getServiceWindowStates(
  now: Date = new Date(),
): Promise<Record<ServiceKey, ServiceWindowState>> {
  const windows = await getServiceWindows();
  const result = {} as Record<ServiceKey, ServiceWindowState>;
  for (const key of SERVICE_KEYS) {
    result[key] = { window: windows[key], status: getServiceStatus(windows[key], now) };
  }
  return result;
}