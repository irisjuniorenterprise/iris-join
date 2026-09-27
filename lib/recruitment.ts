// lib/recruitment.ts

/**
 * Fenêtre de recrutement. Contrairement au site vitrine (qui codait le mois
 * en dur), les dates sont ici configurables via variables d'environnement
 * pour que l'équipe RH puisse ajuster la campagne sans redéploiement de code.
 */
const OPEN_DATE = process.env.NEXT_PUBLIC_RECRUITMENT_OPEN ?? '2026-10-01T00:00:00+01:00';
const CLOSE_DATE = process.env.NEXT_PUBLIC_RECRUITMENT_CLOSE ?? '2026-10-31T23:59:59+01:00';

export function getRecruitmentWindow() {
  return {
    opensAt: new Date(OPEN_DATE),
    closesAt: new Date(CLOSE_DATE),
  };
}

export function isRecruitmentOpen(now: Date = new Date()): boolean {
  const { opensAt, closesAt } = getRecruitmentWindow();
  return now >= opensAt && now <= closesAt;
}

/** Nombre de jours restants avant la fermeture (0 si déjà fermé). */
export function daysUntilClose(now: Date = new Date()): number {
  const { closesAt } = getRecruitmentWindow();
  const diff = closesAt.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}
