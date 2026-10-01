import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeRequest, readJson } from '../helpers/http';

const mocks = vi.hoisted(() => ({
  isFirebaseAdminConfigured: vi.fn(),
  getVerifiedEmail: vi.fn(),
  getServiceWindowStates: vi.fn(),
  getCandidateDepartment: vi.fn(),
  getBookingForEmail: vi.fn(),
  bookSlot: vi.fn(),
}));

vi.mock('@/lib/firebase-admin', () => ({
  isFirebaseAdminConfigured: mocks.isFirebaseAdminConfigured,
  getVerifiedEmail: mocks.getVerifiedEmail,
}));
vi.mock('@/lib/settings-store', () => ({ getServiceWindowStates: mocks.getServiceWindowStates }));
vi.mock('@/lib/slots-store', () => ({
  getCandidateDepartment: mocks.getCandidateDepartment,
  getBookingForEmail: mocks.getBookingForEmail,
  bookSlot: mocks.bookSlot,
}));

import { GET, POST } from '@/app/api/reservation/route';

const slot = { id: 'slot-1', date: '2026-10-12', time: '09:00', department: 'it', mode: 'en-ligne', booked: true };
const post = (body: unknown) => POST(makeRequest('/api/reservation', { method: 'POST', body }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.isFirebaseAdminConfigured.mockReturnValue(true);
  mocks.getVerifiedEmail.mockResolvedValue('candidat@example.com');
  mocks.getServiceWindowStates.mockResolvedValue({ entretien: { status: { state: 'open' } } });
  mocks.getCandidateDepartment.mockResolvedValue({ status: 'ok', department: 'it' });
  mocks.getBookingForEmail.mockResolvedValue(null);
  mocks.bookSlot.mockResolvedValue({ ok: true, slot });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GET /api/reservation', () => {
  const get = () => GET(makeRequest('/api/reservation'));

  it('401 sans token valide', async () => {
    mocks.getVerifiedEmail.mockResolvedValue(null);
    expect((await get()).status).toBe(401);
  });

  it('slot: null quand aucune réservation', async () => {
    expect(await readJson(await get())).toEqual({ slot: null });
  });

  it('renvoie la réservation existante sans exposer d’e-mail', async () => {
    mocks.getBookingForEmail.mockResolvedValue({ ...slot, bookedByEmail: 'candidat@example.com' });
    const body = await readJson(await get());
    expect(body).toEqual({
      slot: { id: 'slot-1', date: '2026-10-12', time: '09:00', department: 'it', mode: 'en-ligne' },
    });
  });

  it('500 quand la lecture échoue', async () => {
    mocks.getBookingForEmail.mockRejectedValue(new Error('boom'));
    expect((await get()).status).toBe(500);
  });
});

describe('POST /api/reservation', () => {
  it('401 sans token valide', async () => {
    mocks.getVerifiedEmail.mockResolvedValue(null);
    expect((await post({ slotId: 'slot-1' })).status).toBe(401);
    expect(mocks.bookSlot).not.toHaveBeenCalled();
  });

  it('403 NOT_STARTED / CLOSED selon la fenêtre de réservation', async () => {
    mocks.getServiceWindowStates.mockResolvedValue({
      entretien: { status: { state: 'not-started', opensAt: '2026-10-10T08:00:00+01:00' } },
    });
    let res = await post({ slotId: 'slot-1' });
    expect(res.status).toBe(403);
    expect((await readJson(res)).code).toBe('NOT_STARTED');

    mocks.getServiceWindowStates.mockResolvedValue({
      entretien: { status: { state: 'closed', closesAt: '2026-10-11T08:00:00+01:00' } },
    });
    res = await post({ slotId: 'slot-1' });
    expect(res.status).toBe(403);
    expect((await readJson(res)).code).toBe('CLOSED');
    expect(mocks.bookSlot).not.toHaveBeenCalled();
  });

  it.each([
    ['slotId absent', {}],
    ['slotId vide', { slotId: '' }],
    ['slotId avec un slash', { slotId: 'a/b' }],
    ['slotId avec ../', { slotId: '../secret' }],
    ['slotId trop long', { slotId: 'a'.repeat(201) }],
    ['slotId non-string', { slotId: 42 }],
  ])('400 : %s', async (_label, body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(mocks.bookSlot).not.toHaveBeenCalled();
  });

  it('400 quand le corps n’est pas du JSON', async () => {
    const res = await POST(makeRequest('/api/reservation', { method: 'POST', rawBody: 'nope' }));
    expect(res.status).toBe(400);
  });

  it('409 sans candidature préalable', async () => {
    mocks.getCandidateDepartment.mockResolvedValue({ status: 'no-candidature' });
    expect((await post({ slotId: 'slot-1' })).status).toBe(409);
    expect(mocks.bookSlot).not.toHaveBeenCalled();
  });

  it('409 quand le département de la candidature est invalide', async () => {
    mocks.getCandidateDepartment.mockResolvedValue({ status: 'invalid-department' });
    expect((await post({ slotId: 'slot-1' })).status).toBe(409);
  });

  it('réserve avec l’e-mail du token et le département de la CANDIDATURE (jamais du client)', async () => {
    const res = await post({ slotId: 'slot-1', department: 'marketing', email: 'pirate@example.com' });
    expect(res.status).toBe(200);
    expect(mocks.bookSlot).toHaveBeenCalledWith('slot-1', 'candidat@example.com', 'it');
    expect(await readJson(res)).toEqual({
      ok: true,
      slot: { id: 'slot-1', date: '2026-10-12', time: '09:00', department: 'it', mode: 'en-ligne' },
    });
  });

  it.each([
    ['already-booked', 409, /vient d'être réservé/],
    ['not-found', 409, /n'existe plus/],
    ['duplicate-email', 409, /déjà réservé/],
    ['wrong-department', 403, /département/],
  ] as const)('refus « %s » -> %i', async (reason, status, message) => {
    mocks.bookSlot.mockResolvedValue({ ok: false, reason });
    const res = await post({ slotId: 'slot-1' });
    expect(res.status).toBe(status);
    expect((await readJson<{ message: string }>(res)).message).toMatch(message);
  });

  it('500 quand la transaction échoue', async () => {
    mocks.bookSlot.mockRejectedValue(new Error('firestore down'));
    expect((await post({ slotId: 'slot-1' })).status).toBe(500);
  });
});
