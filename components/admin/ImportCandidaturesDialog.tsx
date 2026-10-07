'use client';
// components/admin/ImportCandidaturesDialog.tsx
//
// Import Excel des candidatures, en trois temps :
//   1. choisir le fichier (modèle OU registre des candidats) et les options ;
//   2. « Analyser » : validation à blanc, rapport ligne par ligne (filtres,
//      recherche, en-tête fixe). Pour chaque ligne l'admin peut :
//        • la COCHER / DÉCOCHER : seules les lignes cochées seront importées
//          (ex. n'accepter qu'un seul enregistrement) ;
//        • la CORRIGER (bouton « Modifier ») : un e-mail mal écrit, un
//          téléphone, un département… La ligne est revalidée par le serveur
//          avec les mêmes règles que le formulaire public ;
//   3. « Importer » : enregistrement des lignes cochées et valides, puis bilan.
// Appelle POST /api/admin/candidatures/import (voir la route pour le détail
// des formats, des champs `overrides` / `selected` et des règles de validation).
import { Fragment, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { Icons } from '@/components/icons/Icons';
import { useAuth } from '@/lib/auth';
import Modal from './Modal';
import ImportRowEditor, { type ImportFieldDef } from './ImportRowEditor';
import { fold } from './shared';
import styles from './ImportCandidaturesDialog.module.css';
import ed from './ImportRowEditor.module.css';

type Props = {
  onClose: () => void;
  /** Appelé à la fermeture si des candidatures ont été créées (pour recharger la liste). */
  onImported?: () => void;
};

type RowReport = {
  line: number;
  nomPrenom: string;
  email: string;
  status: 'ok' | 'duplicate' | 'error';
  errors: string[];
  warnings?: string[];
  /** Valeurs éditables de la ligne (après corrections). */
  fields?: Record<string, string>;
  /** Champs corrigés par l'admin. */
  corrected?: string[];
};

type ImportResponse = {
  ok: boolean;
  message?: string;
  dryRun?: boolean;
  format?: 'modele' | 'registre';
  total: number;
  valid: number;
  duplicates: number;
  errors: number;
  withWarnings?: number;
  created?: number;
  notSelected?: number;
  emailsSent?: number;
  fields?: ImportFieldDef[];
  rows: RowReport[];
};

/** Corrections de l'admin : n° de ligne Excel → { champ → valeur }. */
type Overrides = Record<number, Record<string, string>>;

type RowKind = 'ok' | 'warning' | 'duplicate' | 'error';
type Filter = 'all' | RowKind;

const ENDPOINT = '/api/admin/candidatures/import';

const KIND_LABEL: Record<RowKind, string> = {
  ok: 'Prête',
  warning: 'À vérifier',
  duplicate: 'Doublon',
  error: 'Refusée',
};

function rowKind(row: RowReport): RowKind {
  if (row.status === 'ok') return row.warnings && row.warnings.length > 0 ? 'warning' : 'ok';
  return row.status;
}

/** Une ligne n'est importable que si le serveur la juge valide. */
const isImportable = (row: RowReport) => row.status === 'ok';

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} Ko` : `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

/** Sélection de départ : toutes les lignes importables. */
function allImportable(rows: RowReport[]): Set<number> {
  return new Set(rows.filter(isImportable).map((r) => r.line));
}

