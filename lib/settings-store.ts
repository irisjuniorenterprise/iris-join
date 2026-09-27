// lib/settings-store.ts
//
// Persistance des fenêtres de disponibilité des services publics
// (candidature, entretien) — SERVEUR uniquement (utilise firebase-admin,
// jamais importé par un composant client). Un seul document Firestore
// (settings/serviceWindows) porte les deux périodes : simple à lire en
// un aller, simple à modifier depuis le panneau admin.
import { getAdminDb } from './firebase-admin';
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

/** Lit les deux fenêtres. Renvoie « pas de limite » des deux côtés si le document n'existe pas encore. */
export async function getServiceWindows(): Promise<ServiceWindows> {
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