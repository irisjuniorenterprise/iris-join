'use client';
// components/admin/SettingsPanel.tsx
//
// Panneau "Disponibilité" : permet à l'admin de définir, pour chacun des
// deux services publics (candidature, entretien), une date d'ouverture
// et une date de fermeture. Laisser un champ vide = pas de limite de ce
// côté (le service est ouvert dès maintenant, ou ne ferme jamais tout
// seul). Le statut affiché (Ouvert / Pas encore ouvert / Fermé) est
// recalculé côté client à partir de l'heure locale, pour un retour
// immédiat ; la règle qui compte réellement est appliquée côté serveur
// (voir lib/settings-store.ts et les routes API publiques concernées).
import { useMemo, useState } from 'react';
import { Icons } from '@/components/icons/Icons';
import {
  SERVICE_KEYS,
  SERVICE_META,
  getServiceStatus,
  type ServiceKey,
  type ServiceWindow,
  type ServiceWindows,
} from '@/lib/service-window';
import styles from './admin.module.css';

type Props = {
  windows: ServiceWindows | null;
  onSave: (service: ServiceKey, window: ServiceWindow) => Promise<boolean>;
};

/** ISO (avec fuseau) -> valeur attendue par <input type="datetime-local"> (heure locale du navigateur). */
function isoToInputValue(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Valeur d'un <input type="datetime-local"> (heure locale) -> ISO, ou null si vide. */
function inputValueToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function StatusBadge({ window }: { window: ServiceWindow }) {
  const status = getServiceStatus(window);
  if (status.state === 'open') {
    return <span className={`${styles.status} ${styles.statusOk}`}>Ouvert</span>;
  }
  if (status.state === 'not-started') {
    return <span className={`${styles.status} ${styles.statusWarn}`}>Pas encore ouvert</span>;
  }
  return <span className={`${styles.status} ${styles.statusDanger}`}>Fermé</span>;
}

function ServiceWindowCard({
  service,
  window,
  onSave,
}: {
  service: ServiceKey;
  window: ServiceWindow;
  onSave: (service: ServiceKey, window: ServiceWindow) => Promise<boolean>;
}) {
  const meta = SERVICE_META[service];
  const [opensAt, setOpensAt] = useState(isoToInputValue(window.opensAt));
  const [closesAt, setClosesAt] = useState(isoToInputValue(window.closesAt));
  const [busy, setBusy] = useState(false);

  const changed =
    opensAt !== isoToInputValue(window.opensAt) || closesAt !== isoToInputValue(window.closesAt);
  const invalidRange = Boolean(opensAt && closesAt && opensAt >= closesAt);

  async function submit() {
    if (!changed || invalidRange) return;
    setBusy(true);
    try {
      const ok = await onSave(service, {
        opensAt: inputValueToIso(opensAt),
        closesAt: inputValueToIso(closesAt),
      });
      if (!ok) return;
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setOpensAt(isoToInputValue(window.opensAt));
    setClosesAt(isoToInputValue(window.closesAt));
  }

  return (
    <div className={styles.settingsCard}>
      <div className={styles.settingsCardHeader}>
        <h3 className={styles.settingsCardTitle}>{meta.title}</h3>
        <StatusBadge window={window} />
      </div>

      <div className={styles.formRow}>
        <label className={styles.formField}>
          <span>Ouverture</span>
          <input
            type="datetime-local"
            value={opensAt}
            onChange={(e) => setOpensAt(e.target.value)}
          />
        </label>
        <label className={styles.formField}>
          <span>Fermeture</span>
          <input
            type="datetime-local"
            value={closesAt}
            onChange={(e) => setClosesAt(e.target.value)}
          />
        </label>
      </div>

      <p className={styles.fieldHint}>
        Laissez un champ vide pour ne pas limiter l&rsquo;ouverture (le service démarre
        immédiatement) ou la fermeture (il ne se ferme jamais tout seul).
      </p>

      {invalidRange && (
        <div className={styles.infoBox} role="alert">
          <Icons.Alert size={18} />
          <span>La date de fermeture doit être après la date d&rsquo;ouverture.</span>
        </div>
      )}

      <div className={styles.formActions}>
        {changed && (
          <button type="button" className="btn btn-outline" onClick={reset} disabled={busy}>
            Annuler
          </button>
        )}
        <button
          type="button"
          className="btn btn-primary"
          onClick={submit}
          disabled={!changed || invalidRange || busy}
        >
          {busy ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </div>
  );
}

export default function SettingsPanel({ windows, onSave }: Props) {
  const services = useMemo(() => SERVICE_KEYS, []);

  if (!windows) {
    return (
      <div className={styles.panel}>
        <div className={styles.empty}>
          <Icons.Alert size={28} />
          <p>Impossible de charger les périodes de disponibilité pour le moment.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <div className={styles.infoBox}>
        <Icons.Info size={18} />
        <span>
          Chaque service (candidature, entretien) a sa propre période. Les candidats voient un
          message adapté tant que le service qu&rsquo;ils visitent n&rsquo;est pas encore ouvert
          ou a déjà fermé.
        </span>
      </div>

      <div className={styles.settingsGrid}>
        {services.map((service) => (
          <ServiceWindowCard
            key={service}
            service={service}
            window={windows[service]}
            onSave={onSave}
          />
        ))}
      </div>
    </div>
  );
}