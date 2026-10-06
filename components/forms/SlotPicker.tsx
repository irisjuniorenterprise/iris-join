'use client';
// components/forms/SlotPicker.tsx
//
// Sélecteur de créneaux d'entretien. Le serveur (/api/creneaux) ne renvoie
// que les créneaux du département choisi par le candidat dans son
// formulaire de candidature : les créneaux des autres départements (qui
// se déroulent en parallèle) ne sont jamais envoyés au navigateur.
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { Icons } from '@/components/icons/Icons';
import ScrollDownButton, { type ScrollDownStep } from '@/components/ui/ScrollDownButton';
import InterviewCountdown from '@/components/forms/InterviewCountdown';
import {
  DEPARTMENT_LABELS,
  INTERVIEW_DURATION_MINUTES,
  INTERVIEW_MODE_LABELS,
  REMINDER_LEAD_HOURS,
  formatClockTunis,
  getDayParts,
  getSlotEndMs,
  type DepartmentKey,
  type InterviewMode,
} from '@/lib/interview';
import styles from './SlotPicker.module.css';

/** Mettre à false pour ne montrer que les créneaux encore libres. */
const SHOW_BOOKED_SLOTS = true;

type Slot = {
  id: string;
  date: string;
  time: string;
  department: DepartmentKey;
  mode: InterviewMode;
  booked: boolean;
};

type BookedSlot = {
  id: string;
  date: string;
  time: string;
  department: DepartmentKey;
  mode: InterviewMode;
};

type Status = 'idle' | 'loading' | 'ready' | 'no-candidature' | 'error';

type IconComponent = ComponentType<{ size?: number; className?: string }>;

const DEPARTMENT_ICONS: Record<DepartmentKey, IconComponent> = {
  it: Icons.Code,
  marketing: Icons.Megaphone,
  etudes: Icons.BarChart,
  'dev-co': Icons.Handshake,
};

type SlotPickerProps = {
  /** Email vérifié via AuthGate — le composant reste passif tant qu'il est vide. */
  verifiedEmail: string;
};

function pickDefaultDay(list: Slot[]): string | null {
  const visible = SHOW_BOOKED_SLOTS ? list : list.filter((s) => !s.booked);
  const firstFree = visible.find((s) => !s.booked);
  return (firstFree ?? visible[0])?.date ?? null;
}

function plural(count: number, one: string, many: string): string {
  return count > 1 ? many : one;
}

/** Icône du mode d'entretien : globe pour « En ligne », repère pour « Présentiel ». */
function modeIcon(mode: InterviewMode): IconComponent {
  return mode === 'en-ligne' ? Icons.Globe : Icons.MapPin;
}

/** « 10:30 – 11:00 » (heure de Tunis). Retombe sur l'heure de début si la date est invalide. */
function timeRange(date: string, time: string): string {
  const end = getSlotEndMs(date, time);
  if (Number.isNaN(end)) return time;
  return `${time} – ${formatClockTunis(end)}`;
}

/* ------------------------------------------------------------------ */
/* Petits blocs d'interface                                             */
/* ------------------------------------------------------------------ */

type NoticeProps = {
  icon: IconComponent;
  title: string;
  text: string;
  tone?: 'info' | 'danger';
  action?: ReactNode;
};

function Notice({ icon: Icon, title, text, tone = 'info', action }: NoticeProps) {
  return (
    <div className={styles.notice} role={tone === 'danger' ? 'alert' : undefined}>
      <span className={`${styles.noticeIcon} ${tone === 'danger' ? styles.noticeIconDanger : ''}`}>
        <Icon size={28} />
      </span>
      <h3 className={styles.noticeTitle}>{title}</h3>
      <p className={styles.noticeText}>{text}</p>
      {action && <div className={styles.noticeAction}>{action}</div>}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className={styles.root} aria-busy="true">
      <span className="sr-only" role="status">
        Chargement des créneaux…
      </span>
      <div className={`${styles.skeleton} ${styles.skeletonBanner}`} />
      <div className={styles.skeletonRow}>
        {[0, 1, 2].map((i) => (
          <div key={i} className={`${styles.skeleton} ${styles.skeletonDay}`} />
        ))}
      </div>
      <div className={styles.skeletonGrid}>
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className={`${styles.skeleton} ${styles.skeletonSlot}`} />
        ))}
      </div>
    </div>
  );
}

