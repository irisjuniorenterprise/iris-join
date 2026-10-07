// app/api/admin/slots/route.ts
//
// Gestion des créneaux par l'administration :
//  - POST   : crée des créneaux (jours × heures × départements) avec leur
//             mode (présentiel / en ligne), sans doublon ;
//  - PATCH  : modifie date / heure / département / mode d'un créneau
//             (aucun e-mail : le rappel 24 h avant suit le nouvel horaire) ;
//  - DELETE : supprime un créneau libre ({ id }) ou plusieurs d'un coup ({ ids }) ;
//             les créneaux réservés sont ignorés et comptés à part.
// Réservé aux e-mails listés dans ADMIN_EMAILS.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { denyResponse, requireAdmin } from '@/lib/admin-auth';
import { createSlots, deleteSlot, updateSlot } from '@/lib/slots-store';
import { DEPARTMENT_KEYS, INTERVIEW_MODES } from '@/lib/interview';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime()), 'Date invalide');
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const idSchema = z.string().min(1).max(200).regex(/^[A-Za-z0-9_-]+$/);

const createSchema = z.object({
  dates: z.array(dateSchema).min(1).max(31),
  times: z.array(timeSchema).min(1).max(30),
  departments: z.array(z.enum(DEPARTMENT_KEYS)).min(1),
  mode: z.enum(INTERVIEW_MODES),
});

const patchSchema = z
  .object({
    id: idSchema,
    date: dateSchema.optional(),
    time: timeSchema.optional(),
    department: z.enum(DEPARTMENT_KEYS).optional(),
    mode: z.enum(INTERVIEW_MODES).optional(),
  })
  .refine((v) => v.date || v.time || v.department || v.mode, 'Aucune modification.');

const deleteSchema = z.object({ id: idSchema });
const deleteManySchema = z.object({ ids: z.array(idSchema).min(1).max(200) });

function fail(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status, headers: NO_STORE });
}

export async function POST(request: Request) {
  const check = await requireAdmin(request);
  if (!check.ok) return denyResponse(check);

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail('Données invalides.', 400);

  const { dates, times, departments, mode } = parsed.data;
  const items = [];
  for (const date of new Set(dates)) {
    for (const time of new Set(times)) {
      for (const department of new Set(departments)) {
        items.push({ date, time, department, mode });
      }
    }
  }
  if (items.length > 500) return fail('Trop de créneaux à la fois (500 maximum).', 400);

  try {
    const result = await createSlots(items);
    return NextResponse.json({ ok: true, ...result }, { headers: NO_STORE });
  } catch (err) {
    console.error('[api/admin/slots] création', err);
    return fail('Erreur serveur.', 500);
  }
}

export async function PATCH(request: Request) {
  const check = await requireAdmin(request);
  if (!check.ok) return denyResponse(check);

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail('Données invalides.', 400);

  const { id, ...patch } = parsed.data;

  try {
    const outcome = await updateSlot(id, patch);
    if (!outcome.ok) {
      const messages = {
        'not-found': "Ce créneau n'existe plus.",
        duplicate: 'Un créneau existe déjà pour ce jour, cette heure et ce département.',
        'department-locked':
          "Le département d'un créneau réservé ne peut pas être modifié. Changez d'abord le créneau du candidat.",
      };
      return fail(messages[outcome.reason], outcome.reason === 'not-found' ? 404 : 409);
    }

    // Aucun e-mail ici : si le créneau réservé change d'horaire, le rappel
    // 24 h avant est simplement (re)programmé pour le nouvel horaire.
    return NextResponse.json({ ok: true, slot: outcome.slot }, { headers: NO_STORE });
  } catch (err) {
    console.error('[api/admin/slots] modification', err);
    return fail('Erreur serveur.', 500);
  }
}

export async function DELETE(request: Request) {
  const check = await requireAdmin(request);
  if (!check.ok) return denyResponse(check);

  const body = await request.json().catch(() => null);

  // Suppression groupée (sélection multiple Ctrl+2 du tableau de bord).
  const many = deleteManySchema.safeParse(body);
  if (many.success) {
    const ids = Array.from(new Set(many.data.ids));
    let deleted = 0;
    let booked = 0;
    let missing = 0;

    try {
      for (const id of ids) {
        const outcome = await deleteSlot(id);
        if (outcome.ok) deleted += 1;
        else if (outcome.reason === 'booked') booked += 1;
        else missing += 1;
      }
    } catch (err) {
      console.error('[api/admin/slots] suppression groupée', err);
      return fail('Erreur serveur.', 500);
    }

    return NextResponse.json({ ok: true, deleted, booked, missing }, { headers: NO_STORE });
  }

  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) return fail('Données invalides.', 400);

  try {
    const outcome = await deleteSlot(parsed.data.id);
    if (!outcome.ok) {
      return outcome.reason === 'booked'
        ? fail("Ce créneau est réservé : libérez-le d'abord avant de le supprimer.", 409)
        : fail("Ce créneau n'existe plus.", 404);
    }
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (err) {
    console.error('[api/admin/slots] suppression', err);
    return fail('Erreur serveur.', 500);
  }
}