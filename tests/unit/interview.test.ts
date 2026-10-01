import { afterEach, describe, expect, it } from 'vitest';
import {
  DEPARTMENT_KEYS,
  DEPARTMENT_LABELS,
  INTERVIEW_DURATION_MINUTES,
  departmentStoredValues,
  formatClockTunis,
  formatDayLong,
  getDayParts,
  getSlotEndMs,
  getSlotStartMs,
  normalizeDepartment,
  normalizeInterviewMode,
} from '@/lib/interview';

describe('normalizeDepartment', () => {
  it.each([
    ['it', 'it'],
    ['IT', 'it'],
    ['  it  ', 'it'],
    ['marketing', 'marketing'],
    ['Marketing', 'marketing'],
    ['etudes', 'etudes'],
    ['Études', 'etudes'], // ancien libellé stocké avec accent
    ['ÉTUDES', 'etudes'],
    ['dev-co', 'dev-co'],
    ['devco', 'dev-co'],
    ['Dev Co', 'dev-co'],
    ['Dev. Commercial', 'dev-co'],
    ['Développement Commercial', 'dev-co'],
    ['Développement & Communication', 'dev-co'],
  ])('%j -> %j', (raw, expected) => {
    expect(normalizeDepartment(raw)).toBe(expected);
  });

  it.each([['rh'], [''], ['   '], [undefined], [null], [42], [{}], [['it']]])('%j -> null', (raw) => {
    expect(normalizeDepartment(raw)).toBeNull();
  });

  it('reconnaît toutes les clés canoniques et tous les libellés d’affichage', () => {
    for (const key of DEPARTMENT_KEYS) {
      expect(normalizeDepartment(key)).toBe(key);
      expect(normalizeDepartment(DEPARTMENT_LABELS[key])).toBe(key);
    }
  });
});

describe('departmentStoredValues', () => {
  it('renvoie la clé et l’ancien libellé, sans doublon', () => {
    expect(departmentStoredValues('etudes')).toEqual(['etudes', 'Études']);
    expect(departmentStoredValues('dev-co')).toEqual(['dev-co', 'Développement Commercial']);
  });

  it('dédoublonne quand clé et libellé sont identiques', () => {
    // « marketing » / « Marketing » diffèrent par la casse : 2 valeurs ; « it » / « IT » aussi.
    for (const key of DEPARTMENT_KEYS) {
      const values = departmentStoredValues(key);
      expect(new Set(values).size).toBe(values.length);
      expect(values).toContain(key);
    }
  });
});

describe('normalizeInterviewMode', () => {
  it.each([
    ['en-ligne', 'en-ligne'],
    ['En ligne', 'en-ligne'],
    ['enligne', 'en-ligne'],
    ['ONLINE', 'en-ligne'],
    ['presentiel', 'presentiel'],
    ['Présentiel', 'presentiel'],
  ])('%j -> %j', (raw, expected) => {
    expect(normalizeInterviewMode(raw)).toBe(expected);
  });

  it.each([[undefined], [null], [''], ['zoom'], [3]])('valeur %j -> présentiel par défaut', (raw) => {
    expect(normalizeInterviewMode(raw)).toBe('presentiel');
  });
});

describe('getDayParts / formatDayLong', () => {
  it('formate un lundi d’octobre', () => {
    const parts = getDayParts('2026-10-12');
    expect(parts.long).toBe('Lundi 12 octobre');
    expect(parts.dayNumber).toBe('12');
    expect(parts.weekdayShort.toLowerCase()).toMatch(/^lun/);
    expect(parts.monthShort.toLowerCase()).toMatch(/^oct/);
    expect(formatDayLong('2026-10-12')).toBe('Lundi 12 octobre');
  });

  it('enchaîne correctement les jours suivants', () => {
    expect(formatDayLong('2026-10-13')).toBe('Mardi 13 octobre');
    expect(formatDayLong('2026-10-14')).toBe('Mercredi 14 octobre');
  });

  it('renvoie la valeur d’origine quand la date est invalide', () => {
    expect(getDayParts('pas-une-date')).toEqual({
      weekdayShort: 'pas-une-date',
      dayNumber: '',
      monthShort: '',
      long: 'pas-une-date',
    });
  });
});

describe('horaires de créneaux (heure de Tunis, UTC+1)', () => {
  const originalTz = process.env.TZ;
  afterEach(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it('09:00 à Tunis = 08:00 UTC', () => {
    expect(getSlotStartMs('2026-10-12', '09:00')).toBe(Date.UTC(2026, 9, 12, 8, 0));
  });

  it('la fin est 30 minutes après le début', () => {
    expect(INTERVIEW_DURATION_MINUTES).toBe(30);
    expect(getSlotEndMs('2026-10-12', '09:00') - getSlotStartMs('2026-10-12', '09:00')).toBe(30 * 60_000);
  });

  it('renvoie NaN pour une date ou une heure invalide', () => {
    expect(getSlotStartMs('2026-13-45', '09:00')).toBeNaN();
    expect(getSlotStartMs('2026-10-12', 'xx:yy')).toBeNaN();
    expect(getSlotEndMs('n/a', 'n/a')).toBeNaN();
  });

  it('formatClockTunis affiche l’heure de Tunis', () => {
    expect(formatClockTunis(getSlotStartMs('2026-10-12', '14:30'))).toBe('14:30');
    expect(formatClockTunis(Date.UTC(2026, 9, 12, 8, 0))).toBe('09:00');
  });

  // Le résultat ne doit JAMAIS dépendre du fuseau de l'appareil du candidat.
  it.each(['UTC', 'America/New_York', 'Asia/Tokyo', 'Pacific/Kiritimati', 'Africa/Tunis'])(
    'est identique avec TZ=%s',
    (tz) => {
      process.env.TZ = tz;
      expect(getSlotStartMs('2026-10-12', '09:00')).toBe(Date.UTC(2026, 9, 12, 8, 0));
      expect(formatDayLong('2026-10-12')).toBe('Lundi 12 octobre');
      expect(formatClockTunis(getSlotStartMs('2026-10-12', '09:00'))).toBe('09:00');
    },
  );
});
