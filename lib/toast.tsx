'use client';
// lib/toast.tsx
//
// Toasts/snackbars pour le feedback transitoire (succès réseau, erreurs
// ponctuelles). Ne remplace PAS les erreurs de validation de champ, qui
// doivent rester visibles en permanence à côté du champ concerné — les
// toasts servent aux événements éphémères (email envoyé, réservation
// confirmée, erreur réseau) qu'on veut signaler sans figer la mise en page.
//
// Accessibilité : la pile de toasts est une région aria-live. "polite"
// pour success/info (n'interrompt pas un lecteur d'écran en cours de
// lecture), "assertive" pour error (l'utilisateur doit être notifié tout
// de suite d'un échec). Le timer se met en pause au survol/focus pour
// laisser le temps de lire les messages longs (ex : guide de remplissage).

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Icons } from '@/components/icons/Icons';

type ToastVariant = 'success' | 'error' | 'info';

type Toast = {
  id: string;
  title?: string;
  message: string;
  variant: ToastVariant;
  duration: number;
};

type ShowToastOptions = {
  /** Titre optionnel affiché en gras au-dessus du message. */
  title?: string;
  /** Durée d'affichage en ms. Par défaut, calculée selon la longueur du message. */
  duration?: number;
};

type ToastContextValue = {
  showToast: (message: string, variant?: ToastVariant, options?: ShowToastOptions) => void;
};

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const MIN_DURATION_MS = 4000;
const MAX_DURATION_MS = 12000;
const MS_PER_CHAR = 45;

/** Durée auto-adaptée à la longueur du message (les longs textes restent plus longtemps affichés). */
function computeDuration(message: string): number {
  return Math.min(MAX_DURATION_MS, Math.max(MIN_DURATION_MS, message.length * MS_PER_CHAR));
}

const ICONS: Record<ToastVariant, keyof typeof Icons> = {
  success: 'Check',
  error: 'Alert',
  info: 'Info',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const remaining = useRef<Map<string, number>>(new Map());
  const startedAt = useRef<Map<string, number>>(new Map());

  const clearTimer = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const dismiss = useCallback(
    (id: string) => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      clearTimer(id);
      remaining.current.delete(id);
      startedAt.current.delete(id);
    },
    [clearTimer],
  );

  const startTimer = useCallback(
    (id: string, duration: number) => {
      clearTimer(id);
      startedAt.current.set(id, Date.now());
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), duration),
      );
    },
    [clearTimer, dismiss],
  );

  const pauseTimer = useCallback((id: string) => {
    const timer = timers.current.get(id);
    const started = startedAt.current.get(id);
    if (timer && started) {
      clearTimeout(timer);
      timers.current.delete(id);
      const elapsed = Date.now() - started;
      const left = (remaining.current.get(id) ?? 0) - elapsed;
      remaining.current.set(id, Math.max(left, 300));
    }
  }, []);

  const resumeTimer = useCallback(
    (id: string) => {
      const left = remaining.current.get(id);
      if (left) startTimer(id, left);
    },
    [startTimer],
  );

  const showToast = useCallback(
    (message: string, variant: ToastVariant = 'info', options: ShowToastOptions = {}) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const duration = options.duration ?? computeDuration(message);
      setToasts((prev) => [...prev, { id, title: options.title, message, variant, duration }]);
      remaining.current.set(id, duration);
      startTimer(id, duration);
    },
    [startTimer],
  );

  useEffect(() => {
    return () => {
      timers.current.forEach((t) => clearTimeout(t));
      timers.current.clear();
    };
  }, []);

return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toasts.length > 0 && (
        <>
          <div className="toast-backdrop" aria-hidden="true" />
          <div className="toast-stack">
          {toasts.map((t) => {
            const Icon = Icons[ICONS[t.variant]];
            return (
              <div
                key={t.id}
                role="status"
                aria-live={t.variant === 'error' ? 'assertive' : 'polite'}
                aria-atomic="true"
                className={`toast toast--${t.variant}`}
                onMouseEnter={() => pauseTimer(t.id)}
                onMouseLeave={() => resumeTimer(t.id)}
                onFocus={() => pauseTimer(t.id)}
                onBlur={() => resumeTimer(t.id)}
              >
                <Icon size={20} className="toast-icon" />
                <div className="toast-body">
                  {t.title && <span className="toast-title">{t.title}</span>}
                  <div className="toast-message">
                    {t.message
                      .split('\n')
                      .filter(Boolean)
                      .map((line, i) => (
                        <p key={i} className="toast-line">
                          {line}
                        </p>
                      ))}
                  </div>
                </div>
                <button
                  type="button"
                  className="toast-close"
                  onClick={() => dismiss(t.id)}
                  aria-label="Fermer la notification"
                >
                  <Icons.X size={14} />
                </button>
              </div>
            );
          })}
          </div>
        </>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast doit être utilisé à l\'intérieur de <ToastProvider>.');
  }
  return ctx;
}