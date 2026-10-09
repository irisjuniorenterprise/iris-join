// lib/data-cache.ts
//
// Cache de données PARTAGÉ (Next.js « Data Cache ») pour réduire les lectures
// Firestore. Contrairement à une variable en mémoire, il est commun à toutes
// les instances serverless : 1 000 candidats qui ouvrent la même page
// déclenchent UNE lecture, pas 1 000.
//
// Règles :
//  - on ne met en cache que des données identiques pour tous les candidats
//    (liste des créneaux d'un département, réglages), clés par e-mail
//    (décision d'un candidat), ou des vues ADMIN (lib/admin-cache.ts) qui ne
//    sont lisibles qu'à travers des routes protégées par `requireAdmin` ;
//  - chaque écriture qui change ces données appelle `invalidate(tag)` pour
//    qu'elles soient relues immédiatement ; le TTL (`revalidate`) n'est qu'un
//    filet de sécurité ;
//  - une erreur n'est jamais mise en cache : si Firestore échoue, la requête
//    suivante réessaie.
//
// Désactivé sous Vitest (comme le cache des réglages) : les tests doivent
// toujours lire l'état réel de la base.
import { revalidateTag, unstable_cache } from 'next/cache';

export const CACHE_TAGS = {
  slots: 'slots',
  decisions: 'decisions',
  settings: 'settings',
  candidatures: 'candidatures',
} as const;

export type CacheTag = (typeof CACHE_TAGS)[keyof typeof CACHE_TAGS];

const CACHE_ENABLED = process.env.NODE_ENV !== 'test';

/** Vrai quand le cache partagé est actif (faux sous Vitest). */
export const DATA_CACHE_ENABLED = CACHE_ENABLED;

/** Enveloppe `fn` dans le cache partagé (les arguments font partie de la clé). */
export function dataCache<Args extends unknown[], Result>(
  fn: (...args: Args) => Promise<Result>,
  keyParts: string[],
  options: { revalidate: number; tags: CacheTag[] },
): (...args: Args) => Promise<Result> {
  if (!CACHE_ENABLED) return fn;
  return unstable_cache(fn, keyParts, options);
}

/** Périme immédiatement toutes les entrées portant ces tags. */
export function invalidate(...tags: CacheTag[]): void {
  if (!CACHE_ENABLED) return;
  for (const tag of tags) {
    try {
      revalidateTag(tag, { expire: 0 });
    } catch {
      // Hors requête Next (script, tâche de fond) : rien à invalider, le TTL prendra le relais.
    }
  }
}