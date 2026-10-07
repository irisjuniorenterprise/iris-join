// POST /api/admin/candidatures/import — sélection de lignes et corrections de l'admin.
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

/** Registre : en-têtes en ligne 20 (colonne E) → premières données en ligne 21. */
async function registreFile(rows: Cell[][], headers: readonly string[] = EXPECTED_HEADERS): Promise<File> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Base de données candidats');
  headers.forEach((h, i) => (ws.getRow(20).getCell(5 + i).value = h));
  rows.forEach((cells, r) =>
    cells.forEach((v, c) => {
      if (v !== null) ws.getRow(21 + r).getCell(5 + c).value = v;
    }),
  );
  return new File([await wb.xlsx.writeBuffer()], 'Candidats.xlsx');
}

async function modeleFile(email: string): Promise<File> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(IMPORT_SHEET_NAME);
  IMPORT_COLUMNS.forEach((c, i) => (ws.getRow(1).getCell(i + 1).value = c.header));
  const values: Record<string, string> = {
    'Nom et prénom': 'Ali Ben Salah',
    'E-mail': email,
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
const ROW_A: Cell[] = ['ayoub', 'hadded', 13517883, 'ayoub@enis.tn', 54513418, null, 'sfax', 'ge2', null, 'IT'];
const ROW_B: Cell[] = ['chahd', 'khedir', null, 'chahd@enis.tn', 51487489, null, null, 'GB1', null, 'Marketing'];
const BAD_MAIL: Cell[] = ['sewar', 'chaibi', null, 'sewar.chaibi', 97662062, null, null, 'GMMI1', null, 'IT'];

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireAdmin.mockResolvedValue({ ok: true, email: 'admin@iris.tn' });
  mocks.sendCandidatureConfirmation.mockResolvedValue(undefined);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('import — champs éditables renvoyés au rapport', () => {
  it('renvoie la définition des champs et les valeurs de chaque ligne (registre)', async () => {
    mocks.getAdminDb.mockReturnValue(makeDb().db);
    const res = await post(await registreFile([ROW_A, BAD_MAIL]), { dryRun: 'true' });
    const body = await readJson<any>(res);

    expect(body.fields.map((f: any) => f.key)).toContain('email');
    const bad = body.rows.find((r: any) => r.line === 22);
    expect(bad.status).toBe('error');
    expect(bad.fields).toMatchObject({ prenom: 'sewar', email: 'sewar.chaibi', telephone: '97662062' });
    expect(bad.corrected).toEqual([]);
  });
});

describe('import — corrections de l’admin (registre)', () => {
  it('un e-mail invalide corrigé rend la ligne importable', async () => {
    mocks.getAdminDb.mockReturnValue(makeDb().db);
    const overrides = JSON.stringify({ 22: { email: 'sewar.chaibi@gmail.com' } });
    const res = await post(await registreFile([ROW_A, BAD_MAIL]), { dryRun: 'true', overrides });
    const body = await readJson<any>(res);

    expect(body).toMatchObject({ total: 2, valid: 2, errors: 0 });
    const fixed = body.rows.find((r: any) => r.line === 22);
    expect(fixed).toMatchObject({ status: 'ok', email: 'sewar.chaibi@gmail.com', corrected: ['email'] });
    expect(fixed.fields.email).toBe('sewar.chaibi@gmail.com');
  });

  it('ajoute un département quand le fichier n’a pas la colonne', async () => {
    mocks.getAdminDb.mockReturnValue(makeDb().db);
    const headers = EXPECTED_HEADERS.filter((h) => h !== 'Département');
    const row: Cell[] = ['ayoub', 'hadded', null, 'ayoub@enis.tn', 54513418, null, null, 'ge2', null];

    const sans = await readJson<any>(await post(await registreFile([row], headers), { dryRun: 'true' }));
    expect(sans.rows[0].status).toBe('error');

    const overrides = JSON.stringify({ 21: { departement: 'Marketing' } });
    const avec = await readJson<any>(await post(await registreFile([row], headers), { dryRun: 'true', overrides }));
    expect(avec.rows[0]).toMatchObject({ status: 'ok', corrected: ['departement'] });
  });

  it('ignore les champs inconnus et les lignes hors tableau', async () => {
    mocks.getAdminDb.mockReturnValue(makeDb().db);
    const overrides = JSON.stringify({ 21: { nimporte: 'x' }, 999: { email: 'a@b.tn' } });
    const body = await readJson<any>(await post(await registreFile([ROW_A]), { dryRun: 'true', overrides }));
    expect(body).toMatchObject({ total: 1, valid: 1 });
    expect(body.rows[0].corrected).toEqual([]);
  });
});

describe('import — corrections de l’admin (modèle)', () => {
  it('corrige un e-mail invalide du modèle', async () => {
    mocks.getAdminDb.mockReturnValue(makeDb().db);
    const sans = await readJson<any>(await post(await modeleFile('ali@gmail'), { dryRun: 'true' }));
    expect(sans).toMatchObject({ format: 'modele', valid: 0, errors: 1 });

    const overrides = JSON.stringify({ 2: { email: 'Ali@Gmail.com' } });
    const avec = await readJson<any>(await post(await modeleFile('ali@gmail'), { dryRun: 'true', overrides }));
    expect(avec.rows[0]).toMatchObject({ status: 'ok', email: 'ali@gmail.com', corrected: ['email'] });
  });
});

describe('import — sélection des lignes', () => {
  it('n’enregistre que la ligne choisie, avec la trace des corrections', async () => {
    const { db, written } = makeDb();
    mocks.getAdminDb.mockReturnValue(db);

    const res = await post(await registreFile([ROW_A, ROW_B, BAD_MAIL]), {
      consent: 'true',
      notify: 'true',
      selected: JSON.stringify([22]),
      overrides: JSON.stringify({ 22: { email: 'chahd.khedir@gmail.com' } }),
    });
    const body = await readJson<any>(res);

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ dryRun: false, created: 1, notSelected: 1, emailsSent: 1 });
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({
      email: 'chahd.khedir@gmail.com',
      importedBy: 'admin@iris.tn',
      importCorrectedFields: ['email'],
    });
    expect(mocks.sendCandidatureConfirmation).toHaveBeenCalledTimes(1);
  });

  it('sans sélection : toutes les lignes valides (comportement historique)', async () => {
    const { db, written } = makeDb();
    mocks.getAdminDb.mockReturnValue(db);
    const body = await readJson<any>(await post(await registreFile([ROW_A, ROW_B, BAD_MAIL]), { consent: 'true' }));
    expect(body).toMatchObject({ created: 2, notSelected: 0 });
    expect(written.every((w) => !('importCorrectedFields' in w))).toBe(true);
  });

  it('refuse une sélection vide, ou ne contenant aucune ligne valide', async () => {
    const { db, written } = makeDb();
    mocks.getAdminDb.mockReturnValue(db);

    for (const selected of ['[]', '[22]']) {
      const res = await post(await registreFile([ROW_A, BAD_MAIL]), { consent: 'true', selected });
      expect(res.status).toBe(400);
    }
    expect(written).toHaveLength(0);
  });

  it('la sélection est ignorée à l’analyse à blanc', async () => {
    mocks.getAdminDb.mockReturnValue(makeDb().db);
    const body = await readJson<any>(
      await post(await registreFile([ROW_A, ROW_B]), { dryRun: 'true', selected: '[21]' }),
    );
    expect(body.valid).toBe(2);
  });
});

describe('import — entrées invalides', () => {
  it.each([
    ['selected', 'pas du json'],
    ['selected', '{"a":1}'],
    ['selected', '["x"]'],
    ['overrides', '[1,2]'],
    ['overrides', '{"abc":{"email":"x"}}'],
    ['overrides', '{"21":{"email":42}}'],
  ])('%s = %s → 400', async (field, value) => {
    mocks.getAdminDb.mockReturnValue(makeDb().db);
    const res = await post(await registreFile([ROW_A]), { dryRun: 'true', [field]: value });
    expect(res.status).toBe(400);
  });
});