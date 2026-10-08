'use client';
// components/forms/MissingInfoCard.tsx
//
// Invitation FACULTATIVE faite à un candidat dont la candidature a été
// importée par l'admin (fichier Excel) : certaines données manquent, il peut
// nous aider à les compléter. Le bloc est replié par défaut ; le bouton
// « Compléter » déplie le formulaire des seules données manquantes.
// Il ne s'affiche pas si rien ne manque, et ne bloque jamais la réservation.
// Le département n'est pas traité ici : il se choisit avant les créneaux.
import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { Icons } from '@/components/icons/Icons';
import { COMPLEMENT_FIELDS, type ComplementFieldKey } from '@/lib/candidature-complement';
import styles from './MissingInfoCard.module.css';

type Props = {
  /** E-mail vérifié via AuthGate — le bloc reste passif tant qu'il est vide. */
  verifiedEmail: string;
};

type Errors = Partial<Record<ComplementFieldKey, string>>;

export default function MissingInfoCard({ verifiedEmail }: Props) {
  const { getIdToken } = useAuth();
  const { showToast } = useToast();
  const panelId = useId();

  const [missing, setMissing] = useState<ComplementFieldKey[]>([]);
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Partial<Record<ComplementFieldKey, string>>>({});
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [thanks, setThanks] = useState(false);

  // Lecture des données manquantes. Un échec n'affiche rien : l'aide est facultative.
  useEffect(() => {
    if (!verifiedEmail) {
      setMissing([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const idToken = await getIdToken();
        if (!idToken) return;
        const res = await fetch('/api/candidature/complement', {
          headers: { Authorization: `Bearer ${idToken}` },
          cache: 'no-store',
        });
        const data = await res.json().catch(() => null);
        if (cancelled || !res.ok || !Array.isArray(data?.missing)) return;
        setMissing(data.missing);
      } catch {
        /* silencieux : le bloc reste simplement masqué */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verifiedEmail]);

  // Champs à afficher : les données manquantes ; le détail « organisation du
  // temps » apparaît dès que le candidat répond « oui » à l'autre engagement.
  const fields = useMemo(
    () =>
      COMPLEMENT_FIELDS.filter((f) => {
        if (f.key === 'organisationTemps') {
          return missing.includes('organisationTemps') || values.autreEngagement === 'oui';
        }
        return missing.includes(f.key);
      }),
    [missing, values.autreEngagement],
  );

  function setValue(key: ComplementFieldKey, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    // Seules les réponses renseignées sont envoyées (l'aide est facultative).
    const payload: Record<string, string> = {};
    for (const f of fields) {
      const v = values[f.key]?.trim();
      if (v) payload[f.key] = v;
    }
    if (Object.keys(payload).length === 0) {
      showToast('Renseignez au moins une information, ou cliquez sur « Plus tard ».', 'info');
      return;
    }

    setSubmitting(true);
    try {
      const idToken = await getIdToken();
      if (!idToken) throw new Error('no-token');
      const res = await fetch('/api/candidature/complement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok) {
        if (data?.errors) setErrors(data.errors);
        showToast(data?.message ?? 'Enregistrement impossible. Réessayez.', 'error');
        return;
      }

      const remaining: ComplementFieldKey[] = Array.isArray(data.missing) ? data.missing : [];
      setMissing(remaining);
      setValues({});
      setErrors({});
      setOpen(false);
      setThanks(remaining.length === 0);
      showToast('Merci, vos informations ont bien été enregistrées.', 'success');
    } catch (err) {
      console.error('[complement] erreur réseau/inattendue', err);
      showToast("L'envoi a échoué. Vérifiez votre connexion et réessayez.", 'error');
    } finally {
      setSubmitting(false);
    }
  }

  if (thanks && missing.length === 0) {
    return (
      <div className={`${styles.card} ${styles.thanks}`} role="status">
        <span className={styles.icon} aria-hidden="true">
          <Icons.Check size={20} />
        </span>
        <p className={styles.thanksText}>Merci ! Votre dossier est maintenant complet.</p>
      </div>
    );
  }

  if (missing.length === 0) return null;

  return (
    <section className={styles.card} aria-labelledby={`${panelId}-title`}>
      <div className={styles.head}>
        <span className={styles.icon} aria-hidden="true">
          <Icons.Info size={20} />
        </span>
        <div className={styles.headText}>
          <h3 className={styles.title} id={`${panelId}-title`}>
            Il nous manque quelques données qui vous concernent
          </h3>
          <p className={styles.text}>
            Voudriez-vous nous aider ? C&rsquo;est facultatif et cela ne retarde pas votre réservation.
          </p>
        </div>
        <button
          type="button"
          className={`btn btn-outline ${styles.toggle}`}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? 'Réduire' : 'Compléter'}
          <Icons.ChevronDown size={16} className={open ? styles.chevronOpen : styles.chevron} />
        </button>
      </div>

      {open && (
        <form id={panelId} className={styles.body} onSubmit={handleSubmit} noValidate>
          <div className="form-grid">
            {fields.map((f) => {
              const id = `${panelId}-${f.key}`;
              const error = errors[f.key];
              const wide = f.kind === 'textarea' || f.key === 'autreEngagement' || f.key === 'sourceConnaissance';
              return (
                <div key={f.key} className={`field ${wide ? 'field-full' : ''}`}>
                  <label htmlFor={id}>{f.label}</label>
                  {f.kind === 'select' ? (
                    <select
                      id={id}
                      value={values[f.key] ?? ''}
                      onChange={(e) => setValue(f.key, e.target.value)}
                      aria-invalid={Boolean(error)}
                    >
                      <option value="">Choisir…</option>
                      {f.options?.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : f.kind === 'textarea' ? (
                    <textarea
                      id={id}
                      rows={3}
                      maxLength={f.maxLength}
                      placeholder={f.placeholder}
                      value={values[f.key] ?? ''}
                      onChange={(e) => setValue(f.key, e.target.value)}
                      aria-invalid={Boolean(error)}
                    />
                  ) : (
                    <input
                      id={id}
                      type={f.kind === 'tel' ? 'tel' : 'text'}
                      inputMode={f.kind === 'tel' ? 'numeric' : undefined}
                      maxLength={f.maxLength}
                      placeholder={f.placeholder}
                      value={values[f.key] ?? ''}
                      onChange={(e) =>
                        setValue(f.key, f.kind === 'tel' ? e.target.value.replace(/\D/g, '') : e.target.value)
                      }
                      aria-invalid={Boolean(error)}
                    />
                  )}
                  {error && (
                    <span className="field-error" role="alert">
                      {error}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <div className={styles.actions}>
            <button type="button" className="btn btn-outline" onClick={() => setOpen(false)} disabled={submitting}>
              Plus tard
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? (
                'Enregistrement…'
              ) : (
                <>
                  <Icons.Check size={16} />
                  Enregistrer
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}