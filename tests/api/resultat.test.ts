import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeRequest, readJson } from '../helpers/http';

const mocks = vi.hoisted(() => ({
  isFirebaseAdminConfigured: vi.fn(),
  getVerifiedEmail: vi.fn(),
  getCandidateDepartment: vi.fn(),
  getDecision: vi.fn(),
}));

vi.mock('@/lib/firebase-admin', () => ({
  isFirebaseAdminConfigured: mocks.isFirebaseAdminConfigured,
  getVerifiedEmail: mocks.getVerifiedEmail,
}));
vi.mock('@/lib/slots-store', () => ({ getCandidateDepartment: mocks.getCandidateDepartment }));
vi.mock('@/lib/deliberation-store', async () => {
  // On garde la vraie normEmail ; seule la lecture Firestore est simulée.
  return { getDecisionCached: mocks.getDecision, normEmail: (e: string) => e.trim().toLowerCase() };
});

import { GET } from '@/app/api/resultat/route';

const get = () => GET(makeRequest('/api/resultat'));

const decision = (over: Record<string, unknown> = {}) => ({
  email: 'candidat@example.com',
  status: 'accepted',
  message: 'Bienvenue, rendez-vous lundi.',
  published: true,
  publishedAt: '2026-10-20T10:00:00Z',
  emailSentAt: null,
  decidedAt: '2026-10-19T10:00:00Z',
  decidedBy: 'admin@iris.tn',
  ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.isFirebaseAdminConfigured.mockReturnValue(true);
  mocks.getVerifiedEmail.mockResolvedValue('Candidat@Example.com');
  mocks.getCandidateDepartment.mockResolvedValue({ status: 'ok', department: 'it' });
  mocks.getDecision.mockResolvedValue(decision());
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GET /api/resultat', () => {
  it('500 quand Firebase Admin n’est pas configuré', async () => {
    mocks.isFirebaseAdminConfigured.mockReturnValue(false);
    expect((await get()).status).toBe(500);
  });

  it('401 sans token valide', async () => {
    mocks.getVerifiedEmail.mockResolvedValue(null);
    expect((await get()).status).toBe(401);
  });

  it('« no-candidature » quand aucune candidature n’existe', async () => {
    mocks.getCandidateDepartment.mockResolvedValue({ status: 'no-candidature' });
    expect(await readJson(await get())).toEqual({ ok: true, state: 'no-candidature' });
    expect(mocks.getDecision).not.toHaveBeenCalled();
  });

  it('« pending » quand aucune décision n’a été prise', async () => {
    mocks.getDecision.mockResolvedValue(null);
    expect(await readJson(await get())).toEqual({ ok: true, state: 'pending' });
  });

  // CRITIQUE : un brouillon ne doit JAMAIS fuiter vers le candidat.
  it('« pending » pour un brouillon — sans aucune fuite du statut ni du message', async () => {
    mocks.getDecision.mockResolvedValue(decision({ published: false, publishedAt: null }));
    const res = await get();
    const raw = JSON.stringify(await readJson(res));
    expect(JSON.parse(raw)).toEqual({ ok: true, state: 'pending' });
    expect(raw).not.toContain('accepted');
    expect(raw).not.toContain('Bienvenue');
  });

  it('« published » : renvoie le résultat, le message et le département', async () => {
    const body = await readJson(await get());
    expect(body).toEqual({
      ok: true,
      state: 'published',
      result: {
        status: 'accepted',
        message: 'Bienvenue, rendez-vous lundi.',
        departmentLabel: 'IT',
        publishedAt: '2026-10-20T10:00:00Z',
      },
    });
  });

  it('n’expose aucun champ interne (décideur, e-mail, dates de décision)', async () => {
    const raw = JSON.stringify(await readJson(await get()));
    expect(raw).not.toContain('admin@iris.tn');
    expect(raw).not.toContain('decidedBy');
    expect(raw).not.toContain('emailSentAt');
  });

  it('cherche la décision avec l’e-mail normalisé en minuscules', async () => {
    await get();
    expect(mocks.getDecision).toHaveBeenCalledWith('candidat@example.com');
  });

  it('departmentLabel = null quand le département est invalide', async () => {
    mocks.getCandidateDepartment.mockResolvedValue({ status: 'invalid-department' });
    mocks.getDecision.mockResolvedValue(decision({ status: 'rejected' }));
    const body = await readJson<{ result: { departmentLabel: string | null } }>(await get());
    expect(body.result.departmentLabel).toBeNull();
  });

  it('interdit la mise en cache', async () => {
    expect((await get()).headers.get('cache-control')).toBe('no-store');
  });

  it('500 quand la lecture échoue', async () => {
    mocks.getDecision.mockRejectedValue(new Error('boom'));
    expect((await get()).status).toBe(500);
  });
});
