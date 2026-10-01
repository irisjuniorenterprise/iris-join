// Contrôle d'accès de TOUTES les routes /api/admin/* : aucune ne doit
// répondre à un visiteur anonyme ni à un compte Google qui n'est pas admin,
// et aucune ne doit toucher aux données dans ces cas.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeRequest } from '../helpers/http';

const mocks = vi.hoisted(() => ({
  getAdminAuth: vi.fn(),
  verifyIdToken: vi.fn(),
  getAdminDb: vi.fn(),
  store: vi.fn(),
}));

vi.mock('@/lib/firebase-admin', () => ({ getAdminAuth: mocks.getAdminAuth, getAdminDb: mocks.getAdminDb }));
vi.mock('@/lib/slots-store', () => ({
  listAllSlots: mocks.store,
  createSlots: mocks.store,
  updateSlot: mocks.store,
  deleteSlot: mocks.store,
  assignSlot: mocks.store,
  releaseSlot: mocks.store,
  getCandidateDepartment: mocks.store,
}));
vi.mock('@/lib/settings-store', () => ({
  getServiceWindowStates: mocks.store,
  updateServiceWindow: mocks.store,
}));
vi.mock('@/lib/deliberation-store', () => ({
  listDecisions: mocks.store,
  getDecisions: mocks.store,
  markEmailSent: mocks.store,
  normEmail: (e: string) => e.toLowerCase(),
  setDecisions: mocks.store,
  setPublished: mocks.store,
}));
vi.mock('@/lib/email', () => ({ isEmailConfigured: mocks.store, sendResultEmail: mocks.store }));

import * as deliberation from '@/app/api/admin/deliberation/route';
import * as overview from '@/app/api/admin/overview/route';
import * as reservations from '@/app/api/admin/reservations/route';
import * as settings from '@/app/api/admin/settings/route';
import * as slots from '@/app/api/admin/slots/route';

type Handler = (request: Request) => Promise<Response>;

const routes: Array<{ name: string; handler: Handler; method: string; path: string; body?: unknown }> = [
  { name: 'deliberation GET', handler: deliberation.GET, method: 'GET', path: '/api/admin/deliberation' },
  {
    name: 'deliberation PUT',
    handler: deliberation.PUT,
    method: 'PUT',
    path: '/api/admin/deliberation',
    body: { emails: ['a@b.tn'], status: 'accepted' },
  },
  {
    name: 'deliberation POST',
    handler: deliberation.POST,
    method: 'POST',
    path: '/api/admin/deliberation',
    body: { action: 'publish' },
  },
  { name: 'overview GET', handler: overview.GET, method: 'GET', path: '/api/admin/overview' },
  {
    name: 'reservations POST',
    handler: reservations.POST,
    method: 'POST',
    path: '/api/admin/reservations',
    body: { action: 'release', slotId: 'abc' },
  },
  { name: 'settings GET', handler: settings.GET, method: 'GET', path: '/api/admin/settings' },
  {
    name: 'settings PUT',
    handler: settings.PUT,
    method: 'PUT',
    path: '/api/admin/settings',
    body: { service: 'entretien', opensAt: null, closesAt: null },
  },
  {
    name: 'slots POST',
    handler: slots.POST,
    method: 'POST',
    path: '/api/admin/slots',
    body: { dates: ['2026-10-12'], times: ['09:00'], departments: ['it'], mode: 'presentiel' },
  },
  { name: 'slots PATCH', handler: slots.PATCH, method: 'PATCH', path: '/api/admin/slots', body: { id: 'abc', time: '10:00' } },
  { name: 'slots DELETE', handler: slots.DELETE, method: 'DELETE', path: '/api/admin/slots', body: { id: 'abc' } },
];

let savedAdmins: string | undefined;

beforeEach(() => {
  vi.resetAllMocks();
  savedAdmins = process.env.ADMIN_EMAILS;
  process.env.ADMIN_EMAILS = 'admin@iris.tn';
  mocks.getAdminAuth.mockReturnValue({ verifyIdToken: mocks.verifyIdToken });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  if (savedAdmins === undefined) delete process.env.ADMIN_EMAILS;
  else process.env.ADMIN_EMAILS = savedAdmins;
});

describe.each(routes)('$name', ({ handler, method, path, body }) => {
  it('401 pour un visiteur sans token', async () => {
    const res = await handler(makeRequest(path, { method, body, auth: false }));
    expect(res.status).toBe(401);
    expect(mocks.store).not.toHaveBeenCalled();
    expect(mocks.getAdminDb).not.toHaveBeenCalled();
  });

  it('401 pour un token invalide', async () => {
    mocks.verifyIdToken.mockRejectedValue(new Error('invalid'));
    expect((await handler(makeRequest(path, { method, body }))).status).toBe(401);
    expect(mocks.store).not.toHaveBeenCalled();
  });

  it('403 pour un compte Google qui n’est pas administrateur', async () => {
    mocks.verifyIdToken.mockResolvedValue({ email: 'candidat@gmail.com', email_verified: true });
    const res = await handler(makeRequest(path, { method, body }));
    expect(res.status).toBe(403);
    expect(mocks.store).not.toHaveBeenCalled();
    expect(mocks.getAdminDb).not.toHaveBeenCalled();
  });

  it('403 pour un administrateur dont l’e-mail n’est pas vérifié', async () => {
    mocks.verifyIdToken.mockResolvedValue({ email: 'admin@iris.tn', email_verified: false });
    expect((await handler(makeRequest(path, { method, body }))).status).toBe(403);
    expect(mocks.store).not.toHaveBeenCalled();
  });

  it('500 (et non un accès ouvert) quand ADMIN_EMAILS est vide', async () => {
    process.env.ADMIN_EMAILS = '';
    mocks.verifyIdToken.mockResolvedValue({ email: 'admin@iris.tn', email_verified: true });
    expect((await handler(makeRequest(path, { method, body }))).status).toBe(500);
    expect(mocks.store).not.toHaveBeenCalled();
  });
});
