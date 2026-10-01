import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeRequest, readJson } from '../helpers/http';

const mocks = vi.hoisted(() => ({
  isEmailConfigured: vi.fn(),
  sendInterviewReminder: vi.fn(),
  claimDueReminders: vi.fn(),
  getCandidatureNameByEmail: vi.fn(),
  releaseReminderClaim: vi.fn(),
}));

vi.mock('@/lib/email', () => ({
  isEmailConfigured: mocks.isEmailConfigured,
  sendInterviewReminder: mocks.sendInterviewReminder,
}));
vi.mock('@/lib/slots-store', () => ({
  claimDueReminders: mocks.claimDueReminders,
  getCandidatureNameByEmail: mocks.getCandidatureNameByEmail,
  releaseReminderClaim: mocks.releaseReminderClaim,
}));

import { GET, POST } from '@/app/api/cron/reminders/route';

const reminder = (n: number) => ({
  slotId: `slot-${n}`,
  email: `cand${n}@example.com`,
  date: '2026-10-12',
  time: '09:00',
  department: 'it',
  mode: 'presentiel',
});

const call = (headers: Record<string, string> = {}) =>
  GET(makeRequest('/api/cron/reminders', { auth: false, headers }));

let savedSecret: string | undefined;

beforeEach(() => {
  vi.resetAllMocks();
  savedSecret = process.env.CRON_SECRET;
  delete process.env.CRON_SECRET;
  mocks.isEmailConfigured.mockReturnValue(true);
  mocks.sendInterviewReminder.mockResolvedValue(true);
  mocks.claimDueReminders.mockResolvedValue([]);
  mocks.getCandidatureNameByEmail.mockResolvedValue('Ali Ben Salah');
  mocks.releaseReminderClaim.mockResolvedValue(undefined);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  if (savedSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = savedSecret;
});

describe('/api/cron/reminders — authentification', () => {
  it('401 quand CRON_SECRET est défini et l’en-tête absent', async () => {
    process.env.CRON_SECRET = 's3cret';
    expect((await call()).status).toBe(401);
    expect(mocks.claimDueReminders).not.toHaveBeenCalled();
  });

  it('401 avec un mauvais secret', async () => {
    process.env.CRON_SECRET = 's3cret';
    expect((await call({ authorization: 'Bearer autre' })).status).toBe(401);
    expect((await call({ authorization: 's3cret' })).status).toBe(401); // sans « Bearer »
  });

  it('200 avec le bon secret', async () => {
    process.env.CRON_SECRET = 's3cret';
    expect((await call({ authorization: 'Bearer s3cret' })).status).toBe(200);
  });

  // Comportement actuel : sans secret, l'endpoint est PUBLIC. À n'accepter qu'en local.
  it('accepte tout appel quand CRON_SECRET est vide (déconseillé en production)', async () => {
    expect((await call()).status).toBe(200);
  });

  it('POST est équivalent à GET (même contrôle du secret)', async () => {
    process.env.CRON_SECRET = 's3cret';
    expect((await POST(makeRequest('/api/cron/reminders', { method: 'POST', auth: false }))).status).toBe(401);
    expect(
      (
        await POST(
          makeRequest('/api/cron/reminders', { method: 'POST', auth: false, headers: { authorization: 'Bearer s3cret' } }),
        )
      ).status,
    ).toBe(200);
  });
});

describe('/api/cron/reminders — envoi', () => {
  it('ne réserve aucun rappel quand le SMTP n’est pas configuré', async () => {
    mocks.isEmailConfigured.mockReturnValue(false);
    const body = await readJson(await call());
    expect(body).toEqual({ ok: true, sent: 0, failed: 0, skipped: 'smtp-not-configured' });
    expect(mocks.claimDueReminders).not.toHaveBeenCalled(); // sinon les rappels seraient « consommés » sans partir
  });

  it('rien à envoyer', async () => {
    expect(await readJson(await call())).toEqual({ ok: true, sent: 0, failed: 0, total: 0 });
    expect(mocks.sendInterviewReminder).not.toHaveBeenCalled();
  });

  it('envoie chaque rappel avec nom, jour lisible et heure', async () => {
    mocks.claimDueReminders.mockResolvedValue([reminder(1), reminder(2)]);
    const body = await readJson(await call());
    expect(body).toEqual({ ok: true, sent: 2, failed: 0, total: 2 });
    expect(mocks.sendInterviewReminder).toHaveBeenNthCalledWith(
      1,
      'cand1@example.com',
      'Ali Ben Salah',
      'Lundi 12 octobre',
      '09:00',
    );
    expect(mocks.releaseReminderClaim).not.toHaveBeenCalled();
  });

  it('utilise l’e-mail comme nom quand la candidature n’a pas de nom', async () => {
    mocks.claimDueReminders.mockResolvedValue([reminder(1)]);
    mocks.getCandidatureNameByEmail.mockResolvedValue(null);
    await call();
    expect(mocks.sendInterviewReminder).toHaveBeenCalledWith(
      'cand1@example.com',
      'cand1@example.com',
      'Lundi 12 octobre',
      '09:00',
    );
  });

  it('libère la réservation du rappel quand l’envoi échoue (nouvelle tentative au prochain passage)', async () => {
    mocks.claimDueReminders.mockResolvedValue([reminder(1), reminder(2)]);
    mocks.sendInterviewReminder.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const body = await readJson(await call());
    expect(body).toEqual({ ok: true, sent: 1, failed: 1, total: 2 });
    expect(mocks.releaseReminderClaim).toHaveBeenCalledTimes(1);
    expect(mocks.releaseReminderClaim).toHaveBeenCalledWith('slot-2');
  });

  it('une exception sur un rappel n’empêche pas les suivants', async () => {
    mocks.claimDueReminders.mockResolvedValue([reminder(1), reminder(2)]);
    mocks.getCandidatureNameByEmail.mockRejectedValueOnce(new Error('firestore')).mockResolvedValueOnce('Sami');
    const body = await readJson(await call());
    expect(body).toEqual({ ok: true, sent: 1, failed: 1, total: 2 });
    expect(mocks.releaseReminderClaim).toHaveBeenCalledWith('slot-1');
    expect(mocks.sendInterviewReminder).toHaveBeenCalledTimes(1);
  });

  it('interdit la mise en cache', async () => {
    expect((await call()).headers.get('cache-control')).toBe('no-store');
  });
});
