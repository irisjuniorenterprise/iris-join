// components/admin/shared.tsx
//
// Types, helpers et petits composants partagés par l'espace administration.
import type { CSSProperties } from 'react';
import { DEPARTMENT_LABELS, type DepartmentKey, type InterviewMode } from '@/lib/interview';
import styles from './admin.module.css';

/* ------------------------------------------------------------------ */
/* Types                                                                */
/* ------------------------------------------------------------------ */

export type Candidature = {
  id: string;
  nomPrenom: string;
  telephone: string;
  filiere: string;
  niveauEtudes: string;
  /** Valeur brute enregistrée par le formulaire — toujours departements[0]. */
  departement: string;
  /** Département normalisé (null si la valeur enregistrée est inconnue). */
  department: DepartmentKey | null;
  /** Départements classés par ordre de préférence tel que soumis par le candidat ; seul le premier compte pour l'entretien. */
  departements: string[];
  sourceConnaissance: string;
  niveauFrancais: string;
  niveauAnglais: string;
  participationFormations: string;
  autreEngagement: string;
  organisationTemps: string;
  motivation: string;
  domaine: string;
  remarques: string;
  consentement: boolean;
  email: string;
  createdAt: string | null;
  updatedAt: string | null;
};

export type AdminSlot = {
  id: string;
  date: string;
  time: string;
  department: DepartmentKey;
  mode: InterviewMode;
  booked: boolean;
  bookedByEmail?: string;
};

export type Overview = {
  admin: string;
  candidatures: Candidature[];
  slots: AdminSlot[];
};

/** Demandes d'ouverture de dialogue émises par les panneaux vers le tableau de bord. */
export type DialogRequest =
  | { type: 'move'; email: string }
  | { type: 'release'; slotId: string }
  | { type: 'edit-slot'; slotId: string }
  | { type: 'delete-slot'; slotId: string }
  | {
      type: 'create-slots';
      initial?: { date?: string; time?: string; department?: DepartmentKey };
    };

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

export const emailKey = (email: string): string => email.trim().toLowerCase();

export const fullName = (c: Pick<Candidature, 'nomPrenom'>): string => c.nomPrenom.trim();

const dateTimeFormatter = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Africa/Tunis',
});

export function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : dateTimeFormatter.format(d);
}

/** Minuscules sans accents — pour la recherche. */
export function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/* ------------------------------------------------------------------ */
/* Départements                                                         */
/* ------------------------------------------------------------------ */

const DEPT_RGB: Record<DepartmentKey, string> = {
  it: '26, 57, 105',
  marketing: '217, 73, 28',
  etudes: '47, 127, 161',
  'dev-co': '27, 127, 138',
};

export function deptStyle(department: DepartmentKey | null): CSSProperties {
  const rgb = department ? DEPT_RGB[department] : '107, 114, 128';
  return { '--dept-rgb': rgb, '--dept': `rgb(${rgb})` } as CSSProperties;
}

export function DeptBadge({
  department,
  fallback,
}: {
  department: DepartmentKey | null;
  fallback?: string;
}) {
  return (
    <span className={styles.badge} style={deptStyle(department)}>
      {department ? DEPARTMENT_LABELS[department] : fallback || 'Inconnu'}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Appels API                                                           */
/* ------------------------------------------------------------------ */

export type ApiResult<T> = {
  ok: boolean;
  status: number;
  data: (T & { message?: string }) | null;
};

export async function adminRequest<T = Record<string, unknown>>(
  getIdToken: () => Promise<string | null>,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<ApiResult<T>> {
  const token = await getIdToken();
  if (!token) {
    return {
      ok: false,
      status: 401,
      data: { message: 'Session expirée. Reconnectez-vous.' } as T & { message?: string },
    };
  }

  try {
    const res = await fetch(path, {
      method: init.method ?? 'GET',
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    const data = (await res.json().catch(() => null)) as (T & { message?: string }) | null;
    return { ok: res.ok, status: res.status, data };
  } catch {
    return {
      ok: false,
      status: 0,
      data: { message: 'Problème réseau. Vérifiez votre connexion.' } as T & { message?: string },
    };
  }
}