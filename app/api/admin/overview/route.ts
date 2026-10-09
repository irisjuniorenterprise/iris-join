// app/api/admin/overview/route.ts
//
// Vue d'ensemble pour l'espace administration : toutes les candidatures
// et tous les créneaux (avec l'e-mail des candidats ayant réservé).
// Réservé aux e-mails listés dans ADMIN_EMAILS.
//
// Lectures Firestore : les deux listes passent par lib/admin-cache.ts (cache
// partagé invalidé à chaque écriture) au lieu d'être relues en entier à chaque
// appel. Les champs exposés sont listés explicitement dans ce module : on
// n'expose jamais un document brut.
import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { denyResponse, requireAdmin } from '@/lib/admin-auth';
import { listAllSlotsForAdmin, listCandidaturesForAdmin } from '@/lib/admin-cache';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

export async function GET(request: Request) {
  const check = await requireAdmin(request);
  if (!check.ok) return denyResponse(check);

  const db = getAdminDb();
  if (!db) {
    return NextResponse.json(
      { ok: false, message: 'Base de données indisponible.' },
      { status: 500, headers: NO_STORE },
    );
  }

  try {
    const [candidatures, slots] = await Promise.all([
      listCandidaturesForAdmin(),
      listAllSlotsForAdmin(),
    ]);

    return NextResponse.json(
      { ok: true, admin: check.email, candidatures, slots },
      { headers: NO_STORE },
    );
  } catch {
    return NextResponse.json(
      { ok: false, message: 'Erreur serveur lors du chargement des données.' },
      { status: 500, headers: NO_STORE },
    );
  }
}