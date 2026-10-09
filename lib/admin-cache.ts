// lib/admin-cache.ts
//
// Vues ADMIN en cache partagé, pour réduire les lectures Firestore (1 document
// renvoyé = 1 lecture facturée). Avant : chaque ouverture / « Actualiser » /
// action du tableau de bord relisait TOUTES les candidatures + TOUS les
// créneaux, et chaque décision enregistrée relisait toutes les candidatures.
//
// Principe :
//  - la liste des candidatures est mise en cache (Next « Data Cache », commun à
//    toutes les instances) avec, dans sa clé, le NOMBRE de candidatures obtenu par
//    une requête d'agrégation `count()` (1 lecture facturée par tranche de 1 000
//    documents). Toute candidature ajoutée (formulaire, import) ou supprimée
//    change le nombre : la liste est relue sans qu'aucune route d'écriture n'ait
//    à y penser ;
//  - les modifications qui ne changent pas le nombre (complément d'un candidat,
//    suppression + ajout simultanés) invalident le tag `candidatures` ;
//  - les créneaux sont invalidés par le tag `slots`, déjà appelé à chaque écriture
//    de lib/slots-store.ts ;
//  - le TTL n'est qu'un filet de sécurité (modification manuelle dans la console) ;
//  - une erreur n'est jamais mise en cache.
//
// Données ADMIN uniquement : ces fonctions ne sont appelées que par des routes
// protégées par `requireAdmin`. Sous Vitest, le cache est désactivé et le
// comportement est identique à l'ancien (lecture directe de la base).
import type { DocumentData } from 'firebase-admin/firestore';
import { CACHE_TAGS, DATA_CACHE_ENABLED, dataCache } from './data-cache';
import { getAdminDb } from './firebase-admin';
import { normalizeDepartment } from './interview';
import { listAllSlots } from './slots-store';

const COLLECTION = 'candidatures';

const str = (value: unknown): string => (typeof value === 'string' ? value : '');
const bool = (value: unknown): boolean => value === true;
const strArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];

/** Candidature telle qu'exposée à l'administration (champs listés explicitement). */
function toAdminCandidature(id: string, d: DocumentData) {
  return {
    id,
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
}

export type AdminCandidature = ReturnType<typeof toAdminCandidature>;

/** Lecture directe (la seule qui coûte N lectures) : à ne pas appeler hors cache. */
async function readCandidaturesFromDb(): Promise<AdminCandidature[]> {
  const db = getAdminDb();
  if (!db) throw new Error('firestore-not-configured');

  const snapshot = await db.collection(COLLECTION).get();
  return snapshot.docs
    .map((doc) => toAdminCandidature(doc.id, doc.data()))
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
}

/** Le paramètre `_version` ne sert qu'à faire varier la clé de cache. */
const readCandidaturesCached = dataCache(
  async (_version: number) => readCandidaturesFromDb(),
  ['admin-candidatures-list'],
  { revalidate: 300, tags: [CACHE_TAGS.candidatures] },
);

/** Nombre de candidatures (agrégation : ~1 lecture facturée). -1 si indisponible. */
async function candidaturesVersion(): Promise<number> {
  const db = getAdminDb();
  if (!db) return -1;
  try {
    const aggregate = await db.collection(COLLECTION).count().get();
    return aggregate.data().count;
  } catch {
    // count() indisponible : on retombe sur le TTL et les invalidations par tag.
    return -1;
  }
}

/** Toutes les candidatures, plus récentes d'abord. */
export async function listCandidaturesForAdmin(): Promise<AdminCandidature[]> {
  if (!DATA_CACHE_ENABLED) return readCandidaturesFromDb();
  return readCandidaturesCached(await candidaturesVersion());
}

/** E-mails de toutes les candidatures (vérifier qu'une décision vise un vrai candidat). */
export async function listCandidatureEmails(): Promise<string[]> {
  if (!DATA_CACHE_ENABLED) {
    const db = getAdminDb();
    if (!db) throw new Error('firestore-not-configured');
    const snapshot = await db.collection(COLLECTION).select('email').get();
    return snapshot.docs
      .map((doc) => doc.data().email)
      .filter((email): email is string => typeof email === 'string');
  }
  const candidatures = await readCandidaturesCached(await candidaturesVersion());
  return candidatures.map((c) => c.email).filter(Boolean);
}

const readAllSlotsCached = dataCache(async () => listAllSlots(), ['admin-all-slots'], {
  revalidate: 120,
  tags: [CACHE_TAGS.slots],
});

/** Tous les créneaux (avec l'e-mail des réservations), invalidés à chaque écriture de créneau. */
export async function listAllSlotsForAdmin(): Promise<Awaited<ReturnType<typeof listAllSlots>>> {
  return readAllSlotsCached();
}