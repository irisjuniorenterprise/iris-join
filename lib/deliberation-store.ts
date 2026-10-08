// lib/deliberation-store.ts
//
// Résultats de délibération persistés dans Firestore (collection
// "deliberations"). SERVEUR uniquement (routes API, via Firebase Admin).
//
// Modèle : un document = un résultat, dont l'ID est l'adresse e-mail du
// candidat en minuscules. Un résultat existe dès que l'admin a pris une
// décision ; il reste un BROUILLON (published = false, invisible pour le
// candidat) jusqu'à sa publication.

import { FieldValue, type DocumentData } from 'firebase-admin/firestore';
import { getAdminDb } from './firebase-admin';
import { CACHE_TAGS, dataCache, invalidate } from './data-cache';
import { isResultStatus, type AdminDecision, type ResultStatus } from './deliberation';
import { normalizeDepartment, type DepartmentKey } from './interview';

const COLLECTION = 'deliberations';
const BATCH_SIZE = 400;
const GET_ALL_SIZE = 100;

export const normEmail = (email: string): string => email.trim().toLowerCase();

function getDb() {
  const db = getAdminDb();
  if (!db) throw new Error('firestore-not-configured');
  return db;
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function toDecision(id: string, data: DocumentData): AdminDecision | null {
  if (!isResultStatus(data.status)) return null;
  return {
    email: id,
    status: data.status,
    message: typeof data.message === 'string' ? data.message : '',
    published: data.published === true,
    publishedAt: optionalString(data.publishedAt),
    emailSentAt: optionalString(data.emailSentAt),
    decidedAt: optionalString(data.decidedAt),
    decidedBy: optionalString(data.decidedBy),
    acceptedDepartment: data.status === 'accepted' ? normalizeDepartment(data.acceptedDepartment) : null,
  };
}

/** Toutes les décisions (brouillons et publiées). */
export async function listDecisions(): Promise<AdminDecision[]> {
  const snapshot = await getDb().collection(COLLECTION).get();
  return snapshot.docs
    .map((doc) => toDecision(doc.id, doc.data()))
    .filter((d): d is AdminDecision => d !== null);
}

/** Décisions des clés demandées (clés absentes = pas de décision). */
export async function getDecisions(keys: string[]): Promise<Map<string, AdminDecision>> {
  const db = getDb();
  const unique = Array.from(new Set(keys.map(normEmail)));
  const result = new Map<string, AdminDecision>();

  for (let i = 0; i < unique.length; i += GET_ALL_SIZE) {
    const refs = unique.slice(i, i + GET_ALL_SIZE).map((key) => db.collection(COLLECTION).doc(key));
    if (refs.length === 0) continue;
    const docs = await db.getAll(...refs);
    for (const doc of docs) {
      if (!doc.exists) continue;
      const decision = toDecision(doc.id, doc.data() as DocumentData);
      if (decision) result.set(doc.id, decision);
    }
  }
  return result;
}

export async function getDecision(key: string): Promise<AdminDecision | null> {
  const map = await getDecisions([key]);
  return map.get(normEmail(key)) ?? null;
}

/**
 * Version en cache partagé, réservée à l'API CANDIDAT (/api/resultat),
 * appelée en boucle par la page « Résultats ». 1 lecture Firestore par
 * candidat et par minute au plus ; toute décision enregistrée, publiée ou
 * retirée invalide le cache (voir `setDecisions` et `setPublished`). Le
 * brouillon est mis en cache lui aussi, mais la route ne renvoie jamais
 * un résultat non publié. L'admin continue d'utiliser `getDecision`.
 */
export const getDecisionCached = dataCache(
  async (key: string): Promise<AdminDecision | null> => getDecision(key),
  ['decision-by-email'],
  { revalidate: 60, tags: [CACHE_TAGS.decisions] },
);

/**
 * Enregistre (ou retire, si status = null) la décision pour une liste de
 * candidats. Un résultat nouvellement créé est toujours un brouillon ; un
 * résultat déjà publié le reste, mais sa date d'envoi d'e-mail est effacée
 * quand la décision ou le message change (l'e-mail est à renvoyer).
 * Renvoie le nombre de résultats réellement créés / modifiés / retirés.
 *
 * `acceptedDepartment` (uniquement pour « accepté ») : département dans lequel
 * le candidat est accepté s'il diffère de son 1er choix. `undefined` = on
 * conserve la valeur actuelle ; `null` = on la retire (retour au 1er choix).
 * Pour tout autre résultat, le champ est toujours retiré.
 */
export async function setDecisions(
  keys: string[],
  status: ResultStatus | null,
  message: string | undefined,
  adminEmail: string,
  acceptedDepartment?: DepartmentKey | null,
): Promise<number> {
  const db = getDb();
  const unique = Array.from(new Set(keys.map(normEmail)));
  const existing = await getDecisions(unique);
  const now = new Date().toISOString();
  let count = 0;

  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const batch = db.batch();
    let pending = 0;

    for (const key of unique.slice(i, i + BATCH_SIZE)) {
      const ref = db.collection(COLLECTION).doc(key);
      const prev = existing.get(key);

      if (status === null) {
        if (prev) {
          batch.delete(ref);
          pending += 1;
        }
        continue;
      }

      const nextMessage = message !== undefined ? message : (prev?.message ?? '');
      const prevDepartment = prev?.acceptedDepartment ?? null;
      const nextDepartment: DepartmentKey | null =
        status !== 'accepted'
          ? null
          : acceptedDepartment !== undefined
            ? acceptedDepartment
            : prevDepartment;
      if (
        prev &&
        prev.status === status &&
        prev.message === nextMessage &&
        prevDepartment === nextDepartment
      ) {
        continue;
      }

      batch.set(
        ref,
        {
          email: key,
          status,
          message: nextMessage,
          published: prev?.published ?? false,
          decidedAt: now,
          decidedBy: adminEmail,
          updatedAt: now,
          ...(nextDepartment
            ? { acceptedDepartment: nextDepartment }
            : prevDepartment
              ? { acceptedDepartment: FieldValue.delete() }
              : {}),
          ...(prev?.emailSentAt ? { emailSentAt: FieldValue.delete() } : {}),
        },
        { merge: true },
      );
      pending += 1;
    }

    if (pending > 0) await batch.commit();
    count += pending;
  }

  if (count > 0) invalidate(CACHE_TAGS.decisions);
  return count;
}

