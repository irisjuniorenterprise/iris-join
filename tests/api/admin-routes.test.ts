// Comportement des routes /api/admin/* pour un administrateur authentifié.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeRequest, readJson } from '../helpers/http';
import { createFakeDb } from '../helpers/fake-db';

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getAdminDb: vi.fn(),
  // slots-store
  listAllSlots: vi.fn(),
  createSlots: vi.fn(),
  updateSlot: vi.fn(),
  deleteSlot: vi.fn(),
  assignSlot: vi.fn(),
  releaseSlot: vi.fn(),
  getCandidateDepartment: vi.fn(),
  // settings-store
  getServiceWindowStates: vi.fn(),
  updateServiceWindow: vi.fn(),
  // deliberation-store
  listDecisions: vi.fn(),
  getDecisions: vi.fn(),
  markEmailSent: vi.fn(),
  setDecisions: vi.fn(),
  setPublished: vi.fn(),
  // email
  isEmailConfigured: vi.fn(),
  sendResultEmail: vi.fn(),
}));

vi.mock('@/lib/admin-auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/admin-auth')>('@/lib/admin-auth');
  return { ...actual, requireAdmin: mocks.requireAdmin };
});
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: mocks.getAdminDb, getAdminAuth: vi.fn() }));
vi.mock('@/lib/slots-store', () => ({
  listAllSlots: mocks.listAllSlots,
  createSlots: mocks.createSlots,
  updateSlot: mocks.updateSlot,
  deleteSlot: mocks.deleteSlot,
  assignSlot: mocks.assignSlot,
  releaseSlot: mocks.releaseSlot,
  getCandidateDepartment: mocks.getCandidateDepartment,
}));
vi.mock('@/lib/settings-store', () => ({
  getServiceWindowStates: mocks.getServiceWindowStates,
  updateServiceWindow: mocks.updateServiceWindow,
}));
vi.mock('@/lib/deliberation-store', () => ({
  listDecisions: mocks.listDecisions,
  getDecisions: mocks.getDecisions,
  markEmailSent: mocks.markEmailSent,
  normEmail: (e: string) => e.trim().toLowerCase(),
  setDecisions: mocks.setDecisions,
  setPublished: mocks.setPublished,
}));
vi.mock('@/lib/email', () => ({
  isEmailConfigured: mocks.isEmailConfigured,
  sendResultEmail: mocks.sendResultEmail,
}));

import * as deliberation from '@/app/api/admin/deliberation/route';
import * as overview from '@/app/api/admin/overview/route';
import * as reservations from '@/app/api/admin/reservations/route';
import * as settings from '@/app/api/admin/settings/route';
import * as slots from '@/app/api/admin/slots/route';

const ADMIN = 'admin@iris.tn';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireAdmin.mockResolvedValue({ ok: true, email: ADMIN });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

