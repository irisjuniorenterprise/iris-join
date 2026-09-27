"use client";

import { useAuth } from "@/lib/auth";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading, signIn } = useAuth();

  if (loading) return <p>Chargement...</p>;

  if (!user) {
    return (
      <button onClick={signIn}>
        Se connecter avec Google pour continuer
      </button>
    );
  }

  return <>{children}</>;
}
