'use client';
// components/admin/DeliberationPanel.tsx
//
// Onglet « Délibération » : l'admin renseigne le résultat de chaque
// candidat (accepté / non accepté / absent à l'entretien), le publie, puis
// envoie l'e-mail de résultat depuis la plateforme.
//
// Trois étapes indépendantes, pour ne jamais rien envoyer par accident :
//   1. DÉCIDER   — brouillon, invisible pour le candidat ;
//   2. PUBLIER   — le résultat devient visible sur /resultats ;
//   3. ENVOYER   — e-mail de résultat, par petits lots avec progression.
//
// Le panneau charge ses propres données (/api/admin/deliberation) et
// utilise la fonction `call` du tableau de bord (token Firebase inclus).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icons } from '@/components/icons/Icons';
import { useToast } from '@/lib/toast';
import {
  DEPARTMENT_KEYS,
  DEPARTMENT_LABELS,
  getDayParts,
  normalizeDepartment,
  type DepartmentKey,
} from '@/lib/interview';
import {
  RESULT_LABELS,
  RESULT_MESSAGE_MAX,
  RESULT_STATUSES,
  SEND_CHUNK_SIZE,
  type AdminDecision,
  type ResultStatus,
} from '@/lib/deliberation';
import Modal from './Modal';
import { ConfirmDialog } from './dialogs';
import {
  DeptBadge,
  emailKey,
  fold,
  formatDateTime,
  fullName,
  type AdminSlot,
  type ApiResult,
  type Candidature,
} from './shared';
import adminStyles from './admin.module.css';
import styles from './DeliberationPanel.module.css';

/** Même signature que le `call` du tableau de bord. */
type AdminCall = <T = Record<string, unknown>>(
  path: string,
  init?: { method?: string; body?: unknown },
) => Promise<ApiResult<T>>;

type Props = {
  candidatures: Candidature[];
  bookingByEmail: Map<string, AdminSlot>;
  call: AdminCall;
};

type Filter = 'all' | 'none' | ResultStatus | 'draft' | 'to-send';

type Dialog =
  | { type: 'decide'; key: string }
  | { type: 'publish'; keys: string[] | null; count: number }
  | { type: 'unpublish'; keys: string[] }
  | { type: 'send'; keys: string[] }
  | { type: 'clear'; keys: string[] };

type Progress = { done: number; total: number; ok: number; failed: number };

const ENDPOINT = '/api/admin/deliberation';

const STATUS_TONE: Record<ResultStatus, string> = {
  accepted: adminStyles.statusOk,
  rejected: adminStyles.statusDanger,
  absent: adminStyles.statusWarn,
};

function shortSlot(slot: AdminSlot): string {
  const p = getDayParts(slot.date);
  return `${p.weekdayShort} ${p.dayNumber} ${p.monthShort} · ${slot.time}`;
}

const plural = (n: number, one: string, many: string) => (n > 1 ? many : one);

/* ------------------------------------------------------------------ */
/* Dialogue : décision d'un candidat                                    */
/* ------------------------------------------------------------------ */

type DecisionDialogProps = {
  candidate: Candidature;
  name: string;
  email: string;
  current: AdminDecision | null;
  onClose: () => void;
  /** `acceptedDepartment` : département d'acceptation s'il diffère du 1er choix, sinon null. */
  onSave: (status: ResultStatus, message: string, acceptedDepartment: DepartmentKey | null) => Promise<boolean>;
};

