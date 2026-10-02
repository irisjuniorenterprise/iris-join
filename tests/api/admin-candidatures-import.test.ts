// POST /api/admin/candidatures/import — formats « modèle » et « registre ».
import ExcelJS from 'exceljs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readJson } from '../helpers/http';
import { snapshot } from '../helpers/fake-db';
import { EXPECTED_HEADERS } from '@/lib/candidature-excel';
import { IMPORT_COLUMNS, IMPORT_SHEET_NAME } from '@/lib/candidature-import';

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getAdminDb: vi.fn(),
  sendCandidatureConfirmation: vi.fn(),
}));

vi.mock('@/lib/admin-auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/admin-auth')>('@/lib/admin-auth');
  return { ...actual, requireAdmin: mocks.requireAdmin };
});
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: mocks.getAdminDb, getAdminAuth: vi.fn() }));
vi.mock('@/lib/email', () => ({ sendCandidatureConfirmation: mocks.sendCandidatureConfirmation }));

import { POST } from '@/app/api/admin/candidatures/import/route';

type Cell = string | number | Date | null;
type Written = Record<string, unknown>;

/** Faux Firestore avec lots d'écriture : on capture les documents créés. */
function makeDb(existingEmails: string[] = []) {
  const written: Written[] = [];
  const db = {
    collection: () => ({
      select: () => ({ get: async () => snapshot(existingEmails.map((email) => ({ email }))) }),
      doc: () => ({ id: `doc${written.length}` }),
    }),
    batch: () => {
      const pending: Written[] = [];
      return {
        set: (_ref: unknown, data: Written) => void pending.push(data),
        commit: async () => void written.push(...pending),
      };
    },
  };
  return { db, written };
}

/** Classeur « registre » : feuille de garde + données à en-tête ligne 20, colonne E. */
async function registreFile(rows: Cell[][], name = 'Candidats-2027.xlsx'): Promise<File> {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet(' Avant-propos ').getCell('C2').value = 'Registre des Candidats';
  const ws = wb.addWorksheet('Base de données candidats');
  EXPECTED_HEADERS.forEach((h, i) => (ws.getRow(20).getCell(5 + i).value = h));
  rows.forEach((cells, r) =>
    cells.forEach((v, c) => {
      if (v !== null) ws.getRow(21 + r).getCell(5 + c).value = v;
    }),
  );
  return new File([await wb.xlsx.writeBuffer()], name);
}

/** Classeur « modèle » : en-têtes en ligne 1, feuille « Candidatures ». */
async function modeleFile(): Promise<File> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(IMPORT_SHEET_NAME);
  IMPORT_COLUMNS.forEach((c, i) => (ws.getRow(1).getCell(i + 1).value = c.header));
  const values: Record<string, string> = {
    'Nom et prénom': 'Ali Ben Salah',
    'E-mail': 'ali@gmail.com',
    Téléphone: '22123456',
    Filière: 'GI',
    "Niveau d'études": '2e année',
    'Départements (par ordre de préférence)': 'IT, Marketing',
    'Comment avez-vous connu IRIS': 'Réseaux sociaux',
    'Niveau en français': 'Avancé',
    'Niveau en anglais': 'Courant',
    'Participation aux formations': 'Oui, systématiquement',
    'Autre engagement': 'Non',
    Motivation: 'Je veux apprendre',
    'Domaine à développer': 'Web',
  };
  IMPORT_COLUMNS.forEach((c, i) => {
    if (values[c.header]) ws.getRow(2).getCell(i + 1).value = values[c.header];
  });
  return new File([await wb.xlsx.writeBuffer()], 'modele.xlsx');
}

function post(file: File, fields: Record<string, string> = {}): Promise<Response> {
  const form = new FormData();
  form.set('file', file);
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return POST(new Request('http://localhost/api/admin/candidatures/import', { method: 'POST', body: form }));
}

