// app/loading.tsx
//
// Fichier spécial du App Router : Next.js affiche automatiquement ce
// composant (via un Suspense boundary implicite) pendant le chargement
// d'un segment de route sous app/ — navigation vers une page, ou attente
// des données d'un composant serveur. Aucun appel manuel nécessaire.
import LoadingScreen from '@/components/layout/LoadingScreen';

export default function Loading() {
  return <LoadingScreen />;
}
