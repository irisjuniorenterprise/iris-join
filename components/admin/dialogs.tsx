'use client';
// components/admin/dialogs.tsx
//
// Dialogues de l'espace administration :
//  - MoveSlotDialog      : attribuer / changer le créneau d'un candidat ;
//  - SlotFormDialog      : modifier date / heure / département / mode d'un créneau ;
//  - GenerateSlotsDialog : ajouter des créneaux (un seul ou en série) ;
//  - ConfirmDialog       : confirmation (suppression, annulation d'entretien).
//
// Aucun de ces dialogues n'envoie d'e-mail : le seul e-mail lié à
// l'entretien est le rappel automatique 24h avant (voir lib/email.ts et
// app/api/cron/reminders/route.ts), donc il n'y a plus de case
// « prévenir par e-mail » nulle part ici.
import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Icons } from '@/components/icons/Icons';
import {
  DEPARTMENT_KEYS,
  DEPARTMENT_LABELS,
  formatDayLong,
  getDayParts,
  INTERVIEW_MODES,
  INTERVIEW_MODE_LABELS,
  type DepartmentKey,
  type InterviewMode,
} from '@/lib/interview';
import Modal from './Modal';
import type { AdminSlot } from './shared';
import styles from './admin.module.css';

/* ------------------------------------------------------------------ */
/* Case à cocher générique                                              */
/* ------------------------------------------------------------------ */

