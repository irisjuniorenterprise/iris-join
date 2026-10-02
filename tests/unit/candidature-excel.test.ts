import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import {
  EXPECTED_HEADERS,
  ExcelImportError,
  parseCandidatesWorkbook,
} from '@/lib/candidature-excel';

type Cell = string | number | Date | null;

/** Classeur en mémoire : une feuille de garde + une feuille de données à en-tête décalé. */
async function buildWorkbook(opts: {
  headers?: readonly string[];
  headerRow?: number;
  firstCol?: number;
  rows: Cell[][];
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const cover = wb.addWorksheet(' Avant-propos ');
  cover.getCell('C2').value = 'Registre des Candidats';

  const ws = wb.addWorksheet('Base de données candidats');
  ws.getCell('C2').value = 'Registre des candidats';
  const headerRow = opts.headerRow ?? 20;
  const firstCol = opts.firstCol ?? 5; // colonne E, comme le registre IRIS JE
  (opts.headers ?? EXPECTED_HEADERS).forEach((h, i) => {
    ws.getRow(headerRow).getCell(firstCol + i).value = h;
  });
  opts.rows.forEach((cells, r) => {
    cells.forEach((v, c) => {
      if (v !== null) ws.getRow(headerRow + 1 + r).getCell(firstCol + c).value = v;
    });
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// Prénom, Nom, CIN, E-mail, Tél, Naissance, Adresse, Niveau, Nationalité, Département
const GOOD: Cell[] = [
  'chahd', 'KHEDIR', 11181390, 'chahd.khedir@enis.tn', 23856567,
  new Date(Date.UTC(2003, 10, 29)), 'sfax', 'GB2', null, 'IT',
];

describe('parseCandidatesWorkbook — structure', () => {
  it("détecte l'en-tête décalé (ligne 20, colonne E) et ignore la feuille de garde", async () => {
    const res = await parseCandidatesWorkbook(await buildWorkbook({ rows: [GOOD] }));
    expect(res.sheetName).toBe('Base de données candidats');
    expect(res.headerRow).toBe(20);
    expect(res.columns.prenom).toBe(5);
    expect(res.columns.departement).toBe(14);
    expect(res.rows).toHaveLength(1);
  });

  it("accepte des en-têtes dans un autre ordre, sans accents ni casse", async () => {
    const buf = await buildWorkbook({
      headerRow: 1,
      firstCol: 1,
      headers: ['EMAIL', 'prenom', 'NOM', 'telephone', 'departement'],
      rows: [['a.b@gmail.com', 'ali', 'ben salah', 29668698, 'Marketing']],
    });
    const { rows } = await parseCandidatesWorkbook(buf);
    expect(rows[0]).toMatchObject({
      email: 'a.b@gmail.com',
      nomPrenom: 'Ali Ben Salah',
      telephone: '29668698',
      departement: 'marketing',
      cin: null,
    });
  });

  it("refuse un fichier sans les colonnes minimales, avec un message lisible", async () => {
    const buf = await buildWorkbook({ headers: ['Foo', 'Bar'], rows: [['x', 'y']] });
    await expect(parseCandidatesWorkbook(buf)).rejects.toThrow(ExcelImportError);
    await expect(parseCandidatesWorkbook(buf)).rejects.toThrow(/En-têtes introuvables/);
  });

  it('refuse un fichier qui n\'est pas un .xlsx', async () => {
    await expect(parseCandidatesWorkbook(Buffer.from('pas un excel'))).rejects.toThrow(/illisible/);
  });
});

describe('parseCandidatesWorkbook — nettoyage', () => {
  it('normalise une ligne propre sans aucun avertissement', async () => {
    const { rows } = await parseCandidatesWorkbook(await buildWorkbook({ rows: [GOOD] }));
    expect(rows[0]).toMatchObject({
      excelRow: 21,
      prenom: 'Chahd',
      nom: 'Khedir',
      nomPrenom: 'Chahd Khedir',
      cin: '11181390',
      email: 'chahd.khedir@enis.tn',
      telephone: '23856567',
      dateNaissance: '2003-11-29',
      adresse: 'Sfax',
      filiere: 'GB',
      niveauEtudes: '2e année',
      niveauEtudeBrut: 'GB2',
      nationalite: null,
      departement: 'it',
    });
    // La nationalité vide du registre ne produit pas d'avertissement.
    expect(rows[0].warnings).toEqual([]);
  });

  it('corrige les e-mails (virgule, faute de domaine, espaces, majuscules)', async () => {
    const mk = (email: string): Cell[] => ['a', 'b', null, email, 22222222, null, null, 'GI1', null, 'IT'];
    const { rows } = await parseCandidatesWorkbook(
      await buildWorkbook({
        rows: [
          mk('farah@gmail,com'),
          mk('wiem@gmai.com'),
          mk(' chaibisewar@gmail.com'),
          mk('Hiba2@Gmail.com'),
        ],
      }),
    );
    expect(rows.map((r) => r.email)).toEqual([
      'farah@gmail.com',
      'wiem@gmail.com',
      'chaibisewar@gmail.com',
      'hiba2@gmail.com',
    ]);
    expect(rows[0].warnings.some((w) => w.startsWith('E-mail corrigé'))).toBe(true);
    expect(rows[1].warnings.some((w) => w.startsWith('E-mail corrigé'))).toBe(true);
    // Espaces / majuscules : correction silencieuse.
    expect(rows[2].warnings.some((w) => w.startsWith('E-mail corrigé'))).toBe(false);
    expect(rows[3].warnings.some((w) => w.startsWith('E-mail corrigé'))).toBe(false);
  });

  it('gère CIN et téléphone : nombres Excel, tirets, indicatif, zéro de tête perdu', async () => {
    const mk = (cin: Cell, tel: Cell, email: string): Cell[] =>
      ['a', 'b', cin, email, tel, null, null, 'GI1', null, 'IT'];
    const { rows } = await parseCandidatesWorkbook(
      await buildWorkbook({
        rows: [
          mk('--', '+216 23 856 567', 'a1@x.tn'),
          mk(1234567, '12 345', 'a2@x.tn'),
          mk('-', null, 'a3@x.tn'),
        ],
      }),
    );
    expect(rows[0].cin).toBeNull();
    expect(rows[0].telephone).toBe('23856567');
    expect(rows[1].cin).toBe('01234567');
    expect(rows[1].telephone).toBeNull();
    expect(rows[1].warnings.join('|')).toMatch(/Téléphone invalide/);
    expect(rows[2].warnings).toEqual(expect.arrayContaining(['CIN manquant', 'Téléphone manquant']));
  });

  it('lit les dates : vraie date, jj/mm/aaaa, nombre collé (4012006), tiret, invraisemblable', async () => {
    const mk = (d: Cell, email: string): Cell[] => ['a', 'b', null, email, 22222222, d, null, 'GI1', null, 'IT'];
    const { rows } = await parseCandidatesWorkbook(
      await buildWorkbook({
        rows: [
          mk(new Date(Date.UTC(2005, 2, 18)), 'd1@x.tn'),
          mk('18/03/2005', 'd2@x.tn'),
          mk(4012006, 'd3@x.tn'),
          mk('-', 'd4@x.tn'),
          mk('31/02/2005', 'd5@x.tn'),
        ],
      }),
    );
    expect(rows.map((r) => r.dateNaissance)).toEqual([
      '2005-03-18',
      '2005-03-18',
      '2006-01-04',
      null,
      null,
    ]);
    expect(rows[2].warnings.join('|')).toMatch(/reconstituée/);
    expect(rows[3].warnings).toContain('Date de naissance manquante');
    expect(rows[4].warnings.join('|')).toMatch(/illisible/);
  });

  it("découpe « Niveau d'étude » en filière + année", async () => {
    const mk = (lvl: string, email: string): Cell[] => ['a', 'b', null, email, 22222222, null, null, lvl, null, 'IT'];
    const { rows } = await parseCandidatesWorkbook(
      await buildWorkbook({
        rows: [mk('ge2', 'l1@x.tn'), mk('GMMI1', 'l2@x.tn'), mk('GEM1 ', 'l3@x.tn'), mk('GE', 'l4@x.tn'), mk('XYZ3', 'l5@x.tn')],
      }),
    );
    expect(rows.map((r) => [r.filiere, r.niveauEtudes])).toEqual([
      ['GE', '2e année'],
      ['GMMI', '1re année'],
      ['GEM', '1re année'],
      ['GE', null],
      [null, '3e année'],
    ]);
    expect(rows[3].warnings.join('|')).toMatch(/année non précisée/);
    expect(rows[4].warnings.join('|')).toMatch(/filière non reconnue/);
  });

  it('reconnaît les départements du registre (IT, ÉTUDE, Dev Co, Marketing) et signale le reste', async () => {
    const mk = (dept: Cell, email: string): Cell[] => ['a', 'b', null, email, 22222222, null, null, 'GI1', null, dept];
    const { rows } = await parseCandidatesWorkbook(
      await buildWorkbook({
        rows: [mk('IT', 'p1@x.tn'), mk('ÉTUDE', 'p2@x.tn'), mk('Dev Co', 'p3@x.tn'), mk('Marketing', 'p4@x.tn'), mk(null, 'p5@x.tn'), mk('RH', 'p6@x.tn')],
      }),
    );
    expect(rows.map((r) => r.departement)).toEqual(['it', 'etudes', 'dev-co', 'marketing', null, null]);
    expect(rows[4].warnings).toContain('Département manquant');
    expect(rows[5].warnings.join('|')).toMatch(/Département inconnu/);
  });
});

describe('parseCandidatesWorkbook — lignes écartées', () => {
  it('écarte sans e-mail valide ou en doublon, ignore les lignes vides', async () => {
    const mk = (email: Cell, p = 'a'): Cell[] => [p, 'b', null, email, 22222222, null, null, 'GI1', null, 'IT'];
    const res = await parseCandidatesWorkbook(
      await buildWorkbook({
        rows: [
          mk('ok@x.tn'),
          mk(null, 'sarra'),
          [null, null, null, null, null, null, null, null, null, null],
          mk('pas-un-email'),
          mk('OK@x.tn'),
        ],
      }),
    );
    expect(res.rows.map((r) => r.email)).toEqual(['ok@x.tn']);
    expect(res.skipped.map((s) => s.reason)).toEqual([
      'E-mail manquant',
      'E-mail invalide (« pas-un-email »)',
      'Doublon dans le fichier (même e-mail)',
    ]);
    expect(res.totalRead).toBe(4);
    expect(res.skipped[0].excelRow).toBe(22);
  });
});