export default function ImportCandidaturesDialog({ onClose, onImported }: Props) {
  const { getIdToken } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const headerCheckRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [consent, setConsent] = useState(false);
  const [notify, setNotify] = useState(false);
  const [allowNoDepartment, setAllowNoDepartment] = useState(false);

  const [report, setReport] = useState<ImportResponse | null>(null);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [busy, setBusy] = useState<'analyse' | 'import' | 'template' | null>(null);
  const [error, setError] = useState('');

  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  // Flexibilité admin : lignes cochées, corrections saisies, ligne en cours d'édition.
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [overrides, setOverrides] = useState<Overrides>({});
  const [editing, setEditing] = useState<number | null>(null);

  /* ------------------------------ Fichier ------------------------------ */

  function pickFile(next: File | null) {
    setError('');
    setReport(null);
    setSelected(new Set());
    setOverrides({});
    setEditing(null);
    if (next && !next.name.toLowerCase().endsWith('.xlsx')) {
      setFile(null);
      setError('Format non pris en charge : choisissez un fichier Excel .xlsx.');
      return;
    }
    setFile(next);
  }

  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragging(false);
    pickFile(e.dataTransfer.files?.[0] ?? null);
  }

  // Toute modification des options invalide l'analyse précédente
  // (les corrections de l'admin sont conservées pour la nouvelle analyse).
  function changeOption(setter: (value: boolean) => void, value: boolean, invalidates: boolean) {
    setter(value);
    if (invalidates) {
      setReport(null);
      setEditing(null);
    }
  }

  /* ------------------------------ Appels API ------------------------------ */

  async function authHeader(): Promise<Record<string, string> | null> {
    const token = await getIdToken();
    if (!token) {
      setError('Session expirée. Reconnectez-vous puis réessayez.');
      return null;
    }
    return { Authorization: `Bearer ${token}` };
  }

  async function downloadTemplate() {
    setError('');
    setBusy('template');
    try {
      const headers = await authHeader();
      if (!headers) return;
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
      setError('Impossible de télécharger le modèle. Réessayez.');
    } finally {
      setBusy(null);
    }
  }

  /**
   * Envoie le fichier. `dryRun` = analyse à blanc ; sinon import réel des
   * lignes cochées. `ov` = corrections à appliquer (passées en paramètre car
   * l'état React n'est pas encore à jour juste après une modification).
   * `keepFor` : après une correction, on garde la sélection actuelle et on
   * coche automatiquement la ligne corrigée si elle est devenue valide.
   * Renvoie true si la requête a abouti.
   */
  async function send(
    dryRun: boolean,
    ov: Overrides = overrides,
    keepFor: number | null = null,
  ): Promise<boolean> {
    if (!file) return false;
    setError('');
    setBusy(dryRun ? 'analyse' : 'import');
    try {
      const headers = await authHeader();
      if (!headers) return false;

      const form = new FormData();
      form.set('file', file);
      form.set('dryRun', String(dryRun));
      form.set('consent', String(consent));
      form.set('notify', String(notify));
      form.set('allowNoDepartment', String(allowNoDepartment));
      form.set('overrides', JSON.stringify(ov));
      if (!dryRun) form.set('selected', JSON.stringify([...selectedValid]));

      const res = await fetch(ENDPOINT, { method: 'POST', headers, body: form, cache: 'no-store' });
      const data = (await res.json().catch(() => null)) as ImportResponse | null;
      if (!res.ok || !data?.ok) {
        setError(data?.message ?? 'Le serveur a refusé le fichier. Réessayez.');
        return false;
      }
      if (dryRun) {
        setReport(data);
        if (keepFor === null) {
          setSelected(allImportable(data.rows));
          setFilter('all');
          setQuery('');
        } else {
          setSelected((prev) => {
            const next = new Set<number>();
            for (const row of data.rows) {
              if (isImportable(row) && (prev.has(row.line) || row.line === keepFor)) next.add(row.line);
            }
            return next;
          });
          setEditing(null);
        }
      } else {
        setResult(data);
      }
      return true;
    } catch {
      setError('Erreur réseau. Vérifiez votre connexion puis réessayez.');
      return false;
    } finally {
      setBusy(null);
    }
  }

  function close() {
    onClose();
    if (result && (result.created ?? 0) > 0) (onImported ?? (() => window.location.reload()))();
  }

  /* ------------------------------ Corrections ------------------------------ */

  async function applyEdit(line: number, changes: Record<string, string>) {
    const previous = overrides;
    const next: Overrides = { ...overrides, [line]: { ...(overrides[line] ?? {}), ...changes } };
    setOverrides(next);
    const ok = await send(true, next, line);
    if (!ok) setOverrides(previous);
  }

  async function resetEdit(line: number) {
    const previous = overrides;
    const next: Overrides = { ...overrides };
    delete next[line];
    setOverrides(next);
    const ok = await send(true, next, line);
    if (!ok) setOverrides(previous);
  }

  /* ------------------------------ Sélection ------------------------------ */

  function toggleLine(line: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(line)) next.delete(line);
      else next.add(line);
      return next;
    });
  }

  function setLines(lines: number[], checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const line of lines) {
        if (checked) next.add(line);
        else next.delete(line);
      }
      return next;
    });
  }

  /* ------------------------------ Rapport ------------------------------ */

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: 0, ok: 0, warning: 0, duplicate: 0, error: 0 };
    for (const row of report?.rows ?? []) {
      c.all += 1;
      c[rowKind(row)] += 1;
    }
    return c;
  }, [report]);

  const visibleRows = useMemo(() => {
    const q = fold(query.trim());
    return (report?.rows ?? []).filter((row) => {
      if (filter !== 'all' && rowKind(row) !== filter) return false;
      if (!q) return true;
      return fold(`${row.nomPrenom} ${row.email} ${row.line}`).includes(q);
    });
  }, [report, filter, query]);

  /** Lignes cochées ET valides : ce qui sera réellement importé. */
  const selectedValid = useMemo(
    () => (report?.rows ?? []).filter((row) => isImportable(row) && selected.has(row.line)).map((r) => r.line),
    [report, selected],
  );
  const importableCount = useMemo(() => (report?.rows ?? []).filter(isImportable).length, [report]);

  const visibleImportable = useMemo(() => visibleRows.filter(isImportable).map((r) => r.line), [visibleRows]);
  const visibleSelectedCount = visibleImportable.filter((line) => selected.has(line)).length;
  const allVisibleSelected = visibleImportable.length > 0 && visibleSelectedCount === visibleImportable.length;

  // Case « tout » de l'en-tête : état indéterminé quand la sélection est partielle.
  useEffect(() => {
    if (headerCheckRef.current) {
      headerCheckRef.current.indeterminate = visibleSelectedCount > 0 && !allVisibleSelected;
    }
  }, [visibleSelectedCount, allVisibleSelected]);

  const fieldLabel = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of report?.fields ?? []) map.set(f.key, f.label);
    return map;
  }, [report]);

  const canImport = Boolean(report && selectedValid.length > 0 && consent && busy === null);
  const working = busy === 'analyse' || busy === 'import';

  /* ------------------------------ Rendu ------------------------------ */

  const footer = result ? (
    <button type="button" className="btn btn-primary" onClick={close}>
      Terminer
    </button>
  ) : (
    <>
      <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy !== null}>
        Annuler
      </button>
      {!report ? (
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void send(true)}
          disabled={!file || busy !== null}
        >
          {busy === 'analyse' ? 'Analyse en cours…' : 'Analyser le fichier'}
        </button>
      ) : (
        <button type="button" className="btn btn-primary" onClick={() => void send(false)} disabled={!canImport}>
          {busy === 'import'
            ? 'Import en cours…'
            : selectedValid.length > 0
              ? `Importer ${plural(selectedValid.length, 'candidature sélectionnée', 'candidatures sélectionnées')}`
              : 'Aucune candidature sélectionnée'}
        </button>
      )}
    </>
  );

  return (
    <Modal
      title="Importer des candidatures"
      subtitle="Fichier Excel (.xlsx) : modèle d’import ou registre des candidats"
      onClose={result ? close : onClose}
      busy={working}
      className={styles.xl}
      footer={footer}
    >
      <div className={styles.content}>
        {error && (
          <div className={styles.alertError} role="alert">
            <Icons.Alert size={18} />
            <span>{error}</span>
          </div>
        )}

        {result ? (
          /* ------------------------- Bilan ------------------------- */
          <div className={styles.done}>
            <span className={styles.doneIcon} aria-hidden="true">
              <Icons.Check size={30} />
            </span>
            <h3>
              {(result.created ?? 0) > 0
                ? `${plural(result.created ?? 0, 'candidature importée', 'candidatures importées')}`
                : 'Aucune candidature importée'}
            </h3>
            <p>
              {(result.notSelected ?? 0) > 0 &&
                `${plural(result.notSelected ?? 0, 'ligne laissée de côté', 'lignes laissées de côté')} · `}
              {result.duplicates > 0 && `${plural(result.duplicates, 'doublon ignoré', 'doublons ignorés')} · `}
              {result.errors > 0 && `${plural(result.errors, 'ligne refusée', 'lignes refusées')} · `}
              {notify ? `${plural(result.emailsSent ?? 0, 'e-mail envoyé', 'e-mails envoyés')}` : 'Aucun e-mail envoyé'}
            </p>
          </div>
        ) : (
          <>
            {/* ------------------------- Fichier ------------------------- */}
            <label
              className={`${styles.drop} ${dragging ? styles.dropActive : ''} ${file ? styles.dropFilled : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className={styles.fileInput}
                onChange={(e) => {
                  pickFile(e.target.files?.[0] ?? null);
                  e.target.value = '';
                }}
              />
              <span className={styles.dropIcon} aria-hidden="true">
                {file ? <Icons.FileText size={26} /> : <UploadIcon />}
              </span>
              {file ? (
                <span className={styles.dropText}>
                  <strong>{file.name}</strong>
                  <span>{formatSize(file.size)} · cliquez pour changer de fichier</span>
                </span>
              ) : (
                <span className={styles.dropText}>
                  <strong>Déposez le fichier Excel ici</strong>
                  <span>ou cliquez pour le choisir (.xlsx, 2 Mo maximum)</span>
                </span>
              )}
            </label>

            <button
              type="button"
              className={styles.linkBtn}
              onClick={() => void downloadTemplate()}
              disabled={busy !== null}
            >
              <DownloadIcon />
              {busy === 'template' ? 'Téléchargement…' : 'Télécharger le modèle d’import (.xlsx)'}
            </button>

            {/* ------------------------- Options ------------------------- */}
            <fieldset className={styles.options} disabled={busy !== null}>
              <legend className={styles.srOnly}>Options d’import</legend>

              <label className={styles.check}>
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                <span>
                  <strong>Je confirme le consentement des candidats</strong>
                  <small>Obligatoire pour importer : les candidats ont accepté le traitement de leurs données.</small>
                </span>
              </label>

              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={allowNoDepartment}
                  onChange={(e) => changeOption(setAllowNoDepartment, e.target.checked, true)}
                />
                <span>
                  <strong>Importer aussi les candidats sans département</strong>
                  <small>
                    Registre uniquement. Sans département, un candidat ne peut pas réserver d’entretien tant que vous ne
                    lui en avez pas attribué un.
                  </small>
                </span>
              </label>

              <label className={styles.check}>
                <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
                <span>
                  <strong>Envoyer un e-mail de confirmation</strong>
                  <small>Uniquement aux candidats qui ont un département.</small>
                </span>
              </label>
            </fieldset>

            {/* ------------------------- Rapport ------------------------- */}
            {report && (
              <section className={styles.report} aria-label="Résultat de l’analyse">
                <div className={styles.summary}>
                  <Stat label="Lignes lues" value={report.total} />
                  <Stat label="Prêtes à importer" value={report.valid} tone="ok" />
                  <Stat label="Sélectionnées" value={selectedValid.length} tone="ok" />
                  <Stat label="À vérifier" value={report.withWarnings ?? 0} tone="warn" />
                  <Stat label="Doublons" value={report.duplicates} tone="muted" />
                  <Stat label="Refusées" value={report.errors} tone="danger" />
                </div>

                {report.format === 'registre' && (
                  <div className={styles.alertInfo}>
                    <Icons.Info size={18} />
                    <span>
                      Fichier détecté : <strong>registre des candidats</strong>. Il ne contient pas les réponses du
                      questionnaire (motivation, niveaux de langue…) ni toujours le CIN ou l’adresse : ces champs seront
                      enregistrés avec un tiret (<strong>-</strong>).
                    </span>
                  </div>
                )}

                <div className={ed.selectionBar}>
                  <span>
                    <strong>{selectedValid.length}</strong> sur {importableCount} ligne
                    {importableCount > 1 ? 's' : ''} importable{importableCount > 1 ? 's' : ''} cochée
                    {selectedValid.length > 1 ? 's' : ''}
                  </span>
                  <button
                    type="button"
                    className={ed.linkBtn}
                    onClick={() => setSelected(allImportable(report.rows))}
                    disabled={busy !== null || selectedValid.length === importableCount}
                  >
                    Tout sélectionner
                  </button>
                  <button
                    type="button"
                    className={ed.linkBtn}
                    onClick={() => setSelected(new Set())}
                    disabled={busy !== null || selectedValid.length === 0}
                  >
                    Tout désélectionner
                  </button>
                  <span>Cochez les lignes à importer ; « Modifier » corrige les données d’une ligne.</span>
                </div>

                <div className={styles.reportBar}>
                  <div className={styles.tabs} role="tablist" aria-label="Filtrer les lignes">
                    {(['all', 'ok', 'warning', 'duplicate', 'error'] as Filter[]).map((key) => (
                      <button
                        key={key}
                        type="button"
                        role="tab"
                        aria-selected={filter === key}
                        className={`${styles.tab} ${filter === key ? styles.tabActive : ''}`}
                        onClick={() => setFilter(key)}
                        disabled={key !== 'all' && counts[key] === 0}
                      >
                        {key === 'all' ? 'Toutes' : KIND_LABEL[key]} <span>{counts[key]}</span>
                      </button>
                    ))}
                  </div>
                  <label className={styles.search}>
                    <Icons.Search size={16} />
                    <input
                      type="search"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Nom, e-mail, ligne…"
                      aria-label="Rechercher dans le rapport"
                    />
                  </label>
                </div>

                <div className={styles.tableScroll} tabIndex={0} aria-label="Détail ligne par ligne">
                  {visibleRows.length === 0 ? (
                    <p className={styles.emptyRows}>Aucune ligne pour ce filtre.</p>
                  ) : (
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th scope="col" className={ed.cellCheck}>
                            <input
                              ref={headerCheckRef}
                              type="checkbox"
                              checked={allVisibleSelected}
                              disabled={visibleImportable.length === 0 || busy !== null}
                              onChange={(e) => setLines(visibleImportable, e.target.checked)}
                              aria-label="Cocher ou décocher toutes les lignes importables affichées"
                            />
                          </th>
                          <th scope="col">Ligne</th>
                          <th scope="col">Candidat</th>
                          <th scope="col">Statut</th>
                          <th scope="col">Détails</th>
                          <th scope="col">
                            <span className={styles.srOnly}>Actions</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleRows.map((row) => {
                          const kind = rowKind(row);
                          const notes = kind === 'warning' ? (row.warnings ?? []) : row.errors;
                          const importable = isImportable(row);
                          const isChecked = importable && selected.has(row.line);
                          const isEditing = editing === row.line;
                          const corrected = row.corrected ?? [];
                          return (
                            <Fragment key={`${row.line}-${row.email}`}>
                              <tr className={importable && !isChecked ? ed.unselected : undefined}>
                                <td className={ed.cellCheck}>
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    disabled={!importable || busy !== null}
                                    onChange={() => toggleLine(row.line)}
                                    aria-label={
                                      importable
                                        ? `Importer la ligne ${row.line}`
                                        : `Ligne ${row.line} non importable : corrigez-la d’abord`
                                    }
                                  />
                                </td>
                                <td className={styles.cellLine}>{row.line}</td>
                                <td>
                                  <span className={styles.name}>{row.nomPrenom || '-'}</span>
                                  <span className={styles.mail}>{row.email || '-'}</span>
                                </td>
                                <td>
                                  <span className={`${styles.badge} ${styles[`badge_${kind}`]}`}>{KIND_LABEL[kind]}</span>
                                  {corrected.length > 0 && (
                                    <span className={ed.correctedNote}>
                                      Corrigée : {corrected.map((key) => fieldLabel.get(key) ?? key).join(', ')}
                                    </span>
                                  )}
                                </td>
                                <td>
                                  {notes.length === 0 ? (
                                    <span className={styles.okText}>Prête à être importée</span>
                                  ) : (
                                    <ul className={`${styles.notes} ${kind === 'warning' ? styles.notesWarn : ''}`}>
                                      {notes.map((note) => (
                                        <li key={note}>{note}</li>
                                      ))}
                                    </ul>
                                  )}
                                </td>
                                <td className={ed.cellActions}>
                                  {row.fields && (
                                    <button
                                      type="button"
                                      className={ed.editBtn}
                                      aria-expanded={isEditing}
                                      onClick={() => setEditing(isEditing ? null : row.line)}
                                      disabled={busy !== null}
                                    >
                                      <Icons.Edit size={14} />
                                      {isEditing ? 'Fermer' : 'Modifier'}
                                    </button>
                                  )}
                                </td>
                              </tr>

                              {isEditing && row.fields && report.fields && (
                                <tr className={ed.editRow}>
                                  <td colSpan={6}>
                                    <ImportRowEditor
                                      key={`${row.line}-${row.email}-${corrected.join(',')}`}
                                      fields={report.fields}
                                      values={row.fields}
                                      notes={importable ? [] : row.errors}
                                      busy={busy === 'analyse'}
                                      hasCorrections={Boolean(overrides[row.line])}
                                      onApply={(changes) => void applyEdit(row.line, changes)}
                                      onReset={() => void resetEdit(row.line)}
                                      onCancel={() => setEditing(null)}
                                    />
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

function Stat({ label, value, tone = 'plain' }: { label: string; value: number; tone?: 'plain' | 'ok' | 'warn' | 'muted' | 'danger' }) {
  return (
    <div className={`${styles.stat} ${styles[`stat_${tone}`]}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function UploadIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}