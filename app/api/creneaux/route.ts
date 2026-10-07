// app/api/creneaux/route.ts
//
// Renvoie UNIQUEMENT les créneaux du département choisi par le candidat
// dans son formulaire de candidature. Si la candidature n'a pas de
// département (candidature importée par l'admin), le candidat le choisit ici
// (paramètre ?department=) : sans choix, la réponse liste les départements.
// Accès refusé si :
//  - la requête n'est pas authentifiée (token Firebase absent/invalide) ;
//  - l'e-mail n'a pas soumis de candidature (il n'est pas concerné).
import { NextResponse } from 'next/server';
import { getCandidateDepartment, getSlotsForDepartment } from '@/lib/slots-store';
import { getVerifiedEmail, isFirebaseAdminConfigured } from '@/lib/firebase-admin';
import { DEPARTMENT_KEYS, DEPARTMENT_LABELS, normalizeDepartment } from '@/lib/interview';
import { getServiceWindowStates } from '@/lib/settings-store';
import { formatServiceDateTime } from '@/lib/service-window';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

export async function GET(request: Request) {
  if (!isFirebaseAdminConfigured()) {
    return NextResponse.json(
      { slots: [], code: 'server-misconfigured', message: 'Serveur mal configuré (Firebase Admin manquant).' },
      { status: 500, headers: NO_STORE },
    );
  }

  const email = await getVerifiedEmail(request);
  if (!email) {
    return NextResponse.json(
      { slots: [], code: 'unauthenticated', message: 'Connexion requise. Reconnectez-vous et réessayez.' },
      { status: 401, headers: NO_STORE },
    );
  }

  // Les créneaux ne sont visibles que pendant la période de réservation
  // configurée par l'admin — même règle que app/api/reservation/route.ts,
  // vérifiée ici aussi pour ne pas afficher un planning que l'on ne
  // pourrait de toute façon pas réserver.
  const { entretien: entretienWindow } = await getServiceWindowStates();
  if (entretienWindow.status.state === 'not-started') {
    return NextResponse.json(
      {
        slots: [],
        code: 'not-started',
        message: `La réservation d'entretien n'est pas encore ouverte. Rendez-vous à partir du ${formatServiceDateTime(entretienWindow.status.opensAt)}.`,
      },
      { status: 403, headers: NO_STORE },
    );
  }
  if (entretienWindow.status.state === 'closed') {
    return NextResponse.json(
      {
        slots: [],
        code: 'closed',
        message: `La réservation d'entretien est close depuis le ${formatServiceDateTime(entretienWindow.status.closesAt)}.`,
      },
      { status: 403, headers: NO_STORE },
    );
  }

  try {
    const candidate = await getCandidateDepartment(email);

    if (candidate.status === 'no-candidature') {
      return NextResponse.json(
        {
          slots: [],
          code: 'no-candidature',
          message: "Déposez d'abord votre candidature pour accéder aux créneaux d'entretien.",
        },
        { status: 403, headers: NO_STORE },
      );
    }

    // Candidature sans département : le candidat choisit le sien pour réserver.
    if (candidate.status === 'no-department') {
      const chosen = normalizeDepartment(new URL(request.url).searchParams.get('department'));
      if (!chosen) {
        return NextResponse.json(
          {
            needsDepartment: true,
            departments: DEPARTMENT_KEYS.map((key) => ({ key, label: DEPARTMENT_LABELS[key] })),
            slots: [],
          },
          { headers: NO_STORE },
        );
      }
      const chosenSlots = await getSlotsForDepartment(chosen);
      return NextResponse.json(
        {
          department: chosen,
          departmentLabel: DEPARTMENT_LABELS[chosen],
          canChangeDepartment: true,
          slots: chosenSlots,
        },
        { headers: NO_STORE },
      );
    }

    if (candidate.status === 'invalid-department') {
      return NextResponse.json(
        {
          slots: [],
          code: 'invalid-department',
          message: 'Le département de votre candidature est invalide. Renvoyez votre candidature.',
        },
        { status: 409, headers: NO_STORE },
      );
    }

    const slots = await getSlotsForDepartment(candidate.department);
    return NextResponse.json(
      {
        department: candidate.department,
        departmentLabel: DEPARTMENT_LABELS[candidate.department],
        slots,
      },
      { headers: NO_STORE },
    );
  } catch (err) {
    console.error('[api/creneaux] échec de la récupération des créneaux', err);
    return NextResponse.json(
      { slots: [], code: 'server-error', message: 'Erreur serveur.' },
      { status: 500, headers: NO_STORE },
    );
  }
}