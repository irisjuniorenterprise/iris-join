'use client';
// components/resultats/ResultCard.tsx
//
// « Mon résultat » : affiche la décision de la délibération une fois
// publiée par l'administration.
//
// Mise en scène du suspense :
//  - décision pas encore publiée : « délibération en cours » (anneaux
//    animés, frise de progression, mise à jour automatique toutes les 45 s
//    et au retour sur l'onglet) ;
//  - décision publiée : le résultat reste SCELLÉ derrière un bouton
//    « Découvrir mon résultat ». Au clic, un court compte à rebours
//    (3-2-1) précède l'ouverture. Une fois découvert, il s'affiche
//    directement lors des visites suivantes (mémorisé dans ce navigateur).
//  - mouvement réduit : pas de compte à rebours ni de confettis, le
//    résultat s'affiche dès le clic.
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
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

const POLL_MS = 180_000;
const COUNTDOWN_FROM = 3;
const COUNTDOWN_STEP_MS = 800;
const REVEALED_KEY = 'iris-je:result-revealed';

const dateFormatter = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Africa/Tunis',
});

const timeFormatter = new Intl.DateTimeFormat('fr-FR', {
  hour: '2-digit',
  minute: '2-digit',
});

function formatPublished(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : dateFormatter.format(d);
}

type Copy = {
  tone: 'success' | 'neutral' | 'warning';
  icon: 'Check' | 'Heart' | 'Calendar';
  chip: string;
  title: string;
  text: (department: string | null, departmentChanged: boolean) => string;
  hint?: string;
};

const COPY: Record<ResultStatus, Copy> = {
  accepted: {
    tone: 'success',
    icon: 'Check',
    chip: 'Accepté(e)',
    title: 'Félicitations, vous êtes accepté(e) !',
    text: (dept, changed) =>
      changed && dept
        ? `Au vu de votre profil et de vos échanges lors de l’entretien, l’équipe IRIS JE a le plaisir de vous accepter au sein du département ${dept}. Bienvenue chez IRIS Junior Entreprise !`
        : `Votre candidature${dept ? ` pour le département ${dept}` : ''} a été retenue. Bienvenue chez IRIS Junior Entreprise !`,
  },
  rejected: {
    tone: 'neutral',
    icon: 'Heart',
    chip: 'Non retenu(e)',
    title: 'Merci pour votre candidature',
    text: (dept) =>
      `Après délibération, nous ne sommes malheureusement pas en mesure de retenir votre candidature${dept ? ` pour le département ${dept}` : ''} cette fois-ci. Merci sincèrement pour votre intérêt et le temps consacré à ce processus.`,
    hint: 'Nous vous encourageons à retenter votre chance lors d’une prochaine campagne.',
  },
  absent: {
    tone: 'warning',
    icon: 'Calendar',
    chip: 'Absent(e) à l’entretien',
    title: 'Entretien non effectué',
    text: (dept) =>
      `Vous n’étiez pas présent(e) à votre entretien${dept ? ` pour le département ${dept}` : ''}. Sans entretien, nous ne sommes pas en mesure d’étudier votre candidature plus avant.`,
    hint: 'Si vous pensez qu’il s’agit d’une erreur, contactez l’équipe IRIS JE par e-mail au plus vite.',
  },
};

/* ------------------------------------------------------------------ */
/* Briques visuelles                                                    */
/* ------------------------------------------------------------------ */

/** Motif « iris » de la charte : anneaux concentriques, arc et point orange. */
function Rings({ className, arc = true }: { className?: string; arc?: boolean }) {
  return (
    <svg className={className} viewBox="0 0 400 400" aria-hidden="true" focusable="false">
      <circle cx="200" cy="200" r="70" />
      <circle cx="200" cy="200" r="110" />
      <circle cx="200" cy="200" r="150" />
      <circle cx="200" cy="200" r="190" />
      {arc && (
        <>
          <path className={styles.arc} d="M 255 104.7 A 110 110 0 0 1 303.4 237.6" />
          <circle className={styles.dot} cx="303.4" cy="237.6" r="6" />
        </>
      )}
    </svg>
  );
}

