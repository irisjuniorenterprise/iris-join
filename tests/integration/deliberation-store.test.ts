// Intégration de lib/deliberation-store.ts et lib/settings-store.ts sur l'ÉMULATEUR Firestore.
import { beforeEach, describe, expect, it } from 'vitest';
import { clearFirestore, freshModules, hasEmulator } from './_emulator';

type Mods = Awaited<ReturnType<typeof freshModules>>;
let m: Mods;

const raw = async (key: string) => (await m.db.collection('deliberations').doc(key).get()).data();

describe.skipIf(!hasEmulator)('deliberation-store (émulateur Firestore)', () => {
  beforeEach(async () => {
    await clearFirestore();
    m = await freshModules();
  });

  describe('setDecisions', () => {
    it('crée les décisions en BROUILLON (non publiées), avec l’e-mail en minuscules comme clé', async () => {
      const count = await m.deliberation.setDecisions(['Ali@X.tn', 'sami@x.tn'], 'accepted', 'Bravo', 'admin@iris.tn');
      expect(count).toBe(2);

      expect(await raw('ali@x.tn')).toMatchObject({
        email: 'ali@x.tn',
        status: 'accepted',
        message: 'Bravo',
        published: false,
        decidedBy: 'admin@iris.tn',
      });
    });

    it('dédoublonne les e-mails (casse ignorée)', async () => {
      expect(await m.deliberation.setDecisions(['a@x.tn', 'A@X.TN'], 'rejected', undefined, 'admin')).toBe(1);
    });

    it('ne compte pas une décision identique (idempotent)', async () => {
      await m.deliberation.setDecisions(['a@x.tn'], 'accepted', 'msg', 'admin');
      expect(await m.deliberation.setDecisions(['a@x.tn'], 'accepted', 'msg', 'admin')).toBe(0);
    });

    it('conserve le message existant quand aucun message n’est fourni', async () => {
      await m.deliberation.setDecisions(['a@x.tn'], 'accepted', 'Message initial', 'admin');
      await m.deliberation.setDecisions(['a@x.tn'], 'rejected', undefined, 'admin');
      expect(await raw('a@x.tn')).toMatchObject({ status: 'rejected', message: 'Message initial' });
    });

    it('un résultat déjà publié le reste, mais l’envoi d’e-mail est à refaire quand la décision change', async () => {
      await m.deliberation.setDecisions(['a@x.tn'], 'accepted', 'm', 'admin');
      await m.deliberation.setPublished(['a@x.tn'], true);
      await m.deliberation.markEmailSent('a@x.tn');
      expect((await raw('a@x.tn'))?.emailSentAt).toBeTruthy();

      await m.deliberation.setDecisions(['a@x.tn'], 'rejected', 'm', 'admin');
      const stored = await raw('a@x.tn');
      expect(stored?.published).toBe(true);
      expect(stored).not.toHaveProperty('emailSentAt');
    });

    it('status = null retire la décision', async () => {
      await m.deliberation.setDecisions(['a@x.tn'], 'accepted', 'm', 'admin');
      expect(await m.deliberation.setDecisions(['a@x.tn', 'inconnu@x.tn'], null, undefined, 'admin')).toBe(1);
      expect(await raw('a@x.tn')).toBeUndefined();
    });

    it('traite plus de 400 candidats (plusieurs lots d’écriture)', async () => {
      const emails = Array.from({ length: 450 }, (_, i) => `cand${i}@x.tn`);
      expect(await m.deliberation.setDecisions(emails, 'absent', undefined, 'admin')).toBe(450);
      expect(await m.deliberation.listDecisions()).toHaveLength(450);
    }, 60_000);
  });

  describe('setPublished', () => {
    beforeEach(async () => {
      await m.deliberation.setDecisions(['a@x.tn', 'b@x.tn', 'c@x.tn'], 'accepted', '', 'admin');
    });

    it('publie une sélection seulement', async () => {
      expect(await m.deliberation.setPublished(['a@x.tn'], true)).toEqual(['a@x.tn']);
      expect((await raw('a@x.tn'))?.published).toBe(true);
      expect((await raw('a@x.tn'))?.publishedAt).toBeTruthy();
      expect((await raw('b@x.tn'))?.published).toBe(false);
    });

    it('keys = null : publie TOUS les brouillons', async () => {
      const affected = await m.deliberation.setPublished(null, true);
      expect(affected.sort()).toEqual(['a@x.tn', 'b@x.tn', 'c@x.tn']);
    });

    it('ne re-publie pas ce qui l’est déjà', async () => {
      await m.deliberation.setPublished(['a@x.tn'], true);
      expect(await m.deliberation.setPublished(['a@x.tn'], true)).toEqual([]);
    });

    it('dépublie et efface la date de publication', async () => {
      await m.deliberation.setPublished(null, true);
      expect(await m.deliberation.setPublished(['a@x.tn'], false)).toEqual(['a@x.tn']);
      const stored = await raw('a@x.tn');
      expect(stored?.published).toBe(false);
      expect(stored).not.toHaveProperty('publishedAt');
    });

    it('ignore les e-mails sans décision', async () => {
      expect(await m.deliberation.setPublished(['inconnu@x.tn'], true)).toEqual([]);
    });
  });

  describe('lecture', () => {
    it('getDecision est insensible à la casse et renvoie null si absente', async () => {
      await m.deliberation.setDecisions(['a@x.tn'], 'absent', 'm', 'admin');
      expect((await m.deliberation.getDecision('A@X.tn'))?.status).toBe('absent');
      expect(await m.deliberation.getDecision('inconnu@x.tn')).toBeNull();
    });

    it('getDecisions gère plus de 100 clés (lecture par paquets)', async () => {
      const emails = Array.from({ length: 130 }, (_, i) => `c${i}@x.tn`);
      await m.deliberation.setDecisions(emails, 'accepted', '', 'admin');
      const map = await m.deliberation.getDecisions(emails);
      expect(map.size).toBe(130);
    }, 30_000);

    it('ignore les documents dont le statut est invalide', async () => {
      await m.db.collection('deliberations').doc('bad@x.tn').set({ status: 'peut-etre' });
      expect(await m.deliberation.listDecisions()).toEqual([]);
    });
  });
});

