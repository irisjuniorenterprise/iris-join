import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeRequest, readJson } from '../helpers/http';

const mocks = vi.hoisted(() => ({
  isFirebaseAdminConfigured: vi.fn(),
  getVerifiedEmail: vi.fn(),
  getComplementState: vi.fn(),
  applyComplement: vi.fn(),
}));

vi.mock('@/lib/firebase-admin', () => ({
  isFirebaseAdminConfigured: mocks.isFirebaseAdminConfigured,
  getVerifiedEmail: mocks.getVerifiedEmail,
}));
vi.mock('@/lib/candidature-complement-store', () => ({
  getComplementState: mocks.getComplementState,
  applyComplement: mocks.applyComplement,
}));

import { GET, POST } from '@/app/api/candidature/complement/route';

const get = () => GET(makeRequest('/api/candidature/complement'));
const post = (body: unknown) => POST(makeRequest('/api/candidature/complement', { method: 'POST', body }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.isFirebaseAdminConfigured.mockReturnValue(true);
  mocks.getVerifiedEmail.mockResolvedValue('candidat@example.com');
  mocks.getComplementState.mockResolvedValue({ status: 'ok', missing: ['telephone', 'motivation'] });
  mocks.applyComplement.mockResolvedValue({ ok: true, saved: ['telephone'], missing: ['motivation'] });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GET /api/candidature/complement', () => {
  it('401 sans token valide', async () => {
    mocks.getVerifiedEmail.mockResolvedValue(null);
    expect((await get()).status).toBe(401);
    expect(mocks.getComplementState).not.toHaveBeenCalled();
  });

  it('500 si Firebase Admin n’est pas configuré', async () => {
    mocks.isFirebaseAdminConfigured.mockReturnValue(false);
    expect((await get()).status).toBe(500);
  });

  it('renvoie les données manquantes de la candidature du token', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ ok: true, missing: ['telephone', 'motivation'] });
    expect(mocks.getComplementState).toHaveBeenCalledWith('candidat@example.com');
  });

  it('404 sans candidature', async () => {
    mocks.getComplementState.mockResolvedValue({ status: 'no-candidature' });
    const res = await get();
    expect(res.status).toBe(404);
    expect(await readJson(res)).toMatchObject({ code: 'no-candidature' });
  });

  it('500 quand la lecture échoue', async () => {
    mocks.getComplementState.mockRejectedValue(new Error('boom'));
    expect((await get()).status).toBe(500);
  });
});

describe('POST /api/candidature/complement', () => {
  it('401 sans token valide', async () => {
    mocks.getVerifiedEmail.mockResolvedValue(null);
    expect((await post({ telephone: '20123456' })).status).toBe(401);
    expect(mocks.applyComplement).not.toHaveBeenCalled();
  });

  it('400 sur un corps invalide', async () => {
    expect((await post(['x'])).status).toBe(400);
    expect((await post({ telephone: 20123456 })).status).toBe(400);
    expect(mocks.applyComplement).not.toHaveBeenCalled();
  });

  it('enregistre pour l’e-mail du TOKEN, jamais celui du corps', async () => {
    const res = await post({ telephone: '20123456', email: 'autre@example.com' });
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ ok: true, saved: ['telephone'], missing: ['motivation'] });
    expect(mocks.applyComplement).toHaveBeenCalledWith('candidat@example.com', {
      telephone: '20123456',
      email: 'autre@example.com',
    });
  });

  it('400 avec les erreurs par champ quand une réponse est invalide', async () => {
    mocks.applyComplement.mockResolvedValue({ ok: false, reason: 'invalid', errors: { telephone: 'Numéro invalide' } });
    const res = await post({ telephone: '1' });
    expect(res.status).toBe(400);
    expect(await readJson(res)).toMatchObject({ ok: false, errors: { telephone: 'Numéro invalide' } });
  });

  it('404 sans candidature', async () => {
    mocks.applyComplement.mockResolvedValue({ ok: false, reason: 'no-candidature' });
    expect((await post({ telephone: '20123456' })).status).toBe(404);
  });

  it('500 quand l’enregistrement échoue', async () => {
    mocks.applyComplement.mockRejectedValue(new Error('boom'));
    expect((await post({ telephone: '20123456' })).status).toBe(500);
  });
});