/**
 * Publie (ou dépublie) des résultats. `keys = null` : tous les résultats
 * concernés (tous les brouillons pour une publication). Renvoie les clés
 * réellement modifiées, dans l'ordre.
 */
export async function setPublished(keys: string[] | null, published: boolean): Promise<string[]> {
  const db = getDb();

  let targets: AdminDecision[];
  if (keys === null) {
    const snapshot = await db.collection(COLLECTION).where('published', '==', !published).get();
    targets = snapshot.docs
      .map((doc) => toDecision(doc.id, doc.data()))
      .filter((d): d is AdminDecision => d !== null);
  } else {
    const found = await getDecisions(keys);
    targets = Array.from(found.values()).filter((d) => d.published !== published);
  }

  const now = new Date().toISOString();
  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    const batch = db.batch();
    for (const decision of targets.slice(i, i + BATCH_SIZE)) {
      batch.update(
        db.collection(COLLECTION).doc(decision.email),
        published
          ? { published: true, publishedAt: now, updatedAt: now }
          : { published: false, publishedAt: FieldValue.delete(), updatedAt: now },
      );
    }
    await batch.commit();
  }

  if (targets.length > 0) invalidate(CACHE_TAGS.decisions);
  return targets.map((d) => d.email);
}

/** Note l'envoi de l'e-mail de résultat (évite les doublons involontaires). */
export async function markEmailSent(key: string): Promise<void> {
  await getDb()
    .collection(COLLECTION)
    .doc(normEmail(key))
    .update({ emailSentAt: new Date().toISOString() });
}