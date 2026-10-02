// DELETE /api/admin/candidatures — suppression en masse + nettoyage des traces.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeRequest, readJson } from '../helpers/http';

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getAdminDb: vi.fn(),
}));

vi.mock('@/lib/admin-auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/admin-auth')>('@/lib/admin-auth');
  return { ...actual, requireAdmin: mocks.requireAdmin };
});
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: mocks.getAdminDb, getAdminAuth: vi.fn() }));

import { DELETE } from '@/app/api/admin/candidatures/route';

type Ref = { path: string };
type Row = Record<string, unknown>;

/**
 * Faux Firestore : `candidatures` et `deliberations` indexés par ID de document,
 * `slots` réservés renvoyés par la requête where('booked', '==', true).
 */
function makeDb(opts: {
  candidatures?: Record<string, Row>;
  deliberations?: Record<string, Row>;
  bookedSlots?: Record<string, Row>;
}) {
  const stores: Record<string, Record<string, Row>> = {
    candidatures: opts.candidatures ?? {},
    deliberations: opts.deliberations ?? {},
    slots: opts.bookedSlots ?? {},
  };
  const deleted: string[] = [];
  const updated: Array<{ path: string; data: Row }> = [];
  const commit = vi.fn(async () => {});

  const refOf = (collection: string, id: string): Ref => ({ path: `${collection}/${id}` });
  const db = {
    collection: (name: string) => ({
      doc: (id: string) => refOf(name, id),
      where: () => ({
        get: async () => ({
          docs: Object.entries(stores[name]).map(([id, data]) => ({
            ref: refOf(name, id),
            data: () => data,
          })),
        }),
      }),
    }),
    getAll: async (...refs: Ref[]) =>
      refs.map((ref) => {
        const [collection, id] = ref.path.split('/');
        const data = stores[collection]?.[id];
        return { exists: data !== undefined, ref, data: () => data };
      }),
    batch: () => ({
      delete: (ref: Ref) => void deleted.push(ref.path),
      update: (ref: Ref, data: Row) => void updated.push({ path: ref.path, data }),
      commit,
    }),
  };
  return { db, deleted, updated, commit };
}

const del = (body: unknown, auth = true) =>
  DELETE(makeRequest('/api/admin/candidatures', { method: 'DELETE', body, auth }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireAdmin.mockResolvedValue({ ok: true, email: 'admin@iris.tn' });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('DELETE /api/admin/candidatures', () => {
  it('refuse un non-administrateur', async () => {
    mocks.requireAdmin.mockResolvedValue({ ok: false, status: 403, message: 'Interdit.' });
    const res = await del({ ids: ['a1'] });
    expect(res.status).toBe(403);
    expect(mocks.getAdminDb).not.toHaveBeenCalled();
  });

  it.each([
    ['corps absent', undefined],
    ['ids manquant', {}],
    ['liste vide', { ids: [] }],
    ['id avec « / »', { ids: ['a/b'] }],
    ['id non texte', { ids: [42] }],
    ['plus de 200 ids', { ids: Array.from({ length: 201 }, (_, i) => `id${i}`) }],
  ])('400 : %s', async (_label, body) => {
    const res = await del(body);
    expect(res.status).toBe(400);
    expect(mocks.getAdminDb).not.toHaveBeenCalled();
  });

  it('500 si la base est indisponible', async () => {
    mocks.getAdminDb.mockReturnValue(null);
    expect((await del({ ids: ['a1'] })).status).toBe(500);
  });

  it('supprime la candidature, libère son créneau et supprime sa décision', async () => {
    const { db, deleted, updated, commit } = makeDb({
      candidatures: { a1: { email: 'Alice@Mail.com' }, a2: { email: 'bob@mail.com' } },
      deliberations: { 'alice@mail.com': { status: 'accepted' } },
      bookedSlots: {
        s1: { bookedByEmail: 'alice@mail.com' },
        s2: { bookedByEmail: 'autre@mail.com' }, // d'un candidat NON supprimé : intact
      },
    });
    mocks.getAdminDb.mockReturnValue(db);

    const res = await del({ ids: ['a1', 'a2'] });
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({
      ok: true,
      deleted: 2,
      releasedSlots: 1,
      removedDecisions: 1,
      notFound: 0,
    });

    expect(deleted.sort()).toEqual(['candidatures/a1', 'candidatures/a2', 'deliberations/alice@mail.com']);
    expect(updated).toHaveLength(1);
    expect(updated[0].path).toBe('slots/s1');
    expect(updated[0].data).toHaveProperty('booked', false);
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it('ignore les doublons et les identifiants inexistants', async () => {
    const { db, deleted } = makeDb({ candidatures: { a1: { email: 'alice@mail.com' } } });
    mocks.getAdminDb.mockReturnValue(db);

    const res = await del({ ids: ['a1', 'a1', 'inconnu'] });
    expect(res.status).toBe(200);
    expect(await readJson(res)).toMatchObject({ deleted: 1, notFound: 1, releasedSlots: 0, removedDecisions: 0 });
    expect(deleted).toEqual(['candidatures/a1']);
  });

  it('500 quand Firestore échoue', async () => {
    const { db } = makeDb({ candidatures: { a1: { email: 'alice@mail.com' } } });
    db.getAll = async () => {
      throw new Error('boom');
    };
    mocks.getAdminDb.mockReturnValue(db);
    expect((await del({ ids: ['a1'] })).status).toBe(500);
  });
});