function CheckboxRow({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <label className={styles.checkRow}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* Sélecteur de mode (présentiel / en ligne)                            */
/* ------------------------------------------------------------------ */

function ModeSelect({
  value,
  onChange,
  disabled,
}: {
  value: InterviewMode;
  onChange: (value: InterviewMode) => void;
  disabled?: boolean;
}) {
  return (
    <label className={styles.formField}>
      <span>Mode</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as InterviewMode)}
        disabled={disabled}
      >
        {INTERVIEW_MODES.map((mode) => (
          <option key={mode} value={mode}>
            {INTERVIEW_MODE_LABELS[mode]}
          </option>
        ))}
      </select>
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* Attribuer / changer le créneau d'un candidat                         */
/* ------------------------------------------------------------------ */

type MoveSlotDialogProps = {
  name: string;
  email: string;
  department: DepartmentKey | null;
  currentSlot: AdminSlot | null;
  slots: AdminSlot[];
  onClose: () => void;
  onConfirm: (slotId: string) => Promise<boolean>;
};

export function MoveSlotDialog({
  name,
  email,
  department,
  currentSlot,
  slots,
  onClose,
  onConfirm,
}: MoveSlotDialogProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Seuls les créneaux LIBRES du département du candidat sont proposés.
  const groups = useMemo(() => {
    const map = new Map<string, AdminSlot[]>();
    for (const slot of slots) {
      if (slot.department !== department || slot.booked) continue;
      map.set(slot.date, [...(map.get(slot.date) ?? []), slot]);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [slots, department]);

  const selected = slots.find((s) => s.id === selectedId) ?? null;

  async function submit() {
    if (!selectedId) return;
    setBusy(true);
    try {
      await onConfirm(selectedId);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={currentSlot ? 'Changer le créneau' : 'Attribuer un créneau'}
      subtitle={`${name} · ${email}`}
      onClose={onClose}
      busy={busy}
      wide
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>
            Annuler
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={submit}
            disabled={!selectedId || busy}
          >
            {busy ? 'Enregistrement…' : currentSlot ? 'Confirmer le changement' : 'Attribuer ce créneau'}
          </button>
        </>
      }
    >
      {currentSlot && (
        <div className={styles.infoBox}>
          <Icons.Calendar size={18} />
          <span>
            Créneau actuel : <strong>{formatDayLong(currentSlot.date)} à {currentSlot.time}</strong>
            {' '}— il sera libéré automatiquement.
          </span>
        </div>
      )}

      {!department ? (
        <p className={styles.mutedText}>
          Le département de cette candidature est invalide : impossible de proposer des créneaux.
        </p>
      ) : groups.length === 0 ? (
        <p className={styles.mutedText}>
          Aucun créneau libre pour le département {DEPARTMENT_LABELS[department]}. Ajoutez d&rsquo;abord
          des créneaux depuis l&rsquo;onglet « Créneaux ».
        </p>
      ) : (
        <>
          <p className={styles.fieldHint}>
            Créneaux libres du département <strong>{DEPARTMENT_LABELS[department]}</strong> :
          </p>
          <div className={styles.dayGroups}>
            {groups.map(([date, list]) => (
              <div key={date} className={styles.dayGroup}>
                <h3 className={styles.dayGroupTitle}>{formatDayLong(date)}</h3>
                <div className={styles.chips}>
                  {list.map((slot) => (
                    <button
                      key={slot.id}
                      type="button"
                      className={styles.chip}
                      aria-pressed={selectedId === slot.id}
                      onClick={() => setSelectedId(slot.id)}
                      disabled={busy}
                    >
                      {slot.time}
                      <span className={styles.chipMeta}>{INTERVIEW_MODE_LABELS[slot.mode]}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {selected && (
            <div className={styles.selectionBox} role="status">
              Nouveau créneau : <strong>{formatDayLong(selected.date)} à {selected.time}</strong>
              {' '}({INTERVIEW_MODE_LABELS[selected.mode]})
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Modifier un créneau                                                  */
/* ------------------------------------------------------------------ */

type SlotFormDialogProps = {
  slot: AdminSlot;
  /** Nom du candidat si le créneau est réservé. */
  bookedName?: string;
  onClose: () => void;
  onSubmit: (patch: {
    date?: string;
    time?: string;
    department?: DepartmentKey;
    mode?: InterviewMode;
  }) => Promise<boolean>;
};

export function SlotFormDialog({ slot, bookedName, onClose, onSubmit }: SlotFormDialogProps) {
  const [date, setDate] = useState(slot.date);
  const [time, setTime] = useState(slot.time);
  const [department, setDepartment] = useState<DepartmentKey>(slot.department);
  const [mode, setMode] = useState<InterviewMode>(slot.mode);
  const [busy, setBusy] = useState(false);

  const changed =
    date !== slot.date || time !== slot.time || department !== slot.department || mode !== slot.mode;
  const valid = Boolean(date) && /^([01]\d|2[0-3]):[0-5]\d$/.test(time);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!changed || !valid) return;
    setBusy(true);
    try {
      await onSubmit({
        ...(date !== slot.date ? { date } : {}),
        ...(time !== slot.time ? { time } : {}),
        ...(department !== slot.department ? { department } : {}),
        ...(mode !== slot.mode ? { mode } : {}),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Modifier le créneau"
      subtitle={`${formatDayLong(slot.date)} · ${slot.time} · ${DEPARTMENT_LABELS[slot.department]}`}
      onClose={onClose}
      busy={busy}
    >
      <form onSubmit={submit} className={styles.form} id="slot-form">
        {slot.booked && (
          <div className={styles.infoBox}>
            <Icons.Info size={18} />
            <span>
              Ce créneau est réservé{bookedName ? <> par <strong>{bookedName}</strong></> : null}.
              Changer le jour ou l&rsquo;heure déplace son entretien (le rappel automatique suivra le
              nouvel horaire) ; le département ne peut pas être modifié (utilisez « Changer le créneau »
              pour le candidat).
            </span>
          </div>
        )}

        <div className={styles.formRow}>
          <label className={styles.formField}>
            <span>Jour</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
          <label className={styles.formField}>
            <span>Heure</span>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
          </label>
        </div>

        <div className={styles.formRow}>
          <label className={styles.formField}>
            <span>Département</span>
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value as DepartmentKey)}
              disabled={slot.booked}
            >
              {DEPARTMENT_KEYS.map((key) => (
                <option key={key} value={key}>
                  {DEPARTMENT_LABELS[key]}
                </option>
              ))}
            </select>
          </label>
          <ModeSelect value={mode} onChange={setMode} />
        </div>

        <div className={styles.formActions}>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>
            Annuler
          </button>
          <button type="submit" className="btn btn-primary" disabled={!changed || !valid || busy}>
            {busy ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Ajouter des créneaux                                                 */
/* ------------------------------------------------------------------ */

const STANDARD_HOURS = ['09:00', '09:30', '10:30', '11:00', '14:00', '14:30', '15:30', '16:00'];
const MAX_DAYS = 31;

function expandDates(from: string, to: string, skipWeekends: boolean): string[] {
  if (!from) return [];
  const end = to && to > from ? to : from;
  const single = end === from;
  const out: string[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(last.getTime())) return [];

  while (cursor <= last && out.length <= MAX_DAYS) {
    const dow = cursor.getUTCDay();
    const weekend = dow === 0 || dow === 6;
    if (single || !skipWeekends || !weekend) out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

type GenerateSlotsDialogProps = {
  initial?: { date?: string; time?: string; department?: DepartmentKey };
  onClose: () => void;
  onSubmit: (payload: {
    dates: string[];
    times: string[];
    departments: DepartmentKey[];
    mode: InterviewMode;
  }) => Promise<boolean>;
};

export function GenerateSlotsDialog({ initial, onClose, onSubmit }: GenerateSlotsDialogProps) {
  const [from, setFrom] = useState(initial?.date ?? '');
  const [to, setTo] = useState('');
  const [skipWeekends, setSkipWeekends] = useState(true);
  const [times, setTimes] = useState<string[]>(initial?.time ? [initial.time] : []);
  const [timeInput, setTimeInput] = useState('');
  const [departments, setDepartments] = useState<DepartmentKey[]>(
    initial?.department ? [initial.department] : [...DEPARTMENT_KEYS],
  );
  const [mode, setMode] = useState<InterviewMode>('presentiel');
  const [busy, setBusy] = useState(false);

  const dates = useMemo(() => expandDates(from, to, skipWeekends), [from, to, skipWeekends]);
  const tooManyDays = dates.length > MAX_DAYS;
  const total = dates.length * times.length * departments.length;
  const valid = dates.length > 0 && !tooManyDays && times.length > 0 && departments.length > 0 && total <= 500;

  function addTime(value: string) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return;
    setTimes((prev) => (prev.includes(value) ? prev : [...prev, value].sort()));
    setTimeInput('');
  }

  function toggleDepartment(key: DepartmentKey) {
    setDepartments((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    try {
      await onSubmit({ dates, times, departments, mode });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Ajouter des créneaux"
      subtitle="Un créneau est créé pour chaque jour × heure × département, dans le mode choisi ci-dessous. Les doublons sont ignorés."
      onClose={onClose}
      busy={busy}
      wide
    >
      <form onSubmit={submit} className={styles.form}>
        <div className={styles.formRow}>
          <label className={styles.formField}>
            <span>Du</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} required />
          </label>
          <label className={styles.formField}>
            <span>Au (optionnel)</span>
            <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>

        {to && to > from && (
          <CheckboxRow
            checked={skipWeekends}
            onChange={setSkipWeekends}
            label="Ignorer les week-ends"
          />
        )}

        <div className={styles.formField}>
          <span>Heures</span>
          <div className={styles.timeAdder}>
            <input
              type="time"
              value={timeInput}
              onChange={(e) => setTimeInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addTime(timeInput);
                }
              }}
              aria-label="Ajouter une heure"
            />
            <button type="button" className="btn btn-outline" onClick={() => addTime(timeInput)}>
              Ajouter
            </button>
            <button
              type="button"
              className={styles.linkBtn}
              onClick={() => setTimes([...STANDARD_HOURS])}
            >
              Utiliser la grille standard
            </button>
          </div>
          {times.length > 0 && (
            <div className={styles.chips}>
              {times.map((t) => (
                <span key={t} className={styles.tag}>
                  {t}
                  <button
                    type="button"
                    className={styles.tagRemove}
                    onClick={() => setTimes((prev) => prev.filter((x) => x !== t))}
                    aria-label={`Retirer ${t}`}
                  >
                    <Icons.X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <fieldset className={styles.fieldsetPlain}>
          <legend>Départements</legend>
          <div className={styles.checkGrid}>
            {DEPARTMENT_KEYS.map((key) => (
              <label key={key} className={styles.checkRow}>
                <input
                  type="checkbox"
                  checked={departments.includes(key)}
                  onChange={() => toggleDepartment(key)}
                />
                <span>{DEPARTMENT_LABELS[key]}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className={styles.fieldsetPlain}>
          <legend>Mode de l&rsquo;entretien</legend>
          <div className={styles.checkGrid}>
            {INTERVIEW_MODES.map((key) => (
              <label key={key} className={styles.checkRow}>
                <input
                  type="radio"
                  name="interview-mode"
                  checked={mode === key}
                  onChange={() => setMode(key)}
                />
                <span>{INTERVIEW_MODE_LABELS[key]}</span>
              </label>
            ))}
          </div>
          <p className={styles.fieldHint}>
            Tous les créneaux créés ici auront ce mode ; modifiez-le au cas par cas ensuite si besoin.
          </p>
        </fieldset>

        <div className={styles.selectionBox} role="status">
          {tooManyDays ? (
            <>Période trop longue : {MAX_DAYS} jours maximum à la fois.</>
          ) : valid ? (
            <>
              <strong>{total}</strong> créneau{total > 1 ? 'x' : ''} · {dates.length} jour
              {dates.length > 1 ? 's' : ''}
              {dates.length === 1 ? <> ({getDayParts(dates[0]).long})</> : null} ·{' '}
              {INTERVIEW_MODE_LABELS[mode]}
            </>
          ) : (
            <>Choisissez au moins un jour, une heure et un département.</>
          )}
        </div>

        <div className={styles.formActions}>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>
            Annuler
          </button>
          <button type="submit" className="btn btn-primary" disabled={!valid || busy}>
            {busy ? 'Création…' : 'Créer les créneaux'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Confirmation                                                         */
/* ------------------------------------------------------------------ */

type ConfirmDialogProps = {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  /**
   * Si fourni, affiche une case à cocher avec ce libellé (ex. l'envoi de
   * l'e-mail de résultat de délibération — sans rapport avec l'entretien).
   */
  notifyLabel?: string;
  onClose: () => void;
  onConfirm: (notify: boolean) => Promise<boolean>;
};

export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  danger,
  notifyLabel,
  onClose,
  onConfirm,
}: ConfirmDialogProps) {
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await onConfirm(notify);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={title}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>
            Annuler
          </button>
          <button
            type="button"
            className={`btn ${danger ? styles.danger : 'btn-primary'}`}
            onClick={submit}
            disabled={busy}
          >
            {busy ? 'Traitement…' : confirmLabel}
          </button>
        </>
      }
    >
      <div className={styles.confirmText}>{children}</div>
    </Modal>
  );
}
