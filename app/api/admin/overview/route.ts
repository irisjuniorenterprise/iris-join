// app/api/admin/overview/route.ts
//
// Vue d'ensemble pour l'espace administration : toutes les candidatures
// et tous les créneaux (avec l'e-mail des candidats ayant réservé).
// Réservé aux e-mails listés dans ADMIN_EMAILS.
import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { denyResponse, requireAdmin } from '@/lib/admin-auth';
import { listAllSlots } from '@/lib/slots-store';
import { normalizeDepartment } from '@/lib/interview';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

const str = (value: unknown): string => (typeof value === 'string' ? value : '');
const bool = (value: unknown): boolean => value === true;
const strArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];

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
    const [candidaturesSnap, slots] = await Promise.all([
      db.collection('candidatures').get(),
      listAllSlots(),
    ]);

    // Champs listés explicitement : on n'expose jamais un document brut.
    const candidatures = candidaturesSnap.docs
      .map((doc) => {
        const d = doc.data();
        return {
          id: doc.id,
          nomPrenom: str(d.nomPrenom),
          telephone: str(d.telephone),
          filiere: str(d.filiere),
          niveauEtudes: str(d.niveauEtudes),
          departement: str(d.departement),
          department: normalizeDepartment(d.departement),
          departements: strArray(d.departements),
          sourceConnaissance: str(d.sourceConnaissance),
          niveauFrancais: str(d.niveauFrancais),
          niveauAnglais: str(d.niveauAnglais),
          participationFormations: str(d.participationFormations),
          autreEngagement: str(d.autreEngagement),
          organisationTemps: str(d.organisationTemps),
          motivation: str(d.motivation),
          domaine: str(d.domaine),
          remarques: str(d.remarques),
          consentement: bool(d.consentement),
          email: str(d.email),
          createdAt: str(d.createdAt) || null,
          updatedAt: str(d.updatedAt) || null,
        };
      })
      .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));

    return NextResponse.json(
      { ok: true, admin: check.email, candidatures, slots },
      { headers: NO_STORE },
    );
  } catch (err) {
    console.error('[api/admin/overview] échec', err);
    return NextResponse.json(
      { ok: false, message: 'Erreur serveur lors du chargement des données.' },
      { status: 500, headers: NO_STORE },
    );
  }
}