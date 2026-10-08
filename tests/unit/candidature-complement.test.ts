import { describe, expect, it } from 'vitest';
import {
  COMPLEMENT_FIELDS,
  getMissingKeys,
  isBlank,
  validateComplement,
} from '@/lib/candidature-complement';

const COMPLETE = {
  telephone: '20123456',
  filiere: 'GI',
  niveauEtudes: '2e année',
  sourceConnaissance: 'Réseaux sociaux',
  niveauFrancais: 'Avancé',
  niveauAnglais: 'Intermédiaire',
  participationFormations: 'Non',
  autreEngagement: 'non',
  organisationTemps: '',
  motivation: 'Apprendre et contribuer',
  domaine: 'Développement web',
};

describe('isBlank', () => {
  it.each([undefined, null, '', '  ', '-', '—', '–', ' - '])('%j est une donnée absente', (v) => {
    expect(isBlank(v)).toBe(true);
  });
  it.each(['GI', '0', 'oui', 'a-b'])('%j est renseigné', (v) => {
    expect(isBlank(v)).toBe(false);
  });
});

describe('getMissingKeys', () => {
  it('ne signale rien pour une candidature complète du formulaire public', () => {
    expect(getMissingKeys(COMPLETE)).toEqual([]);
  });

  it('signale les tirets écrits par l’import, dans l’ordre d’affichage', () => {
    const missing = getMissingKeys({ ...COMPLETE, telephone: '-', motivation: '-', filiere: '-' });
    expect(missing).toEqual(['telephone', 'filiere', 'motivation']);
    expect(COMPLEMENT_FIELDS.map((f) => f.key)).toEqual(expect.arrayContaining(missing));
  });

  it('ne demande pas organisationTemps quand l’autre engagement est « non » ou inconnu', () => {
    expect(getMissingKeys({ ...COMPLETE, organisationTemps: '-' })).toEqual([]);
    expect(getMissingKeys({ ...COMPLETE, autreEngagement: '-', organisationTemps: '-' })).toEqual(['autreEngagement']);
  });

  it('demande organisationTemps quand l’autre engagement est « oui » sans détail', () => {
    expect(getMissingKeys({ ...COMPLETE, autreEngagement: 'oui', organisationTemps: '-' })).toEqual([
      'organisationTemps',
    ]);
  });

  it('ne demande jamais le département', () => {
    expect(getMissingKeys({ ...COMPLETE, departement: undefined, departements: [] })).toEqual([]);
  });
});

describe('validateComplement', () => {
  it('accepte des réponses valides pour les champs manquants', () => {
    expect(validateComplement({ telephone: '20123456', filiere: 'GE' }, ['telephone', 'filiere'])).toEqual({
      ok: true,
      values: { telephone: '20123456', filiere: 'GE' },
    });
  });

  it('ignore les champs vides (l’aide est facultative)', () => {
    expect(validateComplement({ telephone: '  ', filiere: '' }, ['telephone', 'filiere'])).toEqual({
      ok: true,
      values: {},
    });
  });

  it('ignore les champs qui ne manquent pas : une donnée présente n’est jamais écrasée', () => {
    expect(validateComplement({ telephone: '20123456', filiere: 'GE' }, ['telephone'])).toEqual({
      ok: true,
      values: { telephone: '20123456' },
    });
  });

  it('ignore les clés inconnues, dont le département et l’e-mail', () => {
    expect(
      validateComplement({ departement: 'it', email: 'x@y.z', nomPrenom: 'Autre Nom' }, ['telephone']),
    ).toEqual({ ok: true, values: {} });
  });

  it('rejette une valeur hors liste ou mal formée, avec le message du formulaire', () => {
    const res = validateComplement({ telephone: '123', filiere: 'XX' }, ['telephone', 'filiere']);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(Object.keys(res.errors).sort()).toEqual(['filiere', 'telephone']);
  });

  it('applique les longueurs du formulaire public', () => {
    expect(validateComplement({ motivation: 'abc' }, ['motivation']).ok).toBe(false);
    expect(validateComplement({ motivation: 'x'.repeat(401) }, ['motivation']).ok).toBe(false);
    expect(validateComplement({ motivation: 'x'.repeat(400) }, ['motivation']).ok).toBe(true);
  });
});