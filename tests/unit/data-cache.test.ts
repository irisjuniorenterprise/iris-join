// lib/data-cache.ts : enveloppe du cache de données Next.js.
// `next/cache` est simulé : on vérifie le câblage (clés, TTL, tags, invalidation
// immédiate), pas le moteur de cache de Next lui-même.
import { afterEach, describe, expect, it, vi } from 'vitest';

const nextCache = vi.hoisted(() => ({
  unstable_cache: vi.fn(),
  revalidateTag: vi.fn(),
}));
vi.mock('next/cache', () => nextCache);

/** Recharge le module avec un NODE_ENV donné (le cache est désactivé sous « test »). */
async function loadDataCache(nodeEnv: 'test' | 'production') {
  vi.resetModules();
  vi.stubEnv('NODE_ENV', nodeEnv);
  return import('@/lib/data-cache');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('data-cache — désactivé sous Vitest', () => {
  it('dataCache renvoie la fonction telle quelle (aucun cache dans les tests)', async () => {
    const { dataCache } = await loadDataCache('test');
    const fn = vi.fn(async (x: string) => x.toUpperCase());

    const wrapped = dataCache(fn, ['k'], { revalidate: 30, tags: ['slots'] });

    expect(wrapped).toBe(fn);
    expect(nextCache.unstable_cache).not.toHaveBeenCalled();
  });

  it('invalidate ne fait rien', async () => {
    const { invalidate } = await loadDataCache('test');
    invalidate('slots', 'decisions');
    expect(nextCache.revalidateTag).not.toHaveBeenCalled();
  });
});

describe('data-cache — actif en production', () => {
  it('dataCache délègue à unstable_cache avec la clé, le TTL et les tags', async () => {
    const cachedFn = vi.fn();
    nextCache.unstable_cache.mockReturnValue(cachedFn);
    const { dataCache } = await loadDataCache('production');
    const fn = async (x: string) => x;

    const wrapped = dataCache(fn, ['slots-by-department'], { revalidate: 30, tags: ['slots'] });

    expect(wrapped).toBe(cachedFn);
    expect(nextCache.unstable_cache).toHaveBeenCalledWith(fn, ['slots-by-department'], {
      revalidate: 30,
      tags: ['slots'],
    });
  });

  it('invalidate expire immédiatement chaque tag donné', async () => {
    const { invalidate } = await loadDataCache('production');
    invalidate('slots', 'settings');

    expect(nextCache.revalidateTag).toHaveBeenCalledTimes(2);
    expect(nextCache.revalidateTag).toHaveBeenNthCalledWith(1, 'slots', { expire: 0 });
    expect(nextCache.revalidateTag).toHaveBeenNthCalledWith(2, 'settings', { expire: 0 });
  });

  it('invalidate ne casse pas l’écriture si Next refuse (hors requête) et continue avec les autres tags', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    nextCache.revalidateTag.mockImplementationOnce(() => {
      throw new Error('Invariant: static generation store missing');
    });
    const { invalidate } = await loadDataCache('production');

    expect(() => invalidate('slots', 'decisions')).not.toThrow();
    expect(nextCache.revalidateTag).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
