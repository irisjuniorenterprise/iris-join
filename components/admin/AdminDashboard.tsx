'use client';
// components/admin/AdminDashboard.tsx
//
// Espace administration : connexion Google, puis vue d'ensemble
// (candidatures, entretiens réservés, délibération, gestion des créneaux). L'autorisation
// est vérifiée CÔTÉ SERVEUR à chaque appel (voir lib/admin-auth.ts) : ce
// composant ne fait qu'afficher ce que l'API accepte de renvoyer.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { Icons } from '@/components/icons/Icons';
import {
  DEPARTMENT_KEYS,
  DEPARTMENT_LABELS,
  formatDayLong,
  type DepartmentKey,
} from '@/lib/interview';
import CandidaturesPanel from './CandidaturesPanel';
import InterviewsPanel from './InterviewsPanel';
import DeliberationPanel from './DeliberationPanel';
import SlotsPanel from './SlotsPanel';
import SettingsPanel from './SettingsPanel';
import type { ServiceKey, ServiceWindow, ServiceWindows } from '@/lib/service-window';
import { ConfirmDialog, GenerateSlotsDialog, MoveSlotDialog, SlotFormDialog } from './dialogs';
import {
  adminRequest,
  deptStyle,
  emailKey,
  fullName,
  type AdminSlot,
  type Candidature,
  type DialogRequest,
  type Overview,
} from './shared';
import styles from './admin.module.css';

type Tab = 'candidatures' | 'interviews' | 'deliberation' | 'slots' | 'settings';
type Status = 'idle' | 'loading' | 'ready' | 'forbidden' | 'error';

type MutationResult = {
  ok?: boolean;
  message?: string;
  moved?: boolean;
  created?: number;
  skipped?: number;
};

