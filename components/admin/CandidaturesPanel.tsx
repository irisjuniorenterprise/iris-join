'use client';
// components/admin/CandidaturesPanel.tsx
//
// Candidatures soumises via le formulaire : recherche, filtres par
// département / statut d'entretien, fiche détaillée, export CSV et
// suppression en masse (Ctrl+0 affiche / masque le mode sélection).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icons } from '@/components/icons/Icons';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import {
  DEPARTMENT_KEYS,
  DEPARTMENT_LABELS,
  formatDayLong,
  getDayParts,
  normalizeDepartment,
  type DepartmentKey,
} from '@/lib/interview';
import { ConfirmDialog } from './dialogs';
import ImportCandidaturesDialog from './ImportCandidaturesDialog';
import Modal from './Modal';
import {
  DeptBadge,
  adminRequest,
  fold,
  emailKey,
  formatDateTime,
  fullName,
  type AdminSlot,
  type Candidature,
  type DialogRequest,
} from './shared';
import styles from './admin.module.css';
import panel from './CandidaturesPanel.module.css';

type Props = {
  candidatures: Candidature[];
  bookingByEmail: Map<string, AdminSlot>;
  onRequest: (request: DialogRequest) => void;
  /** Jeton Firebase de l'administrateur (par défaut : celui du contexte d'authentification). */
  getIdToken?: () => Promise<string | null>;
  /** Appelé après un import ou une suppression : le tableau de bord recharge ses données. */
  onImported?: () => void;
};

type DeleteResult = {
  ok?: boolean;
  deleted?: number;
  releasedSlots?: number;
  removedDecisions?: number;
};

type InterviewFilter = 'all' | 'booked' | 'none';

function shortSlot(slot: AdminSlot): string {
  const p = getDayParts(slot.date);
  return `${p.weekdayShort} ${p.dayNumber} ${p.monthShort} · ${slot.time}`;
}

/**
 * Départements classés par ordre de préférence, tels que soumis par le
 * candidat (« 1. IT, 2. Marketing… »). Seul le premier compte pour
 * l'affectation aux créneaux d'entretien — les suivants sont indicatifs
 * pour l'équipe RH uniquement.
 */
function formatDepartementsOrdre(departements: string[]): string {
  if (departements.length === 0) return '—';
  return departements
    .map((raw, i) => {
      const key = normalizeDepartment(raw);
      return `${i + 1}. ${key ? DEPARTMENT_LABELS[key] : raw}`;
    })
    .join(' · ');
}

/** Valeur affichée quand une donnée n'existe pas (import du registre : voir lib/candidature-import.ts). */
const MISSING = '-';

/** « oui » / « non » du formulaire ; tout le reste (import du registre) = tiret. */
function formatEngagement(value: string): string {
  if (value === 'oui') return 'Oui';
  if (value === 'non') return 'Non';
  return MISSING;
}

/* ------------------------------ CSV ------------------------------ */

