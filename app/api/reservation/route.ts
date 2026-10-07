// app/api/reservation/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  bookSlot,
  getBookingForEmail,
  getCandidateDepartment,
  setCandidateDepartment,
} from '@/lib/slots-store';
import { normalizeDepartment, type DepartmentKey } from '@/lib/interview';
import { getVerifiedEmail, isFirebaseAdminConfigured } from '@/lib/firebase-admin';
import { getServiceWindowStates } from '@/lib/settings-store';
import { formatServiceDateTime } from '@/lib/service-window';

const reservationSchema = z.object({
  // Les identifiants de créneaux sont des IDs de documents Firestore :
  // on refuse tout caractère (ex. "/") qui casserait le chemin du document.
  slotId: z.string().min(1).max(200).regex(/^[A-Za-z0-9_-]+$/),
  // Uniquement pour un candidat dont la candidature n'a pas de département
  // (candidature importée) : le département qu'il choisit pour son entretien.
  department: z.string().max(40).optional(),
});

/**
 * Renvoie la réservation existante de l'utilisateur authentifié (ou null).
 * Permet au client d'afficher directement "vous avez déjà un entretien
 * confirmé" au chargement, plutôt que de le découvrir seulement en
 * essayant de réserver un second créneau — un email ne peut réserver
 * qu'un seul créneau (voir bookSlot / "duplicate-email").
 */
export async function GET(request: Request) {
  if (!isFirebaseAdminConfigured()) {
    return NextResponse.json({ slot: null }, { status: 500 });
  }

  const email = await getVerifiedEmail(request);
  if (!email) {
    return NextResponse.json({ slot: null }, { status: 401 });
  }

  try {
    const slot = await getBookingForEmail(email);
    if (!slot) return NextResponse.json({ slot: null });

    return NextResponse.json({
      slot: {
        id: slot.id,
        date: slot.date,
        time: slot.time,
        department: slot.department,
        mode: slot.mode,
      },
    });
  } catch (err) {
    console.error('[api/reservation] échec de la lecture de la réservation', err);
    return NextResponse.json({ slot: null }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isFirebaseAdminConfigured()) {
    return NextResponse.json(
      { ok: false, message: 'Serveur mal configuré (Firebase Admin manquant).' },
      { status: 500 },
    );
  }

  const email = await getVerifiedEmail(request);
  if (!email) {
    return NextResponse.json(
      { ok: false, message: 'Connexion requise. Reconnectez-vous et réessayez.' },
      { status: 401 },
    );
  }

  // La réservation n'est ouverte que pendant la période configurée par
  // l'admin (voir lib/settings-store.ts) — revalidé ici côté serveur,
  // indépendamment de ce que montre la page (onglet resté ouvert, appel
  // direct à l'API…).
  const { entretien: entretienWindow } = await getServiceWindowStates();
  if (entretienWindow.status.state === 'not-started') {
    return NextResponse.json(
      {
        ok: false,
        code: 'NOT_STARTED',
        message: `La réservation d'entretien n'est pas encore ouverte. Rendez-vous à partir du ${formatServiceDateTime(entretienWindow.status.opensAt)}.`,
      },
      { status: 403 },
    );
  }
  if (entretienWindow.status.state === 'closed') {
    return NextResponse.json(
      {
        ok: false,
        code: 'CLOSED',
        message: `La réservation d'entretien est close depuis le ${formatServiceDateTime(entretienWindow.status.closesAt)}.`,
      },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => null);
  const result = reservationSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ ok: false, message: 'Créneau invalide.' }, { status: 400 });
  }

  try {
    // Règle métier : il faut avoir déposé une candidature avant de réserver
    // un entretien — et on ne peut réserver que dans le département choisi
    // dans cette candidature (les créneaux des autres départements se
    // déroulent en parallèle et ne le concernent pas).
    const candidate = await getCandidateDepartment(email);

    if (candidate.status === 'no-candidature') {
      return NextResponse.json(
        { ok: false, message: "Déposez d'abord votre candidature avant de réserver un entretien." },
        { status: 409 },
      );
    }
    if (candidate.status === 'invalid-department') {
      return NextResponse.json(
        { ok: false, message: 'Le département de votre candidature est invalide. Renvoyez votre candidature.' },
        { status: 409 },
      );
    }

    // Candidature sans département : on réserve dans le département choisi par
    // le candidat, puis on l'enregistre sur sa candidature (une fois pour toutes).
    let department: DepartmentKey;
    if (candidate.status === 'no-department') {
      const chosen = normalizeDepartment(result.data.department);
      if (!chosen) {
        return NextResponse.json(
          { ok: false, message: 'Choisissez d’abord le département de votre entretien.' },
          { status: 400 },
        );
      }
      department = chosen;
    } else {
      department = candidate.department;
    }

    const outcome = await bookSlot(result.data.slotId, email, department);

    if (!outcome.ok) {
      // "duplicate-email" = règle "une seule réservation par personne" :
      // un email ayant déjà un créneau ne peut pas en réserver un second.
      const messages: Record<string, string> = {
        'already-booked': "Ce créneau vient d'être réservé par quelqu'un d'autre. Choisissez-en un autre.",
        'not-found': "Ce créneau n'existe plus.",
        'duplicate-email': 'Vous avez déjà réservé un entretien — une seule réservation par personne est autorisée.',
        'wrong-department': "Ce créneau n'est pas ouvert pour le département de votre candidature.",
      };
      return NextResponse.json(
        { ok: false, message: messages[outcome.reason] },
        { status: outcome.reason === 'wrong-department' ? 403 : 409 },
      );
    }

    if (candidate.status === 'no-department') {
      try {
        await setCandidateDepartment(email, department);
      } catch (err) {
        // La réservation est faite : on ne la fait pas échouer pour ça (log seulement).
        console.error('[api/reservation] département non enregistré sur la candidature', err);
      }
    }

    // Aucun e-mail à la réservation : le candidat reçoit uniquement le
    // rappel envoyé 24 h avant l'entretien (voir app/api/cron/reminders).

    return NextResponse.json({
      ok: true,
      slot: {
        id: outcome.slot.id,
        date: outcome.slot.date,
        time: outcome.slot.time,
        department: outcome.slot.department,
        mode: outcome.slot.mode,
      },
    });
  } catch (err) {
    console.error('[api/reservation] échec de la réservation', err);
    return NextResponse.json(
      { ok: false, message: 'Erreur serveur. Réessayez dans quelques instants.' },
      { status: 500 },
    );
  }
}