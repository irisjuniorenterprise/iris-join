// app/api/admin/candidatures/import/route.ts
//
// Import en masse de candidatures depuis un fichier Excel (.xlsx).
//   GET  → télécharge le modèle Excel (menus déroulants inclus).
//   POST → multipart/form-data { file, consent, dryRun?, notify?, allowNoDepartment? }
//          dryRun=true : valide seulement et renvoie le rapport ligne par ligne.
//          sinon       : enregistre les lignes valides.
//
// Deux formats de fichier sont acceptés (détectés automatiquement) :
//   • « modele »   : le modèle téléchargé ci-dessus (15 colonnes, feuille
//                    « Candidatures »), mêmes règles que le formulaire public ;
//   • « registre » : le registre des candidats d'IRIS JE — colonnes Prénom,
//                    Nom, CIN, E-mail, Num de téléphone, Date de naissance,
//                    Adresse, Niveau d'étude, Nationalité, Département, à
//                    n'importe quelle position de la feuille (voir
//                    lib/candidature-excel.ts). Le registre ne contient pas
//                    les réponses du questionnaire : elles restent absentes.
//
// Réservé aux administrateurs (ADMIN_EMAILS). La règle « une candidature
// par e-mail » est respectée dans les deux formats.
import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { getAdminDb } from '@/lib/firebase-admin';
import { denyResponse, requireAdmin } from '@/lib/admin-auth';
import { sendCandidatureConfirmation } from '@/lib/email';
import { DEPARTMENT_LABELS, type DepartmentKey } from '@/lib/interview';
import { departementPrincipal } from '@/lib/candidature';
import { ExcelImportError, extractCandidates } from '@/lib/candidature-excel';
import {
  IMPORT_COLUMNS,
  IMPORT_MAX_FILE_BYTES,
  IMPORT_MAX_ROWS,
  IMPORT_SHEET_NAME,
  buildRegistreCandidature,
  mapHeaders,
  parseImportRow,
  type ImportKey,
} from '@/lib/candidature-import';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const NO_STORE = { 'Cache-Control': 'no-store' };

type ImportFormat = 'modele' | 'registre';

type RowReport = {
  line: number;
  nomPrenom: string;
  email: string;
  status: 'ok' | 'duplicate' | 'error';
  /** Raisons du rejet (statuts « error » et « duplicate »). */
  errors: string[];
  /** Remarques sur une ligne importée (donnée manquante ou corrigée). */
  warnings: string[];
};