type StepHeaderProps = {
  id?: string;
  step: number;
  title: string;
  meta?: ReactNode;
};

/** En-tête d'étape : pastille numérotée, titre et information contextuelle à droite. */
function StepHeader({ id, step, title, meta }: StepHeaderProps) {
  return (
    <div className={styles.stepHeader}>
      <h3 className={styles.stepTitle} id={id}>
        <span className={styles.stepNum} aria-hidden="true">
          {step}
        </span>
        <span className={styles.stepTitleText}>
          <span className={styles.stepKicker}>Étape {step} sur 2</span>
          {title}
        </span>
      </h3>
      {meta && <p className={styles.stepMeta}>{meta}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Composant principal                                                  */
/* ------------------------------------------------------------------ */

export default function SlotPicker({ verifiedEmail }: SlotPickerProps) {
  const { getIdToken } = useAuth();
  const { showToast } = useToast();
  const [status, setStatus] = useState<Status>('idle');
  const [reloadKey, setReloadKey] = useState(0);
  const [department, setDepartment] = useState<DepartmentKey | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [activeDay, setActiveDay] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [bookedSlot, setBookedSlot] = useState<BookedSlot | null>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const summaryRef = useRef<HTMLDivElement | null>(null);
  const daysRef = useRef<HTMLElement | null>(null);
  const hoursRef = useRef<HTMLElement | null>(null);

  // Étapes guidées par la flèche flottante : d'abord le jour, puis l'heure.
  const hintSteps = useMemo<ScrollDownStep[]>(
    () => [
      { ref: daysRef, number: 1, label: 'Choisir un jour', ariaLabel: 'Aller au choix du jour, plus bas dans la page' },
      { ref: hoursRef, number: 2, label: 'Choisir une heure', ariaLabel: "Aller au choix de l'heure, plus bas dans la page" },
    ],
    [],
  );

  // Chargement initial : créneaux du département + réservation éventuelle.
  useEffect(() => {
    if (!verifiedEmail) {
      setStatus('idle');
      setSlots([]);
      setDepartment(null);
      setBookedSlot(null);
      setSelectedSlot(null);
      return;
    }

    let cancelled = false;
    setStatus('loading');

    (async () => {
      try {
        const idToken = await getIdToken();
        if (!idToken) throw new Error('no-token');
        const headers = { Authorization: `Bearer ${idToken}` };

        const [slotsRes, bookingRes] = await Promise.all([
          fetch('/api/creneaux', { headers, cache: 'no-store' }),
          fetch('/api/reservation', { headers, cache: 'no-store' }),
        ]);
        const [slotsData, bookingData] = await Promise.all([
          slotsRes.json().catch(() => null),
          bookingRes.json().catch(() => null),
        ]);
        if (cancelled) return;

        // Entretien déjà réservé : on affiche directement la confirmation.
        if (bookingData?.slot) {
          setBookedSlot(bookingData.slot);
          setStatus('ready');
          return;
        }

        if (slotsRes.status === 403 && slotsData?.code === 'no-candidature') {
          setStatus('no-candidature');
          return;
        }

        if (!slotsRes.ok || !Array.isArray(slotsData?.slots) || !slotsData.department) {
          console.error('[creneaux] échec du chargement', slotsRes.status, slotsData);
          setStatus('error');
          return;
        }

        setDepartment(slotsData.department);
        setSlots(slotsData.slots);
        setActiveDay(pickDefaultDay(slotsData.slots));
        setSelectedSlot(null);
        setStatus('ready');
      } catch (err) {
        if (cancelled) return;
        console.error('[creneaux] erreur réseau/inattendue', err);
        setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verifiedEmail, reloadKey]);

  const visibleSlots = useMemo(
    () => (SHOW_BOOKED_SLOTS ? slots : slots.filter((s) => !s.booked)),
    [slots],
  );

  const days = useMemo(() => {
    const map = new Map<string, { date: string; free: number; total: number }>();
    for (const slot of visibleSlots) {
      const entry = map.get(slot.date) ?? { date: slot.date, free: 0, total: 0 };
      entry.total += 1;
      if (!slot.booked) entry.free += 1;
      map.set(slot.date, entry);
    }
    return Array.from(map.values());
  }, [visibleSlots]);

  const currentDay = days.some((d) => d.date === activeDay) ? activeDay : (days[0]?.date ?? null);
  const currentDayParts = currentDay ? getDayParts(currentDay) : null;
  const daySlots = visibleSlots.filter((s) => s.date === currentDay);
  const periods = [
    { key: 'morning', label: 'Matin', items: daySlots.filter((s) => s.time < '12:00') },
    { key: 'afternoon', label: 'Après-midi', items: daySlots.filter((s) => s.time >= '12:00') },
  ].filter((p) => p.items.length > 0);

  const selected = slots.find((s) => s.id === selectedSlot) ?? null;

  // Amène le récapitulatif à l'écran quand un créneau est choisi (utile sur mobile).
  useEffect(() => {
    if (!selected || !summaryRef.current) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    summaryRef.current.scrollIntoView({
      behavior: reduceMotion ? 'auto' : 'smooth',
      block: 'nearest',
    });
  }, [selected]);

  function selectDay(day: string) {
    setActiveDay(day);
    setSelectedSlot(null);
  }

  function handleTabKeyDown(e: KeyboardEvent, index: number) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const nextIndex =
      e.key === 'ArrowRight' ? (index + 1) % days.length : (index - 1 + days.length) % days.length;
    const nextDay = days[nextIndex].date;
    selectDay(nextDay);
    tabRefs.current[nextDay]?.focus();
  }

  async function handleBook() {
    if (!selectedSlot || !verifiedEmail) return;
    setSubmitting(true);
    try {
      const idToken = await getIdToken();
      if (!idToken) throw new Error('no-token');

      const res = await fetch('/api/reservation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ slotId: selectedSlot }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok) {
        console.error('[reservation] échec', res.status, data);
        showToast(data?.message ?? 'Une erreur est survenue.', 'error');
        // On rafraîchit la liste : le créneau vient peut-être d'être pris.
        const fresh = await fetch('/api/creneaux', {
          headers: { Authorization: `Bearer ${idToken}` },
          cache: 'no-store',
        })
          .then((r) => r.json())
          .catch(() => null);
        if (Array.isArray(fresh?.slots)) setSlots(fresh.slots);
        setSelectedSlot(null);
        return;
      }

      showToast('Entretien confirmé !', 'success');
      setBookedSlot(data.slot);
      setSlots((prev) => prev.map((s) => (s.id === selectedSlot ? { ...s, booked: true } : s)));
      setSelectedSlot(null);
    } catch (err) {
      console.error('[reservation] erreur réseau/inattendue', err);
      showToast("L'envoi a échoué. Vérifiez votre connexion et réessayez.", 'error');
    } finally {
      setSubmitting(false);
    }
  }

  /* ---------------------------- États ---------------------------- */

  if (status === 'idle') {
    return (
      <div className="form-card">
        <Notice
          icon={Icons.Mail}
          title="Confirmez votre e-mail"
          text="Confirmez votre adresse e-mail ci-dessus pour afficher les créneaux d'entretien de votre département."
        />
      </div>
    );
  }

  if (status === 'loading') {
    return (
      <div className="form-card">
        <LoadingSkeleton />
      </div>
    );
  }

  if (status === 'no-candidature') {
    return (
      <div className="form-card">
        <Notice
          icon={Icons.FileText}
          title="Candidature requise"
          text="Les créneaux d'entretien sont réservés aux candidats ayant déposé leur candidature. Une fois votre formulaire envoyé, vous verrez ici les créneaux de votre département."
          action={
            <Link href="/candidature" className="btn btn-primary">
              <Icons.Send size={16} />
              Déposer ma candidature
            </Link>
          }
        />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="form-card">
        <Notice
          tone="danger"
          icon={Icons.Alert}
          title="Créneaux indisponibles"
          text="Impossible de charger les créneaux pour le moment. Vérifiez votre connexion puis réessayez."
          action={
            <button type="button" className="btn btn-outline" onClick={() => setReloadKey((k) => k + 1)}>
              Réessayer
            </button>
          }
        />
      </div>
    );
  }

  if (bookedSlot) {
    const booked = getDayParts(bookedSlot.date);
    const bookedDept = DEPARTMENT_LABELS[bookedSlot.department] ?? bookedSlot.department;
    const BookedModeIcon = modeIcon(bookedSlot.mode);
    return (
      <div className="form-card">
        <div className={styles.success} data-dept={bookedSlot.department} role="status">
          <span className={styles.successBadge}>
            <Icons.Check size={32} />
          </span>
          <h3 className={styles.successTitle}>Entretien confirmé !</h3>
          <p className={styles.successText}>
            Un rappel sera envoyé à <strong>{verifiedEmail}</strong> {REMINDER_LEAD_HOURS}&nbsp;h avant
            votre entretien.
          </p>

          <ul className={styles.successList}>
            <li className={`${styles.successItem} ${styles.successItemWide}`}>
              <span className={styles.successItemIcon}>
                <Icons.Calendar size={18} />
              </span>
              <span className={styles.successItemBody}>
                <span className={styles.successItemLabel}>Date</span>
                <span className={styles.successItemValue}>{booked.long}</span>
              </span>
            </li>
            <li className={styles.successItem}>
              <span className={styles.successItemIcon}>
                <Icons.Clock size={18} />
              </span>
              <span className={styles.successItemBody}>
                <span className={styles.successItemLabel}>Horaire</span>
                <span className={styles.successItemValue}>{timeRange(bookedSlot.date, bookedSlot.time)}</span>
              </span>
            </li>
            <li className={styles.successItem}>
              <span className={styles.successItemIcon}>
                <BookedModeIcon size={18} />
              </span>
              <span className={styles.successItemBody}>
                <span className={styles.successItemLabel}>Mode</span>
                <span className={styles.successItemValue}>{INTERVIEW_MODE_LABELS[bookedSlot.mode]}</span>
              </span>
            </li>
            <li className={`${styles.successItem} ${styles.successItemWide}`}>
              <span className={styles.successItemIcon}>
                <Icons.Briefcase size={18} />
              </span>
              <span className={styles.successItemBody}>
                <span className={styles.successItemLabel}>Département</span>
                <span className={styles.successItemValue}>{bookedDept}</span>
              </span>
            </li>
          </ul>

          <InterviewCountdown date={bookedSlot.date} time={bookedSlot.time} />

          <p className={styles.successNote}>Merci d&rsquo;arriver 5 minutes en avance.</p>
        </div>
      </div>
    );
  }

  if (!department) return null;

  const DeptIcon = DEPARTMENT_ICONS[department] ?? Icons.Briefcase;
  const deptLabel = DEPARTMENT_LABELS[department];

  const banner = (
    <header className={styles.banner}>
      <span className={styles.bannerIcon} aria-hidden="true">
        <DeptIcon size={22} />
      </span>
      <div className={styles.bannerText}>
        <p className={styles.bannerKicker}>Département visé</p>
        <p className={styles.bannerTitle}>{deptLabel}</p>
      </div>
      <p className={styles.bannerHint}>
        <Icons.Info size={14} />
        <span>Seuls les créneaux de ce département vous sont proposés.</span>
      </p>
    </header>
  );

  if (days.length === 0) {
    return (
      <div className="form-card">
        <div className={styles.root} data-dept={department}>
          {banner}
          <Notice
            icon={Icons.Calendar}
            title="Aucun créneau pour le moment"
            text={`Aucun créneau d'entretien n'est ouvert pour le département ${deptLabel}. Revenez bientôt : de nouveaux créneaux peuvent être ajoutés.`}
          />
        </div>
      </div>
    );
  }

  const selectedParts = selected ? getDayParts(selected.date) : null;
  const SelectedModeIcon = selected ? modeIcon(selected.mode) : null;

  return (
    <div className="form-card">
      <div className={styles.root} data-dept={department}>
        {banner}

        {/* ------------------------- Étape 1 : jour ------------------------- */}
        <section
          ref={daysRef}
          tabIndex={-1}
          className={styles.stepSection}
          aria-labelledby="slot-step-day"
        >
          <StepHeader
            id="slot-step-day"
            step={1}
            title="Choisissez un jour"
            meta={`${days.length} ${plural(days.length, 'jour proposé', 'jours proposés')}`}
          />

          <div className={styles.dayList} role="tablist" aria-label="Choisir un jour">
            {days.map((day, index) => {
              const parts = getDayParts(day.date);
              const isActive = currentDay === day.date;
              const isFull = day.free === 0;
              const fill = day.total > 0 ? Math.round((day.free / day.total) * 100) : 0;
              return (
                <button
                  key={day.date}
                  ref={(el) => {
                    tabRefs.current[day.date] = el;
                  }}
                  type="button"
                  role="tab"
                  id={`day-tab-${day.date}`}
                  aria-selected={isActive}
                  aria-controls={`day-panel-${day.date}`}
                  aria-label={`${parts.long}, ${
                    isFull ? 'complet' : `${day.free} ${plural(day.free, 'créneau libre', 'créneaux libres')}`
                  }`}
                  tabIndex={isActive ? 0 : -1}
                  className={`${styles.day} ${isFull ? styles.dayFull : ''}`}
                  style={{ '--fill': `${fill}%` } as CSSProperties}
                  onClick={() => selectDay(day.date)}
                  onKeyDown={(e) => handleTabKeyDown(e, index)}
                >
                  <span className={styles.dayHead}>{parts.weekdayShort}</span>
                  <span className={styles.dayBody}>
                    <span className={styles.dayNum}>{parts.dayNumber}</span>
                    <span className={styles.dayMonth}>{parts.monthShort}</span>
                    <span className={styles.dayMeter} aria-hidden="true">
                      <span className={styles.dayMeterFill} />
                    </span>
                    <span className={styles.dayCount}>
                      {isFull ? 'Complet' : `${day.free} ${plural(day.free, 'libre', 'libres')}`}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* ------------------------ Étape 2 : heure ------------------------ */}
        <section
          ref={hoursRef}
          tabIndex={-1}
          className={styles.stepSection}
          role="tabpanel"
          id={currentDay ? `day-panel-${currentDay}` : undefined}
          aria-labelledby={currentDay ? `day-tab-${currentDay}` : undefined}
        >
          <StepHeader
            step={2}
            title="Choisissez une heure"
            meta={
              currentDayParts ? (
                <>
                  <strong>{currentDayParts.long}</strong> · entretiens de {INTERVIEW_DURATION_MINUTES}&nbsp;min
                </>
              ) : undefined
            }
          />

          <ul className={styles.legend} aria-hidden="true">
            <li className={styles.legendItem}>
              <span className={`${styles.legendDot} ${styles.legendDotFree}`} />
              Libre
            </li>
            <li className={styles.legendItem}>
              <span className={`${styles.legendDot} ${styles.legendDotSelected}`} />
              Sélectionné
            </li>
            {SHOW_BOOKED_SLOTS && (
              <li className={styles.legendItem}>
                <span className={`${styles.legendDot} ${styles.legendDotBooked}`} />
                Complet
              </li>
            )}
          </ul>

          {periods.map((period) => {
            const freeCount = period.items.filter((s) => !s.booked).length;
            return (
              <div key={period.key} className={styles.period}>
                <h4 className={styles.periodTitle}>
                  {period.label}
                  <span className={styles.periodCount}>
                    {freeCount === 0 ? 'Complet' : `${freeCount} ${plural(freeCount, 'libre', 'libres')}`}
                  </span>
                </h4>
                <div className={styles.slotGrid} role="group" aria-label={`Créneaux — ${period.label}`}>
                  {period.items.map((slot, index) => {
                    const isSelected = selectedSlot === slot.id;
                    const SlotModeIcon = modeIcon(slot.mode);
                    return (
                      <button
                        key={slot.id}
                        type="button"
                        className={styles.slot}
                        style={{ '--i': index } as CSSProperties}
                        disabled={slot.booked}
                        aria-pressed={isSelected}
                        aria-label={`${slot.time}${slot.booked ? ', complet' : ''}`}
                        onClick={() => setSelectedSlot(isSelected ? null : slot.id)}
                      >
                        <span className={styles.slotRadio} aria-hidden="true">
                          {isSelected && <Icons.Check size={12} />}
                        </span>
                        <span className={styles.slotBody}>
                          <span className={styles.slotTime}>{slot.time}</span>
                          <span className={styles.slotMeta}>
                            <SlotModeIcon size={12} />
                            {INTERVIEW_MODE_LABELS[slot.mode]}
                          </span>
                        </span>
                        {slot.booked && <span className={styles.slotTag}>Complet</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>

        {/* ----------------------- Récapitulatif ----------------------- */}
        {selected && selectedParts && SelectedModeIcon && (
          <div ref={summaryRef} className={styles.summary} role="status" aria-live="polite">
            <div className={styles.summaryHead}>
              <span className={styles.summaryBadge} aria-hidden="true">
                <Icons.Calendar size={20} />
              </span>
              <div className={styles.summaryTitleBlock}>
                <p className={styles.summaryLabel}>Créneau sélectionné</p>
                <p className={styles.summaryValue}>{selectedParts.long}</p>
              </div>
            </div>

            <dl className={styles.summaryFacts}>
              <div className={styles.summaryFact}>
                <dt>Horaire</dt>
                <dd>{timeRange(selected.date, selected.time)}</dd>
              </div>
              <div className={styles.summaryFact}>
                <dt>Durée</dt>
                <dd>{INTERVIEW_DURATION_MINUTES}&nbsp;min</dd>
              </div>
              <div className={styles.summaryFact}>
                <dt>Mode</dt>
                <dd>
                  <SelectedModeIcon size={14} />
                  {INTERVIEW_MODE_LABELS[selected.mode]}
                </dd>
              </div>
              <div className={styles.summaryFact}>
                <dt>Département</dt>
                <dd>{deptLabel}</dd>
              </div>
            </dl>

            <p className={styles.summaryNote}>
              Un rappel sera envoyé à <strong>{verifiedEmail}</strong> {REMINDER_LEAD_HOURS}&nbsp;h avant
              l&rsquo;entretien.
            </p>

            <div className={styles.summaryActions}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setSelectedSlot(null)}
                disabled={submitting}
              >
                Annuler
              </button>
              <button type="button" className="btn btn-primary" onClick={handleBook} disabled={submitting}>
                {submitting ? (
                  'Confirmation…'
                ) : (
                  <>
                    <Icons.Check size={16} />
                    Confirmer ce créneau
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Flèche flottante : tant que « Choisissez une heure » est cachée en bas de
            l'écran, elle guide l'utilisateur : d'abord le jour, puis l'heure. */}
        <ScrollDownButton steps={hintSteps} enabled={!selected && !submitting} />
      </div>
    </div>
  );
}