// Prénom, Nom, CIN, E-mail, Tél, Naissance, Adresse, Niveau, Nationalité, Département
const IT_OK: Cell[] = ['ayoub', 'HADDED', 13517883, 'ayoub.hadded@enis.tn', 54513418, new Date(Date.UTC(2003, 2, 16)), 'sfax', 'ge2', null, 'IT'];
const ETUDE_OK: Cell[] = ['chahd', 'khedir', null, 'chahd@enis.tn', 51487489, null, null, 'GB1', null, 'ÉTUDE'];
const NO_DEPT: Cell[] = ['sewar', 'chaibi', null, ' Chaibisewar@Gmail,com', 97662062, null, null, 'GMMI1', null, null];
const NO_MAIL: Cell[] = ['sarra', 'saidani', 11474953, null, null, null, null, null, null, null];

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireAdmin.mockResolvedValue({ ok: true, email: 'admin@iris.tn' });
  mocks.sendCandidatureConfirmation.mockResolvedValue(undefined);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('POST /api/admin/candidatures/import — format registre', () => {
  it('valide à blanc (dryRun) et rapporte chaque ligne sans rien écrire', async () => {
    const { db, written } = makeDb();
    mocks.getAdminDb.mockReturnValue(db);

    const res = await post(await registreFile([IT_OK, ETUDE_OK, NO_DEPT, NO_MAIL]), { dryRun: 'true' });
    expect(res.status).toBe(200);
    const body = await readJson<any>(res);

    expect(body).toMatchObject({ ok: true, dryRun: true, format: 'registre', total: 4, valid: 2, errors: 2, duplicates: 0 });
    const byLine = Object.fromEntries(body.rows.map((r: any) => [r.line, r]));
    expect(byLine[21]).toMatchObject({ status: 'ok', email: 'ayoub.hadded@enis.tn', nomPrenom: 'Ayoub Hadded' });
    expect(byLine[22]).toMatchObject({ status: 'ok' });
    expect(byLine[23].status).toBe('error');
    expect(byLine[23].errors.join('|')).toMatch(/Département/);
    expect(byLine[24]).toMatchObject({ status: 'error', errors: ['E-mail manquant'] });
    expect(written).toHaveLength(0);
  });

  it('exige le consentement pour importer pour de bon', async () => {
    mocks.getAdminDb.mockReturnValue(makeDb().db);
    const res = await post(await registreFile([IT_OK]));
    expect(res.status).toBe(400);
    expect((await readJson<any>(res)).message).toMatch(/consentement/);
  });

  it('écrit les champs du registre, des tirets pour le reste, avec traçabilité', async () => {
    const { db, written } = makeDb();
    mocks.getAdminDb.mockReturnValue(db);

    const res = await post(await registreFile([IT_OK, ETUDE_OK, NO_DEPT]), { consent: 'true' });
    const body = await readJson<any>(res);
    expect(body).toMatchObject({ ok: true, dryRun: false, created: 2, errors: 1 });

    expect(written).toHaveLength(2);
    expect(written[0]).toMatchObject({
      nomPrenom: 'Ayoub Hadded',
      email: 'ayoub.hadded@enis.tn',
      telephone: '54513418',
      cin: '13517883',
      dateNaissance: '2003-03-16',
      adresse: 'Sfax',
      filiere: 'GE',
      niveauEtudes: '2e année',
      departement: 'it',
      departements: ['it'],
      consentement: true,
      source: 'import-registre',
      importedBy: 'admin@iris.tn',
      // Absent du registre → tirets (jamais de valeur inventée).
      nationalite: '-',
      motivation: '-',
      niveauFrancais: '-',
      sourceConnaissance: '-',
      autreEngagement: '-',
      remarques: '-',
    });
    // Champs absents de la ligne « ÉTUDE » : tirets.
    expect(written[1]).toMatchObject({
      departement: 'etudes',
      filiere: 'GB',
      niveauEtudes: '1re année',
      cin: '-',
      dateNaissance: '-',
      adresse: '-',
    });
    expect(mocks.sendCandidatureConfirmation).not.toHaveBeenCalled();
  });

  it('signale les e-mails déjà candidats et ne les réécrit pas', async () => {
    const { db, written } = makeDb(['AYOUB.HADDED@enis.tn']);
    mocks.getAdminDb.mockReturnValue(db);

    const res = await post(await registreFile([IT_OK, ETUDE_OK]), { consent: 'true' });
    const body = await readJson<any>(res);
    expect(body).toMatchObject({ created: 1, duplicates: 1 });
    expect(body.rows.find((r: any) => r.line === 21)).toMatchObject({
      status: 'duplicate',
      errors: ['Une candidature existe déjà avec cet e-mail.'],
    });
    expect(written).toHaveLength(1);
    expect(written[0].email).toBe('chahd@enis.tn');
  });

  it('allowNoDepartment importe les candidats sans département, sans clé « departement »', async () => {
    const { db, written } = makeDb();
    mocks.getAdminDb.mockReturnValue(db);

    const res = await post(await registreFile([IT_OK, NO_DEPT]), { consent: 'true', allowNoDepartment: 'true' });
    const body = await readJson<any>(res);
    expect(body).toMatchObject({ created: 2, errors: 0 });

    const sewar = written.find((d) => d.email === 'chaibisewar@gmail.com');
    expect(sewar).toBeDefined();
    expect(sewar).not.toHaveProperty('departement');
    expect(sewar?.departements).toEqual([]);
  });

  it('envoie la confirmation seulement aux candidats ayant un département', async () => {
    const { db } = makeDb();
    mocks.getAdminDb.mockReturnValue(db);

    const res = await post(await registreFile([IT_OK, NO_DEPT]), {
      consent: 'true',
      notify: 'true',
      allowNoDepartment: 'true',
    });
    expect((await readJson<any>(res)).emailsSent).toBe(1);
    expect(mocks.sendCandidatureConfirmation).toHaveBeenCalledTimes(1);
    expect(mocks.sendCandidatureConfirmation).toHaveBeenCalledWith('ayoub.hadded@enis.tn', 'Ayoub Hadded', 'IT');
  });
});

