import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeRequest, readJson } from '../helpers/http';
import { createFakeDb } from '../helpers/fake-db';

const mocks = vi.hoisted(() => ({
  isFirebaseAdminConfigured: vi.fn(),
  getVerifiedEmail: vi.fn(),
  getAdminDb: vi.fn(),
  getServiceWindowStates: vi.fn(),
  getNotificationSettings: vi.fn(),
  sendCandidatureConfirmation: vi.fn(),
  notifyRhNewCandidature: vi.fn(),
}));

vi.mock('@/lib/firebase-admin', () => ({
  isFirebaseAdminConfigured: mocks.isFirebaseAdminConfigured,
  getVerifiedEmail: mocks.getVerifiedEmail,
  getAdminDb: mocks.getAdminDb,
}));
vi.mock('@/lib/settings-store', () => ({ getServiceWindowStates: mocks.getServiceWindowStates }));
vi.mock('@/lib/notification-settings-store', () => ({
  getNotificationSettings: mocks.getNotificationSettings,
}));
vi.mock('@/lib/email', () => ({
  sendCandidatureConfirmation: mocks.sendCandidatureConfirmation,
  notifyRhNewCandidature: mocks.notifyRhNewCandidature,
}));

import { GET, POST } from '@/app/api/candidature/route';

const OPEN = { candidature: { status: { state: 'open' } } };

const validBody = {
  nomPrenom: 'Ahmed Ben Salah',
  telephone: '22123456',
  filiere: 'GI',
  niveauEtudes: '2e année',
  departements: ['marketing', 'it'],
  sourceConnaissance: 'Réseaux sociaux',
  niveauFrancais: 'Avancé',
  niveauAnglais: 'Intermédiaire',
  participationFormations: 'Oui, systématiquement',
  autreEngagement: 'non',
  organisationTemps: '',
  motivation: 'Je veux apprendre sur de vrais projets',
  domaine: 'Développement web',
  remarques: '',
  consentement: true,
};

let fake: ReturnType<typeof createFakeDb>;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.isFirebaseAdminConfigured.mockReturnValue(true);
  mocks.getVerifiedEmail.mockResolvedValue('candidat@example.com');
  mocks.getServiceWindowStates.mockResolvedValue(OPEN);
  mocks.getNotificationSettings.mockResolvedValue({ candidatureEmail: true });
  mocks.sendCandidatureConfirmation.mockResolvedValue(undefined);
  mocks.notifyRhNewCandidature.mockResolvedValue(undefined);
  fake = createFakeDb({ candidatures: [] });
  mocks.getAdminDb.mockReturnValue(fake.db);
});

describe('GET /api/candidature', () => {
  it('500 quand Firebase Admin n’est pas configuré', async () => {
    mocks.isFirebaseAdminConfigured.mockReturnValue(false);
    expect((await GET(makeRequest('/api/candidature'))).status).toBe(500);
  });

  it('401 sans token valide', async () => {
    mocks.getVerifiedEmail.mockResolvedValue(null);
    expect((await GET(makeRequest('/api/candidature', { auth: false }))).status).toBe(401);
  });

  it('exists: false quand aucune candidature', async () => {
    const res = await GET(makeRequest('/api/candidature'));
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ ok: true, exists: false });
  });

  it('exists: true avec la date et le département', async () => {
    fake = createFakeDb({ candidatures: [{ createdAt: '2026-10-02T10:00:00Z', departement: 'it' }] });
    mocks.getAdminDb.mockReturnValue(fake.db);
    const body = await readJson(await GET(makeRequest('/api/candidature')));
    expect(body).toEqual({ ok: true, exists: true, submittedAt: '2026-10-02T10:00:00Z', departement: 'it' });
  });
});

