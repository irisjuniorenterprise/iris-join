// tests/integration/_emulator.ts
//
// Utilitaires communs aux tests d'intégration (émulateur Firestore).
// Lancez-les avec :  npm run test:emulator
//
// Sans émulateur (FIRESTORE_EMULATOR_HOST absent), les tests d'intégration
// sont simplement IGNORÉS : `npm test` reste utilisable partout.
import { generateKeyPairSync } from 'node:crypto';
import { vi } from 'vitest';

export const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
export const hasEmulator = Boolean(EMULATOR_HOST);
export const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'demo-iris-join';

/**
 * lib/firebase-admin.ts exige projectId + clientEmail + privateKey pour créer
 * l'app. Avec l'émulateur, ces identifiants ne sont jamais vérifiés : on
 * fabrique une clé RSA jetable (le SDK vérifie seulement le format PEM).
 */
export function configureAdminForEmulator(): void {
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  process.env.FIREBASE_PROJECT_ID = PROJECT_ID;
  process.env.FIREBASE_CLIENT_EMAIL = 'test@demo-iris-join.iam.gserviceaccount.com';
  process.env.FIREBASE_PRIVATE_KEY = privateKey.replace(/\n/g, '\\n');
}

/** Vide entièrement la base de l'émulateur. */
export async function clearFirestore(): Promise<void> {
  const res = await fetch(
    `http://${EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: 'DELETE' },
  );
  if (!res.ok) throw new Error(`Impossible de vider l'émulateur Firestore (${res.status})`);
}

/**
 * Charge un module de lib/ avec un état neuf (lib/slots-store garde en mémoire
 * le drapeau « grille déjà vérifiée »). `seedGrid: true` écrit le document
 * témoin meta/slots-grid pour que la grille automatique de 96 créneaux ne
 * soit PAS générée : chaque test maîtrise ainsi exactement ses créneaux.
 */
export async function freshModules(options: { seedGrid?: boolean } = {}) {
  configureAdminForEmulator();
  vi.resetModules();
  const admin = await import('@/lib/firebase-admin');
  const db = admin.getAdminDb();
  if (!db) throw new Error("Firebase Admin n'a pas pu s'initialiser");

  if (options.seedGrid !== false) {
    await db.collection('meta').doc('slots-grid').set({ version: 2 });
  }

  return {
    db,
    slots: await import('@/lib/slots-store'),
    deliberation: await import('@/lib/deliberation-store'),
    settings: await import('@/lib/settings-store'),
  };
}