/** Une candidature prête à être écrite dans Firestore. */
type PendingCandidature = {
  line: number;
  email: string;
  nomPrenom: string;
  /** Document Firestore (hors email / dates / traçabilité, ajoutés à l'écriture). */
  doc: Record<string, unknown>;
  /** Libellé du département (null si le candidat n'en a pas : pas d'e-mail possible). */
  departementLabel: string | null;
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

function labelOf(department: DepartmentKey | null | undefined): string | null {
  return department ? DEPARTMENT_LABELS[department] : null;
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
    return fail('Format non pris en charge : utilisez un fichier Excel .xlsx (le modèle ou le registre des candidats).');
  }
  if (file.size > IMPORT_MAX_FILE_BYTES) return fail('Fichier trop volumineux (2 Mo maximum).');

  const dryRun = form.get('dryRun') === 'true';
  const notify = form.get('notify') === 'true';
  const allowNoDepartment = form.get('allowNoDepartment') === 'true';
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
  if (wb.worksheets.length === 0) return fail('Le classeur ne contient aucune feuille.');

  // E-mails déjà candidats (une seule candidature par e-mail).
  const existingSnap = await db.collection('candidatures').select('email').get();
  const existing = new Set(
    existingSnap.docs.map((d) => String(d.data().email ?? '').trim().toLowerCase()),
  );

  const reports: RowReport[] = [];
  const toCreate: PendingCandidature[] = [];
  const seenInFile = new Set<string>();

  /** Contrôles communs aux deux formats : doublons en base puis dans le fichier. */
  const register = (report: RowReport, pending: PendingCandidature | null) => {
    if (pending) {
      if (existing.has(pending.email)) {
        report.status = 'duplicate';
        report.errors = ['Une candidature existe déjà avec cet e-mail.'];
      } else if (seenInFile.has(pending.email)) {
        report.status = 'duplicate';
        report.errors = ['E-mail en double dans le fichier (ligne ignorée).'];
      } else {
        seenInFile.add(pending.email);
        toCreate.push(pending);
      }
    }
    reports.push(report);
  };

  /* ---- Détection du format : modèle (en-têtes en ligne 1) sinon registre ---- */
  const templateSheet = wb.getWorksheet(IMPORT_SHEET_NAME) ?? wb.worksheets[0];
  const headerValues = (templateSheet.getRow(1).values as ExcelJS.CellValue[]).slice(1).map(cellText);
  const { indexByKey, missing } = mapHeaders(headerValues);
  const format: ImportFormat = missing.length === 0 ? 'modele' : 'registre';

  if (format === 'modele') {
    let rowCount = 0;
    for (let r = 2; r <= templateSheet.rowCount; r += 1) {
      const row = templateSheet.getRow(r);
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
        warnings: [],
      };

      if (parsed.errors.length > 0 || !parsed.data) {
        report.status = 'error';
        register(report, null);
        continue;
      }

      const departement = departementPrincipal(parsed.data.departements);
      register(report, {
        line: r,
        email: parsed.email,
        nomPrenom: parsed.data.nomPrenom,
        doc: { ...parsed.data, departement, source: 'import-admin' },
        departementLabel: labelOf(departement),
      });
    }
  } else {
    let extracted: ReturnType<typeof extractCandidates>;
    try {
      extracted = extractCandidates(wb, { maxRows: IMPORT_MAX_ROWS });
    } catch (err) {
      if (err instanceof ExcelImportError) {
        return fail(`${err.message} Vous pouvez aussi utiliser le modèle d’import fourni.`);
      }
      throw err;
    }

    // Lignes que le lecteur a écartées (e-mail manquant / invalide / doublon dans le fichier).
    for (const s of extracted.skipped) {
      register(
        {
          line: s.excelRow,
          nomPrenom: [s.prenom, s.nom].filter(Boolean).join(' '),
          email: s.email,
          status: s.reason.startsWith('Doublon') ? 'duplicate' : 'error',
          errors: [s.reason],
          warnings: [],
        },
        null,
      );
    }

    for (const candidate of extracted.rows) {
      const built = buildRegistreCandidature(candidate, { allowNoDepartment });
      const report: RowReport = {
        line: candidate.excelRow,
        nomPrenom: candidate.nomPrenom,
        email: built.email,
        status: built.data ? 'ok' : 'error',
        errors: built.errors,
        warnings: built.warnings,
      };
      register(
        report,
        built.data
          ? {
              line: candidate.excelRow,
              email: built.email,
              nomPrenom: built.data.nomPrenom,
              // Le registre ne porte aucune réponse de questionnaire : on n'écrit que ce qu'il contient.
              doc: { ...built.data, consentement: true, source: 'import-registre' },
              departementLabel: labelOf(built.data.departement),
            }
          : null,
      );
    }

    reports.sort((a, b) => a.line - b.line);
  }

  if (reports.length === 0) return fail('Le fichier ne contient aucune candidature.');

  const summary = {
    format,
    total: reports.length,
    valid: toCreate.length,
    duplicates: reports.filter((x) => x.status === 'duplicate').length,
    errors: reports.filter((x) => x.status === 'error').length,
    withWarnings: reports.filter((x) => x.status === 'ok' && x.warnings.length > 0).length,
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
          ...item.doc,
          email: item.email,
          createdAt: now,
          updatedAt: now,
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
  // Un candidat sans département n'en reçoit pas : l'e-mail cite son département.
  let emailsSent = 0;
  if (notify) {
    const recipients = toCreate.filter((item) => item.departementLabel);
    for (let i = 0; i < recipients.length; i += 10) {
      const results = await Promise.allSettled(
        recipients
          .slice(i, i + 10)
          .map((item) =>
            sendCandidatureConfirmation(item.email, item.nomPrenom, item.departementLabel as string),
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