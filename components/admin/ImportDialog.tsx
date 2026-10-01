'use client';
// components/admin/ImportDialog.tsx
//
// Import de candidatures depuis le modèle Excel : téléchargement du modèle,
// choix du fichier, vérification (aperçu ligne par ligne), puis import des
// lignes valides. Toute la validation est faite côté serveur
// (app/api/admin/candidatures/import/route.ts).
import { useRef, useState } from 'react';
import { Icons } from '@/components/icons/Icons';
import { useToast } from '@/lib/toast';
import Modal from './Modal';
import styles from './admin.module.css';
import local from './ImportDialog.module.css';

type RowReport = {
  line: number;
  nomPrenom: string;
  email: string;
  status: 'ok' | 'duplicate' | 'error';
  errors: string[];
};

type Report = {
  total: number;
  valid: number;
  duplicates: number;
  errors: number;
  rows: RowReport[];
  created?: number;
  emailsSent?: number;
};

type Props = {
  getIdToken: () => Promise<string | null>;
  onClose: () => void;
  /** Appelé après un import réussi (rechargement des données). */
  onImported: () => void;
};

const ENDPOINT = '/api/admin/candidatures/import';

export default function ImportDialog({ getIdToken, onClose, onImported }: Props) {
  const { showToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [consent, setConsent] = useState(false);
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function authHeaders(): Promise<HeadersInit | null> {
    const token = await getIdToken();
    return token ? { Authorization: `Bearer ${token}` } : null;
  }

  async function downloadTemplate() {
    const headers = await authHeaders();
    if (!headers) return setError('Session expirée. Reconnectez-vous.');
    try {
      const res = await fetch(ENDPOINT, { headers, cache: 'no-store' });
      if (!res.ok) throw new Error();
      const url = URL.createObjectURL(await res.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = 'modele-candidatures-iris.xlsx';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError('Impossible de télécharger le modèle.');
    }
  }

  async function send(dryRun: boolean) {
    if (!file) return;
    const headers = await authHeaders();
    if (!headers) return setError('Session expirée. Reconnectez-vous.');

    setBusy(true);
    setError('');
    try {
      const body = new FormData();
      body.append('file', file);
      body.append('dryRun', String(dryRun));
      body.append('consent', String(consent));
      body.append('notify', String(notify));

      const res = await fetch(ENDPOINT, { method: 'POST', headers, body, cache: 'no-store' });
      const data = (await res.json().catch(() => null)) as (Report & { ok?: boolean; message?: string }) | null;

      if (!res.ok || !data?.ok) {
        setReport(null);
        setError(data?.message ?? 'Import impossible.');
        return;
      }

      setReport(data);
      if (!dryRun) {
        setDone(true);
        showToast(
          `${data.created ?? 0} candidature${(data.created ?? 0) > 1 ? 's' : ''} importée${(data.created ?? 0) > 1 ? 's' : ''}.`,
          'success',
        );
        onImported();
      }
    } catch {
      setError('Problème réseau. Vérifiez votre connexion.');
    } finally {
      setBusy(false);
    }
  }

  function pickFile(f: File | null) {
    setFile(f);
    setReport(null);
    setError('');
    setDone(false);
    if (f) void checkAfterPick(f);
  }

  // Vérification automatique dès le choix du fichier.
  async function checkAfterPick(f: File) {
    const headers = await authHeaders();
    if (!headers) return setError('Session expirée. Reconnectez-vous.');
    setBusy(true);
    try {
      const body = new FormData();
      body.append('file', f);
      body.append('dryRun', 'true');
      const res = await fetch(ENDPOINT, { method: 'POST', headers, body, cache: 'no-store' });
      const data = (await res.json().catch(() => null)) as (Report & { ok?: boolean; message?: string }) | null;
      if (!res.ok || !data?.ok) setError(data?.message ?? 'Fichier invalide.');
      else setReport(data);
    } catch {
      setError('Problème réseau. Vérifiez votre connexion.');
    } finally {
      setBusy(false);
    }
  }

  const canImport = Boolean(file && report && report.valid > 0 && consent && !busy && !done);
  const problems = report?.rows.filter((r) => r.status !== 'ok') ?? [];

  return (
    <Modal
      title="Importer des candidatures (Excel)"
      subtitle="Pour les candidats ayant rempli le modèle .xlsx"
      onClose={onClose}
      busy={busy}
      wide
      footer={
        <>
          <button type="button" className={`btn btn-outline ${styles.compact}`} onClick={onClose} disabled={busy}>
            {done ? 'Fermer' : 'Annuler'}
          </button>
          {!done && (
            <button
              type="button"
              className={`btn btn-primary ${styles.compact}`}
              onClick={() => send(false)}
              disabled={!canImport}
            >
              {busy ? 'Traitement…' : `Importer ${report?.valid ?? 0} candidature${(report?.valid ?? 0) > 1 ? 's' : ''}`}
            </button>
          )}
        </>
      }
    >
      <ol className={local.steps}>
        <li>Téléchargez le modèle et remplissez une ligne par candidat.</li>
        <li>Choisissez le fichier : il est vérifié avant tout enregistrement.</li>
        <li>Confirmez, puis importez les lignes valides.</li>
      </ol>

      <button type="button" className={`btn btn-outline ${styles.compact}`} onClick={downloadTemplate}>
        <Icons.FileText size={16} />
        Télécharger le modèle Excel
      </button>

      <div className={local.drop} style={{ marginTop: '1rem' }}>
        <label htmlFor="import-file">
          <strong>Fichier Excel (.xlsx)</strong>
        </label>
        <input
          id="import-file"
          ref={inputRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          disabled={busy || done}
        />
      </div>

      {error && (
        <p className={local.error} role="alert">
          {error}
        </p>
      )}

      {report && (
        <>
          <div className={local.summary} aria-live="polite">
            <span className={`${styles.status} ${styles.statusNone}`}>{report.total} ligne{report.total > 1 ? 's' : ''}</span>
            <span className={`${styles.status} ${styles.statusOk}`}>{report.valid} valide{report.valid > 1 ? 's' : ''}</span>
            {report.duplicates > 0 && (
              <span className={`${styles.status} ${styles.statusWarn}`}>{report.duplicates} doublon{report.duplicates > 1 ? 's' : ''}</span>
            )}
            {report.errors > 0 && (
              <span className={`${styles.status} ${styles.statusDanger}`}>{report.errors} erreur{report.errors > 1 ? 's' : ''}</span>
            )}
            {done && report.emailsSent !== undefined && (
              <span className={`${styles.status} ${styles.statusOk}`}>{report.emailsSent} e-mail(s) envoyé(s)</span>
            )}
          </div>

          {problems.length > 0 && (
            <div className={local.scroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Ligne</th>
                    <th scope="col">Candidat</th>
                    <th scope="col">Problème</th>
                  </tr>
                </thead>
                <tbody>
                  {problems.map((r) => (
                    <tr key={r.line}>
                      <td data-label="Ligne">{r.line}</td>
                      <td data-label="Candidat">
                        {r.nomPrenom || '—'}
                        <span className={styles.cellSubtle}>{r.email}</span>
                      </td>
                      <td data-label="Problème">
                        <ul className={local.errorList}>
                          {r.errors.map((e, i) => (
                            <li key={i}>{e}</li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!done && (
            <>
              <label className={local.check}>
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                <span>
                  Je confirme que ces candidats ont donné leur consentement au traitement de leurs données pour
                  leur candidature à IRIS.
                </span>
              </label>
              <label className={local.check}>
                <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
                <span>Envoyer l’e-mail de confirmation (avec le lien de réservation d’entretien) aux candidats importés.</span>
              </label>
            </>
          )}
        </>
      )}
    </Modal>
  );
}