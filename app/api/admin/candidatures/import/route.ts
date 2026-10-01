// app/api/admin/candidatures/import/route.ts
//
// Import en masse de candidatures depuis un fichier Excel (.xlsx).
//   GET  → télécharge le modèle Excel (menus déroulants inclus).
//   POST → multipart/form-data { file, consent, dryRun?, notify? }
//          dryRun=true : valide seulement et renvoie le rapport ligne par ligne.
//          sinon       : enregistre les lignes valides.
// Réservé aux administrateurs (ADMIN_EMAILS). Les mêmes règles que le
// formulaire public s'appliquent (lib/candidature.ts) et la règle « une
// candidature par e-mail » est respectée.
import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { getAdminDb } from '@/lib/firebase-admin';
import { denyResponse, requireAdmin } from '@/lib/admin-auth';
import { sendCandidatureConfirmation } from '@/lib/email';
import { DEPARTMENT_LABELS } from '@/lib/interview';
import { departementPrincipal } from '@/lib/candidature';
import {
  IMPORT_COLUMNS,
  IMPORT_MAX_FILE_BYTES,
  IMPORT_MAX_ROWS,
  IMPORT_SHEET_NAME,
  mapHeaders,
  parseImportRow,
  type ImportKey,
} from '@/lib/candidature-import';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const NO_STORE = { 'Cache-Control': 'no-store' };

type RowReport = {
  line: number;
  nomPrenom: string;
  email: string;
  status: 'ok' | 'duplicate' | 'error';
  errors: string[];
};

function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status, headers: NO_STORE });
}

/** Texte d'une cellule Excel (texte, nombre, lien hypertexte, texte riche, formule). */
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();
  const o = value as unknown as Record<string, unknown>;
  if (Array.isArray(o.richText)) {
    return (o.richText as { text: string }[]).map((t) => t.text).join('').trim();
  }
  if (typeof o.text === 'string') return o.text.trim(); // lien hypertexte (mailto:…)
  if (o.result !== undefined && o.result !== null) return cellText(o.result as ExcelJS.CellValue);
  return '';
}

/* ------------------------------------------------------------------ */
/* GET — modèle Excel                                                   */
/* ------------------------------------------------------------------ */

export async function GET(request: Request) {
  const check = await requireAdmin(request);
  if (!check.ok) return denyResponse(check);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'IRIS Join';

  const sheet = wb.addWorksheet(IMPORT_SHEET_NAME, { views: [{ state: 'frozen', ySplit: 1 }] });
  const lists = wb.addWorksheet('Listes', { state: 'hidden' });
  const help = wb.addWorksheet('Instructions');

  sheet.columns = IMPORT_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  const head = sheet.getRow(1);
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.alignment = { vertical: 'middle', wrapText: true };
  head.height = 32;
  head.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A3969' } };
  });

  // Téléphone en texte pour ne pas perdre de zéro / passer en notation scientifique.
  const phoneIndex = IMPORT_COLUMNS.findIndex((c) => c.key === 'telephone') + 1;
  sheet.getColumn(phoneIndex).numFmt = '@';

  // Menus déroulants (listes dans la feuille cachée « Listes »).
  let listCol = 0;
  IMPORT_COLUMNS.forEach((col, idx) => {
    if (!col.options || col.key === 'departements') return;
    listCol += 1;
    col.options.forEach((opt, r) => {
      lists.getCell(r + 1, listCol).value = opt;
    });
    const letter = lists.getColumn(listCol).letter;
    const range = `Listes!$${letter}$1:$${letter}$${col.options.length}`;
    for (let row = 2; row <= IMPORT_MAX_ROWS + 1; row += 1) {
      sheet.getCell(row, idx + 1).dataValidation = {
        type: 'list',
        allowBlank: col.optional ?? false,
        formulae: [range],
        showErrorMessage: true,
        errorTitle: 'Valeur invalide',
        error: 'Choisissez une valeur dans la liste.',
      };
    }
  });

  help.columns = [
    { header: 'Colonne', key: 'c', width: 40 },
    { header: 'Règle', key: 'r', width: 90 },
  ];
  help.getRow(1).font = { bold: true };
  for (const col of IMPORT_COLUMNS) {
    help.addRow({ c: col.header + (col.optional ? ' (facultatif)' : ''), r: col.hint });
  }
  help.addRow({});
  help.addRow({ c: 'Important', r: `Une ligne = une candidature. ${IMPORT_MAX_ROWS} lignes maximum. Une seule candidature par e-mail.` });

  const buffer = await wb.xlsx.writeBuffer();
  return new Response(new Uint8Array(buffer as ArrayBuffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="modele-candidatures-iris.xlsx"',
      ...NO_STORE,
    },
  });
}

/* ------------------------------------------------------------------ */
/* POST — validation / import                                           */
/* ------------------------------------------------------------------ */

