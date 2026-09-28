// app/api/resultat/route.ts
//
// Résultat de délibération du candidat authentifié. Ne renvoie JAMAIS un
// brouillon : tant que l'admin n'a pas publié, le candidat reçoit
// simplement l'état "pending" (délibération en cours).
//
// États renvoyés dans `state` :
//  - "no-candidature" : aucune candidature déposée avec cet e-mail ;
//  - "pending"        : candidature déposée, résultat pas encore publié ;
//  - "published"      : résultat visible (`result` présent).
import { NextResponse } from 'next/server';
import { getVerifiedEmail, isFirebaseAdminConfigured } from '@/lib/firebase-admin';
import { getCandidateDepartment } from '@/lib/slots-store';
import { getDecision, normEmail } from '@/lib/deliberation-store';
import { DEPARTMENT_LABELS } from '@/lib/interview';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

export async function GET(request: Request) {
  if (!isFirebaseAdminConfigured()) {
    return NextResponse.json(
      { ok: false, message: 'Serveur mal configuré (Firebase Admin manquant).' },
      { status: 500, headers: NO_STORE },
    );
  }

  const email = await getVerifiedEmail(request);
  if (!email) {
    return NextResponse.json(
      { ok: false, message: 'Connexion requise. Reconnectez-vous et réessayez.' },
      { status: 401, headers: NO_STORE },
    );
  }

  try {
    const candidate = await getCandidateDepartment(email);
    if (candidate.status === 'no-candidature') {
      return NextResponse.json({ ok: true, state: 'no-candidature' }, { headers: NO_STORE });
    }

    const decision = await getDecision(normEmail(email));
    if (!decision || !decision.published) {
      return NextResponse.json({ ok: true, state: 'pending' }, { headers: NO_STORE });
    }

    return NextResponse.json(
      {
        ok: true,
        state: 'published',
        result: {
          status: decision.status,
          message: decision.message,
          departmentLabel: candidate.status === 'ok' ? DEPARTMENT_LABELS[candidate.department] : null,
          publishedAt: decision.publishedAt,
        },
      },
      { headers: NO_STORE },
    );
  } catch (err) {
    console.error('[api/resultat] échec de la lecture du résultat', err);
    return NextResponse.json(
      { ok: false, message: 'Erreur serveur. Réessayez dans quelques instants.' },
      { status: 500, headers: NO_STORE },
    );
  }
}