"use client";
// lib/auth.tsx

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  browserLocalPersistence,
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { getFirebaseAuth, isFirebaseConfigured } from "./firebase";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  configured: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  error: string | null;
  /** ID token Firebase à envoyer en Authorization: Bearer <token> vers nos API routes. */
  getIdToken: () => Promise<string | null>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function getErrorCode(error: unknown): string {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : "";
}

function translateAuthError(error: unknown): string {
  const code = getErrorCode(error);
  switch (code) {
    case "auth/popup-blocked":
      return "La fenêtre de connexion a été bloquée par votre navigateur. Autorisez les pop-ups puis réessayez.";
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "Connexion annulée.";
    case "auth/operation-not-supported-in-this-environment":
      return "La connexion n'est pas prise en charge par ce navigateur. Ouvrez la page dans Safari ou Chrome (pas dans l'app Instagram/Facebook/TikTok) puis réessayez.";
    case "auth/unauthorized-domain":
      return "Le domaine n'est pas autorisé pour Firebase Auth. Ajoutez-le dans la console Firebase (Authentication > Settings > Authorized domains).";
    case "auth/account-exists-with-different-credential":
      return "Un compte existe déjà avec cette adresse via un autre fournisseur. Connectez-vous avec ce fournisseur.";
    case "auth/web-storage-unsupported":
    case "auth/network-request-failed":
      return "Votre navigateur bloque le stockage nécessaire à la connexion (navigation privée, cookies tiers bloqués, ou navigateur intégré à une app). Essayez d'ouvrir le site dans Safari ou Chrome directement.";
    default:
      return "La connexion avec Google a échoué. Veuillez réessayer.";
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isFirebaseConfigured();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(configured);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!configured) {
      setLoading(false);
      return;
    }
    const auth = getFirebaseAuth();
    if (!auth) {
      setLoading(false);
      return;
    }

    let authStateSettled = false;
    let redirectSettled = false;

    const maybeStopLoading = () => {
      if (authStateSettled && redirectSettled) {
        setLoading(false);
      }
    };

    void setPersistence(auth, browserLocalPersistence).catch(() => undefined);

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      authStateSettled = true;
      maybeStopLoading();
    });

    getRedirectResult(auth)
      .catch((redirectError: unknown) => {
        setError(translateAuthError(redirectError));
      })
      .finally(() => {
        redirectSettled = true;
        maybeStopLoading();
      });

    return () => unsubscribe();
  }, [configured]);

  const signInWithGoogle = async () => {
    setError(null);
    const auth = getFirebaseAuth();
    if (!auth) {
      setError(
        "La configuration Firebase est manquante. Renseignez les variables d'environnement (voir .env.example)."
      );
      return;
    }

    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });

    // Popup privilégié sur tous les appareils (voir note projet d'origine) :
    // évite les problèmes de partage de stockage cross-site sur mobile
    // (Safari ITP, etc.) qui font échouer silencieusement la redirection.
    try {
      await signInWithPopup(auth, provider);
      return;
    } catch (err) {
      const code = getErrorCode(err);
      const popupUnavailable =
        code === "auth/popup-blocked" ||
        code === "auth/operation-not-supported-in-this-environment" ||
        code === "auth/cancelled-popup-request";

      if (!popupUnavailable) {
        setError(translateAuthError(err));
        return;
      }

      try {
        await setPersistence(auth, browserLocalPersistence);
        await signInWithRedirect(auth, provider);
      } catch (redirectErr) {
        setError(translateAuthError(redirectErr));
      }
    }
  };

  const signOut = async () => {
    const auth = getFirebaseAuth();
    if (!auth) return;
    await firebaseSignOut(auth);
  };

  const getIdToken = async (): Promise<string | null> => {
    const auth = getFirebaseAuth();
    if (!auth?.currentUser) return null;
    try {
      return await auth.currentUser.getIdToken();
    } catch {
      return null;
    }
  };

  const value = useMemo(
    () => ({ user, loading, configured, signInWithGoogle, signOut, error, getIdToken }),
    [user, loading, configured, error]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth doit être utilisé à l'intérieur de <AuthProvider>.");
  }
  return ctx;
}
