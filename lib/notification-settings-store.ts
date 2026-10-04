// lib/notification-settings-store.ts
//
// Persistance des réglages de notification (document Firestore
// settings/notifications) — SERVEUR uniquement.
//
// La lecture ne lève jamais d'exception : si le réglage est illisible
// (base indisponible, document absent…), on retombe sur les valeurs par
// défaut, c'est-à-dire « e-mail de confirmation activé ». Un incident de
// lecture ne doit pas priver les candidats de leur confirmation.
import { getAdminDb } from './firebase-admin';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  type NotificationSettings,
} from './notification-settings';

const SETTINGS_COLLECTION = 'settings';
const NOTIFICATIONS_DOC = 'notifications';

export async function getNotificationSettings(): Promise<NotificationSettings> {
  try {
    const db = getAdminDb();
    if (!db) return { ...DEFAULT_NOTIFICATION_SETTINGS };

    const snap = await db.collection(SETTINGS_COLLECTION).doc(NOTIFICATIONS_DOC).get();
    if (!snap.exists) return { ...DEFAULT_NOTIFICATION_SETTINGS };

    const data = snap.data() ?? {};
    return {
      // Seul un « false » explicite désactive l'envoi.
      candidatureEmail: data.candidatureEmail !== false,
    };
  } catch (err) {
    console.warn('[notification-settings] lecture impossible, valeurs par défaut utilisées', err);
    return { ...DEFAULT_NOTIFICATION_SETTINGS };
  }
}

export async function updateNotificationSettings(
  patch: Partial<NotificationSettings>,
  adminEmail: string,
): Promise<NotificationSettings> {
  const db = getAdminDb();
  if (!db) throw new Error('Base de données indisponible.');

  await db
    .collection(SETTINGS_COLLECTION)
    .doc(NOTIFICATIONS_DOC)
    .set({ ...patch, updatedAt: new Date().toISOString(), updatedBy: adminEmail }, { merge: true });

  return getNotificationSettings();
}
