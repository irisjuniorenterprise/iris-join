'use client';
// components/ui/DepartmentCards.tsx
//
// Cartes des départements de la page d'accueil.
//  - Face avant  : icône + nom du département (lisible en un coup d'œil).
//  - Face arrière: missions du département + bouton de candidature.
// La carte pivote autour de son axe vertical :
//  - souris   : au survol ;
//  - tactile  : au toucher (re-toucher pour revenir) ;
//  - clavier  : Entrée / Espace pour retourner, Échap pour revenir.
// Au premier affichage à l'écran, les cartes « s'entrouvrent » une fois
// (animation courte) pour signaler qu'elles sont interactives. Cette
// animation est désactivée si l'utilisateur préfère réduire les animations.
import Link from 'next/link';
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { Icons } from '@/components/icons/Icons';
import styles from './DepartmentCards.module.css';

type Tone = 'it' | 'marketing' | 'etudes' | 'commercial';

type Department = {
  key: string;
  label: string;
  tone: Tone;
  icon: (typeof Icons)['Code'];
  missions: string[];
};

const DEPARTMENTS: Department[] = [
  {
    key: 'it',
    label: 'IT',
    tone: 'it',
    icon: Icons.Code,
    missions: ['Développement web', 'Développement mobile', 'Création de chatbots'],
  },
  {
    key: 'marketing',
    label: 'Marketing',
    tone: 'marketing',
    icon: Icons.MarketingMegaphone,
    missions: ['Branding', 'Rebranding', 'Community management'],
  },
  {
    key: 'etudes',
    label: 'Études',
    tone: 'etudes',
    icon: Icons.VisibilitySurvey,
    missions: [
      'Études de marché',
      'Études de notoriété',
      'Études de satisfaction',
      'Plans d’affaires',
    ],
  },
  {
    key: 'dev-co',
    label: 'Développement commercial',
    tone: 'commercial',
    icon: Icons.TrendUp,
    missions: [
      'Prospection de clients',
      'Acquisition de partenaires',
      'Acquisition de sponsors',
    ],
  },
];

function FlipIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 1 1-3-6.7" />
      <polyline points="21 3 21 9 15 9" />
    </svg>
  );
}

export default function DepartmentCards() {
  const [flipped, setFlipped] = useState<string | null>(null);
  const [peek, setPeek] = useState(false);

  const gridRef = useRef<HTMLDivElement>(null);
  const lastPointer = useRef<string>('');
  const frontRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const ctaRefs = useRef<Record<string, HTMLAnchorElement | null>>({});

  // « Coup d'œil » unique quand la grille entre dans l'écran.
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    if (
      typeof IntersectionObserver === 'undefined' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setPeek(true);
          observer.disconnect();
        }
      },
      { threshold: 0.45 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  function onPointerDown(e: PointerEvent) {
    lastPointer.current = e.pointerType;
  }

  function onPointerEnter(key: string, e: PointerEvent) {
    if (e.pointerType === 'mouse') setFlipped(key);
  }

  function onPointerLeave(key: string, e: PointerEvent) {
    if (e.pointerType === 'mouse') setFlipped((cur) => (cur === key ? null : cur));
  }

  // Souris : le survol gère tout, le clic ne doit pas re-retourner la carte.
  // Tactile / clavier : le clic (ou Entrée / Espace sur le bouton) bascule.
  function onClick(key: string) {
    if (lastPointer.current === 'mouse') {
      lastPointer.current = '';
      return;
    }
    const opening = flipped !== key;
    setFlipped(opening ? key : null);
    if (opening) {
      // Le focus suit la face visible, pour les utilisateurs au clavier.
      requestAnimationFrame(() => ctaRefs.current[key]?.focus({ preventScroll: true }));
    }
  }

  function onKeyDown(key: string, e: KeyboardEvent) {
    lastPointer.current = '';
    if (e.key === 'Escape' && flipped === key) {
      setFlipped(null);
      frontRefs.current[key]?.focus({ preventScroll: true });
    }
  }

  return (
    <>
      <p className={styles.hint}>
        <span className={styles.hintIcon}>
          <FlipIcon />
        </span>
        <span className={styles.hintHover}>
          Survolez une carte pour découvrir les missions du département.
        </span>
        <span className={styles.hintTouch}>
          Touchez une carte pour découvrir les missions du département.
        </span>
      </p>

      <div className={styles.grid} ref={gridRef}>
        {DEPARTMENTS.map((d, index) => {
          const isFlipped = flipped === d.key;
          const Icon = d.icon;
          return (
            <div
              key={d.key}
              className={`${styles.card} ${styles[d.tone]}`}
              data-flipped={isFlipped}
              data-peek={peek}
              style={{ '--i': index } as CSSProperties}
              onPointerDown={onPointerDown}
              onPointerEnter={(e) => onPointerEnter(d.key, e)}
              onPointerLeave={(e) => onPointerLeave(d.key, e)}
              onClick={() => onClick(d.key)}
              onKeyDown={(e) => onKeyDown(d.key, e)}
            >
              <div className={styles.inner}>
                {/* Face avant : le titre est un vrai <h3> (lisible par les lecteurs d'écran
                    et les tests), le bouton « Voir les missions » reste l'élément focusable. */}
                <div className={`${styles.face} ${styles.front}`}>
                  <span className={styles.iconTile} aria-hidden="true">
                    <Icon size={34} />
                  </span>
                  <h3 className={styles.title}>{d.label}</h3>
                  <button
                    type="button"
                    className={styles.more}
                    ref={(el) => {
                      frontRefs.current[d.key] = el;
                    }}
                    aria-expanded={isFlipped}
                    aria-label={`Afficher les missions du département ${d.label}`}
                    tabIndex={isFlipped ? -1 : 0}
                  >
                    <FlipIcon size={14} />
                    Voir les missions
                  </button>
                </div>

                {/* Face arrière */}
                <div className={`${styles.face} ${styles.back}`} aria-hidden={!isFlipped}>
                  <div className={styles.backHead}>
                    <span className={styles.backIcon}>
                      <Icon size={20} />
                    </span>
                    <h3 className={styles.backTitle}>{d.label}</h3>
                  </div>

                  <p className={styles.backLabel}>Missions du département</p>
                  <ul className={styles.missions}>
                    {d.missions.map((m) => (
                      <li key={m}>
                        <Icons.Check size={14} />
                        <span>{m}</span>
                      </li>
                    ))}
                  </ul>

                  <Link
                    href="/candidature"
                    className={styles.cta}
                    tabIndex={isFlipped ? 0 : -1}
                    ref={(el) => {
                      ctaRefs.current[d.key] = el;
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    Postuler en {d.label}
                    <Icons.ChevronRight size={16} />
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}