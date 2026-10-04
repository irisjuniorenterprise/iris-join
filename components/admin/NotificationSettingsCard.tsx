'use client';
// components/admin/NotificationSettingsCard.tsx
//
// Réglage « E-mail de confirmation de candidature » : l'admin choisit, avec
// deux boutons radio (Activé / Désactivé), si le candidat reçoit un e-mail
// dès qu'il soumet son formulaire. Le choix est appliqué côté serveur
// (voir app/api/candidature/route.ts) après clic sur « Enregistrer ».
import { useEffect, useState } from 'react';
import { Icons } from '@/components/icons/Icons';
import type { NotificationSettings } from '@/lib/notification-settings';
import adminStyles from './admin.module.css';
import styles from './NotificationSettingsCard.module.css';

type Props = {
  settings: NotificationSettings | null;
  onSave: (candidatureEmail: boolean) => Promise<boolean>;
};

const OPTIONS = [
  {
    value: true,
    label: 'Activé',
    hint: 'Le candidat reçoit un e-mail de confirmation dès l’envoi de sa candidature.',
  },
  {
    value: false,
    label: 'Désactivé',
    hint: 'Aucun e-mail n’est envoyé au candidat à la soumission. L’équipe RH reste notifiée si elle est configurée.',
  },
] as const;

export default function NotificationSettingsCard({ settings, onSave }: Props) {
  const saved = settings?.candidatureEmail ?? true;
  const [draft, setDraft] = useState<boolean>(saved);
  const [busy, setBusy] = useState(false);

  // Resynchronise le brouillon quand la valeur enregistrée change (chargement, enregistrement).
  useEffect(() => {
    setDraft(saved);
  }, [saved]);

  const changed = draft !== saved;

  async function submit() {
    if (!changed || !settings) return;
    setBusy(true);
    try {
      await onSave(draft);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={adminStyles.settingsCard}>
      <div className={adminStyles.settingsCardHeader}>
        <h3 className={adminStyles.settingsCardTitle}>E-mail de confirmation de candidature</h3>
        {settings && (
          <span className={`${adminStyles.status} ${saved ? adminStyles.statusOk : adminStyles.statusNone}`}>
            {saved ? 'Activé' : 'Désactivé'}
          </span>
        )}
      </div>

      {!settings ? (
        <div className={adminStyles.infoBox} role="alert">
          <Icons.Alert size={18} />
          <span>Impossible de charger ce réglage pour le moment.</span>
        </div>
      ) : (
        <>
          <fieldset className={styles.group} disabled={busy}>
            <legend className={styles.legend}>
              Envoyer un e-mail au candidat quand il soumet sa candidature
            </legend>

            {OPTIONS.map((option) => (
              <label
                key={String(option.value)}
                className={`${styles.option} ${draft === option.value ? styles.optionOn : ''}`}
              >
                <input
                  type="radio"
                  name="candidature-email-notification"
                  className={styles.radio}
                  checked={draft === option.value}
                  onChange={() => setDraft(option.value)}
                />
                <span className={styles.dot} aria-hidden="true" />
                <span className={styles.text}>
                  <strong>{option.label}</strong>
                  <span>{option.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <div className={adminStyles.formActions}>
            {changed && (
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setDraft(saved)}
                disabled={busy}
              >
                Annuler
              </button>
            )}
            <button type="button" className="btn btn-primary" onClick={submit} disabled={!changed || busy}>
              {busy ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
