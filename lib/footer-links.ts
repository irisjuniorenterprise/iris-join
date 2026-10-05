// lib/footer-links.ts
//
// Règle d'affichage des liens « parcours candidat » du pied de page, selon
// la configuration de l'administration (fenêtres d'ouverture, voir
// lib/service-window.ts). Fonction pure : importable partout, testable.
//
//  - Candidature : lien affiché tant qu'elle n'est PAS fermée (pas encore
//    ouverte ou ouverte). Une fois fermée, le lien disparaît.
//  - Entretien   : même règle (pas encore ouvert ou ouvert -> lien affiché).
//  - Résultat    : lien affiché uniquement quand la candidature est fermée,
//    en remplacement du lien de candidature.
import { getServiceStatus, type ServiceWindows } from './service-window';

export type FooterLinks = {
  candidature: boolean;
  entretien: boolean;
  resultats: boolean;
};

/** Valeurs de repli (réglages illisibles) : parcours de candidature ouvert, pas de résultat. */
export const DEFAULT_FOOTER_LINKS: FooterLinks = {
  candidature: true,
  entretien: true,
  resultats: false,
};

export function getFooterLinks(windows: ServiceWindows, now: Date = new Date()): FooterLinks {
  const candidatureClosed = getServiceStatus(windows.candidature, now).state === 'closed';
  const entretienClosed = getServiceStatus(windows.entretien, now).state === 'closed';

  return {
    candidature: !candidatureClosed,
    entretien: !entretienClosed,
    resultats: candidatureClosed,
  };
}
