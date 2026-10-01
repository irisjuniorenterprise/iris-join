import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SERVICE_WINDOWS,
  SERVICE_KEYS,
  SERVICE_META,
  formatServiceDateTime,
  getServiceStatus,
  isServiceOpen,
} from '@/lib/service-window';

const OPENS = '2026-10-01T00:00:00+01:00';
const CLOSES = '2026-10-31T23:59:59+01:00';
const at = (iso: string) => new Date(iso);

describe('getServiceStatus', () => {
  const window = { opensAt: OPENS, closesAt: CLOSES };

  it('« not-started » avant l’ouverture', () => {
    expect(getServiceStatus(window, at('2026-09-30T23:59:59+01:00'))).toEqual({
      state: 'not-started',
      opensAt: OPENS,
    });
  });

  it('« open » pile à l’ouverture (borne incluse)', () => {
    expect(getServiceStatus(window, at(OPENS)).state).toBe('open');
  });

  it('« open » en plein milieu de la période', () => {
    expect(getServiceStatus(window, at('2026-10-15T12:00:00+01:00')).state).toBe('open');
  });

  it('« open » pile à la fermeture (borne incluse)', () => {
    expect(getServiceStatus(window, at(CLOSES)).state).toBe('open');
  });

  it('« closed » une seconde après la fermeture', () => {
    expect(getServiceStatus(window, at('2026-11-01T00:00:00+01:00'))).toEqual({
      state: 'closed',
      closesAt: CLOSES,
    });
  });

  it('opensAt nul = ouvert dès maintenant', () => {
    expect(getServiceStatus({ opensAt: null, closesAt: CLOSES }, at('2000-01-01T00:00:00Z')).state).toBe('open');
  });

  it('closesAt nul = ne ferme jamais', () => {
    expect(getServiceStatus({ opensAt: OPENS, closesAt: null }, at('2099-01-01T00:00:00Z')).state).toBe('open');
  });

  it('aucune limite des deux côtés = toujours ouvert', () => {
    expect(getServiceStatus({ opensAt: null, closesAt: null }, at('2050-06-01T00:00:00Z')).state).toBe('open');
  });

  it('utilise l’heure courante par défaut', () => {
    expect(getServiceStatus({ opensAt: null, closesAt: null }).state).toBe('open');
    expect(getServiceStatus({ opensAt: '2000-01-01T00:00:00Z', closesAt: '2000-01-02T00:00:00Z' }).state).toBe(
      'closed',
    );
  });
});

describe('isServiceOpen', () => {
  it('reflète l’état « open »', () => {
    const window = { opensAt: OPENS, closesAt: CLOSES };
    expect(isServiceOpen(window, at('2026-10-15T00:00:00+01:00'))).toBe(true);
    expect(isServiceOpen(window, at('2026-09-01T00:00:00+01:00'))).toBe(false);
    expect(isServiceOpen(window, at('2026-12-01T00:00:00+01:00'))).toBe(false);
  });
});

describe('constantes', () => {
  it('définit un libellé pour chaque service', () => {
    for (const key of SERVICE_KEYS) {
      expect(SERVICE_META[key].title).toBeTruthy();
      expect(DEFAULT_SERVICE_WINDOWS[key]).toEqual({ opensAt: null, closesAt: null });
    }
  });

  it('les fenêtres par défaut ne sont pas partagées par référence', () => {
    expect(DEFAULT_SERVICE_WINDOWS.candidature).not.toBe(DEFAULT_SERVICE_WINDOWS.entretien);
  });
});

describe('formatServiceDateTime', () => {
  it('formate en heure de Tunis', () => {
    // 08:00 UTC = 09:00 à Tunis (UTC+1, sans changement d'heure).
    expect(formatServiceDateTime('2026-10-12T08:00:00Z')).toMatch(/lundi 12 octobre.*09:00/);
  });

  it('ne dépend pas du décalage fourni dans la chaîne ISO', () => {
    expect(formatServiceDateTime('2026-10-12T09:00:00+01:00')).toMatch(/lundi 12 octobre.*09:00/);
  });

  it('renvoie la chaîne telle quelle quand elle est invalide', () => {
    expect(formatServiceDateTime('bientôt')).toBe('bientôt');
  });
});
