'use client';
// components/admin/InterviewsPanel.tsx
//
// Entretiens réservés, regroupés par jour. C'est ici que l'admin traite
// les demandes de changement de créneau reçues par e-mail : « Changer »
// propose les créneaux libres du département du candidat.
import { useMemo, useState } from 'react';
import { Icons } from '@/components/icons/Icons';
import {
  DEPARTMENT_KEYS,
  DEPARTMENT_LABELS,
  formatDayLong,
  INTERVIEW_MODE_LABELS,
  type DepartmentKey,
} from '@/lib/interview';
import {
  DeptBadge,
  emailKey,
  fold,
  fullName,
  type AdminSlot,
  type Candidature,
  type DialogRequest,
} from './shared';
import styles from './admin.module.css';

type Props = {
  slots: AdminSlot[];
  candidatureByEmail: Map<string, Candidature>;
  onRequest: (request: DialogRequest) => void;
};

export default function InterviewsPanel({ slots, candidatureByEmail, onRequest }: Props) {
  const [query, setQuery] = useState('');
  const [department, setDepartment] = useState<'all' | DepartmentKey>('all');

  const booked = useMemo(
    () => slots.filter((s) => s.booked && s.bookedByEmail),
    [slots],
  );

  const groups = useMemo(() => {
    const q = fold(query.trim());
    const map = new Map<string, { slot: AdminSlot; candidature: Candidature | null }[]>();

    for (const slot of booked) {
      if (department !== 'all' && slot.department !== department) continue;
      const candidature = candidatureByEmail.get(emailKey(slot.bookedByEmail ?? '')) ?? null;
      if (q) {
        const haystack = fold(
          `${candidature ? fullName(candidature) : ''} ${slot.bookedByEmail ?? ''} ${candidature?.telephone ?? ''}`,
        );
        if (!haystack.includes(q)) continue;
      }
      map.set(slot.date, [...(map.get(slot.date) ?? []), { slot, candidature }]);
    }

    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, rows]) => ({
        date,
        rows: rows.sort(
          (a, b) => a.slot.time.localeCompare(b.slot.time) || a.slot.department.localeCompare(b.slot.department),
        ),
      }));
  }, [booked, candidatureByEmail, query, department]);

  const shown = groups.reduce((n, g) => n + g.rows.length, 0);

  return (
    <div className={styles.panel}>
      <div className={styles.toolbar}>
        <label className={styles.search}>
          <Icons.Search size={18} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un candidat…"
            aria-label="Rechercher un entretien"
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
      </div>

      <p className={styles.resultCount} aria-live="polite">
        {shown} entretien{shown > 1 ? 's' : ''} réservé{shown > 1 ? 's' : ''}
        {shown !== booked.length ? ` sur ${booked.length}` : ''}
      </p>

      {groups.length === 0 ? (
        <div className={styles.empty}>
          <Icons.Calendar size={28} />
          <p>{booked.length === 0 ? 'Aucun entretien réservé pour le moment.' : 'Aucun résultat pour ces filtres.'}</p>
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.date} className={styles.dayBlock}>
            <h3 className={styles.dayBlockTitle}>
              {formatDayLong(group.date)}
              <span>{group.rows.length}</span>
            </h3>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Heure</th>
                    <th scope="col">Mode</th>
                    <th scope="col">Département</th>
                    <th scope="col">Candidat</th>
                    <th scope="col">Contact</th>
                    <th scope="col" className={styles.actionsCol}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {group.rows.map(({ slot, candidature }) => (
                    <tr key={slot.id}>
                      <td className={styles.timeCell} data-label="Heure">{slot.time}</td>
                      <td data-label="Mode">{INTERVIEW_MODE_LABELS[slot.mode]}</td>
                      <td data-label="Département">
                        <DeptBadge department={slot.department} />
                      </td>
                      <td className={styles.cellFull}>
                        <strong>{candidature ? fullName(candidature) : 'Candidature introuvable'}</strong>
                        <span className={styles.cellSubtle}>{slot.bookedByEmail}</span>
                      </td>
                      <td data-label="Contact">
                        {candidature?.telephone || '—'}
                        <a className={styles.mailLink} href={`mailto:${slot.bookedByEmail}`}>
                          <Icons.Mail size={14} /> Écrire
                        </a>
                      </td>
                      <td className={styles.actionsCol}>
                        <div className={styles.rowActions}>
                          <button
                            type="button"
                            className={`btn btn-outline ${styles.compact}`}
                            onClick={() => onRequest({ type: 'move', email: slot.bookedByEmail ?? '' })}
                            disabled={!candidature}
                            title={candidature ? undefined : 'Aucune candidature associée à cet e-mail'}
                          >
                            Changer
                          </button>
                          <button
                            type="button"
                            className={`btn btn-outline ${styles.compact}`}
                            onClick={() => onRequest({ type: 'release', slotId: slot.id })}
                          >
                            Libérer
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}
    </div>
  );
}
