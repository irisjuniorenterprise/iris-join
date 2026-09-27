'use client';
// components/ui/ScrollDownButton.tsx
//
// Bouton flottant « descendez » qui guide l'utilisateur étape par étape.
//
// On lui donne une liste ORDONNÉE d'étapes (`steps`), chacune pointant vers
// un élément de la page. Le dernier élément de la liste est la destination
// finale :
//   - tant que cette destination n'est pas à l'écran (elle est cachée plus
//     bas), le bouton est affiché ;
//   - il pointe vers la première étape encore cachée sous l'écran
//     (ex. « 1 · Choisir un jour », puis « 2 · Choisir une heure ») ;
//   - dès que la destination est visible (ou déjà dépassée), il disparaît.
// Un clic amène l'étape affichée en haut de l'écran (défilement fluide, sauf
// si l'utilisateur a demandé à réduire les animations) et déplace le focus.
//
// La couleur suit --dept / --dept-rgb si le bouton est rendu dans un parent
// qui les définit (ex. SlotPicker), sinon la couleur primaire IRIS est utilisée.
import { useEffect, useState, type RefObject } from 'react';
import { Icons } from '@/components/icons/Icons';
import styles from './ScrollDownButton.module.css';

export type ScrollDownStep = {
  /** Élément ciblé. Il doit avoir tabIndex={-1} pour recevoir le focus après le clic. */
  ref: RefObject<HTMLElement | null>;
  /** Texte du bouton pour cette étape. */
  label: string;
  /** Libellé lu par les lecteurs d'écran (par défaut : `label`). */
  ariaLabel?: string;
  /** Numéro affiché dans la pastille à gauche du texte (facultatif). */
  number?: number;
};

type ScrollDownButtonProps = {
  /** Étapes dans l'ordre d'apparition sur la page. Le tableau doit être stable (useMemo). */
  steps: ScrollDownStep[];
  /** Mettre à false pour forcer le masquage du bouton. */
  enabled?: boolean;
};

type Position = 'above' | 'visible' | 'below';

export default function ScrollDownButton({ steps, enabled = true }: ScrollDownButtonProps) {
  const [visible, setVisible] = useState(false);
  // Étape affichée : on la conserve quand le bouton se masque pour que le
  // texte ne change pas pendant l'animation de sortie.
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const targets = steps.map((step) => step.ref.current);
    if (
      !enabled ||
      steps.length === 0 ||
      typeof IntersectionObserver === 'undefined' ||
      targets.some((target) => target === null)
    ) {
      setVisible(false);
      return;
    }

    const elements = targets as HTMLElement[];
    const positions: Position[] = elements.map(() => 'visible');

    // Un élément est « visible » dès que son haut entre dans les 75 % supérieurs
    // de l'écran : le bouton reste tant que le contenu n'est pas réellement là.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const i = elements.indexOf(entry.target as HTMLElement);
          if (i === -1) continue;
          positions[i] = entry.isIntersecting
            ? 'visible'
            : entry.boundingClientRect.top > 0
              ? 'below'
              : 'above';
        }

        // Destination finale à l'écran (ou dépassée) : plus rien à indiquer.
        if (positions[positions.length - 1] !== 'below') {
          setVisible(false);
          return;
        }
        // Sinon on pointe vers la première étape encore cachée en bas.
        setIndex(positions.indexOf('below'));
        setVisible(true);
      },
      { rootMargin: '0px 0px -25% 0px' },
    );

    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [steps, enabled]);

  const step = steps[index] ?? steps[0];
  if (!step) return null;

  function handleClick() {
    const target = step.ref.current;
    if (!target) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    target.focus({ preventScroll: true });
  }

  return (
    <div className={styles.wrap} data-visible={visible} aria-hidden={!visible}>
      <button
        type="button"
        className={styles.button}
        onClick={handleClick}
        aria-label={step.ariaLabel ?? step.label}
        tabIndex={visible ? 0 : -1}
      >
        {/* key : rejoue l'animation d'entrée quand on passe à l'étape suivante */}
        <span key={index} className={styles.content}>
          {step.number !== undefined && (
            <span className={styles.chip} aria-hidden="true">
              {step.number}
            </span>
          )}
          <span className={styles.label}>{step.label}</span>
        </span>
        <span className={styles.arrow} aria-hidden="true">
          <span className={styles.chevrons}>
            <Icons.ChevronDown size={26} strokeWidth={3} className={styles.chevron} />
            <Icons.ChevronDown size={26} strokeWidth={3} className={styles.chevron} />
          </span>
        </span>
      </button>
    </div>
  );
}