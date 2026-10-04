// app/api/admin/notifications/route.ts
//
// Réglages des notifications par e-mail :
//  - GET : réglages actuels ;
//  - PUT : modifie un ou plusieurs réglages (ex. e-mail de confirmation
//          envoyé ou non au candidat quand il soumet sa candidature).
// Réservé aux e-mails listés dans ADMIN_EMAILS.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { denyResponse, requireAdmin } from '@/lib/admin-auth';
import {
  getNotificationSettings,
  updateNotificationSettings,
} from '@/lib/notification-settings-store';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

const updateSchema = z
  .object({
    candidatureEmail: z.boolean().optional(),
  })
  .refine((v) => v.candidatureEmail !== undefined, { message: 'Aucun réglage à modifier.' });

function fail(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status, headers: NO_STORE });
}

export async function GET(request: Request) {
  const check = await requireAdmin(request);
  if (!check.ok) return denyResponse(check);

  try {
    const settings = await getNotificationSettings();
    return NextResponse.json({ ok: true, settings }, { headers: NO_STORE });
  } catch (err) {
    console.error('[api/admin/notifications] lecture', err);
    return fail('Erreur serveur.', 500);
  }
}

export async function PUT(request: Request) {
  const check = await requireAdmin(request);
  if (!check.ok) return denyResponse(check);

  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? 'Données invalides.', 400);
  }

  try {
    const settings = await updateNotificationSettings(parsed.data, check.email);
    return NextResponse.json({ ok: true, settings }, { headers: NO_STORE });
  } catch (err) {
    console.error('[api/admin/notifications] mise à jour', err);
    return fail('Erreur serveur.', 500);
  }
}
