// app/api/admin/slots/route.ts
//
// Gestion des créneaux par l'administration :
//  - POST   : crée des créneaux (jours × heures × départements), sans doublon ;
//  - PATCH  : modifie date / heure / département d'un créneau ;
//  - DELETE : supprime un créneau libre.
// Réservé aux e-mails listés dans ADMIN_EMAILS.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { denyResponse, requireAdmin } from '@/lib/admin-auth';
import { createSlots, deleteSlot, updateSlot } from '@/lib/slots-store';
import { DEPARTMENT_KEYS, DEPARTMENT_LABELS, formatDayLong } from '@/lib/interview';
import { isEmailConfigured, sendReservationChanged } from '@/lib/email';

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
});

const patchSchema = z
  .object({
    id: idSchema,
    date: dateSchema.optional(),
    time: timeSchema.optional(),
    department: z.enum(DEPARTMENT_KEYS).optional(),
    notify: z.boolean().optional(),
  })
  .refine((v) => v.date || v.time || v.department, 'Aucune modification.');

const deleteSchema = z.object({ id: idSchema });

function fail(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status, headers: NO_STORE });
}

export async function POST(request: Request) {
  const check = await requireAdmin(request);
  if (!check.ok) return denyResponse(check);

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail('Données invalides.', 400);

  const { dates, times, departments } = parsed.data;
  const items = [];
  for (const date of new Set(dates)) {
    for (const time of new Set(times)) {
      for (const department of new Set(departments)) {
        items.push({ date, time, department });
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

  const { id, notify, ...patch } = parsed.data;

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

    // Créneau réservé déplacé dans le temps : on prévient le candidat si demandé.
    const { slot, previous } = outcome;
    const timeChanged = slot.date !== previous.date || slot.time !== previous.time;
    let notified = false;
    if (notify && timeChanged && slot.booked && slot.bookedByEmail && isEmailConfigured()) {
      await sendReservationChanged(
        slot.bookedByEmail,
        formatDayLong(slot.date),
        slot.time,
        DEPARTMENT_LABELS[slot.department],
        { dateLabel: formatDayLong(previous.date), time: previous.time },
      );
      notified = true;
    }

    return NextResponse.json(
      { ok: true, slot, notified, emailConfigured: isEmailConfigured() },
      { headers: NO_STORE },
    );
  } catch (err) {
    console.error('[api/admin/slots] modification', err);
    return fail('Erreur serveur.', 500);
  }
}

export async function DELETE(request: Request) {
  const check = await requireAdmin(request);
  if (!check.ok) return denyResponse(check);

  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
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
