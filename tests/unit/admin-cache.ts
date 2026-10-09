// lib/admin-cache.ts : vues admin en cache partagé.
// `next/cache` est simulé par un petit cache mémoire (clé = clé de l'appel + arguments,
// invalidation par tag). On vérifie la RÉDUCTION des lectures Firestore :
//  - 2 chargements identiques = 1 seule lecture complète de `candidatures` ;
//  - une candidature ajoutée/supprimée est détectée par le count() (aucune route d'écriture requise) ;
//  - une modification sans changement de nombre est vue après invalidation du tag ;
//  - les créneaux restent en cache jusqu'à l'invalidation du tag `slots`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Entry = { value: unknown; tags: string[] };

const h = vi.hoisted(() => ({
  store: new Map<string, Entry>(),
  docs: [] as Array<Record<string, unknown>>,
  reads: 0,
  counts: 0,
  slotReads: 0,
}));

vi.mock('next/cache', () => ({
  unstable_cache:
    (fn: (...a: unknown[]) => Promise<unknown>, keyParts: string[], options: { tags: string[] }) =>
    async (...args: unknown[]) => {
      const key = `${keyParts.join('|')}::${JSON.stringify(args)}`;
      const hit = h.store.get(key);
      if (hit) return hit.value;
      const value = await fn(...args);
      h.store.set(key, { value, tags: options.tags });
      return value;
    },
  revalidateTag: (tag: string) => {
    for (const [key, entry] of h.store) if (entry.tags.includes(tag)) h.store.delete(key);
  },
}));

vi.mock('@/lib/firebase-admin', () => ({
  getAdminDb: () => ({
    collection: () => ({
      get: async () => {
        h.reads += h.docs.length;
        return { docs: h.docs.map((data, i) => ({ id: `c${i}`, data: () => data })) };
      },
      count: () => ({
        get: async () => {
          h.counts += 1;
          return { data: () => ({ count: h.docs.length }) };
        },
      }),
    }),
  }),
}));

vi.mock('@/lib/slots-store', () => ({
  listAllSlots: async () => {
    h.slotReads += 1;
    return [{ id: 's1', date: '2026-10-12', time: '09:00', department: 'it', booked: false }];
  },
}));

async function load() {
  vi.resetModules();
  vi.stubEnv('NODE_ENV', 'production');
  const cache = await import('@/lib/admin-cache');
  const dataCache = await import('@/lib/data-cache');
  return { ...cache, invalidate: dataCache.invalidate, CACHE_TAGS: dataCache.CACHE_TAGS };
}

const candidature = (email: string, createdAt: string) => ({ email, nomPrenom: email, createdAt });

beforeEach(() => {
  h.store.clear();
  h.docs = [candidature('a@x.tn', '2026-10-01'), candidature('b@x.tn', '2026-10-02')];
  h.reads = 0;
  h.counts = 0;
  h.slotReads = 0;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('admin-cache — candidatures', () => {
  it('deux chargements identiques ne lisent la collection qu’une seule fois', async () => {
    const { listCandidaturesForAdmin } = await load();

    const first = await listCandidaturesForAdmin();
    const second = await listCandidaturesForAdmin();

    expect(h.reads).toBe(2); // une seule lecture complète (2 documents)
    expect(h.counts).toBe(2); // mais un count() à chaque appel (≈ 1 lecture facturée)
    expect(first.map((c) => c.email)).toEqual(['b@x.tn', 'a@x.tn']); // plus récent d'abord
    expect(second).toEqual(first);
  });

  it('une candidature ajoutée est détectée sans invalidation explicite', async () => {
    const { listCandidaturesForAdmin } = await load();
    await listCandidaturesForAdmin();

    h.docs = [...h.docs, candidature('c@x.tn', '2026-10-03')];
    const list = await listCandidaturesForAdmin();

    expect(list).toHaveLength(3);
    expect(h.reads).toBe(2 + 3);
  });

  it('une modification sans changement de nombre est vue après invalidation du tag', async () => {
    const { listCandidaturesForAdmin, invalidate, CACHE_TAGS } = await load();
    await listCandidaturesForAdmin();

    h.docs = [candidature('a@x.tn', '2026-10-01'), { ...candidature('b@x.tn', '2026-10-02'), nomPrenom: 'Modifié' }];
    expect((await listCandidaturesForAdmin()).find((c) => c.email === 'b@x.tn')?.nomPrenom).toBe('b@x.tn');

    invalidate(CACHE_TAGS.candidatures);
    expect((await listCandidaturesForAdmin()).find((c) => c.email === 'b@x.tn')?.nomPrenom).toBe('Modifié');
  });

  it('listCandidatureEmails réutilise le cache (aucune nouvelle lecture complète)', async () => {
    const { listCandidaturesForAdmin, listCandidatureEmails } = await load();
    await listCandidaturesForAdmin();
    const readsAfterOverview = h.reads;

    const emails = await listCandidatureEmails();

    expect(emails.sort()).toEqual(['a@x.tn', 'b@x.tn']);
    expect(h.reads).toBe(readsAfterOverview);
  });
});

describe('admin-cache — créneaux', () => {
  it('les créneaux restent en cache jusqu’à l’invalidation du tag « slots »', async () => {
    const { listAllSlotsForAdmin, invalidate, CACHE_TAGS } = await load();

    await listAllSlotsForAdmin();
    await listAllSlotsForAdmin();
    expect(h.slotReads).toBe(1);

    invalidate(CACHE_TAGS.slots);
    await listAllSlotsForAdmin();
    expect(h.slotReads).toBe(2);
  });
});