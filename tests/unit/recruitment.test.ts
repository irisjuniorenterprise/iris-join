import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// lib/recruitment.ts lit les variables d'environnement à l'import : on
// recharge donc le module pour chaque scénario.
async function load(env: { open?: string; close?: string } = {}) {
  vi.resetModules();
  if (env.open === undefined) delete process.env.NEXT_PUBLIC_RECRUITMENT_OPEN;
  else process.env.NEXT_PUBLIC_RECRUITMENT_OPEN = env.open;
  if (env.close === undefined) delete process.env.NEXT_PUBLIC_RECRUITMENT_CLOSE;
  else process.env.NEXT_PUBLIC_RECRUITMENT_CLOSE = env.close;
  return import('@/lib/recruitment');
}

describe('lib/recruitment', () => {
  const saved = {
    open: process.env.NEXT_PUBLIC_RECRUITMENT_OPEN,
    close: process.env.NEXT_PUBLIC_RECRUITMENT_CLOSE,
  };

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    if (saved.open === undefined) delete process.env.NEXT_PUBLIC_RECRUITMENT_OPEN;
    else process.env.NEXT_PUBLIC_RECRUITMENT_OPEN = saved.open;
    if (saved.close === undefined) delete process.env.NEXT_PUBLIC_RECRUITMENT_CLOSE;
    else process.env.NEXT_PUBLIC_RECRUITMENT_CLOSE = saved.close;
  });

  it('utilise octobre 2026 par défaut', async () => {
    const { getRecruitmentWindow } = await load();
    const { opensAt, closesAt } = getRecruitmentWindow();
    expect(opensAt.toISOString()).toBe('2026-09-30T23:00:00.000Z');
    expect(closesAt.toISOString()).toBe('2026-10-31T22:59:59.000Z');
  });

  it('prend les dates des variables d’environnement', async () => {
    const { getRecruitmentWindow } = await load({
      open: '2027-02-01T00:00:00+01:00',
      close: '2027-02-28T23:59:59+01:00',
    });
    expect(getRecruitmentWindow().opensAt.toISOString()).toBe('2027-01-31T23:00:00.000Z');
  });

  describe('isRecruitmentOpen', () => {
    it('faux avant l’ouverture, vrai pendant, faux après', async () => {
      const { isRecruitmentOpen } = await load();
      expect(isRecruitmentOpen(new Date('2026-09-30T22:59:59Z'))).toBe(false);
      expect(isRecruitmentOpen(new Date('2026-09-30T23:00:00Z'))).toBe(true);
      expect(isRecruitmentOpen(new Date('2026-10-15T10:00:00Z'))).toBe(true);
      expect(isRecruitmentOpen(new Date('2026-10-31T22:59:59Z'))).toBe(true);
      expect(isRecruitmentOpen(new Date('2026-10-31T23:00:00Z'))).toBe(false);
    });

    it('utilise l’horloge système par défaut', async () => {
      const { isRecruitmentOpen } = await load();
      vi.setSystemTime(new Date('2026-10-10T10:00:00Z'));
      expect(isRecruitmentOpen()).toBe(true);
      vi.setSystemTime(new Date('2026-12-01T10:00:00Z'));
      expect(isRecruitmentOpen()).toBe(false);
    });
  });

  describe('daysUntilClose', () => {
    it('arrondit à la journée supérieure', async () => {
      const { daysUntilClose } = await load();
      // 1 h avant la fermeture -> 1 jour restant (arrondi au supérieur)
      expect(daysUntilClose(new Date('2026-10-31T21:59:59Z'))).toBe(1);
      // exactement 10 jours avant
      expect(daysUntilClose(new Date('2026-10-21T22:59:59Z'))).toBe(10);
    });

    it('vaut 0 une fois la campagne fermée (jamais négatif)', async () => {
      const { daysUntilClose } = await load();
      expect(daysUntilClose(new Date('2026-11-15T00:00:00Z'))).toBe(0);
    });
  });
});
