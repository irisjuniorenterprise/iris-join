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
  getDayParts,
  INTERVIEW_MODE_LABELS,
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
    return (
      <div className="form-card">
        <div className={styles.success} data-dept={bookedSlot.department} role="status">
          <span className={styles.successBadge}>
            <Icons.Check size={32} />
          </span>
          <h3 className={styles.successTitle}>Entretien confirmé !</h3>
          <p className={styles.successText}>
            Une confirmation a été envoyée à <strong>{verifiedEmail}</strong>.
          </p>
          <ul className={styles.successList}>
            <li className={styles.successItem}>
              <Icons.Calendar size={20} />
              {booked.long}
            </li>
            <li className={styles.successItem}>
              <Icons.Clock size={20} />
              {bookedSlot.time}
            </li>
            <li className={styles.successItem}>
              <Icons.Briefcase size={20} />
              {bookedDept}
            </li>
            <li className={styles.successItem}>
              <Icons.MapPin size={20} />
              {INTERVIEW_MODE_LABELS[bookedSlot.mode]}
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
      <p className={styles.bannerHint}>Seuls les créneaux de ce département vous sont proposés.</p>
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

  return (
    <div className="form-card">
      <div className={styles.root} data-dept={department}>
        {banner}

        <section
          ref={daysRef}
          tabIndex={-1}
          className={styles.stepSection}
          aria-labelledby="slot-step-day"
        >
          <h3 className={styles.stepTitle} id="slot-step-day">
            <span className={styles.stepNum}>1</span>
            Choisissez un jour
          </h3>

          <div className={styles.dayList} role="tablist" aria-label="Choisir un jour">
            {days.map((day, index) => {
              const parts = getDayParts(day.date);
              const isActive = currentDay === day.date;
              const isFull = day.free === 0;
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
                  onClick={() => selectDay(day.date)}
                  onKeyDown={(e) => handleTabKeyDown(e, index)}
                >
                  <span className={styles.dayWeek}>{parts.weekdayShort}</span>
                  <span className={styles.dayNum}>{parts.dayNumber}</span>
                  <span className={styles.dayMonth}>{parts.monthShort}</span>
                  <span className={styles.dayCount}>
                    {isFull ? 'Complet' : `${day.free} ${plural(day.free, 'libre', 'libres')}`}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section
          ref={hoursRef}
          tabIndex={-1}
          className={styles.stepSection}
          role="tabpanel"
          id={currentDay ? `day-panel-${currentDay}` : undefined}
          aria-labelledby={currentDay ? `day-tab-${currentDay}` : undefined}
        >
          <h3 className={styles.stepTitle}>
            <span className={styles.stepNum}>2</span>
            Choisissez une heure
          </h3>

          {periods.map((period) => (
            <div key={period.key} className={styles.period}>
              <h4 className={styles.periodTitle}>{period.label}</h4>
              <div className={styles.slotGrid} role="group" aria-label={`Créneaux — ${period.label}`}>
                {period.items.map((slot, index) => {
                  const isSelected = selectedSlot === slot.id;
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
                      {isSelected && (
                        <span className={styles.slotCheck} aria-hidden="true">
                          <Icons.Check size={12} />
                        </span>
                      )}
                      <span className={styles.slotTime}>{slot.time}</span>
                      <span className={styles.slotMode}>{INTERVIEW_MODE_LABELS[slot.mode]}</span>
                      <span className={styles.slotState}>{slot.booked ? 'Complet' : 'Libre'}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </section>

        {selected && selectedParts && (
          <div ref={summaryRef} className={styles.summary} role="status" aria-live="polite">
            <div className={styles.summaryInfo}>
              <span className={styles.summaryBadge} aria-hidden="true">
                <Icons.Calendar size={20} />
              </span>
              <div>
                <p className={styles.summaryLabel}>Créneau sélectionné</p>
                <p className={styles.summaryValue}>
                  {selectedParts.long} · {selected.time}
                </p>
                <p className={styles.summaryMeta}>{INTERVIEW_MODE_LABELS[selected.mode]}</p>
                <p className={styles.summaryMeta}>
                  Confirmation envoyée à <strong>{verifiedEmail}</strong>
                </p>
              </div>
            </div>

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