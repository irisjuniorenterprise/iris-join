'use client';
// components/admin/SlotsPanel.tsx
//
// Planning des créneaux : pour un jour donné, une ligne par heure et une
// colonne par département — les créneaux parallèles apparaissent côte à
// côte. Chaque cellule permet de modifier ou supprimer le créneau, ou d'en
// ajouter un dans une case vide.
//
// Sélection multiple (suppression rapide) : Ctrl+2 (Cmd+2 sur Mac) active ou
// désactive le mode sélection ; un clic sur un créneau libre l'ajoute ou le
// retire de la sélection. Ctrl/Cmd+clic fonctionne aussi hors du mode. Les
// créneaux réservés ne sont pas sélectionnables (il faut d'abord les libérer).
import { useEffect, useMemo, useState, type CSSProperties, type MouseEvent } from 'react';
import { Icons } from '@/components/icons/Icons';
import {
  DEPARTMENT_KEYS,
  DEPARTMENT_LABELS,
  getDayParts,
  INTERVIEW_MODE_LABELS,
  type DepartmentKey,
} from '@/lib/interview';
import {
  deptStyle,
  emailKey,
  fullName,
  type AdminSlot,
  type Candidature,
  type DialogRequest,
} from './shared';
import styles from './admin.module.css';
import selStyles from './SlotsPanel.module.css';

type Props = {
  slots: AdminSlot[];
  candidatureByEmail: Map<string, Candidature>;
  onRequest: (request: DialogRequest) => void;
};

