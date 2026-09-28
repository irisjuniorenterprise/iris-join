'use client';
// components/resultats/ResultCard.tsx
//
// « Mon résultat » : affiche la décision de la délibération une fois
// publiée par l'administration. Tant que rien n'est publié, la carte
// « délibération en cours » se rafraîchit toute seule (toutes les 45 s et
// au retour sur l'onglet) : le candidat n'a rien à recharger.
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { Icons } from '@/components/icons/Icons';
import type { CandidateResult, ResultStatus } from '@/lib/deliberation';
import styles from './ResultCard.module.css';

type State =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'no-candidature' }
  | { status: 'pending' }
  | { status: 'published'; result: CandidateResult };

type Props = {
  /** Email vérifié via AuthGate. */
  verifiedEmail: string;
};

const POLL_MS = 45_000;

const dateFormatter = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Africa/Tunis',
});

function formatPublished(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : dateFormatter.format(d);
}

type Copy = {
  tone: 'success' | 'neutral' | 'warning';
  icon: 'Check' | 'Heart' | 'Calendar';
  title: string;
  text: (department: string | null) => string;
  hint?: string;
};

const COPY: Record<ResultStatus, Copy> = {
  accepted: {
    tone: 'success',
    icon: 'Check',
    title: 'Félicitations, vous êtes accepté(e) !',
    text: (dept) =>
      `Votre candidature${dept ? ` pour le département ${dept}` : ''} a été retenue. Bienvenue chez IRIS Junior Entreprise !`,
  },
  rejected: {
    tone: 'neutral',
    icon: 'Heart',
    title: 'Merci pour votre candidature',
    text: (dept) =>
      `Après délibération, nous ne sommes malheureusement pas en mesure de retenir votre candidature${dept ? ` pour le département ${dept}` : ''} cette fois-ci. Merci sincèrement pour votre intérêt et le temps consacré à ce processus.`,
    hint: 'Nous vous encourageons à retenter votre chance lors d’une prochaine campagne.',
  },
  absent: {
    tone: 'warning',
    icon: 'Calendar',
    title: 'Entretien non effectué',
    text: (dept) =>
      `Vous n’étiez pas présent(e) à votre entretien${dept ? ` pour le département ${dept}` : ''}. Sans entretien, nous ne sommes pas en mesure d’étudier votre candidature plus avant.`,
    hint: 'Si vous pensez qu’il s’agit d’une erreur, contactez l’équipe IRIS JE par e-mail au plus vite.',
  },
};

export default function ResultCard({ verifiedEmail }: Props) {
  const { getIdToken } = useAuth();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [refreshing, setRefreshing] = useState(false);

  const tokenRef = useRef(getIdToken);
  tokenRef.current = getIdToken;
  const stateRef = useRef<State>(state);
  stateRef.current = state;

  /** `silent` : pas de flash « chargement », on garde l'affichage actuel. */
  const fetchResult = useCallback(async (silent: boolean) => {
    if (!silent) setState({ status: 'loading' });
    try {
      const idToken = await tokenRef.current();
      if (!idToken) throw new Error('no-token');

      const res = await fetch('/api/resultat', {
        headers: { Authorization: `Bearer ${idToken}` },
        cache: 'no-store',
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok) throw new Error('bad-response');

      if (data.state === 'published' && data.result) {
        setState({ status: 'published', result: data.result as CandidateResult });
      } else if (data.state === 'no-candidature') {
        setState({ status: 'no-candidature' });
      } else {
        setState({ status: 'pending' });
      }
    } catch (err) {
      console.error('[resultats] échec du chargement', err);
      // Un rafraîchissement silencieux qui échoue ne casse pas l'affichage.
      if (!silent || stateRef.current.status === 'loading') setState({ status: 'error' });
    }
  }, []);

  useEffect(() => {
    if (!verifiedEmail) return;
    void fetchResult(false);
  }, [verifiedEmail, fetchResult]);

  // Tant que le résultat n'est pas publié : rafraîchissement automatique.
  const isPending = state.status === 'pending';
  useEffect(() => {
    if (!isPending) return;

    const timer = window.setInterval(() => void fetchResult(true), POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void fetchResult(true);
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [isPending, fetchResult]);

  async function manualRefresh() {
    setRefreshing(true);
    await fetchResult(true);
    setRefreshing(false);
  }

  if (!verifiedEmail) return null;

  if (state.status === 'loading') {
    return (
      <div className={styles.card} role="status">
        <span className={styles.spinner} aria-hidden="true" />
        <p className={styles.text}>Chargement de votre résultat…</p>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className={styles.card} role="alert">
        <span className={`${styles.icon} ${styles.iconWarning}`}>
          <Icons.Alert size={30} />
        </span>
        <h3 className={styles.title}>Résultat indisponible</h3>
        <p className={styles.text}>Impossible de récupérer votre résultat pour le moment.</p>
        <button type="button" className="btn btn-outline" onClick={() => void fetchResult(false)}>
          Réessayer
        </button>
      </div>
    );
  }

  if (state.status === 'no-candidature') {
    return (
      <div className={styles.card} role="status">
        <span className={`${styles.icon} ${styles.iconNeutral}`}>
          <Icons.FileText size={30} />
        </span>
        <h3 className={styles.title}>Aucune candidature trouvée</h3>
        <p className={styles.text}>
          Aucune candidature n&rsquo;est associée à l&rsquo;adresse <strong>{verifiedEmail}</strong>. Si vous avez
          postulé avec une autre adresse, reconnectez-vous avec celle-ci.
        </p>
        <Link href="/candidature" className="btn btn-primary">
          Déposer ma candidature
        </Link>
      </div>
    );
  }

  if (state.status === 'pending') {
    return (
      <div className={styles.card} role="status">
        <span className={`${styles.icon} ${styles.iconNeutral}`}>
          <Icons.Clock size={30} />
        </span>
        <h3 className={styles.title}>Délibération en cours</h3>
        <p className={styles.text}>
          Votre résultat n&rsquo;est pas encore publié. Cette page se met à jour toute seule dès qu&rsquo;il est
          disponible — vous pouvez la laisser ouverte ou revenir plus tard.
        </p>
        <button
          type="button"
          className="btn btn-outline"
          onClick={manualRefresh}
          disabled={refreshing}
        >
          {refreshing ? 'Actualisation…' : 'Actualiser'}
        </button>
      </div>
    );
  }

  const { result } = state;
  const copy = COPY[result.status];
  const Icon = Icons[copy.icon];
  const publishedLabel = formatPublished(result.publishedAt);
  const toneClass =
    copy.tone === 'success' ? styles.toneSuccess : copy.tone === 'warning' ? styles.toneWarning : styles.toneNeutral;

  return (
    <div className={`${styles.card} ${styles.resultCard} ${toneClass}`} role="status" data-result={result.status}>
      <span className={`${styles.icon} ${styles.iconResult}`}>
        <Icon size={34} />
      </span>
      <h3 className={styles.title}>{copy.title}</h3>
      <p className={styles.text}>{copy.text(result.departmentLabel)}</p>

      {result.message && (
        <blockquote className={styles.note}>
          <span className={styles.noteLabel}>Message de l&rsquo;équipe</span>
          <p>{result.message}</p>
        </blockquote>
      )}

      {copy.hint && <p className={styles.hint}>{copy.hint}</p>}

      {publishedLabel && <p className={styles.meta}>Résultat publié le {publishedLabel}</p>}
    </div>
  );
}