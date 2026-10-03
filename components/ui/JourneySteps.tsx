'use client';
// components/ui/JourneySteps.tsx
//
// Parcours candidat de la page d'accueil : 3 étapes reliées par des
// chevrons. Apparition progressive (étape par étape) quand la section
// entre dans l'écran, survol animé, et liens directs vers les étapes
// 1 et 2. Sans JavaScript (ou avec « réduire les animations »), les
// étapes sont affichées immédiatement.
import Link from 'next/link';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Icons } from '@/components/icons/Icons';
import styles from './JourneySteps.module.css';

type Step = {
  icon: (typeof Icons)['Edit'];
  title: string;
  description: string;
  meta: string;
  href?: string;
  cta?: string;
};

const STEPS: Step[] = [
  {
    icon: Icons.Edit,
    title: 'Candidature en ligne',
    description:
      'Renseignez votre profil et votre motivation pour le département de votre choix. Quinze minutes suffisent.',
    meta: '≈ 5 min',
    href: '/candidature',
    cta: 'Déposer ma candidature',
  },
  {
    icon: Icons.Calendar,
    title: 'Réservation d’entretien',
    description:
      'Choisissez vous-même votre créneau dans l’agenda des entretiens, selon vos disponibilités.',
    meta: '≈ 30 s',
    href: '/entretien',
    cta: 'Choisir mon créneau',
  },
  {
    icon: Icons.FileCheck,
    title: 'Entretien & décision',
    description:
      'Rencontrez l’équipe, échangez sur vos motivations, et recevez la décision le plus rapidement possible.',
    meta: 'Réponse rapide',
  },
];

type Phase = 'ssr' | 'hidden' | 'shown';

export default function JourneySteps() {
  const [phase, setPhase] = useState<Phase>('ssr');
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const el = listRef.current;
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
      { threshold: 0.2 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <ol className={styles.track} ref={listRef} data-phase={phase}>
      {STEPS.map((step, index) => {
        const Icon = step.icon;
        const isLast = index === STEPS.length - 1;
        return (
          <li key={step.title} className={styles.step} style={{ '--i': index } as CSSProperties}>
            <div className={styles.card}>
              <span className={styles.bar} aria-hidden="true" />
              <span className={styles.watermark} aria-hidden="true">
                {index + 1}
              </span>

              <div className={styles.top}>
                <span className={styles.iconTile}>
                  <Icon size={26} />
                </span>
                <div className={styles.labels}>
                  <span className={styles.index}>Étape {index + 1}</span>
                  <span className={styles.meta}>
                    {index < 2 ? <Icons.Clock size={12} /> : <Icons.Check size={12} />}
                    {step.meta}
                  </span>
                </div>
              </div>

              <h3 className={styles.title}>{step.title}</h3>
              <p className={styles.description}>{step.description}</p>

              {step.href && step.cta && (
                <Link href={step.href} className={styles.link}>
                  {step.cta}
                  <Icons.ChevronRight size={16} />
                </Link>
              )}
            </div>

            {!isLast && (
              <span className={styles.connector} aria-hidden="true">
                <Icons.ChevronRight size={20} />
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}