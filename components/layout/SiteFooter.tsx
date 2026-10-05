// components/layout/SiteFooter.tsx
//
// Enveloppe SERVEUR du pied de page : lit la configuration de l'admin
// (fenêtres d'ouverture) et décide quels liens du parcours candidat
// afficher (voir lib/footer-links.ts). Le rendu visuel reste dans Footer.
//
// Le pied de page dépend de l'heure et d'un réglage modifiable sans
// redéploiement : `connection()` exclut le rendu statique (sinon l'état
// du build serait figé). Pour ne pas lire Firestore à chaque page vue,
// les fenêtres sont gardées 30 s en mémoire ; l'état (ouvert / fermé) est
// en revanche recalculé à chaque requête avec l'heure actuelle.
import { connection } from 'next/server';
import { getServiceWindows } from '@/lib/settings-store';
import { DEFAULT_SERVICE_WINDOWS, type ServiceWindows } from '@/lib/service-window';
import { getFooterLinks } from '@/lib/footer-links';
import Footer from './Footer';

const CACHE_MS = 30_000;

let cache: { at: number; windows: ServiceWindows } | null = null;

async function loadWindows(): Promise<ServiceWindows> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.windows;
  try {
    const windows = await getServiceWindows();
    cache = { at: Date.now(), windows };
    return windows;
  } catch (err) {
    // Réglages illisibles : on ne casse pas la page, on affiche le parcours « ouvert ».
    console.warn('[footer] lecture des périodes impossible, liens par défaut', err);
    return cache?.windows ?? DEFAULT_SERVICE_WINDOWS;
  }
}

export default async function SiteFooter() {
  await connection();
  const windows = await loadWindows();
  return <Footer links={getFooterLinks(windows)} />;
}