describe.skipIf(!hasEmulator)('settings-store (émulateur Firestore)', () => {
  beforeEach(async () => {
    await clearFirestore();
    m = await freshModules();
  });

  it('sans document : aucune limite des deux côtés (service ouvert)', async () => {
    const windows = await m.settings.getServiceWindows();
    expect(windows).toEqual({
      candidature: { opensAt: null, closesAt: null },
      entretien: { opensAt: null, closesAt: null },
    });
  });

  it('met à jour UN service sans toucher à l’autre', async () => {
    const a = { opensAt: '2026-10-01T00:00:00+01:00', closesAt: '2026-10-31T23:59:59+01:00' };
    const b = { opensAt: '2026-10-10T08:00:00+01:00', closesAt: null };
    await m.settings.updateServiceWindow('candidature', a);
    const windows = await m.settings.updateServiceWindow('entretien', b);
    expect(windows).toEqual({ candidature: a, entretien: b });
  });

  it('remplace les valeurs illisibles par « pas de limite »', async () => {
    await m.db.collection('settings').doc('serviceWindows').set({
      candidature: { opensAt: 'pas une date', closesAt: 42 },
      entretien: 'cassé',
    });
    expect(await m.settings.getServiceWindows()).toEqual({
      candidature: { opensAt: null, closesAt: null },
      entretien: { opensAt: null, closesAt: null },
    });
  });

  it('getServiceWindowStates calcule le statut à l’instant donné', async () => {
    await m.settings.updateServiceWindow('entretien', {
      opensAt: '2026-10-10T08:00:00+01:00',
      closesAt: '2026-10-11T18:00:00+01:00',
    });
    const before = await m.settings.getServiceWindowStates(new Date('2026-10-09T00:00:00Z'));
    const during = await m.settings.getServiceWindowStates(new Date('2026-10-10T12:00:00Z'));
    const after = await m.settings.getServiceWindowStates(new Date('2026-10-12T00:00:00Z'));
    expect(before.entretien.status.state).toBe('not-started');
    expect(during.entretien.status.state).toBe('open');
    expect(after.entretien.status.state).toBe('closed');
    expect(during.candidature.status.state).toBe('open'); // jamais configuré = ouvert
  });
});
