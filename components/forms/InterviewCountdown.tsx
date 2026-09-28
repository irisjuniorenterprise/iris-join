'use client';
// components/forms/InterviewCountdown.tsx
//
// Compte à rebours de l'entretien réservé, en temps réel :
//  - avant le début  : temps restant (jours / heures / minutes / secondes) ;
//  - pendant         : temps écoulé depuis le début + barre de progression ;
//  - après la fin    : message « entretien terminé ».
//
// Choix pour un rendu fluide :
//  - le tick est aligné sur la seconde réelle (pas de dérive ni de saut) ;
//  - la valeur est recalculée depuis Date.now() à chaque tick, et
//    immédiatement quand l'onglet redevient visible ;
//  - chiffres tabulaires + largeur fixe : rien ne « bouge » quand ça change ;
//  - le tick s'arrête une fois l'entretien terminé ;
//  - un squelette de même hauteur évite tout saut de mise en page au montage
//    (et tout écart d'hydratation SSR : l'heure n'est lue que côté client) ;
//  - les chiffres sont masqués aux lecteurs d'écran (pas d'annonce chaque
//    seconde) ; seul le changement de phase est annoncé.
import { useEffect, useState } from 'react';
import { Icons } from '@/components/icons/Icons';
import {
  INTERVIEW_DURATION_MINUTES,
  formatClockTunis,
  getSlotEndMs,
  getSlotStartMs,
} from '@/lib/interview';
import styles from './InterviewCountdown.module.css';

type Phase = 'upcoming' | 'ongoing' | 'ended';

type Props = {
  /** "2026-10-14" */
  date: string;
  /** "10:30" (heure de Tunis) */
  time: string;
};

/** Seuil à partir duquel le compte à rebours passe en « bientôt » (accent orange). */
const SOON_THRESHOLD_MS = 10 * 60_000;

/**
 * Horloge partagée du composant. Renvoie `null` avant le montage côté client,
 * puis l'heure courante, rafraîchie à chaque seconde réelle. S'arrête à `stopAt`.
 */
function useNow(stopAt: number): number | null {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = () => {
      const current = Date.now();
      setNow(current);
      if (current >= stopAt) return; // terminé : plus besoin de tourner
      // Prochain tick juste après le passage à la seconde suivante.
      timer = setTimeout(tick, 1000 - (current % 1000) + 8);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      if (timer) clearTimeout(timer);
      tick(); // resynchronisation immédiate après un onglet en veille
    };

    tick();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [stopAt]);

  return now;
}