export async function POST(request: Request) {
  const check = await requireAdmin(request);
  if (!check.ok) return denyResponse(check);

  const form = await request.formData().catch(() => null);
  if (!form) return fail('Requête invalide.');

  const file = form.get('file');
  if (!(file instanceof File)) return fail('Aucun fichier reçu.');
  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    return fail('Format non pris en charge : utilisez un fichier Excel .xlsx (le modèle).');
  }
  if (file.size > IMPORT_MAX_FILE_BYTES) return fail('Fichier trop volumineux (2 Mo maximum).');

  const dryRun = form.get('dryRun') === 'true';
  const notify = form.get('notify') === 'true';
  if (!dryRun && form.get('consent') !== 'true') {
    return fail('Vous devez confirmer le consentement des candidats avant d’importer.');
  }

  const db = getAdminDb();
  if (!db) return fail('Base de données indisponible.', 500);

  // Lecture du classeur.
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(await file.arrayBuffer());
  } catch {
    return fail('Fichier illisible : est-ce bien un classeur Excel .xlsx valide ?');
  }
  const sheet = wb.getWorksheet(IMPORT_SHEET_NAME) ?? wb.worksheets[0];
  if (!sheet) return fail('Le classeur ne contient aucune feuille.');

  const headerValues = (sheet.getRow(1).values as ExcelJS.CellValue[]).slice(1).map(cellText);
  const { indexByKey, missing } = mapHeaders(headerValues);
  if (missing.length > 0) {
    return fail(`Colonnes manquantes : ${missing.join(', ')}. Utilisez le modèle fourni.`);
  }

  // E-mails déjà candidats (une seule candidature par e-mail).
  const existingSnap = await db.collection('candidatures').select('email').get();
  const existing = new Set(
    existingSnap.docs.map((d) => String(d.data().email ?? '').trim().toLowerCase()),
  );

  const reports: RowReport[] = [];
  const toCreate: { line: number; data: NonNullable<ReturnType<typeof parseImportRow>['data']>; email: string }[] = [];
  const seenInFile = new Set<string>();
  let rowCount = 0;

  for (let r = 2; r <= sheet.rowCount; r += 1) {
    const row = sheet.getRow(r);
    const cells: Partial<Record<ImportKey, string>> = {};
    let empty = true;
    for (const [key, idx] of indexByKey) {
      const text = cellText(row.getCell(idx + 1).value);
      cells[key] = text;
      if (text) empty = false;
    }
    if (empty) continue;

    rowCount += 1;
    if (rowCount > IMPORT_MAX_ROWS) {
      return fail(`Trop de lignes : ${IMPORT_MAX_ROWS} candidatures maximum par import.`);
    }

    const parsed = parseImportRow(cells);
    const report: RowReport = {
      line: r,
      nomPrenom: cells.nomPrenom ?? '',
      email: parsed.email,
      status: 'ok',
      errors: parsed.errors,
    };

    if (parsed.errors.length > 0 || !parsed.data) {
      report.status = 'error';
    } else if (existing.has(parsed.email)) {
      report.status = 'duplicate';
      report.errors = ['Une candidature existe déjà avec cet e-mail.'];
    } else if (seenInFile.has(parsed.email)) {
      report.status = 'duplicate';
      report.errors = ['E-mail en double dans le fichier (ligne ignorée).'];
    } else {
      seenInFile.add(parsed.email);
      toCreate.push({ line: r, data: parsed.data, email: parsed.email });
    }
    reports.push(report);
  }

  if (reports.length === 0) return fail('Le fichier ne contient aucune candidature.');

  const summary = {
    total: reports.length,
    valid: toCreate.length,
    duplicates: reports.filter((x) => x.status === 'duplicate').length,
    errors: reports.filter((x) => x.status === 'error').length,
  };

  if (dryRun) {
    return NextResponse.json({ ok: true, dryRun: true, ...summary, rows: reports }, { headers: NO_STORE });
  }

  // Enregistrement (par lots : limite Firestore de 500 écritures / batch).
  const now = new Date().toISOString();
  try {
    for (let i = 0; i < toCreate.length; i += 400) {
      const batch = db.batch();
      for (const item of toCreate.slice(i, i + 400)) {
        batch.set(db.collection('candidatures').doc(), {
          ...item.data,
          departement: departementPrincipal(item.data.departements),
          email: item.email,
          createdAt: now,
          updatedAt: now,
          source: 'import-admin',
          importedBy: check.email,
        });
      }
      await batch.commit();
    }
  } catch (err) {
    console.error('[api/admin/candidatures/import] échec', err);
    return fail('Erreur serveur pendant l’enregistrement. Vérifiez la liste puis réessayez.', 500);
  }

  // E-mails de confirmation (ne bloquent jamais : l'import est déjà fait).
  let emailsSent = 0;
  if (notify) {
    for (let i = 0; i < toCreate.length; i += 10) {
      const results = await Promise.allSettled(
        toCreate.slice(i, i + 10).map((item) =>
          sendCandidatureConfirmation(
            item.email,
            item.data.nomPrenom,
            DEPARTMENT_LABELS[departementPrincipal(item.data.departements)],
          ),
        ),
      );
      emailsSent += results.filter((x) => x.status === 'fulfilled').length;
    }
  }

  return NextResponse.json(
    { ok: true, dryRun: false, ...summary, created: toCreate.length, emailsSent, rows: reports },
    { headers: NO_STORE },
  );
}