function csvCell(value: string): string {
  let text = value ?? '';
  // Neutralise l'injection de formules à l'ouverture dans Excel
  // (sauf le simple tiret « - » : c'est la valeur des données absentes).
  if (text !== MISSING && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function exportCsv(rows: Candidature[], bookingByEmail: Map<string, AdminSlot>) {
  const header = [
    'Nom et prénom', 'E-mail', 'Téléphone', 'Filière / Spécialité', "Niveau d'études",
    'Département (entretien)', 'Départements souhaités (ordre)',
    'Comment connu IRIS', 'Niveau français', 'Niveau anglais', 'Disponibilité formations',
    'Autre engagement', 'Organisation du temps', 'Motivation', 'Domaine à développer',
    'Remarques', 'Soumise le', 'Entretien',
  ];
  const lines = rows.map((c) => {
    const slot = bookingByEmail.get(emailKey(c.email));
    return [
      c.nomPrenom, c.email, c.telephone, c.filiere, c.niveauEtudes,
      c.department ? DEPARTMENT_LABELS[c.department] : c.departement,
      formatDepartementsOrdre(c.departements),
      c.sourceConnaissance, c.niveauFrancais, c.niveauAnglais, c.participationFormations,
      formatEngagement(c.autreEngagement), c.organisationTemps,
      c.motivation, c.domaine, c.remarques, formatDateTime(c.createdAt),
      slot ? `${formatDayLong(slot.date)} ${slot.time}` : '',
    ]
      .map(csvCell)
      .join(';');
  });

  const csv = `\ufeff${[header.map(csvCell).join(';'), ...lines].join('\r\n')}`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `candidatures-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/* ---------------------------- Composant ---------------------------- */

export default function CandidaturesPanel({
  candidatures,
  bookingByEmail,
  onRequest,
  getIdToken,
  onImported,
}: Props) {
  const auth = useAuth();
  const { showToast } = useToast();
  const [query, setQuery] = useState('');
  const [department, setDepartment] = useState<'all' | DepartmentKey>('all');
  const [interview, setInterview] = useState<InterviewFilter>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  // Mode suppression (Ctrl+0) : cases à cocher + barre d'actions.
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const selectModeRef = useRef(false);

  const filtered = useMemo(() => {
    const q = fold(query.trim());
    return candidatures.filter((c) => {
      if (department !== 'all' && c.department !== department) return false;
      const booked = bookingByEmail.has(emailKey(c.email));
      if (interview === 'booked' && !booked) return false;
      if (interview === 'none' && booked) return false;
      if (!q) return true;
      return fold(`${c.nomPrenom} ${c.email} ${c.telephone} ${c.filiere} ${c.niveauEtudes}`).includes(q);
    });
  }, [candidatures, bookingByEmail, query, department, interview]);

  // Seules les candidatures VISIBLES (après filtres) et cochées sont supprimées :
  // une case cochée puis masquée par un filtre n'est jamais supprimée à l'insu de l'admin.
  const selectedRows = useMemo(() => filtered.filter((c) => selected.has(c.id)), [filtered, selected]);
  const allSelected = filtered.length > 0 && selectedRows.length === filtered.length;

  // Le raccourci clavier est ignoré tant qu'un dialogue est ouvert.
  const blocked = openId !== null || importOpen || confirmOpen;

  const toggleSelectMode = useCallback(() => {
    const next = !selectModeRef.current;
    selectModeRef.current = next;
    setSelectMode(next);
    if (!next) setSelected(new Set());
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.repeat || event.altKey) return; // Alt+Ctrl = AltGr (ex. « @ » sur AZERTY)
      if (!(event.ctrlKey || event.metaKey)) return;
      // `code` = touche physique : fonctionne aussi sur AZERTY, où le « 0 » est « à ».
      if (event.code !== 'Digit0' && event.code !== 'Numpad0' && event.key !== '0') return;
      event.preventDefault(); // évite la réinitialisation du zoom du navigateur
      if (blocked) return;
      toggleSelectMode();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggleSelectMode, blocked]);

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) filtered.forEach((c) => next.delete(c.id));
      else filtered.forEach((c) => next.add(c.id));
      return next;
    });
  }

  async function deleteSelected(): Promise<boolean> {
    const ids = selectedRows.map((c) => c.id);
    const res = await adminRequest<DeleteResult>(
      () => (getIdToken ?? auth.getIdToken)(),
      '/api/admin/candidatures',
      { method: 'DELETE', body: { ids } },
    );

    if (!res.ok || !res.data?.ok) {
      showToast(res.data?.message ?? 'Suppression impossible.', 'error');
      onImported?.(); // l'état a peut-être changé : on recharge
      return false;
    }

    const count = res.data.deleted ?? 0;
    const released = res.data.releasedSlots ?? 0;
    showToast(
      `${count} candidature${count > 1 ? 's' : ''} supprimée${count > 1 ? 's' : ''}` +
        (released ? ` · ${released} créneau${released > 1 ? 'x' : ''} libéré${released > 1 ? 's' : ''}` : '') +
        '.',
      'success',
    );
    setSelected(new Set());
    setConfirmOpen(false);
    onImported?.();
    return true;
  }

  const opened = candidatures.find((c) => c.id === openId) ?? null;
  const openedSlot = opened ? (bookingByEmail.get(emailKey(opened.email)) ?? null) : null;

  function requestFromDetail(request: DialogRequest) {
    setOpenId(null);
    onRequest(request);
  }

  return (
    <div className={styles.panel}>
      <div className={styles.toolbar}>
        <label className={styles.search}>
          <Icons.Search size={18} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un nom, e-mail, téléphone, filière…"
            aria-label="Rechercher une candidature"
          />
        </label>

        <select
          className={styles.select}
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
          className={styles.select}
          value={interview}
          onChange={(e) => setInterview(e.target.value as InterviewFilter)}
          aria-label="Filtrer par entretien"
        >
          <option value="all">Tous les statuts</option>
          <option value="booked">Entretien réservé</option>
          <option value="none">Sans entretien</option>
        </select>

        <button
          type="button"
          className={`btn btn-outline ${styles.compact}`}
          onClick={() => exportCsv(filtered, bookingByEmail)}
          disabled={filtered.length === 0}
        >
          <Icons.FileText size={16} />
          Exporter CSV
        </button>

        <button
          type="button"
          className={`btn btn-primary ${styles.compact}`}
          onClick={() => setImportOpen(true)}
        >
          <Icons.Layers size={16} />
          Importer un fichier Excel
        </button>
      </div>

      <p className={styles.resultCount} aria-live="polite">
        {filtered.length} candidature{filtered.length > 1 ? 's' : ''}
        {filtered.length !== candidatures.length ? ` sur ${candidatures.length}` : ''}
      </p>

      {selectMode && (
        <div className={panel.selectionBar} role="region" aria-label="Suppression de candidatures">
          <button
            type="button"
            className={`btn btn-outline ${styles.compact}`}
            onClick={toggleAll}
            disabled={filtered.length === 0}
          >
            <Icons.Check size={16} />
            {allSelected ? 'Tout désélectionner' : `Sélectionner tout (${filtered.length})`}
          </button>
          <span className={panel.selectionCount} aria-live="polite">
            {selectedRows.length} sélectionnée{selectedRows.length > 1 ? 's' : ''}
          </span>
          <button
            type="button"
            className={`btn ${styles.danger} ${styles.compact}`}
            onClick={() => setConfirmOpen(true)}
            disabled={selectedRows.length === 0}
          >
            <Icons.X size={16} />
            Supprimer{selectedRows.length > 0 ? ` (${selectedRows.length})` : ''}
          </button>
          <button
            type="button"
            className={`btn btn-outline ${styles.compact} ${panel.selectionExit}`}
            onClick={toggleSelectMode}
          >
            Terminer <kbd>Ctrl+0</kbd>
          </button>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className={styles.empty}>
          <Icons.Search size={28} />
          <p>{candidatures.length === 0 ? 'Aucune candidature pour le moment.' : 'Aucun résultat pour ces filtres.'}</p>
          {candidatures.length === 0 && (
            <button type="button" className={`btn btn-primary ${styles.compact}`} onClick={() => setImportOpen(true)}>
              <Icons.Layers size={16} />
              Importer un fichier Excel
            </button>
          )}
        </div>
      ) : (
        <div className={`${styles.tableWrap} ${panel.tableScroll}`} tabIndex={0} aria-label="Liste des candidatures">
          <table className={`${styles.table} ${panel.table}`}>
            <thead>
              <tr>
                {selectMode && (
                  <th scope="col" className={panel.checkCell}>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      aria-label="Tout sélectionner"
                    />
                  </th>
                )}
                <th scope="col">Candidat</th>
                <th scope="col">Département</th>
                <th scope="col">Niveau</th>
                <th scope="col">Téléphone</th>
                <th scope="col">Soumise le</th>
                <th scope="col">Entretien</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const slot = bookingByEmail.get(emailKey(c.email));
                const isSelected = selected.has(c.id);
                const open = () => (selectMode ? toggleOne(c.id) : setOpenId(c.id));
                return (
                  <tr
                    key={c.id}
                    className={`${styles.rowClickable} ${selectMode && isSelected ? panel.rowSelected : ''}`}
                    onClick={open}
                  >
                    {selectMode && (
                      <td className={panel.checkCell}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleOne(c.id)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Sélectionner ${fullName(c) || c.email}`}
                        />
                      </td>
                    )}
                    <td className={styles.cellFull}>
                      <button
                        type="button"
                        className={styles.rowLink}
                        onClick={(e) => {
                          e.stopPropagation();
                          open();
                        }}
                      >
                        {fullName(c) || '—'}
                      </button>
                      <span className={styles.cellSubtle}>{c.email}</span>
                    </td>
                    <td data-label="Département">
                      <DeptBadge department={c.department} fallback={c.departement} />
                    </td>
                    <td data-label="Niveau">{c.niveauEtudes || '—'}</td>
                    <td data-label="Téléphone">{c.telephone || '—'}</td>
                    <td data-label="Soumise le">{formatDateTime(c.createdAt)}</td>
                    <td data-label="Entretien">
                      {slot ? (
                        <span className={`${styles.status} ${styles.statusOk}`}>{shortSlot(slot)}</span>
                      ) : (
                        <span className={`${styles.status} ${styles.statusNone}`}>Aucun</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {importOpen && (
        <ImportCandidaturesDialog onClose={() => setImportOpen(false)} onImported={onImported} />
      )}

      {confirmOpen && selectedRows.length > 0 && (
        <ConfirmDialog
          title={`Supprimer ${selectedRows.length} candidature${selectedRows.length > 1 ? 's' : ''} ?`}
          confirmLabel={`Supprimer définitivement (${selectedRows.length})`}
          danger
          onClose={() => setConfirmOpen(false)}
          onConfirm={deleteSelected}
        >
          <p>
            {selectedRows.length > 1 ? 'Ces candidatures seront supprimées' : 'Cette candidature sera supprimée'}{' '}
            <strong>définitivement</strong> :
          </p>
          <ul className={panel.deleteList}>
            {selectedRows.slice(0, 5).map((c) => (
              <li key={c.id}>
                <strong>{fullName(c) || '—'}</strong> <span>{c.email}</span>
              </li>
            ))}
            {selectedRows.length > 5 && <li>… et {selectedRows.length - 5} autre{selectedRows.length - 5 > 1 ? 's' : ''}</li>}
          </ul>
          <p>
            Les entretiens déjà réservés seront annulés (créneaux libérés) et les décisions de délibération
            associées supprimées. Les candidats pourront redéposer une candidature.
          </p>
        </ConfirmDialog>
      )}

      {opened && (
        <Modal
          title={fullName(opened) || 'Candidature'}
          subtitle={opened.email}
          onClose={() => setOpenId(null)}
          wide
          footer={
            <>
              <a className={`btn btn-outline ${styles.compact}`} href={`mailto:${opened.email}`}>
                <Icons.Mail size={16} />
                Écrire au candidat
              </a>
              {openedSlot && (
                <button
                  type="button"
                  className={`btn btn-outline ${styles.compact}`}
                  onClick={() => requestFromDetail({ type: 'release', slotId: openedSlot.id })}
                >
                  Libérer le créneau
                </button>
              )}
              <button
                type="button"
                className={`btn btn-primary ${styles.compact}`}
                onClick={() => requestFromDetail({ type: 'move', email: opened.email })}
              >
                <Icons.Calendar size={16} />
                {openedSlot ? 'Changer le créneau' : 'Attribuer un créneau'}
              </button>
            </>
          }
        >
          <div className={styles.detailTop}>
            <DeptBadge department={opened.department} fallback={opened.departement} />
            <span className={styles.status} title="Ordre de préférence indiqué par le candidat">
              {formatDepartementsOrdre(opened.departements)}
            </span>
            {openedSlot ? (
              <span className={`${styles.status} ${styles.statusOk}`}>
                Entretien : {formatDayLong(openedSlot.date)} à {openedSlot.time}
              </span>
            ) : (
              <span className={`${styles.status} ${styles.statusNone}`}>Aucun entretien réservé</span>
            )}
          </div>

          <dl className={styles.detailGrid}>
            <div><dt>Téléphone</dt><dd>{opened.telephone || '—'}</dd></div>
            <div><dt>Filière / Spécialité</dt><dd>{opened.filiere || '—'}</dd></div>
            <div><dt>Niveau d&rsquo;études</dt><dd>{opened.niveauEtudes || '—'}</dd></div>
            <div><dt>Comment connu IRIS</dt><dd>{opened.sourceConnaissance || '—'}</dd></div>
            <div><dt>Niveau français</dt><dd>{opened.niveauFrancais || '—'}</dd></div>
            <div><dt>Niveau anglais</dt><dd>{opened.niveauAnglais || '—'}</dd></div>
            <div className={styles.detailFull}>
              <dt>Disponibilité formations</dt>
              <dd>{opened.participationFormations || '—'}</dd>
            </div>
            <div><dt>Autre engagement</dt><dd>{formatEngagement(opened.autreEngagement)}</dd></div>
            <div><dt>Soumise le</dt><dd>{formatDateTime(opened.createdAt)}</dd></div>
            <div><dt>Dernière mise à jour</dt><dd>{formatDateTime(opened.updatedAt)}</dd></div>
          </dl>

          {opened.autreEngagement === 'oui' && (
            <div className={styles.textBlock}>
              <h3>Organisation du temps</h3>
              <p>{opened.organisationTemps || '—'}</p>
            </div>
          )}
          <div className={styles.textBlock}>
            <h3>Motivation</h3>
            <p>{opened.motivation || '—'}</p>
          </div>
          <div className={styles.textBlock}>
            <h3>Domaine à développer</h3>
            <p>{opened.domaine || '—'}</p>
          </div>
          {opened.remarques && opened.remarques !== MISSING && (
            <div className={styles.textBlock}>
              <h3>Remarques</h3>
              <p>{opened.remarques}</p>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}