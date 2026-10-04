// app/api/candidature/route.ts
import { NextResponse } from 'next/server';
import { getAdminDb, getVerifiedEmail, isFirebaseAdminConfigured } from '@/lib/firebase-admin';
import { sendCandidatureConfirmation, notifyRhNewCandidature } from '@/lib/email';
import { DEPARTMENT_LABELS } from '@/lib/interview';
import { candidatureSchema, departementPrincipal } from '@/lib/candidature';
import { getServiceWindowStates } from '@/lib/settings-store';
import { getNotificationSettings } from '@/lib/notification-settings-store';
import { formatServiceDateTime } from '@/lib/service-window';

/**
 * GET — vérifie si une candidature existe déjà pour l'e-mail vérifié.
 * Utilisé par le formulaire (CandidatureForm) dès que l'e-mail est
 * confirmé, pour afficher un message "déjà candidat" AVANT que la
 * personne ne remplisse tout le formulaire pour rien.
 */
export async function GET(request: Request) {
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

  const db = getAdminDb();
  if (!db) {
    return NextResponse.json({ ok: false, message: 'Base de données indisponible.' }, { status: 500 });
  }

  const existing = await db.collection('candidatures').where('email', '==', email).limit(1).get();

  if (existing.empty) {
    return NextResponse.json({ ok: true, exists: false });
  }

  const data = existing.docs[0].data();
  return NextResponse.json({
    ok: true,
    exists: true,
    submittedAt: (data.createdAt as string | undefined) ?? null,
    departement: (data.departement as string | undefined) ?? null,
  });
}

/**
 * POST — crée la candidature. Une seule candidature par adresse e-mail :
 * si un document existe déjà pour cet e-mail, la requête est refusée
 * (409) plutôt que de mettre à jour la candidature existante. Le
 * candidat ne peut donc plus « re-remplir » le formulaire une fois sa
 * candidature envoyée.
 */
export async function POST(request: Request) {
  if (!isFirebaseAdminConfigured()) {
    return NextResponse.json(
      { ok: false, message: 'Serveur mal configuré (Firebase Admin manquant).' },
      { status: 500 },
    );
  }

  // L'email n'est JAMAIS pris depuis le corps de la requête : il vient
  // uniquement du token Firebase vérifié côté serveur, ce qui garantit
  // que la candidature est bien associée au compte Google authentifié.
  const email = await getVerifiedEmail(request);
  if (!email) {
    return NextResponse.json(
      { ok: false, message: 'Connexion requise. Reconnectez-vous et réessayez.' },
      { status: 401 },
    );
  }

  // Le formulaire n'est visible que pendant la période configurée par
  // l'admin (voir lib/settings-store.ts) — revalidé ici côté serveur au
  // cas où la requête arriverait après la fermeture (onglet resté ouvert,
  // appel direct à l'API…).
  const { candidature: candidatureWindow } = await getServiceWindowStates();
  if (candidatureWindow.status.state === 'not-started') {
    return NextResponse.json(
      {
        ok: false,
        code: 'NOT_STARTED',
        message: `Les candidatures ne sont pas encore ouvertes. Rendez-vous à partir du ${formatServiceDateTime(candidatureWindow.status.opensAt)}.`,
      },
      { status: 403 },
    );
  }
  if (candidatureWindow.status.state === 'closed') {
    return NextResponse.json(
      {
        ok: false,
        code: 'CLOSED',
        message: `Les candidatures sont closes depuis le ${formatServiceDateTime(candidatureWindow.status.closesAt)}.`,
      },
      { status: 403 },
    );
  }

  // Corps absent ou JSON invalide : 400 propre au lieu d'une exception (500).
  const body = await request.json().catch(() => null);
  const result = candidatureSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { ok: false, errors: result.error.flatten() },
      { status: 400 },
    );
  }

  const db = getAdminDb();
  if (!db) {
    return NextResponse.json({ ok: false, message: 'Base de données indisponible.' }, { status: 500 });
  }

  // Une seule candidature par email : si un document existe déjà pour cet
  // e-mail, on refuse la resoumission (au lieu de mettre à jour comme
  // auparavant). Le client vérifie déjà ce cas via GET avant d'afficher
  // le formulaire, mais on revalide ici côté serveur (source de vérité,
  // et protection contre une éventuelle course entre deux requêtes).
  const existing = await db.collection('candidatures').where('email', '==', email).limit(1).get();

  if (!existing.empty) {
    return NextResponse.json(
      {
        ok: false,
        code: 'ALREADY_SUBMITTED',
        message:
          'Une candidature a déjà été envoyée avec cette adresse e-mail. Une seule candidature est autorisée par candidat.',
      },
      { status: 409 },
    );
  }

  // `result.data.departements` est la liste classée par le candidat
  // (ordre de préférence). Seul le premier choix compte pour la
  // réservation d'entretien : c'est lui qui est enregistré dans le champ
  // `departement` (unique), lu par tout le système de créneaux
  // (lib/slots-store.ts, api/creneaux, api/reservation). Les autres choix
  // restent visibles dans `departements` pour l'équipe RH uniquement.
  const departement = departementPrincipal(result.data.departements);
  const now = new Date().toISOString();

  const payload = {
    ...result.data,
    departement,
    email,
    createdAt: now,
    updatedAt: now,
  };

  await db.collection('candidatures').add(payload);

  const departementLabel = DEPARTMENT_LABELS[departement];

  // L'admin décide (Réglages > E-mail de confirmation) si le candidat reçoit
  // un e-mail de confirmation. La notification interne à l'équipe RH part toujours.
  const { candidatureEmail } = await getNotificationSettings();

  // Les emails ne bloquent jamais la réponse : un échec d'envoi est loggé
  // côté serveur (voir lib/email.ts) mais la candidature est déjà enregistrée.
  await Promise.allSettled([
    candidatureEmail
      ? sendCandidatureConfirmation(email, result.data.nomPrenom, departementLabel)
      : Promise.resolve(),
    notifyRhNewCandidature(email, result.data.nomPrenom, departementLabel),
  ]);

  return NextResponse.json({ ok: true });
}