function DecisionDialog({ candidate, name, email, current, onClose, onSave }: DecisionDialogProps) {
  const [status, setStatus] = useState<ResultStatus | null>(current?.status ?? null);
  const [message, setMessage] = useState(current?.message ?? '');
  const [busy, setBusy] = useState(false);

  // 1er choix du candidat = département de sa candidature (celui des entretiens).
  const firstChoice = candidate.department;
  // Département d'acceptation : par défaut le 1er choix ; l'admin peut en choisir un autre.
  const [department, setDepartment] = useState<DepartmentKey | null>(
    current?.acceptedDepartment ?? firstChoice,
  );

  // Choix classés par le candidat (1er, 2e…), pour aider l'admin à décider.
  const rankOf = new Map<DepartmentKey, number>();
  candidate.departements.forEach((raw, index) => {
    const key = normalizeDepartment(raw);
    if (key && !rankOf.has(key)) rankOf.set(key, index + 1);
  });

  const accepted = status === 'accepted';
  const changed = accepted && department !== null && department !== firstChoice;
  const canSave = Boolean(status) && (!accepted || department !== null);

  async function submit() {
    if (!status || !canSave) return;
    setBusy(true);
    try {
      await onSave(status, message.trim(), changed ? department : null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={current ? 'Modifier la décision' : 'Décision de délibération'}
      subtitle={`${name} · ${email}`}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>
            Annuler
          </button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={!canSave || busy}>
            {busy ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </>
      }
    >
      <div className={adminStyles.form}>
        {current?.published && (
          <div className={adminStyles.infoBox}>
            <Icons.Info size={18} />
            <span>
              Ce résultat est <strong>déjà publié</strong> : la modification sera visible tout de suite par le
              candidat, et l&rsquo;e-mail devra être renvoyé.
            </span>
          </div>
        )}

        <fieldset className={adminStyles.fieldsetPlain}>
          <legend>Résultat</legend>
          <div className={adminStyles.chips} role="group" aria-label="Résultat">
            {RESULT_STATUSES.map((value) => (
              <button
                key={value}
                type="button"
                className={adminStyles.chip}
                aria-pressed={status === value}
                onClick={() => setStatus(value)}
              >
                {RESULT_LABELS[value]}
              </button>
            ))}
          </div>
        </fieldset>

        {accepted && (
          <fieldset className={adminStyles.fieldsetPlain}>
            <legend>Accepté dans le département</legend>
            <div className={adminStyles.chips} role="group" aria-label="Département d'acceptation">
              {DEPARTMENT_KEYS.map((key) => {
                const rank = rankOf.get(key);
                return (
                  <button
                    key={key}
                    type="button"
                    className={adminStyles.chip}
                    aria-pressed={department === key}
                    onClick={() => setDepartment(key)}
                  >
                    {DEPARTMENT_LABELS[key]}
                    {rank ? ` · choix ${rank}` : ' · hors choix'}
                  </button>
                );
              })}
            </div>
            <span className={adminStyles.fieldHint}>
              Par défaut, le 1er choix du candidat
              {firstChoice ? ` (${DEPARTMENT_LABELS[firstChoice]})` : ''}. Choisissez un autre département si
              l&rsquo;entretien a révélé un profil mieux adapté.
            </span>
            {changed && department && (
              <div className={adminStyles.infoBox}>
                <Icons.Info size={18} />
                <span>
                  Le candidat sera accepté en <strong>{DEPARTMENT_LABELS[department]}</strong>
                  {firstChoice ? <> (son 1er choix était {DEPARTMENT_LABELS[firstChoice]})</> : null}. Son
                  résultat et l&rsquo;e-mail l&rsquo;indiqueront.
                </span>
              </div>
            )}
          </fieldset>
        )}

        <label className={adminStyles.formField}>
          <span>Message personnalisé (facultatif)</span>
          <textarea
            className={styles.textarea}
            value={message}
            maxLength={RESULT_MESSAGE_MAX}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Ex. : prochaine étape, date d'intégration, conseils…"
          />
          <span className={styles.counter}>
            {message.length}/{RESULT_MESSAGE_MAX}
          </span>
          <span className={adminStyles.fieldHint}>
            Affiché au candidat sur sa page de résultat et ajouté à l&rsquo;e-mail.
          </span>
        </label>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Panneau                                                              */
/* ------------------------------------------------------------------ */

export default function DeliberationPanel({ candidatures, bookingByEmail, call }: Props) {
  const { showToast } = useToast();

  const [decisions, setDecisions] = useState<Map<string, AdminDecision> | null>(null);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [department, setDepartment] = useState<'all' | DepartmentKey>('all');
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [failedKeys, setFailedKeys] = useState<string[]>([]);

  const sending = progress !== null;

  /* ----------------------------- Chargement ----------------------------- */

  const load = useCallback(async () => {
    const res = await call<{ ok?: boolean; decisions?: AdminDecision[] }>(ENDPOINT);
    if (!res.ok || !res.data || !Array.isArray(res.data.decisions)) {
      setLoadError(res.data?.message ?? 'Impossible de charger la délibération.');
      return;
    }
    setLoadError('');
    setDecisions(new Map(res.data.decisions.map((d) => [d.email, d])));
  }, [call]);

  useEffect(() => {
    void load();
  }, [load]);

  /* --------------------------- Données dérivées --------------------------- */

  // Les décisions sont indexées par e-mail en minuscules ; l'API attend l'e-mail
  // tel qu'enregistré dans la candidature (utile pour retrouver le document).
  const rawByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of candidatures) map.set(emailKey(c.email), c.email);
    return map;
  }, [candidatures]);

  const toRaw = useCallback((keys: string[]) => keys.map((k) => rawByKey.get(k) ?? k), [rawByKey]);

  const rows = useMemo(
    () =>
      candidatures.map((c) => {
        const key = emailKey(c.email);
        return {
          c,
          key,
          decision: decisions?.get(key) ?? null,
          slot: bookingByEmail.get(key) ?? null,
        };
      }),
    [candidatures, decisions, bookingByEmail],
  );

  const counts = useMemo(() => {
    let none = 0;
    let accepted = 0;
    let rejected = 0;
    let absent = 0;
    let published = 0;
    let sent = 0;
    const toPublish: string[] = [];
    const toSend: string[] = [];
    for (const { key, decision } of rows) {
      if (!decision) {
        none += 1;
        continue;
      }
      if (decision.status === 'accepted') accepted += 1;
      else if (decision.status === 'rejected') rejected += 1;
      else absent += 1;
      if (decision.published) published += 1;
      else toPublish.push(key);
      if (decision.emailSentAt) sent += 1;
      else if (decision.published) toSend.push(key);
    }
    return { none, accepted, rejected, absent, published, sent, toPublish, toSend };
  }, [rows]);

  const visible = useMemo(() => {
    const q = fold(query.trim());
    return rows.filter(({ c, decision }) => {
      if (department !== 'all' && c.department !== department) return false;
      if (filter === 'none' && decision) return false;
      if (filter === 'draft' && !(decision && !decision.published)) return false;
      if (filter === 'to-send' && !(decision?.published && !decision.emailSentAt)) return false;
      if ((filter === 'accepted' || filter === 'rejected' || filter === 'absent') && decision?.status !== filter) {
        return false;
      }
      if (q) {
        const haystack = fold(`${fullName(c)} ${c.email} ${c.telephone}`);
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [rows, query, department, filter]);

  const visibleKeys = useMemo(() => visible.map((r) => r.key), [visible]);
  const allVisibleSelected = visibleKeys.length > 0 && visibleKeys.every((k) => selected.has(k));
  const selectedKeys = useMemo(
    () => rows.filter((r) => selected.has(r.key)).map((r) => r.key),
    [rows, selected],
  );

  /** Clés de la sélection qui ont un brouillon à publier. */
  const selectedToPublish = useMemo(
    () => selectedKeys.filter((k) => {
      const d = decisions?.get(k);
      return Boolean(d && !d.published);
    }),
    [selectedKeys, decisions],
  );

  /** Clés de la sélection dont le résultat est publié (seuls ceux-là peuvent recevoir l'e-mail). */
  const selectedPublished = useMemo(
    () => selectedKeys.filter((k) => decisions?.get(k)?.published),
    [selectedKeys, decisions],
  );

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visibleKeys.forEach((k) => next.delete(k));
      else visibleKeys.forEach((k) => next.add(k));
      return next;
    });
  }

  /* ------------------------------- Actions ------------------------------- */

  /** Enregistre (ou retire, si status = null) la décision pour des candidats. */
  async function saveDecision(
    keys: string[],
    status: ResultStatus | null,
    message?: string,
    acceptedDepartment?: DepartmentKey | null,
  ): Promise<boolean> {
    setWorking(true);
    try {
      const res = await call<{ ok?: boolean; updated?: number }>(ENDPOINT, {
        method: 'PUT',
        body: {
          emails: toRaw(keys),
          status,
          ...(message !== undefined ? { message } : {}),
          ...(acceptedDepartment !== undefined ? { acceptedDepartment } : {}),
        },
      });
      if (!res.ok || !res.data?.ok) {
        showToast(res.data?.message ?? 'Enregistrement impossible.', 'error');
        return false;
      }
      const n = res.data.updated ?? 0;
      if (status === null) {
        showToast(`${n} décision${n > 1 ? 's retirées' : ' retirée'}.`, 'success');
      } else if (n === 0) {
        showToast('Aucun changement : ces candidats avaient déjà ce résultat.', 'info');
      } else {
        showToast(`${n} ${plural(n, 'candidat marqué', 'candidats marqués')} « ${RESULT_LABELS[status]} ».`, 'success');
      }
      setSelected(new Set());
      await load();
      return true;
    } finally {
      setWorking(false);
    }
  }

  /** Publie / dépublie. `keys = null` : tous les brouillons. Renvoie les clés modifiées (ou null si échec). */
  async function setPublication(keys: string[] | null, publish: boolean): Promise<string[] | null> {
    setWorking(true);
    try {
      const res = await call<{ ok?: boolean; count?: number; emails?: string[] }>(ENDPOINT, {
        method: 'POST',
        body: {
          action: publish ? 'publish' : 'unpublish',
          ...(keys ? { emails: toRaw(keys) } : {}),
        },
      });
      if (!res.ok || !res.data?.ok) {
        showToast(res.data?.message ?? 'Action impossible.', 'error');
        return null;
      }
      const n = res.data.count ?? 0;
      showToast(
        n === 0
          ? publish
            ? 'Rien à publier.'
            : 'Rien à dépublier.'
          : publish
            ? `${n} ${plural(n, 'résultat publié', 'résultats publiés')}.`
            : `${n} ${plural(n, 'résultat dépublié', 'résultats dépubliés')}.`,
        n === 0 ? 'info' : 'success',
      );
      setSelected(new Set());
      await load();
      return res.data.emails ?? [];
    } finally {
      setWorking(false);
    }
  }

  /** Envoie les e-mails de résultat par lots, avec progression et suivi des échecs. */
  async function sendEmails(keys: string[]) {
    if (keys.length === 0 || sending) return;

    setFailedKeys([]);
    setProgress({ done: 0, total: keys.length, ok: 0, failed: 0 });

    const failed: string[] = [];
    let ok = 0;
    let smtpMissing = false;

    for (let i = 0; i < keys.length; i += SEND_CHUNK_SIZE) {
      const chunk = keys.slice(i, i + SEND_CHUNK_SIZE);
      const res = await call<{
        ok?: boolean;
        emailConfigured?: boolean;
        results?: { email: string; ok: boolean }[];
      }>(ENDPOINT, { method: 'POST', body: { action: 'send-email', emails: toRaw(chunk) } });

      if (res.ok && res.data?.emailConfigured === false) {
        smtpMissing = true;
        failed.push(...keys.slice(i));
        break;
      }

      if (!res.ok || !res.data?.results) {
        // Session expirée ou erreur réseau/serveur : on s'arrête, sans renvoyer à l'aveugle.
        failed.push(...keys.slice(i));
        break;
      }

      const okKeys = new Set(res.data.results.filter((r) => r.ok).map((r) => emailKey(r.email)));
      for (const key of chunk) {
        if (okKeys.has(key)) ok += 1;
        else failed.push(key);
      }
      setProgress({ done: Math.min(i + chunk.length, keys.length), total: keys.length, ok, failed: failed.length });
    }

    setProgress(null);
    setFailedKeys(failed);
    await load();

    if (smtpMissing) {
      showToast("SMTP non configuré : aucun e-mail n'a été envoyé. Vérifiez SMTP_HOST, SMTP_USER et SMTP_PASS.", 'error');
    } else if (failed.length === 0) {
      showToast(`${ok} ${plural(ok, 'e-mail envoyé', 'e-mails envoyés')}.`, 'success');
    } else {
      showToast(
        `${ok} envoyé${ok > 1 ? 's' : ''}, ${failed.length} en échec. Vous pouvez réessayer les échecs.`,
        'error',
      );
    }
  }

  /* ------------------------------ Dialogues ------------------------------ */

  const closeDialog = () => setDialog(null);
  let dialogNode: React.ReactNode = null;

  if (dialog?.type === 'decide') {
    const row = rows.find((r) => r.key === dialog.key);
    if (row) {
      dialogNode = (
        <DecisionDialog
          candidate={row.c}
          name={fullName(row.c)}
          email={row.c.email}
          current={row.decision}
          onClose={closeDialog}
          onSave={async (status, message, acceptedDepartment) => {
            const done = await saveDecision([row.key], status, message, acceptedDepartment);
            if (done) closeDialog();
            return done;
          }}
        />
      );
    }
  }

  if (dialog?.type === 'publish') {
    const { keys, count } = dialog;
    dialogNode = (
      <ConfirmDialog
        title="Publier les résultats ?"
        confirmLabel={`Publier ${count} ${plural(count, 'résultat', 'résultats')}`}
        notifyLabel="Envoyer aussi l'e-mail de résultat aux candidats concernés"
        onClose={closeDialog}
        onConfirm={async (notify) => {
          const affected = await setPublication(keys, true);
          closeDialog();
          if (affected === null) return false;
          if (notify && affected.length > 0) void sendEmails(affected);
          return true;
        }}
      >
        <p>
          <strong>
            {count} {plural(count, 'résultat sera visible', 'résultats seront visibles')}
          </strong>{' '}
          immédiatement par {plural(count, 'le candidat concerné', 'les candidats concernés')} sur la page{' '}
          <strong>/resultats</strong>. Vérifiez vos décisions : vous pourrez dépublier en cas d&rsquo;erreur, mais un
          e-mail envoyé ne se rappelle pas.
        </p>
      </ConfirmDialog>
    );
  }

  if (dialog?.type === 'unpublish') {
    const { keys } = dialog;
    dialogNode = (
      <ConfirmDialog
        title="Dépublier ces résultats ?"
        confirmLabel="Dépublier"
        danger
        onClose={closeDialog}
        onConfirm={async () => {
          const affected = await setPublication(keys, false);
          closeDialog();
          return affected !== null;
        }}
      >
        <p>
          Les candidats concernés ne verront plus leur résultat : leur page repassera sur « Délibération en cours ».
          Les e-mails déjà envoyés ne sont pas rappelés.
        </p>
      </ConfirmDialog>
    );
  }

  if (dialog?.type === 'send') {
    const { keys } = dialog;
    dialogNode = (
      <ConfirmDialog
        title="Envoyer les e-mails de résultat ?"
        confirmLabel={`Envoyer ${keys.length} e-mail${keys.length > 1 ? 's' : ''}`}
        onClose={closeDialog}
        onConfirm={async () => {
          closeDialog();
          void sendEmails(keys);
          return true;
        }}
      >
        <p>
          <strong>
            {keys.length} {plural(keys.length, 'candidat recevra', 'candidats recevront')}
          </strong>{' '}
          son résultat par e-mail (Verdana, texte #1a3969). L&rsquo;envoi se fait par petits lots ; vous suivez la
          progression ici et pouvez réessayer les éventuels échecs.
        </p>
      </ConfirmDialog>
    );
  }

  if (dialog?.type === 'clear') {
    const { keys } = dialog;
    dialogNode = (
      <ConfirmDialog
        title="Retirer ces décisions ?"
        confirmLabel="Retirer"
        danger
        onClose={closeDialog}
        onConfirm={async () => {
          const done = await saveDecision(keys, null);
          closeDialog();
          return done;
        }}
      >
        <p>
          {keys.length} {plural(keys.length, 'décision sera supprimée', 'décisions seront supprimées')}. Si elles
          étaient publiées, {plural(keys.length, 'le candidat repassera', 'les candidats repasseront')} sur « Délibération
          en cours ».
        </p>
      </ConfirmDialog>
    );
  }

  /* -------------------------------- Rendu -------------------------------- */

  if (decisions === null) {
    return (
      <div className={adminStyles.panel}>
        {loadError ? (
          <div className={adminStyles.empty} role="alert">
            <Icons.Alert size={28} />
            <p>{loadError}</p>
            <button type="button" className="btn btn-primary" onClick={() => void load()}>
              Réessayer
            </button>
          </div>
        ) : (
          <div className={adminStyles.empty} role="status">
            <span className={adminStyles.spinner} aria-hidden="true" />
            <p>Chargement de la délibération…</p>
          </div>
        )}
      </div>
    );
  }

  const decided = candidatures.length - counts.none;
  const busy = working || sending;

  return (
    <div className={adminStyles.panel}>
      <div className={styles.summary} aria-label="Résumé de la délibération">
        <div className={styles.sumCard}>
          <span className={styles.sumValue}>{counts.none}</span>
          <span className={styles.sumLabel}>Sans décision</span>
        </div>
        <div className={`${styles.sumCard} ${styles.sumOk}`}>
          <span className={styles.sumValue}>{counts.accepted}</span>
          <span className={styles.sumLabel}>Acceptés</span>
        </div>
        <div className={`${styles.sumCard} ${styles.sumDanger}`}>
          <span className={styles.sumValue}>{counts.rejected}</span>
          <span className={styles.sumLabel}>Non acceptés</span>
        </div>
        <div className={`${styles.sumCard} ${styles.sumWarn}`}>
          <span className={styles.sumValue}>{counts.absent}</span>
          <span className={styles.sumLabel}>Absents</span>
        </div>
        <div className={styles.sumCard}>
          <span className={styles.sumValue}>
            {counts.published}/{decided}
          </span>
          <span className={styles.sumLabel}>Publiés</span>
        </div>
        <div className={styles.sumCard}>
          <span className={styles.sumValue}>
            {counts.sent}/{counts.published}
          </span>
          <span className={styles.sumLabel}>E-mails envoyés</span>
        </div>
      </div>

      <div className={styles.globalActions}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || counts.toPublish.length === 0}
          onClick={() => setDialog({ type: 'publish', keys: null, count: counts.toPublish.length })}
        >
          <Icons.Send size={16} />
          Publier les résultats ({counts.toPublish.length})
        </button>
        <button
          type="button"
          className="btn btn-outline"
          disabled={busy || counts.toSend.length === 0}
          onClick={() => setDialog({ type: 'send', keys: counts.toSend })}
        >
          <Icons.Mail size={16} />
          Envoyer les e-mails ({counts.toSend.length})
        </button>
        <p className={styles.globalHint}>
          1. Décidez (brouillon) · 2. Publiez (visible sur /resultats) · 3. Envoyez l&rsquo;e-mail. Le candidat ne
          voit rien tant que vous n&rsquo;avez pas publié.
        </p>
      </div>

      {progress && (
        <div className={styles.progress} role="status" aria-live="polite">
          <span>
            Envoi des e-mails… <strong>{progress.done}</strong> / {progress.total}
            {progress.failed > 0 ? ` (${progress.failed} en échec)` : ''}
          </span>
          <div className={styles.progressTrack}>
            <div
              className={styles.progressFill}
              style={{ width: `${Math.round((progress.done / Math.max(progress.total, 1)) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {!sending && failedKeys.length > 0 && (
        <div className={styles.failBox} role="alert">
          <span>
            {failedKeys.length} e-mail{failedKeys.length > 1 ? 's' : ''} non envoyé{failedKeys.length > 1 ? 's' : ''}.
          </span>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => void sendEmails(failedKeys)}
            disabled={busy}
          >
            Réessayer les échecs
          </button>
          <button type="button" className={adminStyles.linkBtn} onClick={() => setFailedKeys([])}>
            Ignorer
          </button>
        </div>
      )}

      <div className={adminStyles.toolbar}>
        <label className={adminStyles.search}>
          <Icons.Search size={18} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un candidat…"
            aria-label="Rechercher un candidat"
          />
        </label>
        <select
          className={adminStyles.select}
          value={department}
          onChange={(e) => setDepartment(e.target.value as 'all' | DepartmentKey)}
          aria-label="Filtrer par département"
        >
          <option value="all">Tous les départements</option>
          {DEPARTMENT_KEYS.map((key) => (
            <option key={key} value={key}>
              {DEPARTMENT_LABELS[key]}
            </option>
          ))}
        </select>
        <select
          className={adminStyles.select}
          value={filter}
          onChange={(e) => setFilter(e.target.value as Filter)}
          aria-label="Filtrer par résultat"
        >
          <option value="all">Tous les résultats</option>
          <option value="none">Sans décision</option>
          <option value="accepted">Acceptés</option>
          <option value="rejected">Non acceptés</option>
          <option value="absent">Absents</option>
          <option value="draft">À publier (brouillons)</option>
          <option value="to-send">E-mail à envoyer</option>
        </select>
      </div>

      <div className={adminStyles.toolbar}>
        <label className={adminStyles.checkRow}>
          <input
            type="checkbox"
            checked={allVisibleSelected}
            onChange={toggleAllVisible}
            disabled={visibleKeys.length === 0}
          />
          <span>Tout sélectionner ({visibleKeys.length})</span>
        </label>
        <p className={adminStyles.resultCount} aria-live="polite" style={{ marginLeft: 'auto' }}>
          {visible.length} candidat{visible.length > 1 ? 's' : ''}
          {visible.length !== candidatures.length ? ` sur ${candidatures.length}` : ''}
        </p>
      </div>

      {visible.length === 0 ? (
        <div className={adminStyles.empty}>
          <Icons.FileCheck size={28} />
          <p>
            {candidatures.length === 0
              ? 'Aucune candidature pour le moment.'
              : 'Aucun candidat pour ces filtres.'}
          </p>
        </div>
      ) : (
        <div className={adminStyles.tableWrap}>
          <table className={adminStyles.table}>
            <thead>
              <tr>
                <th scope="col">Candidat</th>
                <th scope="col">Département</th>
                <th scope="col">Entretien</th>
                <th scope="col">Résultat</th>
                <th scope="col">E-mail</th>
                <th scope="col" className={adminStyles.actionsCol}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map(({ c, key, decision, slot }) => (
                <tr key={c.id} className={selected.has(key) ? styles.selectedRow : undefined}>
                  <td className={adminStyles.cellFull}>
                    <label className={styles.rowCheck}>
                      <input
                        type="checkbox"
                        checked={selected.has(key)}
                        onChange={() => toggle(key)}
                        aria-label={`Sélectionner ${fullName(c)}`}
                      />
                      <span>
                        <strong>{fullName(c)}</strong>
                        <span className={adminStyles.cellSubtle}>{c.email}</span>
                      </span>
                    </label>
                  </td>
                  <td data-label="Département">
                    <DeptBadge department={c.department} fallback={c.departement} />
                  </td>
                  <td data-label="Entretien">{slot ? shortSlot(slot) : <span className={adminStyles.cellSubtle}>Aucun créneau</span>}</td>
                  <td data-label="Résultat">
                    {decision ? (
                      <>
                        <span className={`${adminStyles.status} ${STATUS_TONE[decision.status]}`}>
                          {RESULT_LABELS[decision.status]}
                        </span>
                        {decision.status === 'accepted' && decision.acceptedDepartment && (
                          <span className={styles.subtleLine}>
                            Accepté en <strong>{DEPARTMENT_LABELS[decision.acceptedDepartment]}</strong>
                          </span>
                        )}
                        <span className={styles.subtleLine}>
                          {decision.published
                            ? `Publié le ${formatDateTime(decision.publishedAt)}`
                            : 'Brouillon — non publié'}
                        </span>
                      </>
                    ) : (
                      <span className={`${adminStyles.status} ${adminStyles.statusNone}`}>Sans décision</span>
                    )}
                  </td>
                  <td data-label="E-mail">
                    {decision?.emailSentAt ? (
                      <span className={styles.subtleLine} style={{ marginTop: 0 }}>
                        Envoyé le {formatDateTime(decision.emailSentAt)}
                      </span>
                    ) : decision?.published ? (
                      <span className={`${adminStyles.status} ${adminStyles.statusWarn}`}>Non envoyé</span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className={adminStyles.actionsCol}>
                    <div className={adminStyles.rowActions}>
                      <button
                        type="button"
                        className={`btn ${decision ? 'btn-outline' : 'btn-primary'} ${adminStyles.compact}`}
                        onClick={() => setDialog({ type: 'decide', key })}
                        disabled={busy}
                      >
                        {decision ? 'Modifier' : 'Décider'}
                      </button>
                      {decision?.published && (
                        <button
                          type="button"
                          className={`btn btn-outline ${adminStyles.compact}`}
                          onClick={() => setDialog({ type: 'send', keys: [key] })}
                          disabled={busy}
                          title={decision.emailSentAt ? "Renvoyer l'e-mail de résultat" : "Envoyer l'e-mail de résultat"}
                        >
                          {decision.emailSentAt ? 'Renvoyer' : 'Envoyer'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedKeys.length > 0 && (
        <div className={styles.selectionBar} role="toolbar" aria-label="Actions sur la sélection">
          <span className={styles.selCount}>
            {selectedKeys.length} sélectionné{selectedKeys.length > 1 ? 's' : ''}
          </span>
          {RESULT_STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              className={styles.selBtn}
              disabled={busy}
              onClick={() => void saveDecision(selectedKeys, status)}
            >
              {RESULT_LABELS[status]}
            </button>
          ))}
          <span className={styles.selSpacer} />
          <button
            type="button"
            className={`${styles.selBtn} ${styles.selBtnPrimary}`}
            disabled={busy}
            onClick={() =>
              selectedToPublish.length === 0
                ? showToast('Rien à publier dans la sélection : décidez d’abord ou ils sont déjà publiés.', 'info')
                : setDialog({ type: 'publish', keys: selectedToPublish, count: selectedToPublish.length })
            }
          >
            Publier
          </button>
          <button
            type="button"
            className={styles.selBtn}
            disabled={busy}
            onClick={() => setDialog({ type: 'unpublish', keys: selectedKeys })}
          >
            Dépublier
          </button>
          <button
            type="button"
            className={styles.selBtn}
            disabled={busy}
            onClick={() =>
              selectedPublished.length === 0
                ? showToast('Publiez d’abord les résultats sélectionnés : l’e-mail ne part qu’après publication.', 'info')
                : setDialog({ type: 'send', keys: selectedPublished })
            }
          >
            E-mail
          </button>
          <button
            type="button"
            className={styles.selBtn}
            disabled={busy}
            onClick={() => setDialog({ type: 'clear', keys: selectedKeys })}
          >
            Retirer
          </button>
          <button
            type="button"
            className={styles.selBtn}
            onClick={() => setSelected(new Set())}
            aria-label="Désélectionner tout"
          >
            <Icons.X size={14} />
          </button>
        </div>
      )}

      {dialogNode}
    </div>
  );
}