export default function SlotsPanel({ slots, candidatureByEmail, onRequest }: Props) {
  const [activeDay, setActiveDay] = useState<string | null>(null);
  const [department, setDepartment] = useState<'all' | DepartmentKey>('all');
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Ne garde que les créneaux qui existent encore et sont toujours libres
  // (après une suppression, une réservation ou une actualisation).
  const selectedIds = useMemo(() => {
    const free = new Set(slots.filter((s) => !s.booked).map((s) => s.id));
    return Array.from(selected).filter((id) => free.has(id));
  }, [selected, slots]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  function leaveSelection() {
    setSelectMode(false);
    setSelected(new Set());
  }

  function toggleSlot(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Raccourci Ctrl+2 (Cmd+2 sur Mac). On teste `code` (position physique de la
  // touche) pour que ça marche aussi sur un clavier AZERTY. Échap quitte le mode.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Une fenêtre (confirmation, formulaire…) est ouverte : on ne touche à rien.
      if (document.querySelector('[role="dialog"]')) return;

      if (e.key === 'Escape' && selectMode) {
        leaveSelection();
        return;
      }
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.repeat) return;
      if (e.code !== 'Digit2' && e.code !== 'Numpad2') return;
      e.preventDefault();
      if (selectMode) leaveSelection();
      else setSelectMode(true);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [selectMode]);

  const days = useMemo(() => {
    const map = new Map<string, { date: string; free: number; total: number }>();
    for (const slot of slots) {
      const entry = map.get(slot.date) ?? { date: slot.date, free: 0, total: 0 };
      entry.total += 1;
      if (!slot.booked) entry.free += 1;
      map.set(slot.date, entry);
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [slots]);

  const currentDay = days.some((d) => d.date === activeDay) ? activeDay : (days[0]?.date ?? null);
  const columns: DepartmentKey[] = department === 'all' ? [...DEPARTMENT_KEYS] : [department];

  const { times, cellByKey } = useMemo(() => {
    const map = new Map<string, AdminSlot>();
    const set = new Set<string>();
    for (const slot of slots) {
      if (slot.date !== currentDay) continue;
      if (department !== 'all' && slot.department !== department) continue;
      map.set(`${slot.time}|${slot.department}`, slot);
      set.add(slot.time);
    }
    return { times: Array.from(set).sort(), cellByKey: map };
  }, [slots, currentDay, department]);

  const columnStats = columns.map((key) => {
    const list = slots.filter((s) => s.date === currentDay && s.department === key);
    return { key, booked: list.filter((s) => s.booked).length, total: list.length };
  });

  const dayFreeIds = slots
    .filter((s) => s.date === currentDay && !s.booked && (department === 'all' || s.department === department))
    .map((s) => s.id);
  const allDayFreeSelected = dayFreeIds.length > 0 && dayFreeIds.every((id) => selectedSet.has(id));

  function toggleAllOfDay() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allDayFreeSelected) dayFreeIds.forEach((id) => next.delete(id));
      else dayFreeIds.forEach((id) => next.add(id));
      return next;
    });
  }

  function onCellClick(e: MouseEvent, slot: AdminSlot) {
    // Ne pas déclencher la sélection quand on clique sur un bouton d'action.
    if ((e.target as HTMLElement).closest('button')) return;
    if (slot.booked) return;
    if (selectMode || e.ctrlKey || e.metaKey) {
      e.preventDefault();
      if (!selectMode) setSelectMode(true);
      toggleSlot(slot.id);
    }
  }

  return (
    <div className={styles.panel}>
      <div className={styles.toolbar}>
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
        <span className={styles.toolbarSpacer} />
        {selectMode ? (
          <>
            <span className={selStyles.selCount} role="status" aria-live="polite">
              {selectedIds.length} sélectionné{selectedIds.length > 1 ? 's' : ''}
            </span>
            <button
              type="button"
              className={`btn btn-outline ${styles.compact}`}
              onClick={toggleAllOfDay}
              disabled={dayFreeIds.length === 0}
            >
              {allDayFreeSelected ? 'Désélectionner le jour' : 'Tout sélectionner (jour)'}
            </button>
            <button
              type="button"
              className={`btn btn-primary ${styles.compact} ${selStyles.deleteBtn}`}
              onClick={() => onRequest({ type: 'delete-slots', slotIds: selectedIds })}
              disabled={selectedIds.length === 0}
            >
              <Icons.X size={16} />
              Supprimer ({selectedIds.length})
            </button>
            <button type="button" className={`btn btn-outline ${styles.compact}`} onClick={leaveSelection}>
              Annuler
            </button>
          </>
        ) : (
          <button
            type="button"
            className={`btn btn-outline ${styles.compact}`}
            onClick={() => setSelectMode(true)}
            title="Raccourci clavier : Ctrl+2 (ou Ctrl+clic sur un créneau)"
          >
            <Icons.Check size={16} />
            Sélectionner (Ctrl+2)
          </button>
        )}
        <button
          type="button"
          className={`btn btn-primary ${styles.compact}`}
          onClick={() => onRequest({ type: 'create-slots', initial: { date: currentDay ?? undefined } })}
        >
          <Icons.Calendar size={16} />
          Ajouter des créneaux
        </button>
      </div>

      {days.length === 0 ? (
        <div className={styles.empty}>
          <Icons.Calendar size={28} />
          <p>Aucun créneau pour le moment. Ajoutez-en pour ouvrir les réservations.</p>
        </div>
      ) : (
        <>
          <div className={styles.dayTabs} role="tablist" aria-label="Choisir un jour">
            {days.map((day) => {
              const parts = getDayParts(day.date);
              return (
                <button
                  key={day.date}
                  type="button"
                  role="tab"
                  id={`admin-day-${day.date}`}
                  aria-selected={currentDay === day.date}
                  aria-controls="admin-day-panel"
                  className={styles.dayTab}
                  onClick={() => setActiveDay(day.date)}
                >
                  <strong>
                    {parts.weekdayShort} {parts.dayNumber} {parts.monthShort}
                  </strong>
                  <span>
                    {day.total - day.free}/{day.total} réservés
                  </span>
                </button>
              );
            })}
          </div>

          <div
            className={styles.grid}
            role="tabpanel"
            id="admin-day-panel"
            aria-labelledby={currentDay ? `admin-day-${currentDay}` : undefined}
          >
            <div className={styles.gridScroll}>
              <div
                className={styles.gridTable}
                style={{ '--cols': columns.length } as CSSProperties}
              >
                <div className={styles.gridCorner} />
                {columnStats.map((col) => (
                  <div key={col.key} className={styles.gridHead} style={deptStyle(col.key)}>
                    <strong>{DEPARTMENT_LABELS[col.key]}</strong>
                    <span>
                      {col.booked}/{col.total} réservés
                    </span>
                  </div>
                ))}

                {times.map((time) => (
                  <div key={time} className={styles.gridRow}>
                    <div className={styles.gridTime}>{time}</div>
                    {columns.map((key) => {
                      const slot = cellByKey.get(`${time}|${key}`);
                      if (!slot) {
                        return (
                          <div key={key} className={styles.cellEmpty}>
                            <span className={styles.cellDept} style={deptStyle(key)}>
                              {DEPARTMENT_LABELS[key]}
                            </span>
                            <button
                              type="button"
                              className={styles.cellAdd}
                              onClick={() =>
                                onRequest({
                                  type: 'create-slots',
                                  initial: { date: currentDay ?? undefined, time, department: key },
                                })
                              }
                              aria-label={`Ajouter un créneau ${time} ${DEPARTMENT_LABELS[key]}`}
                            >
                              + Ajouter
                            </button>
                          </div>
                        );
                      }

                      const candidature = slot.bookedByEmail
                        ? candidatureByEmail.get(emailKey(slot.bookedByEmail))
                        : undefined;
                      const label = `${slot.time} ${DEPARTMENT_LABELS[slot.department]}`;

                      return (
                        <div
                          key={key}
                          className={[
                            styles.cell,
                            slot.booked ? styles.cellBooked : styles.cellFree,
                            selectMode && !slot.booked ? selStyles.selectable : '',
                            selectMode && slot.booked ? selStyles.locked : '',
                            selectedSet.has(slot.id) ? selStyles.selected : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          style={deptStyle(slot.department)}
                          onClick={(e) => onCellClick(e, slot)}
                          aria-selected={selectMode && !slot.booked ? selectedSet.has(slot.id) : undefined}
                        >
                          {selectMode && !slot.booked && (
                            <span className={selStyles.check} aria-hidden="true">
                              {selectedSet.has(slot.id) && <Icons.Check size={12} />}
                            </span>
                          )}
                          <div className={styles.cellMain}>
                            <span className={styles.cellDept}>{DEPARTMENT_LABELS[slot.department]}</span>
                            <span className={styles.cellModeTag}>{INTERVIEW_MODE_LABELS[slot.mode]}</span>
                            <span className={styles.cellState}>
                              {slot.booked
                                ? candidature
                                  ? fullName(candidature)
                                  : (slot.bookedByEmail ?? 'Réservé')
                                : 'Libre'}
                            </span>
                            {slot.booked && (
                              <span className={styles.cellSubtle}>{slot.bookedByEmail}</span>
                            )}
                          </div>
                          <div className={styles.cellActions}>
                            <button
                              type="button"
                              className={styles.iconBtn}
                              onClick={() => onRequest({ type: 'edit-slot', slotId: slot.id })}
                              aria-label={`Modifier le créneau ${label}`}
                              title="Modifier"
                            >
                              <Icons.Edit size={14} />
                            </button>
                            <button
                              type="button"
                              className={styles.iconBtn}
                              onClick={() =>
                                onRequest(
                                  slot.booked
                                    ? { type: 'release', slotId: slot.id }
                                    : { type: 'delete-slot', slotId: slot.id },
                                )
                              }
                              aria-label={
                                slot.booked
                                  ? `Libérer le créneau ${label}`
                                  : `Supprimer le créneau ${label}`
                              }
                              title={slot.booked ? 'Libérer (annuler la réservation)' : 'Supprimer'}
                            >
                              <Icons.X size={14} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}