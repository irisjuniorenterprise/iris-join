'use client';
// components/resultats/ResultatsGate.tsx
//
// Composant client séparé de la page (un Server Component ne peut pas
// passer une fonction en enfant à un Client Component) : connexion Google
// puis affichage du résultat du candidat. Aucune fenêtre de disponibilité
// ici : c'est la publication des résultats par l'admin qui ouvre l'accès.
import AuthGate from '@/components/forms/AuthGate';
import ResultCard from '@/components/resultats/ResultCard';

export default function ResultatsGate() {
  return (
    <AuthGate actionLabel="la consultation de votre résultat">
      {(verifiedEmail) => <ResultCard verifiedEmail={verifiedEmail} />}
    </AuthGate>
  );
}