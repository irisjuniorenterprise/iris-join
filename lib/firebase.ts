// lib/firebase.ts
//
// Firebase côté CLIENT — Auth uniquement. Volontairement minimal : le
// navigateur n'a besoin que de pouvoir authentifier l'utilisateur (Google
// Sign-In) pour obtenir un ID token vérifiable. Toute lecture/écriture de
// données (candidatures, créneaux) passe par nos routes API, qui utilisent
// Firebase Admin (lib/firebase-admin.ts) côté serveur — jamais le SDK
// client Firestore directement, pour garder les règles de sécurité et la
// logique métier (anti-double-réservation, etc.) centralisées côté serveur.

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export function isFirebaseConfigured(): boolean {
  return Boolean(
    firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId,
  );
}

let app: FirebaseApp | null = null;

function getFirebaseApp(): FirebaseApp | null {
  if (!isFirebaseConfigured()) return null;
  if (!app) {
    app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  }
  return app;
}

export function getFirebaseAuth(): Auth | null {
  const a = getFirebaseApp();
  if (!a) return null;
  return getAuth(a);
}
