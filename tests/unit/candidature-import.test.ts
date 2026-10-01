// tests/unit/candidature-import.test.ts
import { describe, expect, it } from 'vitest';
import { mapHeaders, parseImportRow, IMPORT_COLUMNS } from '@/lib/candidature-import';

const valid = {
  nomPrenom: 'Ali Ben Salah',
  email: 'Ali@Gmail.com',
  telephone: '+216 22 123 456',
  filiere: 'gi',
  niveauEtudes: '2',
  departements: 'IT, Dev-Co',
  sourceConnaissance: "Un membre d'IRIS",
  niveauFrancais: 'avancé',
  niveauAnglais: 'Courant',
  participationFormations: 'Oui, systématiquement',
  autreEngagement: 'non',
  organisationTemps: '',
  motivation: 'Je veux apprendre',
  domaine: 'Web',
  remarques: '',
};

describe('parseImportRow', () => {
  it('normalise et accepte une ligne valide', () => {
    const r = parseImportRow(valid);
    expect(r.errors).toEqual([]);
    expect(r.email).toBe('ali@gmail.com');
    expect(r.data?.telephone).toBe('22123456');
    expect(r.data?.filiere).toBe('GI');
    expect(r.data?.niveauEtudes).toBe('2e année');
    expect(r.data?.departements).toEqual(['it', 'dev-co']);
  });

  it('signale les erreurs par colonne', () => {
    const r = parseImportRow({ ...valid, email: 'x', filiere: 'zz', departements: 'Robotique' });
    expect(r.data).toBeNull();
    expect(r.errors.join('|')).toMatch(/E-mail/);
    expect(r.errors.join('|')).toMatch(/Filière/);
    expect(r.errors.join('|')).toMatch(/Départements/);
  });

  it('exige l’organisation du temps si autre engagement = oui', () => {
    const r = parseImportRow({ ...valid, autreEngagement: 'Oui' });
    expect(r.data).toBeNull();
    expect(r.errors.join('|')).toMatch(/Organisation du temps/);
  });
});

describe('mapHeaders', () => {
  it('reconnaît le modèle et détecte les colonnes manquantes', () => {
    const headers = IMPORT_COLUMNS.map((c) => c.header);
    expect(mapHeaders(headers).missing).toEqual([]);
    expect(mapHeaders(headers.slice(2)).missing.length).toBe(2);
  });
});