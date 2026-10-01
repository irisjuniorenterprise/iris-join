import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeRequest, readJson } from '../helpers/http';

const mocks = vi.hoisted(() => ({
  isFirebaseAdminConfigured: vi.fn(),
  getVerifiedEmail: vi.fn(),
  getServiceWindowStates: vi.fn(),
  getCandidateDepartment: vi.fn(),
  getSlotsForDepartment: vi.fn(),
}));

vi.mock('@/lib/firebase-admin', () => ({
  isFirebaseAdminConfigured: mocks.isFirebaseAdminConfigured,
  getVerifiedEmail: mocks.getVerifiedEmail,
}));
vi.mock('@/lib/settings-store', () => ({ getServiceWindowStates: mocks.getServiceWindowStates }));
vi.mock('@/lib/slots-store', () => ({
  getCandidateDepartment: mocks.getCandidateDepartment,
  getSlotsForDepartment: mocks.getSlotsForDepartment,
}));

import { GET } from '@/app/api/creneaux/route';

const get = () => GET(makeRequest('/api/creneaux'));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.isFirebaseAdminConfigured.mockReturnValue(true);
  mocks.getVerifiedEmail.mockResolvedValue('candidat@example.com');
  mocks.getServiceWindowStates.mockResolvedValue({ entretien: { status: { state: 'open' } } });
  mocks.getCandidateDepartment.mockResolvedValue({ status: 'ok', department: 'it' });
  mocks.getSlotsForDepartment.mockResolvedValue([]);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GET /api/creneaux', () => {
  it('500 quand Firebase Admin n’est pas configuré', async () => {
    mocks.isFirebaseAdminConfigured.mockReturnValue(false);
    const res = await get();
    expect(res.status).toBe(500);
    expect((await readJson(res)).code).toBe('server-misconfigured');
  });

  it('401 sans token valide', async () => {
    mocks.getVerifiedEmail.mockResolvedValue(null);
    const res = await get();
    expect(res.status).toBe(401);
    expect((await readJson(res)).code).toBe('unauthenticated');
    expect(mocks.getSlotsForDepartment).not.toHaveBeenCalled();
  });

  it('403 « not-started » avant l’ouverture des réservations', async () => {
    mocks.getServiceWindowStates.mockResolvedValue({
      entretien: { status: { state: 'not-started', opensAt: '2026-10-10T08:00:00+01:00' } },
    });
    const res = await get();
    expect(res.status).toBe(403);
    expect((await readJson(res)).code).toBe('not-started');
    expect(mocks.getSlotsForDepartment).not.toHaveBeenCalled();
  });

  it('403 « closed » après la fermeture des réservations', async () => {
    mocks.getServiceWindowStates.mockResolvedValue({
      entretien: { status: { state: 'closed', closesAt: '2026-10-11T08:00:00+01:00' } },
    });
    const res = await get();
    expect(res.status).toBe(403);
    expect((await readJson(res)).code).toBe('closed');
  });

  it('403 « no-candidature » : sans candidature, aucun créneau n’est visible', async () => {
    mocks.getCandidateDepartment.mockResolvedValue({ status: 'no-candidature' });
    const res = await get();
    expect(res.status).toBe(403);
    expect(await readJson(res)).toMatchObject({ code: 'no-candidature', slots: [] });
    expect(mocks.getSlotsForDepartment).not.toHaveBeenCalled();
  });

  it('409 « invalid-department » quand le département stocké est inconnu', async () => {
    mocks.getCandidateDepartment.mockResolvedValue({ status: 'invalid-department' });
    const res = await get();
    expect(res.status).toBe(409);
    expect((await readJson(res)).code).toBe('invalid-department');
  });

  it('renvoie uniquement les créneaux du département du candidat', async () => {
    mocks.getCandidateDepartment.mockResolvedValue({ status: 'ok', department: 'etudes' });
    const slots = [{ id: 's1', date: '2026-10-12', time: '09:00', department: 'etudes', mode: 'presentiel', booked: false }];
    mocks.getSlotsForDepartment.mockResolvedValue(slots);

    const res = await get();
    expect(res.status).toBe(200);
    expect(mocks.getSlotsForDepartment).toHaveBeenCalledWith('etudes');
    expect(await readJson(res)).toEqual({ department: 'etudes', departmentLabel: 'Études', slots });
  });

  it('interdit la mise en cache des réponses', async () => {
    expect((await get()).headers.get('cache-control')).toBe('no-store');
  });

  it('500 « server-error » quand la lecture échoue', async () => {
    mocks.getSlotsForDepartment.mockRejectedValue(new Error('firestore down'));
    const res = await get();
    expect(res.status).toBe(500);
    expect((await readJson(res)).code).toBe('server-error');
  });
});
