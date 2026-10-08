// app/api/candidature/complement/route.ts
//
// Un candidat dont la candidature a été IMPORTÉE (fichier Excel de l'admin)
// peut compléter lui-même les données manquantes — c'est facultatif.
//  - GET  : liste les données manquantes de SA candidature ;
//  - POST : enregistre ses réponses (seules les données absentes sont
//           modifiables, jamais celles déjà renseignées).
// Le département n'est pas géré ici : il se choisit avant la réservation
// (voir app/api/creneaux et app/api/reservation).
// L'e-mail vient toujours du token Firebase vérifié, jamais du corps.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getVerifiedEmail, isFirebaseAdminConfigured } from '@/lib/firebase-admin';
import { applyComplement, getComplementState } from '@/lib/candidature-complement-store';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

// Valeurs courtes uniquement : le détail est validé champ par champ dans le store.
const bodySchema = z.record(z.string().max(40), z.string().max(1600));

function fail(message: string, status: number, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, message, ...extra }, { status, headers: NO_STORE });
}

async function authenticate(request: Request): Promise<{ email: string } | { response: NextResponse }> {
  if (!isFirebaseAdminConfigured()) {
    return { response: fail('Serveur mal configuré (Firebase Admin manquant).', 500) };
  }
  const email = await getVerifiedEmail(request);
  if (!email) return { response: fail('Connexion requise. Reconnectez-vous et réessayez.', 401) };
  return { email };
}

export async function GET(request: Request) {
  const auth = await authenticate(request);
  if ('response' in auth) return auth.response;

  try {
    const state = await getComplementState(auth.email);
    if (state.status === 'no-candidature') {
      return fail("Aucune candidature trouvée pour cet e-mail.", 404, { code: 'no-candidature' });
    }
    return NextResponse.json({ ok: true, missing: state.missing }, { headers: NO_STORE });
  } catch (err) {
    console.error('[api/candidature/complement] lecture', err);
    return fail('Erreur serveur.', 500);
  }
}

export async function POST(request: Request) {
  const auth = await authenticate(request);
  if ('response' in auth) return auth.response;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail('Données invalides.', 400);

  try {
    const outcome = await applyComplement(auth.email, parsed.data);
    if (!outcome.ok) {
      if (outcome.reason === 'no-candidature') {
        return fail("Aucune candidature trouvée pour cet e-mail.", 404, { code: 'no-candidature' });
      }
      return fail('Certaines réponses sont invalides.', 400, { errors: outcome.errors });
    }
    return NextResponse.json(
      { ok: true, saved: outcome.saved, missing: outcome.missing },
      { headers: NO_STORE },
    );
  } catch (err) {
    console.error('[api/candidature/complement] enregistrement', err);
    return fail('Erreur serveur.', 500);
  }
}