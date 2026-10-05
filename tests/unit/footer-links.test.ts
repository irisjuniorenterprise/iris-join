import { describe, expect, it } from 'vitest';
import { getFooterLinks } from '@/lib/footer-links';
import type { ServiceWindows } from '@/lib/service-window';

const NOW = new Date('2026-10-10T12:00:00Z');
const PAST = '2026-10-01T00:00:00Z';
const FUTURE = '2026-10-20T00:00:00Z';

const windows = (
  candidature: ServiceWindows['candidature'],
  entretien: ServiceWindows['entretien'],
): ServiceWindows => ({ candidature, entretien });

describe('getFooterLinks', () => {
  it('candidature et entretien pas encore ouverts : leurs liens sont affichés, pas le résultat', () => {
    const w = windows({ opensAt: FUTURE, closesAt: null }, { opensAt: FUTURE, closesAt: null });
    expect(getFooterLinks(w, NOW)).toEqual({ candidature: true, entretien: true, resultats: false });
  });

  it('candidature et entretien ouverts : leurs liens sont affichés, pas le résultat', () => {
    const w = windows({ opensAt: PAST, closesAt: FUTURE }, { opensAt: PAST, closesAt: null });
    expect(getFooterLinks(w, NOW)).toEqual({ candidature: true, entretien: true, resultats: false });
  });

  it('aucune limite configurée : parcours affiché, pas de résultat', () => {
    const w = windows({ opensAt: null, closesAt: null }, { opensAt: null, closesAt: null });
    expect(getFooterLinks(w, NOW)).toEqual({ candidature: true, entretien: true, resultats: false });
  });

  it('candidature fermée : le lien résultat remplace le lien candidature', () => {
    const w = windows({ opensAt: PAST, closesAt: '2026-10-05T00:00:00Z' }, { opensAt: PAST, closesAt: FUTURE });
    expect(getFooterLinks(w, NOW)).toEqual({ candidature: false, entretien: true, resultats: true });
  });

  it('candidature et entretien fermés : seul le lien résultat reste', () => {
    const closed = { opensAt: PAST, closesAt: '2026-10-05T00:00:00Z' };
    expect(getFooterLinks(windows(closed, closed), NOW)).toEqual({
      candidature: false,
      entretien: false,
      resultats: true,
    });
  });

  it('entretien fermé mais candidature ouverte : pas de lien résultat', () => {
    const w = windows({ opensAt: PAST, closesAt: FUTURE }, { opensAt: PAST, closesAt: '2026-10-05T00:00:00Z' });
    expect(getFooterLinks(w, NOW)).toEqual({ candidature: true, entretien: false, resultats: false });
  });
});
