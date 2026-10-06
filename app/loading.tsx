// app/loading.tsx
//
// Fichier spécial du App Router : Next.js affiche automatiquement ce
// composant (via un Suspense boundary implicite) pendant le chargement
// d'un segment de route sous app/ — navigation vers une page, ou attente
// des données d'un composant serveur. Aucun appel manuel nécessaire.
//
// L'écran est affiché dans un calque plein écran fixé à la fenêtre
// (voir loading.module.css) : le logo et ses effets restent visibles à
// tout moment, même si la page était défilée, et le header / footer du
// layout sont simplement recouverts (ils ne sont pas supprimés).
import LoadingScreen from '@/components/layout/LoadingScreen';
import styles from './loading.module.css';

export default function Loading() {
  return (
    <div className={styles.overlay}>
      <LoadingScreen full />
    </div>
  );
}