// app/api/admin/deliberation/route.ts
//
// Espace de délibération côté administration :
//  - GET  : toutes les décisions (brouillons et publiées) ;
//  - PUT  : enregistre ou retire la décision d'un ou plusieurs candidats
//           (accepté / non accepté / absent) + message personnalisé ;
//  - POST : action "publish" / "unpublish" (rend les résultats visibles ou
//           non pour les candidats) ou "send-email" (envoie l'e-mail de
//           résultat, par petits lots, aux candidats dont le résultat est publié).
// Réservé aux e-mails listés dans ADMIN_EMAILS.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { denyResponse, requireAdmin } from '@/lib/admin-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { DEPARTMENT_LABELS, normalizeDepartment } from '@/lib/interview';
import { isEmailConfigured, sendResultEmail } from '@/lib/email';
import {
  RESULT_MESSAGE_MAX,
  RESULT_STATUSES,
  SEND_CHUNK_SIZE,
} from '@/lib/deliberation';
import {
  getDecisions,
  listDecisions,
  markEmailSent,
  normEmail,
  setDecisions,
  setPublished,
} from '@/lib/deliberation-store';

export const dynamic = 'force-dynamic';
// Un lot d'e-mails peut prendre quelques secondes (SMTP).
export const maxDuration = 60;

const NO_STORE = { 'Cache-Control': 'no-store' };

const emailField = z.string().email().max(320);
const emailList = z.array(emailField).min(1).max(500);

const putSchema = z.object({
  emails: emailList,
  status: z.enum(RESULT_STATUSES).nullable(),
  message: z.string().trim().max(RESULT_MESSAGE_MAX).optional(),
});

const postSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('publish'), emails: emailList.optional() }),
  z.object({ action: z.literal('unpublish'), emails: emailList.optional() }),
  z.object({
    action: z.literal('send-email'),
    emails: z.array(emailField).min(1).max(SEND_CHUNK_SIZE),
  }),
]);

function fail(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status, headers: NO_STORE });
}

export async function GET(request: Request) {
  const check = await requireAdmin(request);
  if (!check.ok) return denyResponse(check);

  try {
    const decisions = await listDecisions();
    return NextResponse.json({ ok: true, decisions }, { headers: NO_STORE });
  } catch (err) {
    console.error('[api/admin/deliberation] lecture impossible', err);
    return fail('Erreur serveur lors du chargement de la délibération.', 500);
  }
}

export async function PUT(request: Request) {
  const check = await requireAdmin(request);
  if (!check.ok) return denyResponse(check);

  const parsed = putSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail('Données invalides.', 400);

  const { emails, status, message } = parsed.data;

  try {
    // Une décision ne peut concerner qu'un candidat qui a réellement postulé.
    const db = getAdminDb();
    if (!db) return fail('Base de données indisponible.', 500);

    const snapshot = await db.collection('candidatures').select('email').get();
    const known = new Set<string>();
    for (const doc of snapshot.docs) {
      const email = doc.data().email;
      if (typeof email === 'string') known.add(normEmail(email));
    }

    const valid = emails.filter((email) => known.has(normEmail(email)));
    if (valid.length === 0) return fail("Aucune candidature ne correspond à ces e-mails.", 404);

    const updated = await setDecisions(valid, status, message, check.email);
    return NextResponse.json(
      { ok: true, updated, skipped: emails.length - valid.length },
      { headers: NO_STORE },
    );
  } catch (err) {
    console.error('[api/admin/deliberation] enregistrement impossible', err);
    return fail('Erreur serveur.', 500);
  }
}

export async function POST(request: Request) {
  const check = await requireAdmin(request);
  if (!check.ok) return denyResponse(check);

  const parsed = postSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail('Données invalides.', 400);

  const body = parsed.data;

  try {
    /* ------------------------- Publication ------------------------- */
    if (body.action === 'publish' || body.action === 'unpublish') {
      const affected = await setPublished(body.emails ?? null, body.action === 'publish');
      return NextResponse.json(
        { ok: true, count: affected.length, emails: affected },
        { headers: NO_STORE },
      );
    }

    /* ---------------------- Envoi des e-mails ---------------------- */
    if (!isEmailConfigured()) {
      return NextResponse.json(
        { ok: true, emailConfigured: false, results: [] },
        { headers: NO_STORE },
      );
    }

    const db = getAdminDb();
    if (!db) return fail('Base de données indisponible.', 500);

    const { emails } = body;
    const [decisions, candidaturesSnap] = await Promise.all([
      getDecisions(emails),
      db.collection('candidatures').where('email', 'in', emails).get(),
    ]);

    const candidatureByKey = new Map<string, { to: string; nomPrenom: string; department: string }>();
    for (const doc of candidaturesSnap.docs) {
      const d = doc.data();
      if (typeof d.email !== 'string') continue;
      const department = normalizeDepartment(d.departement);
      candidatureByKey.set(normEmail(d.email), {
        to: d.email,
        nomPrenom: typeof d.nomPrenom === 'string' ? d.nomPrenom : '',
        department: department ? DEPARTMENT_LABELS[department] : '',
      });
    }

    const results = await Promise.all(
      emails.map(async (email) => {
        const key = normEmail(email);
        const decision = decisions.get(key);
        const candidature = candidatureByKey.get(key);

        // Un e-mail ne part jamais avant que le résultat soit visible en ligne.
        if (!decision?.published) return { email, ok: false, reason: 'not-published' as const };
        if (!candidature) return { email, ok: false, reason: 'no-candidature' as const };

        const sent = await sendResultEmail(
          candidature.to,
          candidature.nomPrenom,
          candidature.department,
          decision.status,
          decision.message,
        );
        if (!sent) return { email, ok: false, reason: 'smtp-error' as const };

        await markEmailSent(key);
        return { email, ok: true };
      }),
    );

    return NextResponse.json(
      { ok: true, emailConfigured: true, results },
      { headers: NO_STORE },
    );
  } catch (err) {
    console.error('[api/admin/deliberation] action impossible', err);
    return fail('Erreur serveur.', 500);
  }
}