describe('POST /api/candidature', () => {
  const post = (body: unknown) => POST(makeRequest('/api/candidature', { method: 'POST', body }));

  it('500 quand Firebase Admin n’est pas configuré', async () => {
    mocks.isFirebaseAdminConfigured.mockReturnValue(false);
    expect((await post(validBody)).status).toBe(500);
  });

  it('401 sans token valide', async () => {
    mocks.getVerifiedEmail.mockResolvedValue(null);
    expect((await post(validBody)).status).toBe(401);
    expect(fake.add).not.toHaveBeenCalled();
  });

  it('403 NOT_STARTED avant l’ouverture', async () => {
    mocks.getServiceWindowStates.mockResolvedValue({
      candidature: { status: { state: 'not-started', opensAt: '2026-10-01T00:00:00+01:00' } },
    });
    const res = await post(validBody);
    expect(res.status).toBe(403);
    expect((await readJson(res)).code).toBe('NOT_STARTED');
    expect(fake.add).not.toHaveBeenCalled();
  });

  it('403 CLOSED après la fermeture', async () => {
    mocks.getServiceWindowStates.mockResolvedValue({
      candidature: { status: { state: 'closed', closesAt: '2026-10-31T23:59:59+01:00' } },
    });
    const res = await post(validBody);
    expect(res.status).toBe(403);
    expect((await readJson(res)).code).toBe('CLOSED');
    expect(fake.add).not.toHaveBeenCalled();
  });

  it('400 quand le schéma est violé, avec le détail des erreurs', async () => {
    const res = await post({ ...validBody, telephone: '123' });
    expect(res.status).toBe(400);
    const body = await readJson<{ errors: { fieldErrors: Record<string, string[]> } }>(res);
    expect(body.errors.fieldErrors.telephone).toBeTruthy();
    expect(fake.add).not.toHaveBeenCalled();
  });

  it('409 ALREADY_SUBMITTED : une seule candidature par e-mail', async () => {
    fake = createFakeDb({ candidatures: [{ email: 'candidat@example.com' }] });
    mocks.getAdminDb.mockReturnValue(fake.db);
    const res = await post(validBody);
    expect(res.status).toBe(409);
    expect((await readJson(res)).code).toBe('ALREADY_SUBMITTED');
    expect(fake.add).not.toHaveBeenCalled();
    expect(mocks.sendCandidatureConfirmation).not.toHaveBeenCalled();
  });

  it('crée la candidature : e-mail issu du TOKEN, département = premier choix', async () => {
    // Le corps tente d'imposer un autre e-mail : il doit être ignoré.
    const res = await post({ ...validBody, email: 'pirate@example.com' });
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ ok: true });

    expect(fake.add).toHaveBeenCalledTimes(1);
    const saved = fake.add.mock.calls[0][0] as Record<string, unknown>;
    expect(saved.email).toBe('candidat@example.com');
    expect(saved.departement).toBe('marketing'); // 1er de ['marketing', 'it']
    expect(saved.departements).toEqual(['marketing', 'it']);
    expect(saved.nomPrenom).toBe('Ahmed Ben Salah');
    expect(typeof saved.createdAt).toBe('string');
    expect(saved.updatedAt).toBe(saved.createdAt);
  });

  it('envoie la confirmation au candidat et la notification aux RH', async () => {
    await post(validBody);
    expect(mocks.sendCandidatureConfirmation).toHaveBeenCalledWith(
      'candidat@example.com',
      'Ahmed Ben Salah',
      'Marketing',
    );
    expect(mocks.notifyRhNewCandidature).toHaveBeenCalledWith('candidat@example.com', 'Ahmed Ben Salah', 'Marketing');
  });

  it('la candidature est enregistrée même si les e-mails échouent', async () => {
    mocks.sendCandidatureConfirmation.mockRejectedValue(new Error('SMTP down'));
    mocks.notifyRhNewCandidature.mockRejectedValue(new Error('SMTP down'));
    const res = await post(validBody);
    expect(res.status).toBe(200);
    expect(fake.add).toHaveBeenCalledTimes(1);
  });

  // Régression corrigée : un corps invalide renvoie 400 (et non une exception → 500).
  it('400 (et non une exception) quand le corps n’est pas du JSON', async () => {
    const res = await POST(makeRequest('/api/candidature', { method: 'POST', rawBody: '{pas du json' }));
    expect(res.status).toBe(400);
  });
});