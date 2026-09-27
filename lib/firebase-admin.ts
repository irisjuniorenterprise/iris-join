import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function getAdminApp() {
  if (getApps().length) return getApps()[0];

  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey,
    }),
  });
}

const adminApp = getAdminApp();
export const adminAuth = getAuth(adminApp);
export const adminDb = getFirestore(adminApp);

// Vérifie le ID token envoyé par le client et renvoie l'email vérifié.
// À utiliser dans TOUTES les routes API qui touchent aux données d'un candidat.
export async function verifyIdToken(idToken: string) {
  const decoded = await adminAuth.verifyIdToken(idToken);
  if (!decoded.email || !decoded.email_verified) {
    throw new Error("Email non vérifié");
  }
  return decoded;
}