export default function AdminDashboard() {
  const { user, loading, configured, signInWithGoogle, signOut, error, getIdToken } = useAuth();
  const { showToast } = useToast();

  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');
  const [data, setData] = useState<Overview | null>(null);
  const [windows, setWindows] = useState<ServiceWindows | null>(null);
  const [tab, setTab] = useState<Tab>('candidatures');
  const [dialog, setDialog] = useState<DialogRequest | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // getIdToken n'est pas mémoïsé par le contexte : on passe par une ref
  // pour garder des callbacks stables et éviter les boucles d'effet.
  const tokenRef = useRef(getIdToken);
  tokenRef.current = getIdToken;

  const call = useCallback(
    <T,>(path: string, init?: { method?: string; body?: unknown }) =>
      adminRequest<T>(() => tokenRef.current(), path, init),
    [],
  );

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setStatus('loading');
      const res = await call<Overview & { ok?: boolean }>('/api/admin/overview');

      if (res.status === 401 || res.status === 403) {
        setMessage(res.data?.message ?? '');
        setStatus('forbidden');
        return;
      }
      if (!res.ok || !res.data || !Array.isArray(res.data.candidatures)) {
        if (!silent) {
          setMessage(res.data?.message ?? '');
          setStatus('error');
        } else {
          showToast(res.data?.message ?? "Impossible d'actualiser les données.", 'error');
        }
        return;
      }
      setData(res.data);
      setStatus('ready');
    },
    [call, showToast],
  );

  const uid = user?.uid ?? null;
  useEffect(() => {
    if (!configured || loading) return;
    if (!uid) {
      setStatus('idle');
      setData(null);
      return;
    }
    void load();
  }, [configured, loading, uid, load]);

  const loadSettings = useCallback(async () => {
    const res = await call<{ windows: ServiceWindows }>('/api/admin/settings');
    if (res.ok && res.data?.windows) {
      setWindows(res.data.windows);
    } else {
      showToast(res.data?.message ?? "Impossible de charger les périodes de disponibilité.", 'error');
    }
  }, [call, showToast]);

  useEffect(() => {
    if (status === 'ready' && tab === 'settings' && windows === null) {
      void loadSettings();
    }
  }, [status, tab, windows, loadSettings]);

  async function saveServiceWindow(service: ServiceKey, window: ServiceWindow): Promise<boolean> {
    const res = await call<{ windows: ServiceWindows }>('/api/admin/settings', {
      method: 'PUT',
      body: { service, opensAt: window.opensAt, closesAt: window.closesAt },
    });
    if (!res.ok || !res.data?.windows) {
      showToast(res.data?.message ?? 'Enregistrement impossible.', 'error');
      return false;
    }
    setWindows(res.data.windows);
    showToast('Période mise à jour.', 'success');
    return true;
  }

  async function refresh() {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }

  /* -------------------------- Données dérivées -------------------------- */

  const candidatureByEmail = useMemo(() => {
    const map = new Map<string, Candidature>();
    for (const c of data?.candidatures ?? []) map.set(emailKey(c.email), c);
    return map;
  }, [data]);

  const bookingByEmail = useMemo(() => {
    const map = new Map<string, AdminSlot>();
    for (const s of data?.slots ?? []) {
      if (s.booked && s.bookedByEmail) map.set(emailKey(s.bookedByEmail), s);
    }
    return map;
  }, [data]);

  const stats = useMemo(() => {
    const candidatures = data?.candidatures ?? [];
    const slots = data?.slots ?? [];
    const booked = slots.filter((s) => s.booked).length;
    const perDepartment = DEPARTMENT_KEYS.map((key) => ({
      key,
      count: candidatures.filter((c) => c.department === key).length,
    }));
    const withoutInterview = candidatures.filter((c) => !bookingByEmail.has(emailKey(c.email))).length;
    return { total: candidatures.length, booked, free: slots.length - booked, withoutInterview, perDepartment };
  }, [data, bookingByEmail]);

  /* ------------------------------ Actions ------------------------------ */

  /** Appelle une route de modification, affiche le retour et recharge les données. */
  async function mutate(
    path: string,
    method: string,
    body: unknown,
    successMessage: (r: MutationResult) => string,
  ): Promise<boolean> {
    const res = await call<MutationResult>(path, { method, body });
    if (!res.ok || !res.data?.ok) {
      showToast(res.data?.message ?? 'Action impossible.', 'error');
      await load(true); // l'état a peut-être changé (créneau pris entre-temps…)
      return false;
    }

    showToast(successMessage(res.data), 'success');
    setDialog(null);
    await load(true);
    return true;
  }

  const closeDialog = () => setDialog(null);

  /* ------------------------------ Dialogues ------------------------------ */

  let dialogNode: React.ReactNode = null;
  const allSlots = data?.slots ?? [];

  if (dialog?.type === 'move') {
    const candidature = candidatureByEmail.get(emailKey(dialog.email));
    const currentSlot = bookingByEmail.get(emailKey(dialog.email)) ?? null;
    dialogNode = (
      <MoveSlotDialog
        name={candidature ? fullName(candidature) : dialog.email}
        email={dialog.email}
        department={candidature?.department ?? null}
        currentSlot={currentSlot}
        slots={allSlots}
        onClose={closeDialog}
        onConfirm={(slotId) =>
          mutate(
            '/api/admin/reservations',
            'POST',
            { action: 'assign', slotId, email: dialog.email },
            (r) => (r.moved ? 'Créneau changé.' : 'Créneau attribué.'),
          )
        }
      />
    );
  }

  if (dialog?.type === 'release') {
    const slot = allSlots.find((s) => s.id === dialog.slotId);
    const candidature = slot?.bookedByEmail ? candidatureByEmail.get(emailKey(slot.bookedByEmail)) : undefined;
    if (slot) {
      dialogNode = (
        <ConfirmDialog
          title="Libérer ce créneau ?"
          confirmLabel="Libérer le créneau"
          danger
          onClose={closeDialog}
          onConfirm={() =>
            mutate(
              '/api/admin/reservations',
              'POST',
              { action: 'release', slotId: slot.id },
              () => 'Créneau libéré.',
            )
          }
        >
          <p>
            L&rsquo;entretien de <strong>{candidature ? fullName(candidature) : slot.bookedByEmail}</strong> le{' '}
            <strong>{formatDayLong(slot.date)} à {slot.time}</strong> ({DEPARTMENT_LABELS[slot.department]}) sera
            annulé et le créneau redeviendra disponible. Le candidat pourra en réserver un nouveau.
          </p>
        </ConfirmDialog>
      );
    }
  }

  if (dialog?.type === 'edit-slot') {
    const slot = allSlots.find((s) => s.id === dialog.slotId);
    const candidature = slot?.bookedByEmail ? candidatureByEmail.get(emailKey(slot.bookedByEmail)) : undefined;
    if (slot) {
      dialogNode = (
        <SlotFormDialog
          slot={slot}
          bookedName={candidature ? fullName(candidature) : slot.bookedByEmail}
          onClose={closeDialog}
          onSubmit={(patch) =>
            mutate(
              '/api/admin/slots',
              'PATCH',
              { id: slot.id, ...patch },
              () => 'Créneau modifié.',
            )
          }
        />
      );
    }
  }

  if (dialog?.type === 'delete-slot') {
    const slot = allSlots.find((s) => s.id === dialog.slotId);
    if (slot) {
      dialogNode = (
        <ConfirmDialog
          title="Supprimer ce créneau ?"
          confirmLabel="Supprimer"
          danger
          onClose={closeDialog}
          onConfirm={() =>
            mutate('/api/admin/slots', 'DELETE', { id: slot.id }, () => 'Créneau supprimé.')
          }
        >
          <p>
            Le créneau du <strong>{formatDayLong(slot.date)} à {slot.time}</strong> (
            {DEPARTMENT_LABELS[slot.department]}) ne sera plus proposé aux candidats.
          </p>
        </ConfirmDialog>
      );
    }
  }

  if (dialog?.type === 'create-slots') {
    dialogNode = (
      <GenerateSlotsDialog
        initial={dialog.initial}
        onClose={closeDialog}
        onSubmit={(payload) =>
          mutate('/api/admin/slots', 'POST', payload, (r) => {
            const created = r.created ?? 0;
            const skipped = r.skipped ?? 0;
            return `${created} créneau${created > 1 ? 'x' : ''} créé${created > 1 ? 's' : ''}` +
              (skipped ? ` (${skipped} déjà existant${skipped > 1 ? 's' : ''})` : '') + '.';
          })
        }
      />
    );
  }

  /* -------------------------------- Rendu -------------------------------- */

  if (!configured) {
    return (
      <div className={styles.gateCard}>
        <Icons.Alert size={28} />
        <h2>Configuration Firebase manquante</h2>
        <p>Renseignez les variables d&rsquo;environnement Firebase pour activer la connexion.</p>
      </div>
    );
  }

  if (loading || (user && (status === 'idle' || status === 'loading'))) {
    return (
      <div className={styles.gateCard} role="status">
        <span className={styles.spinner} aria-hidden="true" />
        <p>Chargement de l&rsquo;espace administration…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className={styles.gateCard}>
        <span className={styles.gateIcon}>
          <Icons.Lock size={26} />
        </span>
        <h2>Espace administration</h2>
        <p>Connectez-vous avec un compte Google autorisé pour consulter les candidatures et gérer les créneaux.</p>
        <button type="button" className="btn btn-primary" onClick={signInWithGoogle}>
          <Icons.Google size={18} />
          Se connecter avec Google
        </button>
        {error && (
          <p className={styles.gateError} role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }

  if (status === 'forbidden') {
    return (
      <div className={styles.gateCard}>
        <span className={`${styles.gateIcon} ${styles.gateIconDanger}`}>
          <Icons.Shield size={26} />
        </span>
        <h2>Accès refusé</h2>
        <p>{message || `Le compte ${user.email} n'est pas autorisé à accéder à l'administration.`}</p>
        <button type="button" className="btn btn-outline" onClick={signOut}>
          <Icons.LogOut size={16} />
          Changer de compte
        </button>
      </div>
    );
  }

  if (status === 'error' || !data) {
    return (
      <div className={styles.gateCard} role="alert">
        <span className={`${styles.gateIcon} ${styles.gateIconDanger}`}>
          <Icons.Alert size={26} />
        </span>
        <h2>Chargement impossible</h2>
        <p>{message || 'Les données n’ont pas pu être chargées. Réessayez dans quelques instants.'}</p>
        <button type="button" className="btn btn-primary" onClick={() => void load()}>
          Réessayer
        </button>
      </div>
    );
  }

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'candidatures', label: 'Candidatures', count: stats.total },
    { id: 'interviews', label: 'Entretiens', count: stats.booked },
    { id: 'deliberation', label: 'Délibération' },
    { id: 'slots', label: 'Créneaux', count: data.slots.length },
    { id: 'settings', label: 'Réglages' },
  ];

  return (
    <div className={styles.dashboard}>
      <div className={styles.topBar}>
        <p className={styles.who}>
          Connecté en tant que <strong>{data.admin}</strong>
        </p>
        <div className={styles.topActions}>
          <button
            type="button"
            className={`btn btn-outline ${styles.compact}`}
            onClick={refresh}
            disabled={refreshing}
          >
            {refreshing ? 'Actualisation…' : 'Actualiser'}
          </button>
          <button type="button" className={`btn btn-outline ${styles.compact}`} onClick={signOut}>
            <Icons.LogOut size={16} />
            Déconnexion
          </button>
        </div>
      </div>

      <section className={styles.stats} aria-label="Statistiques">
        <div className={styles.statCard}>
          <span className={styles.statValue}>{stats.total}</span>
          <span className={styles.statLabel}>Candidatures</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statValue}>{stats.booked}</span>
          <span className={styles.statLabel}>Entretiens réservés</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statValue}>{stats.free}</span>
          <span className={styles.statLabel}>Créneaux libres</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statValue}>{stats.withoutInterview}</span>
          <span className={styles.statLabel}>Sans entretien</span>
        </div>
      </section>

      <div className={styles.deptStrip} aria-label="Candidatures par département">
        {stats.perDepartment.map((d) => (
          <span key={d.key} className={styles.deptPill} style={deptStyle(d.key as DepartmentKey)}>
            <i aria-hidden="true" />
            {DEPARTMENT_LABELS[d.key]}
            <strong>{d.count}</strong>
          </span>
        ))}
      </div>

      <div className={styles.tabs} role="tablist" aria-label="Sections">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`admin-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`admin-panel-${t.id}`}
            className={styles.tab}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.count !== undefined && <span>{t.count}</span>}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`admin-panel-${tab}`} aria-labelledby={`admin-tab-${tab}`}>
        {tab === 'candidatures' && (
          <CandidaturesPanel
            candidatures={data.candidatures}
            bookingByEmail={bookingByEmail}
            onRequest={setDialog}
          />
        )}
        {tab === 'interviews' && (
          <InterviewsPanel slots={data.slots} candidatureByEmail={candidatureByEmail} onRequest={setDialog} />
        )}
        {tab === 'deliberation' && (
          <DeliberationPanel candidatures={data.candidatures} bookingByEmail={bookingByEmail} call={call} />
        )}
        {tab === 'slots' && (
          <SlotsPanel slots={data.slots} candidatureByEmail={candidatureByEmail} onRequest={setDialog} />
        )}
        {tab === 'settings' && <SettingsPanel windows={windows} onSave={saveServiceWindow} />}
      </div>

      {dialogNode}
    </div>
  );
}