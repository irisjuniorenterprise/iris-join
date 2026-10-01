import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeRequest, readJson } from '../helpers/http';

const mocks = vi.hoisted(() => ({
  getAdminAuth: vi.fn(),
  verifyIdToken: vi.fn(),
}));

vi.mock('@/lib/firebase-admin', () => ({ getAdminAuth: mocks.getAdminAuth }));

import { denyResponse, requireAdmin } from '@/lib/admin-auth';

let savedAdmins: string | undefined;

beforeEach(() => {
  vi.resetAllMocks();
  savedAdmins = process.env.ADMIN_EMAILS;
  process.env.ADMIN_EMAILS = 'admin@iris.tn, Second.Admin@iris.tn';
  mocks.getAdminAuth.mockReturnValue({ verifyIdToken: mocks.verifyIdToken });
  mocks.verifyIdToken.mockResolvedValue({ email: 'admin@iris.tn', email_verified: true });
});

afterEach(() => {
  if (savedAdmins === undefined) delete process.env.ADMIN_EMAILS;
  else process.env.ADMIN_EMAILS = savedAdmins;
});

const check = (opts?: Parameters<typeof makeRequest>[1]) => requireAdmin(makeRequest('/api/admin/x', opts));

describe('requireAdmin', () => {
  it('500 quand ADMIN_EMAILS est absent ou vide (personne n’est admin par défaut)', async () => {
    delete process.env.ADMIN_EMAILS;
    expect(await check()).toMatchObject({ ok: false, status: 500 });
    process.env.ADMIN_EMAILS = ' , ,';
    expect(await check()).toMatchObject({ ok: false, status: 500 });
  });

  it('500 quand Firebase Admin n’est pas configuré', async () => {
    mocks.getAdminAuth.mockReturnValue(null);
    expect(await check()).toMatchObject({ ok: false, status: 500 });
  });

  it('401 sans en-tête Authorization', async () => {
    expect(await check({ auth: false })).toMatchObject({ ok: false, status: 401 });
    expect(mocks.verifyIdToken).not.toHaveBeenCalled();
  });

  it('401 quand l’en-tête n’est pas de type Bearer', async () => {
    expect(await check({ auth: false, headers: { authorization: 'Basic abc' } })).toMatchObject({
      ok: false,
      status: 401,
    });
  });

  it('401 quand le token est invalide ou expiré', async () => {
    mocks.verifyIdToken.mockRejectedValue(new Error('auth/id-token-expired'));
    expect(await check()).toMatchObject({ ok: false, status: 401 });
  });

  it('403 quand l’adresse n’est pas vérifiée', async () => {
    mocks.verifyIdToken.mockResolvedValue({ email: 'admin@iris.tn', email_verified: false });
    expect(await check()).toMatchObject({ ok: false, status: 403 });
  });

  it('403 quand le token n’a pas d’e-mail', async () => {
    mocks.verifyIdToken.mockResolvedValue({ email_verified: true });
    expect(await check()).toMatchObject({ ok: false, status: 403 });
  });

  it('403 quand le compte n’est pas dans la liste', async () => {
    mocks.verifyIdToken.mockResolvedValue({ email: 'intrus@gmail.com', email_verified: true });
    const result = await check();
    expect(result).toMatchObject({ ok: false, status: 403 });
  });

  it('accepte un admin, sans tenir compte de la casse ni des espaces de la liste', async () => {
    expect(await check()).toEqual({ ok: true, email: 'admin@iris.tn' });
    mocks.verifyIdToken.mockResolvedValue({ email: 'second.admin@IRIS.tn', email_verified: true });
    expect(await check()).toMatchObject({ ok: true });
  });

  it('transmet le token sans le préfixe « Bearer »', async () => {
    await check({ token: 'abc.def.ghi' });
    expect(mocks.verifyIdToken).toHaveBeenCalledWith('abc.def.ghi');
  });
});

describe('denyResponse', () => {
  it('reprend le statut et le message, sans cache', async () => {
    const res = denyResponse({ ok: false, status: 403, message: 'Interdit' });
    expect(res.status).toBe(403);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await readJson(res)).toEqual({ ok: false, message: 'Interdit' });
  });
});