/** Confettis aux couleurs IRIS (positions déterministes : pas de Math.random). */
const CONFETTI_COLORS = ['#ff6633', '#5ab8de', '#ffffff', '#ffd9cc', '#a6dcef'];
const CONFETTI = Array.from({ length: 30 }, (_, i) => ({
  x: ((i * 83) % 361) - 180,
  y: -(60 + ((i * 47) % 130)),
  r: ((i * 61) % 360) - 180,
  d: (i % 10) * 45,
  c: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  w: 6 + (i % 3) * 2,
}));

function Confetti() {
  return (
    <div className={styles.confetti} aria-hidden="true">
      {CONFETTI.map((p, i) => (
        <span
          key={i}
          className={styles.piece}
          style={
            {
              '--x': `${p.x}px`,
              '--y': `${p.y}px`,
              '--r': `${p.r}deg`,
              '--c': p.c,
              width: `${p.w}px`,
              height: `${p.w * 1.8}px`,
              animationDelay: `${p.d}ms`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Résultat publié : scellé -> compte à rebours -> révélation           */
/* ------------------------------------------------------------------ */

type RevealPhase = 'sealed' | 'counting' | 'open';

function wasRevealed(email: string, publishedAt: string | null): boolean {
  try {
    return window.localStorage.getItem(REVEALED_KEY) === `${email}|${publishedAt ?? ''}`;
  } catch {
    return false;
  }
}

function markRevealed(email: string, publishedAt: string | null) {
  try {
    window.localStorage.setItem(REVEALED_KEY, `${email}|${publishedAt ?? ''}`);
  } catch {
    /* stockage indisponible : le résultat sera simplement re-scellé à la prochaine visite */
  }
}

function PublishedResult({ result, email }: { result: CandidateResult; email: string }) {
  const [phase, setPhase] = useState<RevealPhase>(() =>
    wasRevealed(email, result.publishedAt) ? 'open' : 'sealed',
  );
  const [count, setCount] = useState(COUNTDOWN_FROM);
  // Confettis seulement si la révélation vient d'avoir lieu sous les yeux du candidat.
  const [celebrate, setCelebrate] = useState(false);

  function open(animated: boolean) {
    markRevealed(email, result.publishedAt);
    setCelebrate(animated);
    setPhase('open');
  }

  function start() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      open(false);
      return;
    }
    setCount(COUNTDOWN_FROM);
    setPhase('counting');
  }

  useEffect(() => {
    if (phase !== 'counting') return;
    if (count <= 0) {
      markRevealed(email, result.publishedAt);
      setCelebrate(true);
      setPhase('open');
      return;
    }
    const timer = window.setTimeout(() => setCount((c) => c - 1), COUNTDOWN_STEP_MS);
    return () => window.clearTimeout(timer);
  }, [phase, count, email, result.publishedAt]);

  if (phase !== 'open') {
    const counting = phase === 'counting';
    return (
      <div className={styles.sealed} data-phase={phase} role="status">
        <div className={styles.sealVisual}>
          <Rings className={styles.sealRings} arc={false} />
          <Rings className={`${styles.sealRings} ${styles.sealSpin}`} />
          {counting && (
            <>
              <span className={styles.ping} aria-hidden="true" />
              <span className={`${styles.ping} ${styles.pingLate}`} aria-hidden="true" />
            </>
          )}
          <span className={styles.sealDisc}>
            {counting ? (
              <span key={count} className={styles.count} aria-hidden="true">
                {Math.max(count, 1)}
              </span>
            ) : (
              <Icons.Lock size={38} />
            )}
          </span>
        </div>

        <span className={styles.eyebrow}>
          <span className={styles.eyebrowDot} aria-hidden="true" />
          {counting ? 'Ouverture en cours' : 'Résultat disponible'}
        </span>
        <h3 className={styles.sealTitle}>
          {counting ? 'Ça y est, on y est presque…' : 'Votre décision est prête'}
        </h3>
        <p className={styles.sealText}>
          {counting
            ? 'Respirez, votre résultat s’affiche dans un instant.'
            : 'L’équipe IRIS JE a publié sa décision. Prenez une inspiration, puis découvrez-la quand vous êtes prêt(e).'}
        </p>

        {!counting && (
          <button type="button" className={`btn btn-primary ${styles.revealBtn}`} onClick={start}>
            <Icons.Sparkles size={18} />
            Découvrir mon résultat
          </button>
        )}
      </div>
    );
  }

  const copy = COPY[result.status];
  const Icon = Icons[copy.icon];
  const publishedLabel = formatPublished(result.publishedAt);
  const toneClass =
    copy.tone === 'success' ? styles.toneSuccess : copy.tone === 'warning' ? styles.toneWarning : styles.toneNeutral;

  return (
    <div className={`${styles.result} ${toneClass}`} role="status" data-result={result.status}>
      <div className={styles.banner}>
        <Rings className={styles.bannerRings} arc={false} />
        {celebrate && result.status === 'accepted' && <Confetti />}
        <span className={styles.badge}>
          <Icon size={38} />
        </span>
        <span className={styles.chip}>{copy.chip}</span>
      </div>

      <div className={styles.resultBody}>
        <h3 className={styles.resultTitle}>{copy.title}</h3>
        <p className={styles.text}>{copy.text(result.departmentLabel, result.departmentChanged === true)}</p>

        {result.departmentLabel && (
          <span className={styles.dept}>
            <Icons.Briefcase size={14} />
            Département {result.departmentLabel}
          </span>
        )}

        {result.message && (
          <blockquote className={styles.note}>
            <span className={styles.noteLabel}>Message de l&rsquo;équipe</span>
            <p>{result.message}</p>
          </blockquote>
        )}

        {copy.hint && <p className={styles.hint}>{copy.hint}</p>}

        {publishedLabel && <p className={styles.meta}>Résultat publié le {publishedLabel}</p>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Composant principal                                                  */
/* ------------------------------------------------------------------ */

export default function ResultCard({ verifiedEmail }: Props) {
  const { getIdToken } = useAuth();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);

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

      setCheckedAt(new Date());
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
      <div className={`${styles.card} ${styles.pending}`} role="status">
        <div className={styles.pendingVisual}>
          <Rings className={styles.pendingRings} arc={false} />
          <Rings className={`${styles.pendingRings} ${styles.pendingSpin}`} />
          <span className={styles.pendingDisc}>
            <Icons.Clock size={32} />
          </span>
        </div>

        <h3 className={styles.title}>Délibération en cours</h3>
        <p className={styles.text}>
          L&rsquo;équipe IRIS JE étudie les candidatures. Votre résultat s&rsquo;affichera ici dès sa publication :
          vous pouvez laisser cette page ouverte ou revenir plus tard.
        </p>

        <ol className={styles.timeline} aria-label="Avancement de votre candidature">
          <li className={styles.tStep} data-state="done">
            <span className={styles.tNode}>
              <Icons.Check size={14} />
            </span>
            <span className={styles.tLabel}>Candidature reçue</span>
          </li>
          <li className={styles.tStep} data-state="active">
            <span className={styles.tNode}>
              <Icons.Clock size={14} />
            </span>
            <span className={styles.tLabel}>Délibération</span>
          </li>
          <li className={styles.tStep} data-state="todo">
            <span className={styles.tNode}>
              <Icons.Lock size={13} />
            </span>
            <span className={styles.tLabel}>Décision</span>
          </li>
        </ol>

        <p className={styles.live}>
          <span className={styles.liveDot} aria-hidden="true" />
          Mise à jour automatique
          {checkedAt ? ` · vérifié à ${timeFormatter.format(checkedAt)}` : ''}
        </p>

        <button type="button" className="btn btn-outline" onClick={manualRefresh} disabled={refreshing}>
          {refreshing ? 'Actualisation…' : 'Actualiser maintenant'}
        </button>
      </div>
    );
  }

  return <PublishedResult result={state.result} email={verifiedEmail} />;
}
