// lib/candidature-complement-store.ts
//
// Lecture / enregistrement des données qu'un candidat importé complète
// lui-même (voir lib/candidature-complement.ts). SERVEUR UNIQUEMENT.
//
// Garanties : l'e-mail identifie la candidature (il vient du token vérifié,
// jamais du corps de la requête) ; seules les données ABSENTES (vides ou
// tiret) peuvent être renseignées ; une donnée déjà présente n'est jamais
// écrasée ; lecture et écriture se font dans la même transaction.
import type { DocumentData } from 'firebase-admin/firestore';
import { getAdminDb } from './firebase-admin';
import { CACHE_TAGS, invalidate } from './data-cache';
import {
  getMissingKeys,
  isBlank,
  validateComplement,
  type ComplementFieldKey,
} from './candidature-complement';

const COLLECTION = 'candidatures';

export type ComplementState =
  | { status: 'no-candidature' }
  | { status: 'ok'; missing: ComplementFieldKey[] };

export type ApplyComplementResult =
  | { ok: true; saved: ComplementFieldKey[]; missing: ComplementFieldKey[] }
  | { ok: false; reason: 'no-candidature' }
  | { ok: false; reason: 'invalid'; errors: Partial<Record<ComplementFieldKey, string>> };

/** Données manquantes de la candidature de cet e-mail (département exclu). */
export async function getComplementState(email: string): Promise<ComplementState> {
  const db = getAdminDb();
  if (!db) throw new Error('firestore-not-configured');

  const snapshot = await db.collection(COLLECTION).where('email', '==', email).limit(1).get();
  if (snapshot.empty) return { status: 'no-candidature' };
  return { status: 'ok', missing: getMissingKeys(snapshot.docs[0].data()) };
}

/** Enregistre les réponses du candidat pour les seules données manquantes. */
export async function applyComplement(
  email: string,
  input: Record<string, unknown>,
): Promise<ApplyComplementResult> {
  const db = getAdminDb();
  if (!db) throw new Error('firestore-not-configured');

  const snapshot = await db.collection(COLLECTION).where('email', '==', email).limit(1).get();
  if (snapshot.empty) return { ok: false, reason: 'no-candidature' };
  const ref = snapshot.docs[0].ref;

  const outcome = await db.runTransaction(async (tx): Promise<ApplyComplementResult> => {
    const doc = await tx.get(ref);
    if (!doc.exists) return { ok: false, reason: 'no-candidature' };
    const data = doc.data() as DocumentData;

    const allowed = getMissingKeys(data);
    // « Autre engagement : oui » renseigné maintenant → le détail devient demandé.
    const engagement = typeof input.autreEngagement === 'string' ? input.autreEngagement.trim() : data.autreEngagement;
    if (engagement === 'oui' && !allowed.includes('organisationTemps') && isBlank(data.organisationTemps)) {
      allowed.push('organisationTemps');
    }

    const result = validateComplement(input, allowed);
    if (!result.ok) return { ok: false, reason: 'invalid', errors: result.errors };

    // Engagement « oui » donné sans explication : mêmes règles que le formulaire public.
    if (
      result.values.autreEngagement === 'oui' &&
      !result.values.organisationTemps &&
      (isBlank(data.organisationTemps) || String(data.organisationTemps).trim().length < 10)
    ) {
      return {
        ok: false,
        reason: 'invalid',
        errors: { organisationTemps: 'Expliquez comment vous organiserez votre temps (10 caractères min.)' },
      };
    }

    const saved = Object.keys(result.values) as ComplementFieldKey[];
    if (saved.length === 0) return { ok: true, saved, missing: getMissingKeys(data) };

    const now = new Date().toISOString();
    tx.update(ref, {
      ...result.values,
      complementeParCandidat: true,
      complementUpdatedAt: now,
      updatedAt: now,
    });

    return { ok: true, saved, missing: getMissingKeys({ ...data, ...result.values }) };
  });

  // La candidature a changé : la vue admin (lib/admin-cache.ts) doit la relire.
  if (outcome.ok && outcome.saved.length > 0) invalidate(CACHE_TAGS.candidatures);
  return outcome;
}