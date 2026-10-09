// app/api/admin/candidatures/route.ts
//
// Suppression de candidatures depuis l'espace administration.
//   DELETE → JSON { ids: string[] } (identifiants de documents Firestore).
//
// Pour chaque candidature supprimée, la route nettoie aussi ses traces :
//   • l'entretien réservé par son e-mail est libéré (le créneau redevient
//     disponible, rappel 24 h annulé) ;
//   • sa décision de délibération (collection « deliberations », ID = e-mail)
//     est supprimée, pour ne pas laisser un résultat orphelin.
// Le candidat pourra ensuite redéposer une candidature avec le même e-mail.
//
// Réservé aux administrateurs (ADMIN_EMAILS). Action irréversible.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { FieldValue, type DocumentReference } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';
import { CACHE_TAGS, invalidate } from '@/lib/data-cache';
import { denyResponse, requireAdmin } from '@/lib/admin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

/** Nombre max de candidatures par requête. */
const MAX_IDS = 200;
/** Taille d'un lot d'écriture (≤ 3 opérations par candidature, limite Firestore : 500). */
const CHUNK_SIZE = 100;

const bodySchema = z.object({
  // Les identifiants sont des IDs de documents Firestore : on refuse tout
  // caractère (ex. « / ») qui casserait le chemin du document.
  ids: z
    .array(z.string().regex(/^[A-Za-z0-9_-]{1,200}$/))
    .min(1)
    .max(MAX_IDS),
});

function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status, headers: NO_STORE });
}

export async function DELETE(request: Request) {
  const check = await requireAdmin(request);
  if (!check.ok) return denyResponse(check);

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return fail(`Sélection invalide : 1 à ${MAX_IDS} candidatures à la fois.`);
  }
  const ids = [...new Set(parsed.data.ids)];

  const db = getAdminDb();
  if (!db) return fail('Base de données indisponible.', 500);

  try {
    // Créneaux réservés, indexés par e-mail (une seule lecture pour tout le lot).
    const bookedSnap = await db.collection('slots').where('booked', '==', true).get();
    const slotsByEmail = new Map<string, DocumentReference[]>();
    for (const doc of bookedSnap.docs) {
      const email = doc.data().bookedByEmail;
      if (typeof email !== 'string' || !email) continue;
      const key = email.trim().toLowerCase();
      slotsByEmail.set(key, [...(slotsByEmail.get(key) ?? []), doc.ref]);
    }

    let deleted = 0;
    let releasedSlots = 0;
    let removedDecisions = 0;

    for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
      const chunk = ids.slice(i, i + CHUNK_SIZE);
      const candidatureDocs = await db.getAll(
        ...chunk.map((id) => db.collection('candidatures').doc(id)),
      );
      const existing = candidatureDocs.filter((doc) => doc.exists);
      if (existing.length === 0) continue;

      const emails = existing.map((doc) => String(doc.data()?.email ?? '').trim().toLowerCase());

      // Décisions de délibération existantes (ID = e-mail en minuscules).
      const decisionRefs = [...new Set(emails.filter(Boolean))].map((email) =>
        db.collection('deliberations').doc(email),
      );
      const decisionDocs = decisionRefs.length > 0 ? await db.getAll(...decisionRefs) : [];

      const batch = db.batch();
      existing.forEach((doc, index) => {
        batch.delete(doc.ref);
        deleted += 1;

        for (const slotRef of slotsByEmail.get(emails[index]) ?? []) {
          batch.update(slotRef, {
            booked: false,
            bookedByEmail: FieldValue.delete(),
            reminderSentAt: FieldValue.delete(),
          });
          releasedSlots += 1;
        }
        // Un même e-mail ne doit libérer ses créneaux qu'une fois.
        slotsByEmail.delete(emails[index]);
      });
      for (const decision of decisionDocs) {
        if (!decision.exists) continue;
        batch.delete(decision.ref);
        removedDecisions += 1;
      }
      await batch.commit();
      // Candidatures, créneaux libérés et décisions ont changé : les vues admin en cache sont périmées.
      invalidate(CACHE_TAGS.candidatures, CACHE_TAGS.slots, CACHE_TAGS.decisions);
    }

    return NextResponse.json(
      {
        ok: true,
        deleted,
        releasedSlots,
        removedDecisions,
        notFound: ids.length - deleted,
      },
      { headers: NO_STORE },
    );
  } catch {
    return fail('Erreur serveur lors de la suppression.', 500);
  }
}