/* ------------------------------------------------------------------ */
describe('/api/admin/slots', () => {
  const post = (body: unknown) => slots.POST(makeRequest('/api/admin/slots', { method: 'POST', body }));
  const patch = (body: unknown) => slots.PATCH(makeRequest('/api/admin/slots', { method: 'PATCH', body }));
  const del = (body: unknown) => slots.DELETE(makeRequest('/api/admin/slots', { method: 'DELETE', body }));

  describe('POST (création)', () => {
    it('crée le produit jours × heures × départements, sans doublon', async () => {
      mocks.createSlots.mockResolvedValue({ created: 4, skipped: 0 });
      const res = await post({
        dates: ['2026-10-12', '2026-10-12'], // doublon volontaire
        times: ['09:00', '10:00'],
        departments: ['it', 'marketing'],
        mode: 'en-ligne',
      });
      expect(res.status).toBe(200);
      expect(await readJson(res)).toEqual({ ok: true, created: 4, skipped: 0 });
      const items = mocks.createSlots.mock.calls[0][0] as Array<Record<string, string>>;
      expect(items).toHaveLength(4);
      expect(items).toContainEqual({ date: '2026-10-12', time: '10:00', department: 'marketing', mode: 'en-ligne' });
    });

    it.each([
      ['date invalide', { dates: ['2026-13-40'], times: ['09:00'], departments: ['it'], mode: 'presentiel' }],
      ['heure invalide', { dates: ['2026-10-12'], times: ['25:00'], departments: ['it'], mode: 'presentiel' }],
      ['département inconnu', { dates: ['2026-10-12'], times: ['09:00'], departments: ['rh'], mode: 'presentiel' }],
      ['mode inconnu', { dates: ['2026-10-12'], times: ['09:00'], departments: ['it'], mode: 'zoom' }],
      ['aucune date', { dates: [], times: ['09:00'], departments: ['it'], mode: 'presentiel' }],
    ])('400 : %s', async (_label, body) => {
      expect((await post(body)).status).toBe(400);
      expect(mocks.createSlots).not.toHaveBeenCalled();
    });

    it('400 au-delà de 500 créneaux d’un coup', async () => {
      const dates = Array.from({ length: 31 }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`);
      const times = Array.from({ length: 30 }, (_, i) => `${String(Math.floor(i / 2) + 8).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);
      const res = await post({ dates, times, departments: ['it'], mode: 'presentiel' });
      expect(res.status).toBe(400);
      expect(mocks.createSlots).not.toHaveBeenCalled();
    });

    it('500 quand la création échoue', async () => {
      mocks.createSlots.mockRejectedValue(new Error('boom'));
      const res = await post({ dates: ['2026-10-12'], times: ['09:00'], departments: ['it'], mode: 'presentiel' });
      expect(res.status).toBe(500);
    });
  });

  describe('PATCH (modification)', () => {
    it('400 sans aucune modification', async () => {
      expect((await patch({ id: 'abc' })).status).toBe(400);
      expect(mocks.updateSlot).not.toHaveBeenCalled();
    });

    it('400 pour un id ou une heure invalides', async () => {
      expect((await patch({ id: 'a/b', time: '10:00' })).status).toBe(400);
      expect((await patch({ id: 'abc', time: '24:00' })).status).toBe(400);
    });

    it('transmet uniquement les champs modifiés', async () => {
      mocks.updateSlot.mockResolvedValue({ ok: true, slot: { id: 'abc' }, previous: { id: 'abc' } });
      const res = await patch({ id: 'abc', time: '10:30', mode: 'en-ligne' });
      expect(res.status).toBe(200);
      expect(mocks.updateSlot).toHaveBeenCalledWith('abc', { time: '10:30', mode: 'en-ligne' });
    });

    it.each([
      ['not-found', 404, /n'existe plus/],
      ['duplicate', 409, /existe déjà/],
      ['department-locked', 409, /réservé/],
    ] as const)('refus « %s » -> %i', async (reason, status, message) => {
      mocks.updateSlot.mockResolvedValue({ ok: false, reason });
      const res = await patch({ id: 'abc', time: '10:00' });
      expect(res.status).toBe(status);
      expect((await readJson<{ message: string }>(res)).message).toMatch(message);
    });
  });

  describe('DELETE (suppression)', () => {
    it('supprime un créneau libre', async () => {
      mocks.deleteSlot.mockResolvedValue({ ok: true, slot: { id: 'abc' } });
      expect((await del({ id: 'abc' })).status).toBe(200);
    });

    it('409 pour un créneau réservé, 404 pour un créneau inconnu', async () => {
      mocks.deleteSlot.mockResolvedValue({ ok: false, reason: 'booked' });
      expect((await del({ id: 'abc' })).status).toBe(409);
      mocks.deleteSlot.mockResolvedValue({ ok: false, reason: 'not-found' });
      expect((await del({ id: 'abc' })).status).toBe(404);
    });

    it('400 pour un id invalide', async () => {
      expect((await del({ id: '../x' })).status).toBe(400);
    });
  });
});

/* ------------------------------------------------------------------ */
describe('/api/admin/reservations', () => {
  const post = (body: unknown) => reservations.POST(makeRequest('/api/admin/reservations', { method: 'POST', body }));

  it('400 pour une action inconnue ou un e-mail invalide', async () => {
    expect((await post({ action: 'delete', slotId: 'abc' })).status).toBe(400);
    expect((await post({ action: 'assign', slotId: 'abc', email: 'pas-un-email' })).status).toBe(400);
  });

  describe('assign', () => {
    const body = { action: 'assign', slotId: 'abc', email: 'cand@example.com' };

    it('409 sans candidature ou avec un département invalide', async () => {
      mocks.getCandidateDepartment.mockResolvedValue({ status: 'no-candidature' });
      expect((await post(body)).status).toBe(409);
      mocks.getCandidateDepartment.mockResolvedValue({ status: 'invalid-department' });
      expect((await post(body)).status).toBe(409);
      expect(mocks.assignSlot).not.toHaveBeenCalled();
    });

    it('attribue avec le département de la CANDIDATURE et indique si le candidat a été déplacé', async () => {
      mocks.getCandidateDepartment.mockResolvedValue({ status: 'ok', department: 'etudes' });
      mocks.assignSlot.mockResolvedValue({ ok: true, slot: { id: 'abc' }, previous: { id: 'old' } });
      const res = await post(body);
      expect(mocks.assignSlot).toHaveBeenCalledWith('abc', 'cand@example.com', 'etudes');
      expect(await readJson(res)).toEqual({ ok: true, moved: true });

      mocks.assignSlot.mockResolvedValue({ ok: true, slot: { id: 'abc' }, previous: null });
      expect(await readJson(await post(body))).toEqual({ ok: true, moved: false });
    });

    it.each([
      ['not-found', 404],
      ['wrong-department', 409],
      ['already-booked', 409],
      ['same-slot', 409],
    ] as const)('refus « %s » -> %i', async (reason, status) => {
      mocks.getCandidateDepartment.mockResolvedValue({ status: 'ok', department: 'it' });
      mocks.assignSlot.mockResolvedValue({ ok: false, reason });
      expect((await post(body)).status).toBe(status);
    });
  });

  describe('release', () => {
    it('libère une réservation', async () => {
      mocks.releaseSlot.mockResolvedValue({ ok: true, slot: {}, email: 'cand@example.com' });
      expect((await post({ action: 'release', slotId: 'abc' })).status).toBe(200);
    });

    it('404 si inconnu, 409 si non réservé', async () => {
      mocks.releaseSlot.mockResolvedValue({ ok: false, reason: 'not-found' });
      expect((await post({ action: 'release', slotId: 'abc' })).status).toBe(404);
      mocks.releaseSlot.mockResolvedValue({ ok: false, reason: 'not-booked' });
      expect((await post({ action: 'release', slotId: 'abc' })).status).toBe(409);
    });
  });
});

/* ------------------------------------------------------------------ */
describe('/api/admin/settings', () => {
  const put = (body: unknown) => settings.PUT(makeRequest('/api/admin/settings', { method: 'PUT', body }));

  it('GET renvoie les fenêtres et leur statut', async () => {
    mocks.getServiceWindowStates.mockResolvedValue({
      candidature: { window: { opensAt: 'a', closesAt: 'b' }, status: { state: 'open' } },
      entretien: { window: { opensAt: null, closesAt: null }, status: { state: 'open' } },
    });
    const body = await readJson(await settings.GET(makeRequest('/api/admin/settings')));
    expect(body).toEqual({
      ok: true,
      windows: { candidature: { opensAt: 'a', closesAt: 'b' }, entretien: { opensAt: null, closesAt: null } },
      statuses: { candidature: { state: 'open' }, entretien: { state: 'open' } },
    });
  });

  it('PUT met à jour la fenêtre d’UN service', async () => {
    mocks.updateServiceWindow.mockResolvedValue({});
    const opensAt = '2026-10-10T08:00:00+01:00';
    const closesAt = '2026-10-11T18:00:00+01:00';
    const res = await put({ service: 'entretien', opensAt, closesAt });
    expect(res.status).toBe(200);
    expect(mocks.updateServiceWindow).toHaveBeenCalledWith('entretien', { opensAt, closesAt });
  });

  it('PUT accepte « pas de limite » (null des deux côtés)', async () => {
    mocks.updateServiceWindow.mockResolvedValue({});
    expect((await put({ service: 'candidature', opensAt: null, closesAt: null })).status).toBe(200);
  });

  it('400 quand la fermeture n’est pas après l’ouverture', async () => {
    const res = await put({
      service: 'entretien',
      opensAt: '2026-10-11T18:00:00+01:00',
      closesAt: '2026-10-10T08:00:00+01:00',
    });
    expect(res.status).toBe(400);
    expect((await readJson<{ message: string }>(res)).message).toMatch(/fermeture/);
    expect(mocks.updateServiceWindow).not.toHaveBeenCalled();
  });

  it('400 pour une ouverture égale à la fermeture', async () => {
    const same = '2026-10-10T08:00:00+01:00';
    expect((await put({ service: 'entretien', opensAt: same, closesAt: same })).status).toBe(400);
  });

  it('400 pour un service inconnu ou une date invalide', async () => {
    expect((await put({ service: 'resultats', opensAt: null, closesAt: null })).status).toBe(400);
    expect((await put({ service: 'entretien', opensAt: 'demain', closesAt: null })).status).toBe(400);
  });
});

/* ------------------------------------------------------------------ */
describe('/api/admin/overview', () => {
  it('500 quand la base est indisponible', async () => {
    mocks.getAdminDb.mockReturnValue(null);
    expect((await overview.GET(makeRequest('/api/admin/overview'))).status).toBe(500);
  });

  it('renvoie candidatures (triées, champs listés) et créneaux', async () => {
    const { db } = createFakeDb({
      candidatures: [
        { nomPrenom: 'Ancien', departement: 'it', email: 'a@x.tn', createdAt: '2026-10-01T10:00:00Z', secretInterne: 'x' },
        { nomPrenom: 'Récent', departement: 'Études', email: 'b@x.tn', createdAt: '2026-10-05T10:00:00Z' },
      ],
    });
    mocks.getAdminDb.mockReturnValue(db);
    mocks.listAllSlots.mockResolvedValue([{ id: 's1' }]);

    const res = await overview.GET(makeRequest('/api/admin/overview'));
    const body = await readJson<{ admin: string; candidatures: Array<Record<string, unknown>>; slots: unknown[] }>(res);
    expect(res.status).toBe(200);
    expect(body.admin).toBe(ADMIN);
    expect(body.candidatures.map((c) => c.nomPrenom)).toEqual(['Récent', 'Ancien']); // plus récent d'abord
    expect(body.candidatures[0].department).toBe('etudes'); // département normalisé
    expect(body.candidatures[1]).not.toHaveProperty('secretInterne'); // jamais de document brut
    expect(body.slots).toEqual([{ id: 's1' }]);
  });
});

/* ------------------------------------------------------------------ */
describe('/api/admin/deliberation', () => {
  const put = (body: unknown) => deliberation.PUT(makeRequest('/api/admin/deliberation', { method: 'PUT', body }));
  const post = (body: unknown) => deliberation.POST(makeRequest('/api/admin/deliberation', { method: 'POST', body }));

  const decision = (email: string, over: Record<string, unknown> = {}) => ({
    email,
    status: 'accepted',
    message: 'Bienvenue',
    published: true,
    publishedAt: 'x',
    emailSentAt: null,
    decidedAt: 'x',
    decidedBy: ADMIN,
    ...over,
  });

  it('GET renvoie toutes les décisions', async () => {
    mocks.listDecisions.mockResolvedValue([decision('a@x.tn')]);
    const body = await readJson<{ decisions: unknown[] }>(await deliberation.GET(makeRequest('/api/admin/deliberation')));
    expect(body.decisions).toHaveLength(1);
  });

  describe('PUT', () => {
    beforeEach(() => {
      mocks.getAdminDb.mockReturnValue(createFakeDb({ candidatures: [{ email: 'Connu@X.tn' }] }).db);
      mocks.setDecisions.mockResolvedValue(1);
    });

    it('n’enregistre que les e-mails qui ont réellement postulé (casse ignorée)', async () => {
      const res = await put({ emails: ['connu@x.tn', 'inconnu@x.tn'], status: 'accepted', message: 'Bravo' });
      expect(res.status).toBe(200);
      expect(mocks.setDecisions).toHaveBeenCalledWith(['connu@x.tn'], 'accepted', 'Bravo', ADMIN);
      expect(await readJson(res)).toEqual({ ok: true, updated: 1, skipped: 1 });
    });

    it('404 quand aucun e-mail ne correspond à une candidature', async () => {
      const res = await put({ emails: ['inconnu@x.tn'], status: 'rejected' });
      expect(res.status).toBe(404);
      expect(mocks.setDecisions).not.toHaveBeenCalled();
    });

    it('accepte status = null (retrait de la décision)', async () => {
      expect((await put({ emails: ['connu@x.tn'], status: null })).status).toBe(200);
      expect(mocks.setDecisions).toHaveBeenCalledWith(['connu@x.tn'], null, undefined, ADMIN);
    });

    it.each([
      ['statut inconnu', { emails: ['connu@x.tn'], status: 'maybe' }],
      ['liste vide', { emails: [], status: 'accepted' }],
      ['e-mail invalide', { emails: ['nope'], status: 'accepted' }],
      ['message trop long', { emails: ['connu@x.tn'], status: 'accepted', message: 'a'.repeat(601) }],
    ])('400 : %s', async (_label, body) => {
      expect((await put(body)).status).toBe(400);
      expect(mocks.setDecisions).not.toHaveBeenCalled();
    });
  });

  describe('POST publish / unpublish', () => {
    it('publie tous les brouillons quand aucune liste n’est fournie', async () => {
      mocks.setPublished.mockResolvedValue(['a@x.tn', 'b@x.tn']);
      const res = await post({ action: 'publish' });
      expect(mocks.setPublished).toHaveBeenCalledWith(null, true);
      expect(await readJson(res)).toMatchObject({ ok: true, count: 2 });
    });

    it('dépublie une sélection', async () => {
      mocks.setPublished.mockResolvedValue(['a@x.tn']);
      await post({ action: 'unpublish', emails: ['a@x.tn'] });
      expect(mocks.setPublished).toHaveBeenCalledWith(['a@x.tn'], false);
    });

    it('400 pour une action inconnue', async () => {
      expect((await post({ action: 'explode' })).status).toBe(400);
    });
  });

  describe('POST send-email', () => {
    const candidatures = [
      { email: 'a@x.tn', nomPrenom: 'Alice A', departement: 'it' },
      { email: 'b@x.tn', nomPrenom: 'Bob B', departement: 'marketing' },
    ];

    beforeEach(() => {
      mocks.isEmailConfigured.mockReturnValue(true);
      mocks.getAdminDb.mockReturnValue(createFakeDb({ candidatures }).db);
      mocks.sendResultEmail.mockResolvedValue(true);
      mocks.markEmailSent.mockResolvedValue(undefined);
      mocks.getDecisions.mockResolvedValue(
        new Map([
          ['a@x.tn', decision('a@x.tn')],
          ['b@x.tn', decision('b@x.tn', { published: false, publishedAt: null })], // brouillon
          ['orphelin@x.tn', decision('orphelin@x.tn')], // publié mais sans candidature
        ]),
      );
    });

    const send = (emails: string[]) => post({ action: 'send-email', emails });

    it('n’envoie JAMAIS un e-mail pour un résultat non publié', async () => {
      const body = await readJson<{ results: Array<{ email: string; ok: boolean; reason?: string }> }>(
        await send(['a@x.tn', 'b@x.tn', 'inconnu@x.tn', 'orphelin@x.tn']),
      );
      expect(body.results).toEqual([
        { email: 'a@x.tn', ok: true },
        { email: 'b@x.tn', ok: false, reason: 'not-published' },
        { email: 'inconnu@x.tn', ok: false, reason: 'not-published' }, // aucune décision
        { email: 'orphelin@x.tn', ok: false, reason: 'no-candidature' },
      ]);
      expect(mocks.sendResultEmail).toHaveBeenCalledTimes(1);
      expect(mocks.sendResultEmail).toHaveBeenCalledWith('a@x.tn', 'Alice A', 'IT', 'accepted', 'Bienvenue');
    });

    it('note l’envoi (emailSentAt) uniquement pour les e-mails réellement partis', async () => {
      await send(['a@x.tn', 'b@x.tn']);
      expect(mocks.markEmailSent).toHaveBeenCalledTimes(1);
      expect(mocks.markEmailSent).toHaveBeenCalledWith('a@x.tn');
    });

    it('« smtp-error » et aucune trace d’envoi quand le SMTP échoue', async () => {
      mocks.sendResultEmail.mockResolvedValue(false);
      const body = await readJson<{ results: Array<{ reason?: string }> }>(await send(['a@x.tn']));
      expect(body.results[0].reason).toBe('smtp-error');
      expect(mocks.markEmailSent).not.toHaveBeenCalled();
    });

    it('signale « emailConfigured: false » sans rien envoyer quand le SMTP est absent', async () => {
      mocks.isEmailConfigured.mockReturnValue(false);
      expect(await readJson(await send(['a@x.tn']))).toEqual({ ok: true, emailConfigured: false, results: [] });
      expect(mocks.sendResultEmail).not.toHaveBeenCalled();
    });

    it('400 au-delà d’un lot de 8 e-mails', async () => {
      const emails = Array.from({ length: 9 }, (_, i) => `c${i}@x.tn`);
      expect((await send(emails)).status).toBe(400);
      expect(mocks.sendResultEmail).not.toHaveBeenCalled();
    });

    it('accepte exactement 8 e-mails', async () => {
      const emails = Array.from({ length: 8 }, (_, i) => `c${i}@x.tn`);
      expect((await send(emails)).status).toBe(200);
    });
  });
});
