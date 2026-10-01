'use client';
// components/admin/CandidaturesPanel.tsx
//
// Candidatures soumises via le formulaire : recherche, filtres par
// département / statut d'entretien, fiche détaillée et export CSV.
import { useMemo, useState } from 'react';
import { Icons } from '@/components/icons/Icons';
import {
  DEPARTMENT_KEYS,
  DEPARTMENT_LABELS,
  formatDayLong,
  getDayParts,
  normalizeDepartment,
  type DepartmentKey,
} from '@/lib/interview';
import Modal from './Modal';
import ImportDialog from './ImportDialog';
import {
  DeptBadge,
  fold,
  emailKey,
  formatDateTime,
  fullName,
  type AdminSlot,
  type Candidature,
  type DialogRequest,
} from './shared';
import styles from './admin.module.css';

type Props = {
  candidatures: Candidature[];
  bookingByEmail: Map<string, AdminSlot>;
  onRequest: (request: DialogRequest) => void;
  getIdToken: () => Promise<string | null>;
  onImported: () => void;
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

/* ------------------------------ CSV ------------------------------ */

function csvCell(value: string): string {
  let text = value ?? '';
  // Neutralise l'injection de formules à l'ouverture dans Excel.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
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
      c.autreEngagement === 'oui' ? 'Oui' : 'Non', c.organisationTemps,
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
  const [query, setQuery] = useState('');
  const [department, setDepartment] = useState<'all' | DepartmentKey>('all');
  const [interview, setInterview] = useState<InterviewFilter>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

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
          onClick={() => setImportOpen(true)}
        >
          <Icons.FileText size={16} />
          Importer Excel
        </button>

        <button
          type="button"
          className={`btn btn-outline ${styles.compact}`}
          onClick={() => exportCsv(filtered, bookingByEmail)}
          disabled={filtered.length === 0}
        >
          <Icons.FileText size={16} />
          Exporter CSV
        </button>
      </div>

      <p className={styles.resultCount} aria-live="polite">
        {filtered.length} candidature{filtered.length > 1 ? 's' : ''}
        {filtered.length !== candidatures.length ? ` sur ${candidatures.length}` : ''}
      </p>

      {filtered.length === 0 ? (
        <div className={styles.empty}>
          <Icons.Search size={28} />
          <p>{candidatures.length === 0 ? 'Aucune candidature pour le moment.' : 'Aucun résultat pour ces filtres.'}</p>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
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
                return (
                  <tr key={c.id} className={styles.rowClickable} onClick={() => setOpenId(c.id)}>
                    <td className={styles.cellFull}>
                      <button
                        type="button"
                        className={styles.rowLink}
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenId(c.id);
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
        <ImportDialog
          getIdToken={getIdToken}
          onClose={() => setImportOpen(false)}
          onImported={onImported}
        />
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
            <div><dt>Autre engagement</dt><dd>{opened.autreEngagement === 'oui' ? 'Oui' : 'Non'}</dd></div>
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
          {opened.remarques && (
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