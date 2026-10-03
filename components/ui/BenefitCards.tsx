'use client';
// components/ui/BenefitCards.tsx
//
// Section « Pourquoi nous rejoindre » : 4 cartes avantages.
//  - apparition progressive quand la section entre dans l'écran ;
//  - survol : la carte monte, un halo suit le curseur, l'icône se colore
//    et pivote, un liseré se déploie ;
//  - sans JavaScript ou avec « réduire les animations » : affichage direct.
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from 'react';
import { Icons } from '@/components/icons/Icons';
import styles from './BenefitCards.module.css';

type Benefit = {
  icon: (typeof Icons)['Briefcase'];
  title: string;
  description: string;
  tag: string;
  tone: string; // couleur d'accent, en "r, g, b"
};

const BENEFITS: Benefit[] = [
  {
    icon: Icons.Briefcase,
    title: 'Projets clients réels',
    description:
      'Vous travaillez sur de vrais mandats, pour de vraies entreprises, pas des exercices fictifs.',
    tag: 'Terrain',
    tone: '26, 57, 105',
  },
  {
    icon: Icons.GraduationCap,
    title: 'Montée en compétences',
    description:
      'Formations internes et externes, en hard skills comme en soft skills, pour progresser tout au long de votre parcours.',
    tag: 'Formation',
    tone: '255, 102, 51',
  },
  {
    icon: Icons.Handshake,
    title: 'Un vrai réseau',
    description:
      'Entreprises partenaires, alumni IRIS JE, et le reste du réseau des Junior-Entreprises tunisiennes.',
    tag: 'Réseau',
    tone: '47, 127, 161',
  },
  {
    icon: Icons.Crown,
    title: 'Un rôle clair',
    description: 'Le membre actif se concentre sur la réalisation des missions.',
    tag: 'Clarté',
    tone: '42, 90, 160',
  },
];

type Phase = 'ssr' | 'hidden' | 'shown';

export default function BenefitCards() {
  const [phase, setPhase] = useState<Phase>('ssr');
  const gridRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;

    if (
      typeof IntersectionObserver === 'undefined' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setPhase('shown');
      return;
    }

    setPhase('hidden');
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setPhase('shown');
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Position du curseur dans la carte -> halo lumineux qui suit la souris.
  function onPointerMove(e: PointerEvent<HTMLElement>) {
    if (e.pointerType !== 'mouse') return;
    const rect = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--mx', `${e.clientX - rect.left}px`);
    e.currentTarget.style.setProperty('--my', `${e.clientY - rect.top}px`);
  }

  return (
    <ul className={styles.grid} ref={gridRef} data-phase={phase}>
      {BENEFITS.map((b, index) => {
        const Icon = b.icon;
        return (
          <li
            key={b.title}
            className={styles.item}
            style={{ '--i': index, '--tone': b.tone } as CSSProperties}
          >
            <article className={styles.card} onPointerMove={onPointerMove} tabIndex={0}>
              <span className={styles.spotlight} aria-hidden="true" />
              <span className={styles.corner} aria-hidden="true" />

              <span className={styles.iconTile}>
                <Icon size={26} />
              </span>

              <h3 className={styles.title}>{b.title}</h3>
              <p className={styles.description}>{b.description}</p>

              <span className={styles.footer}>
                <span className={styles.tag}>{b.tag}</span>
                <span className={styles.arrow} aria-hidden="true">
                  <Icons.ChevronRight size={16} />
                </span>
              </span>
            </article>
          </li>
        );
      })}
    </ul>
  );
}