function splitDuration(totalSeconds: number) {
  const total = Math.max(0, totalSeconds);
  return {
    days: Math.floor(total / 86_400),
    hours: Math.floor((total % 86_400) / 3_600),
    minutes: Math.floor((total % 3_600) / 60),
    seconds: total % 60,
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

function Cell({ value, unit }: { value: number; unit: string }) {
  return (
    <div className={styles.cell}>
      <span className={styles.value}>{pad(value)}</span>
      <span className={styles.unit}>{unit}</span>
    </div>
  );
}

function plural(n: number, one: string, many: string) {
  return n > 1 ? many : one;
}

export default function InterviewCountdown({ date, time }: Props) {
  const startMs = getSlotStartMs(date, time);
  const endMs = getSlotEndMs(date, time);
  const valid = Number.isFinite(startMs);
  const now = useNow(valid ? endMs : 0);

  if (!valid) return null;

  // Avant le montage : squelette de même hauteur (aucun saut de mise en page).
  if (now === null) {
    return <div className={`${styles.root} ${styles.skeleton}`} aria-hidden="true" />;
  }

  const phase: Phase = now < startMs ? 'upcoming' : now < endMs ? 'ongoing' : 'ended';
  const startLabel = formatClockTunis(startMs);
  const endLabel = formatClockTunis(endMs);

  /* ----------------------------- Terminé ----------------------------- */
  if (phase === 'ended') {
    return (
      <div className={styles.root} data-phase="ended">
        <div className={styles.panel} key="ended">
          <span className={styles.endedBadge} aria-hidden="true">
            <Icons.Check size={22} />
          </span>
          <p className={styles.kicker}>Entretien terminé</p>
          <p className={styles.note}>
            Votre créneau de {startLabel} à {endLabel+" "} est écoulé. Merci pour votre participation :
            l&rsquo;équipe IRIS JE reviendra vers vous prochainement.
          </p>
        </div>
        <p className="sr-only" role="status" aria-live="polite">
          Votre entretien est terminé.
        </p>
      </div>
    );
  }

  /* ---------------------------- En cours ---------------------------- */
  if (phase === 'ongoing') {
    const elapsedSeconds = Math.floor((now - startMs) / 1000);
    const { minutes, seconds } = splitDuration(elapsedSeconds);
    const progress = Math.min(1, (now - startMs) / (endMs - startMs));
    const label = `Commencé depuis ${minutes} ${plural(minutes, 'minute', 'minutes')} et ${seconds} ${plural(seconds, 'seconde', 'secondes')}`;

    return (
      <div className={styles.root} data-phase="ongoing">
        <div className={styles.panel} key="ongoing">
          <p className={styles.kicker}>
            <span className={styles.liveDot} aria-hidden="true" />
            Entretien en cours
          </p>
          <p className={styles.caption} aria-hidden="true">
            Commencé depuis
          </p>

          <div className={styles.cells} role="timer" aria-live="off" aria-label={label}>
            <Cell value={minutes} unit="min" />
            <Cell value={seconds} unit="sec" />
          </div>

          <div className={styles.track} aria-hidden="true">
            <div className={styles.fill} style={{ transform: `scaleX(${progress})` }} />
          </div>

          <p className={styles.note}>
            Début à {startLabel} · fin prévue à {endLabel} ({INTERVIEW_DURATION_MINUTES} min). Si vous
            n&rsquo;êtes pas encore sur place, présentez-vous à l&rsquo;équipe IRIS JE.
          </p>
        </div>
        <p className="sr-only" role="status" aria-live="polite">
          Votre entretien est en cours.
        </p>
      </div>
    );
  }

  /* ---------------------------- À venir ---------------------------- */
  const remainingMs = startMs - now;
  // ceil : le décompte affiche 1 s juste avant le début, puis bascule à « en cours ».
  const { days, hours, minutes, seconds } = splitDuration(Math.ceil(remainingMs / 1000));
  const soon = remainingMs <= SOON_THRESHOLD_MS;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days} ${plural(days, 'jour', 'jours')}`);
  if (days > 0 || hours > 0) parts.push(`${hours} ${plural(hours, 'heure', 'heures')}`);
  parts.push(`${minutes} ${plural(minutes, 'minute', 'minutes')}`);
  parts.push(`${seconds} ${plural(seconds, 'seconde', 'secondes')}`);
  const label = `Votre entretien commence dans ${parts.join(', ')}`;

  return (
    <div className={styles.root} data-phase="upcoming" data-tone={soon ? 'soon' : undefined}>
      <div className={styles.panel} key="upcoming">
        <p className={styles.kicker}>Votre entretien commence dans</p>

        <div className={styles.cells} role="timer" aria-live="off" aria-label={label}>
          {days > 0 && <Cell value={days} unit={plural(days, 'jour', 'jours')} />}
          {(days > 0 || hours > 0) && <Cell value={hours} unit="h" />}
          <Cell value={minutes} unit="min" />
          <Cell value={seconds} unit="sec" />
        </div>

        <p className={styles.note}>
          Début prévu à {startLabel} · durée {INTERVIEW_DURATION_MINUTES} min
        </p>
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        Votre entretien n&rsquo;a pas encore commencé.
      </p>
    </div>
  );
}