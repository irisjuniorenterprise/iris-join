// tests/unit/candidature-import.test.ts
import { describe, expect, it } from 'vitest';
import {
  IMPORT_COLUMNS,
  MISSING_VALUE,
  buildRegistreCandidature,
  mapHeaders,
  parseImportRow,
} from '@/lib/candidature-import';
import type { ImportedCandidate } from '@/lib/candidature-excel';

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

/* ------------------------------------------------------------------ */
/* Format « registre »                                                  */
/* ------------------------------------------------------------------ */

function candidate(overrides: Partial<ImportedCandidate> = {}): ImportedCandidate {
  return {
    excelRow: 21,
    prenom: 'Ayoub',
    nom: 'Hadded',
    nomPrenom: 'Ayoub Hadded',
    cin: '13517883',
    email: 'ayoub.hadded@enis.tn',
    telephone: '54513418',
    dateNaissance: '2003-03-16',
    adresse: 'Sfax',
    filiere: 'GE',
    niveauEtudes: '2e année',
    niveauEtudeBrut: 'ge2',
    nationalite: null,
    departement: 'it',
    warnings: [],
    ...overrides,
  };
}

describe('buildRegistreCandidature', () => {
  const DASH_FIELDS = [
    'sourceConnaissance',
    'niveauFrancais',
    'niveauAnglais',
    'participationFormations',
    'autreEngagement',
    'organisationTemps',
    'motivation',
    'domaine',
    'remarques',
  ] as const;

  it('reprend le registre et remplace par des tirets tout ce qui est absent', () => {
    const row = buildRegistreCandidature(candidate());
    expect(row.errors).toEqual([]);
    expect(row.email).toBe('ayoub.hadded@enis.tn');
    expect(row.data).toMatchObject({
      nomPrenom: 'Ayoub Hadded',
      telephone: '54513418',
      filiere: 'GE',
      niveauEtudes: '2e année',
      departement: 'it',
      departements: ['it'],
      cin: '13517883',
      dateNaissance: '2003-03-16',
      adresse: 'Sfax',
      // Nationalité vide dans le registre → tiret.
      nationalite: MISSING_VALUE,
    });
    // Questionnaire du formulaire : jamais inventé, toujours un tiret.
    for (const field of DASH_FIELDS) expect(row.data?.[field]).toBe(MISSING_VALUE);
  });

  it('met un tiret pour chaque donnée personnelle absente, sans bloquer la ligne', () => {
    const row = buildRegistreCandidature(
      candidate({ cin: null, telephone: null, dateNaissance: null, adresse: null, filiere: null, niveauEtudes: null }),
    );
    expect(row.errors).toEqual([]);
    expect(row.data).toMatchObject({
      cin: MISSING_VALUE,
      telephone: MISSING_VALUE,
      dateNaissance: MISSING_VALUE,
      adresse: MISSING_VALUE,
      filiere: MISSING_VALUE,
      niveauEtudes: MISSING_VALUE,
      departement: 'it',
    });
  });

  it('rejette un candidat sans département par défaut (il serait bloqué à la réservation)', () => {
    const row = buildRegistreCandidature(
      candidate({ departement: null, warnings: ['Département manquant', 'CIN manquant'] }),
    );
    expect(row.data).toBeNull();
    expect(row.errors.join('|')).toMatch(/Département : manquant ou inconnu/);
    // L'avertissement équivalent est retiré, les autres restent.
    expect(row.warnings).toEqual(['CIN manquant']);
  });

  it('accepte un candidat sans département avec allowNoDepartment : jamais de tiret dans « departement »', () => {
    const row = buildRegistreCandidature(
      candidate({ departement: null, warnings: ['Département manquant'] }),
      { allowNoDepartment: true },
    );
    expect(row.errors).toEqual([]);
    expect(row.data?.departements).toEqual([]);
    // Un tiret serait lu comme un département invalide par le système de créneaux.
    expect(row.data).not.toHaveProperty('departement');
    expect(row.warnings).toEqual(['Département manquant']);
  });

  it('applique les règles du formulaire public au nom (caractères interdits, longueur)', () => {
    const bad = buildRegistreCandidature(candidate({ nomPrenom: 'Ali <script>' }));
    expect(bad.data).toBeNull();
    expect(bad.errors.join('|')).toMatch(/Nom et prénom/);

    const short = buildRegistreCandidature(candidate({ prenom: '', nom: 'Al', nomPrenom: 'Al' }));
    expect(short.data).toBeNull();
    expect(short.errors.join('|')).toMatch(/Nom et prénom/);
  });
});