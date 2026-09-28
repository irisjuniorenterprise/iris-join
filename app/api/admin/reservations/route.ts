// app/api/admin/reservations/route.ts
//
// Traitement des changements de créneau demandés par e-mail :
//  - action "assign"  : attribue (ou déplace le candidat vers) un créneau
//                       libre de SON département ; l'ancien créneau est
//                       libéré dans la même transaction ;
//  - action "release" : libère un créneau réservé (annulation).
// Aucun e-mail n'est envoyé ici : le candidat reçoit uniquement le rappel
// 24 h avant son entretien (nouveau créneau inclus, voir /api/cron/reminders).
// Réservé aux e-mails listés dans ADMIN_EMAILS.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { denyResponse, requireAdmin } from '@/lib/admin-auth';
import { assignSlot, getCandidateDepartment, releaseSlot } from '@/lib/slots-store';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

const idSchema = z.string().min(1).max(200).regex(/^[A-Za-z0-9_-]+$/);

const bodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('assign'),
    slotId: idSchema,
    email: z.string().email().max(320),
  }),
  z.object({
    action: z.literal('release'),
    slotId: idSchema,
  }),
]);

function fail(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status, headers: NO_STORE });
}

export async function POST(request: Request) {
  const check = await requireAdmin(request);
  if (!check.ok) return denyResponse(check);

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail('Données invalides.', 400);

  const body = parsed.data;

  try {
    if (body.action === 'assign') {
      const candidate = await getCandidateDepartment(body.email);
      if (candidate.status === 'no-candidature') {
        return fail("Aucune candidature n'est associée à cet e-mail.", 409);
      }
      if (candidate.status === 'invalid-department') {
        return fail('Le département de cette candidature est invalide.', 409);
      }

      const outcome = await assignSlot(body.slotId, body.email, candidate.department);
      if (!outcome.ok) {
        const messages = {
          'not-found': "Ce créneau n'existe plus.",
          'wrong-department': "Ce créneau n'appartient pas au département du candidat.",
          'already-booked': 'Ce créneau est déjà réservé par un autre candidat.',
          'same-slot': 'Le candidat a déjà ce créneau.',
        };
        return fail(messages[outcome.reason], outcome.reason === 'not-found' ? 404 : 409);
      }

      return NextResponse.json(
        { ok: true, moved: Boolean(outcome.previous) },
        { headers: NO_STORE },
      );
    }

    // action === 'release'
    const outcome = await releaseSlot(body.slotId);
    if (!outcome.ok) {
      return outcome.reason === 'not-found'
        ? fail("Ce créneau n'existe plus.", 404)
        : fail("Ce créneau n'est pas réservé.", 409);
    }

    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (err) {
    console.error('[api/admin/reservations] échec', err);
    return fail('Erreur serveur.', 500);
  }
}
