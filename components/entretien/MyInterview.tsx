'use client';
// components/entretien/MyInterview.tsx
//
// « Mon entretien » : affiche la réservation du candidat (si elle existe) avec
// le compte à rebours, MÊME quand la période de réservation est close.
// /api/reservation (GET) ne dépend pas de la fenêtre de disponibilité : il
// renvoie simplement la réservation de l'e-mail authentifié.
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { Icons } from '@/components/icons/Icons';
import InterviewCountdown from '@/components/forms/InterviewCountdown';
import { DEPARTMENT_LABELS, getDayParts, type DepartmentKey } from '@/lib/interview';
import styles from '@/components/forms/InterviewCountdown.module.css';

type BookedSlot = {
  id: string;
  date: string;
  time: string;
  department: DepartmentKey;
};

type State =
  | { status: 'loading' }
  | { status: 'none' }
  | { status: 'error' }
  | { status: 'booked'; slot: BookedSlot };

type Props = {
  /** Email vérifié via AuthGate. */
  verifiedEmail: string;
};

export default function MyInterview({ verifiedEmail }: Props) {
  const { getIdToken } = useAuth();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!verifiedEmail) return;

    let cancelled = false;
    setState({ status: 'loading' });

    (async () => {
      try {
        const idToken = await getIdToken();
        if (!idToken) throw new Error('no-token');

        const res = await fetch('/api/reservation', {
          headers: { Authorization: `Bearer ${idToken}` },
          cache: 'no-store',
        });
        const data = await res.json().catch(() => null);
        if (cancelled) return;

        if (!res.ok) {
          setState({ status: 'error' });
          return;
        }
        setState(data?.slot ? { status: 'booked', slot: data.slot } : { status: 'none' });
      } catch (err) {
        if (cancelled) return;
        console.error('[mon-entretien] échec du chargement', err);
        setState({ status: 'error' });
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verifiedEmail, reloadKey]);

  if (!verifiedEmail) return null;

  if (state.status === 'loading') {
    return (
      <div className={styles.card} role="status">
        <span className={styles.cardSpinner} aria-hidden="true" />
        <p className={styles.cardText}>Vérification de votre réservation…</p>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className={styles.card} role="alert">
        <h3 className={styles.cardTitle}>Réservation indisponible</h3>
        <p className={styles.cardText}>
          Impossible de récupérer votre réservation pour le moment.
        </p>
        <p style={{ marginTop: '0.9rem' }}>
          <button type="button" className="btn btn-outline" onClick={() => setReloadKey((k) => k + 1)}>
            Réessayer
          </button>
        </p>
      </div>
    );
  }

  if (state.status === 'none') {
    return (
      <div className={styles.card} role="status">
        <h3 className={styles.cardTitle}>Aucun entretien réservé</h3>
        <p className={styles.cardText}>
          Aucun entretien n&rsquo;est associé à l&rsquo;adresse <strong>{verifiedEmail}</strong>.
        </p>
      </div>
    );
  }

  const { slot } = state;
  const day = getDayParts(slot.date);
  const department = DEPARTMENT_LABELS[slot.department] ?? slot.department;

  return (
    <div className={styles.card} data-dept={slot.department}>
      <h3 className={styles.cardTitle}>Votre entretien</h3>
      <ul className={styles.cardList}>
        <li className={styles.cardItem}>
          <Icons.Calendar size={18} />
          {day.long}
        </li>
        <li className={styles.cardItem}>
          <Icons.Clock size={18} />
          {slot.time}
        </li>
        <li className={styles.cardItem}>
          <Icons.Briefcase size={18} />
          {department}
        </li>
      </ul>

      <InterviewCountdown date={slot.date} time={slot.time} />
    </div>
  );
}