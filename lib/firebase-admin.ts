// lib/firebase-admin.ts
//
// Firebase côté SERVEUR (routes API uniquement — jamais importé par un
// composant client). Utilise le SDK Admin, qui a des droits complets sur
// Firestore et peut vérifier l'authenticité des ID tokens envoyés par le
// client. C'est ce module qui "assure la crédibilité" des soumissions :
// on ne fait jamais confiance à un email tapé/fourni par le client, on
// vérifie systématiquement le token Firebase et on récupère l'email
// depuis le token décodé côté serveur.

import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

function getAdminApp(): App | null {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  // Sur Vercel, la clé privée est stockée avec des \n littéraux : il faut
  // les reconvertir en vrais retours à la ligne.
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) return null;

  if (getApps().length) return getApps()[0];

  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  });
}

export function isFirebaseAdminConfigured(): boolean {
  return Boolean(
    process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY,
  );
}

export function getAdminAuth(): Auth | null {
  const app = getAdminApp();
  return app ? getAuth(app) : null;
}

export function getAdminDb(): Firestore | null {
  const app = getAdminApp();
  return app ? getFirestore(app) : null;
}

/**
 * Vérifie le ID token Firebase envoyé dans l'en-tête Authorization et
 * renvoie l'email authentifié, ou null si le token est absent/invalide.
 * C'est la seule source de vérité pour "qui envoie cette requête" — on
 * n'utilise jamais un champ email fourni librement par le client.
 */
export async function getVerifiedEmail(request: Request): Promise<string | null> {
  const authHeader = request.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return null;

  const auth = getAdminAuth();
  if (!auth) return null;

  try {
    const decoded = await auth.verifyIdToken(token);
    return decoded.email && decoded.email_verified ? decoded.email : decoded.email ?? null;
  } catch {
    return null;
  }
}