describe('POST /api/admin/candidatures/import — modèle et erreurs', () => {
  it('continue de lire le modèle (en-têtes en ligne 1)', async () => {
    const { db, written } = makeDb();
    mocks.getAdminDb.mockReturnValue(db);

    const res = await post(await modeleFile(), { consent: 'true' });
    const body = await readJson<any>(res);
    expect(body).toMatchObject({ ok: true, format: 'modele', created: 1 });
    expect(written[0]).toMatchObject({
      nomPrenom: 'Ali Ben Salah',
      email: 'ali@gmail.com',
      departement: 'it',
      departements: ['it', 'marketing'],
      motivation: 'Je veux apprendre',
      source: 'import-admin',
      importedBy: 'admin@iris.tn',
    });
  });

  it('refuse un fichier sans colonnes reconnues, en expliquant les deux formats', async () => {
    mocks.getAdminDb.mockReturnValue(makeDb().db);
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('Feuille1').getRow(1).getCell(1).value = 'Truc';
    const res = await post(new File([await wb.xlsx.writeBuffer()], 'autre.xlsx'), { dryRun: 'true' });
    expect(res.status).toBe(400);
    const { message } = await readJson<{ message: string }>(res);
    expect(message).toMatch(/En-têtes introuvables/);
    expect(message).toMatch(/Prénom, Nom, CIN, E-mail/);
    expect(message).toMatch(/modèle/);
  });

  it('refuse un fichier qui n’est pas un .xlsx', async () => {
    mocks.getAdminDb.mockReturnValue(makeDb().db);
    const res = await post(new File(['a;b'], 'candidats.csv'), { dryRun: 'true' });
    expect(res.status).toBe(400);
  });

  it('refuse un non-admin', async () => {
    mocks.requireAdmin.mockResolvedValue({ ok: false, status: 403, message: 'Accès refusé.' });
    const res = await post(await registreFile([IT_OK]), { dryRun: 'true' });
    expect(res.status).toBe(403);
  });
});