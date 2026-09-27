// app/api/admin/settings/route.ts
//
// Gestion des périodes de disponibilité des deux services publics :
//  - GET   : renvoie les fenêtres actuelles + leur statut (ouvert / pas
//            encore ouvert / fermé) calculé au moment de l'appel ;
//  - PUT   : modifie la fenêtre d'UN service (candidature OU entretien).
// Réservé aux e-mails listés dans ADMIN_EMAILS.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { denyResponse, requireAdmin } from '@/lib/admin-auth';
import { getServiceWindowStates, updateServiceWindow } from '@/lib/settings-store';
import { SERVICE_KEYS } from '@/lib/service-window';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

const isoDateTime = z
  .string()
  .refine((v) => !Number.isNaN(new Date(v).getTime()), 'Date invalide');

const updateSchema = z
  .object({
    service: z.enum(SERVICE_KEYS),
    opensAt: isoDateTime.nullable(),
    closesAt: isoDateTime.nullable(),
  })
  .refine(
    (v) => !v.opensAt || !v.closesAt || new Date(v.opensAt).getTime() < new Date(v.closesAt).getTime(),
    { message: 'La date de fermeture doit être après la date d’ouverture.', path: ['closesAt'] },
  );

function fail(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status, headers: NO_STORE });
}

export async function GET(request: Request) {
  const check = await requireAdmin(request);
  if (!check.ok) return denyResponse(check);

  try {
    const states = await getServiceWindowStates();
    return NextResponse.json(
      {
        ok: true,
        windows: {
          candidature: states.candidature.window,
          entretien: states.entretien.window,
        },
        statuses: {
          candidature: states.candidature.status,
          entretien: states.entretien.status,
        },
      },
      { headers: NO_STORE },
    );
  } catch (err) {
    console.error('[api/admin/settings] lecture', err);
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

  const { service, opensAt, closesAt } = parsed.data;

  try {
    const windows = await updateServiceWindow(service, { opensAt, closesAt });
    return NextResponse.json({ ok: true, windows }, { headers: NO_STORE });
  } catch (err) {
    console.error('[api/admin/settings] mise à jour', err);
    return fail('Erreur serveur.', 500);
  }
}