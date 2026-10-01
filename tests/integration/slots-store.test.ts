// Intégration de lib/slots-store.ts sur l'ÉMULATEUR Firestore.
// C'est ici que se vérifient les garanties qu'un mock ne peut pas donner :
// transactions, concurrence, suppression de champs, requêtes réelles.
import { beforeEach, describe, expect, it } from 'vitest';
import { clearFirestore, freshModules, hasEmulator } from './_emulator';

type Mods = Awaited<ReturnType<typeof freshModules>>;
let m: Mods;

async function makeSlot(over: Partial<{ date: string; time: string; department: 'it' | 'marketing' | 'etudes' | 'dev-co' }> = {}) {
  const item = { date: '2026-10-12', time: '09:00', department: 'it' as const, ...over };
  await m.slots.createSlots([item]);
  const id = `${item.date}_${item.time.replace(':', '')}_${item.department}`;
  return id;
}

describe.skipIf(!hasEmulator)('slots-store (émulateur Firestore)', () => {
  beforeEach(async () => {
    await clearFirestore();
    m = await freshModules();
  });

  describe('grille automatique', () => {
    it('génère un créneau par (jour × heure × département), puis reste idempotente', async () => {
      await clearFirestore();
      m = await freshModules({ seedGrid: false });

      const first = await m.slots.listAllSlots();
      expect(first).toHaveLength(3 * 8 * 4); // SLOT_DAYS × SLOT_HOURS × départements

      m.db; // la seconde lecture ne doit rien recréer
      const second = await m.slots.listAllSlots();
      expect(second).toHaveLength(first.length);
    });

    it('ne ressuscite pas un créneau supprimé à la main', async () => {
      await clearFirestore();
      m = await freshModules({ seedGrid: false });
      const all = await m.slots.listAllSlots();
      const victim = all[0];
      await m.slots.deleteSlot(victim.id);

      // Nouveau « démarrage » du serveur : le document témoin empêche la régénération.
      m = await freshModules({ seedGrid: false });
      const after = await m.slots.listAllSlots();
      expect(after.find((s) => s.id === victim.id)).toBeUndefined();
      expect(after).toHaveLength(all.length - 1);
    });
  });

  describe('getSlotsForDepartment', () => {
    it('ne renvoie que les créneaux du département, triés par date puis heure', async () => {
      await m.slots.createSlots([
        { date: '2026-10-13', time: '09:00', department: 'it' },
        { date: '2026-10-12', time: '10:30', department: 'it' },
        { date: '2026-10-12', time: '09:00', department: 'it' },
        { date: '2026-10-12', time: '09:00', department: 'marketing' },
      ]);
      const slots = await m.slots.getSlotsForDepartment('it');
      expect(slots.map((s) => `${s.date} ${s.time}`)).toEqual(['2026-10-12 09:00', '2026-10-12 10:30', '2026-10-13 09:00']);
      expect(slots.every((s) => s.department === 'it')).toBe(true);
    });

    it('reconnaît les anciens documents dont le département est un libellé (« Études »)', async () => {
      await m.db.collection('slots').doc('legacy').set({ date: '2026-10-12', time: '09:00', department: 'Études', booked: false });
      const slots = await m.slots.getSlotsForDepartment('etudes');
      expect(slots.map((s) => s.id)).toEqual(['legacy']);
      expect(slots[0].mode).toBe('presentiel'); // mode par défaut pour les anciens créneaux
    });
  });

  describe('createSlots', () => {
    it('ignore les doublons (même jour, heure, département)', async () => {
      const item = { date: '2026-10-12', time: '09:00', department: 'it' as const };
      expect(await m.slots.createSlots([item])).toEqual({ created: 1, skipped: 0 });
      expect(await m.slots.createSlots([item, { ...item, time: '10:00' }])).toEqual({ created: 1, skipped: 1 });
    });

    it('enregistre le mode choisi', async () => {
      await m.slots.createSlots([{ date: '2026-10-12', time: '09:00', department: 'it', mode: 'en-ligne' }]);
      expect((await m.slots.getSlotsForDepartment('it'))[0].mode).toBe('en-ligne');
    });
  });

  describe('bookSlot', () => {
    it('réserve un créneau libre', async () => {
      const id = await makeSlot();
      const result = await m.slots.bookSlot(id, 'a@x.tn', 'it');
      expect(result.ok).toBe(true);
      const stored = (await m.db.collection('slots').doc(id).get()).data();
      expect(stored).toMatchObject({ booked: true, bookedByEmail: 'a@x.tn' });
    });

    it('« not-found » pour un créneau inexistant', async () => {
      expect(await m.slots.bookSlot('inconnu', 'a@x.tn', 'it')).toEqual({ ok: false, reason: 'not-found' });
    });

    it('« wrong-department » : un candidat IT ne réserve pas un créneau Marketing', async () => {
      const id = await makeSlot({ department: 'marketing' });
      expect(await m.slots.bookSlot(id, 'a@x.tn', 'it')).toEqual({ ok: false, reason: 'wrong-department' });
    });

    it('« already-booked » quand le créneau est déjà pris', async () => {
      const id = await makeSlot();
      await m.slots.bookSlot(id, 'a@x.tn', 'it');
      expect(await m.slots.bookSlot(id, 'b@x.tn', 'it')).toEqual({ ok: false, reason: 'already-booked' });
    });

    it('« duplicate-email » : une seule réservation par personne', async () => {
      const first = await makeSlot({ time: '09:00' });
      const second = await makeSlot({ time: '10:00' });
      await m.slots.bookSlot(first, 'a@x.tn', 'it');
      expect(await m.slots.bookSlot(second, 'a@x.tn', 'it')).toEqual({ ok: false, reason: 'duplicate-email' });
    });

    it('CONCURRENCE : 10 candidats sur le même créneau -> un seul gagnant', async () => {
      const id = await makeSlot();
      const results = await Promise.all(
        Array.from({ length: 10 }, (_, i) => m.slots.bookSlot(id, `cand${i}@x.tn`, 'it')),
      );
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(results.filter((r) => !r.ok && r.reason === 'already-booked')).toHaveLength(9);

      const stored = (await m.db.collection('slots').doc(id).get()).data();
      expect(stored?.booked).toBe(true);
      const winner = results.findIndex((r) => r.ok);
      expect(stored?.bookedByEmail).toBe(`cand${winner}@x.tn`);
    });

    // TEST DE DÉTECTION : deux requêtes simultanées du MÊME candidat sur deux
    // créneaux différents (double-clic, deux onglets). Doit donner UNE seule
    // réservation. S'il échoue, il révèle une vraie faille de concurrence
    // (la règle « un e-mail = un créneau » repose sur une requête de transaction).
    it('CONCURRENCE : le même candidat sur deux créneaux en parallèle -> une seule réservation', async () => {
      const a = await makeSlot({ time: '09:00' });
      const b = await makeSlot({ time: '10:00' });
      await Promise.all([m.slots.bookSlot(a, 'double@x.tn', 'it'), m.slots.bookSlot(b, 'double@x.tn', 'it')]);
      const booked = await m.db.collection('slots').where('bookedByEmail', '==', 'double@x.tn').get();
      expect(booked.size).toBe(1);
    });
  });

  describe('getBookingForEmail / getCandidateDepartment / getCandidatureNameByEmail', () => {
    it('retrouve la réservation d’un e-mail (ou null)', async () => {
      const id = await makeSlot();
      expect(await m.slots.getBookingForEmail('a@x.tn')).toBeNull();
      await m.slots.bookSlot(id, 'a@x.tn', 'it');
      expect((await m.slots.getBookingForEmail('a@x.tn'))?.id).toBe(id);
    });

    it('lit le département de la candidature', async () => {
      await m.db.collection('candidatures').add({ email: 'a@x.tn', departement: 'etudes', nomPrenom: ' Ali Ben ' });
      await m.db.collection('candidatures').add({ email: 'b@x.tn', departement: 'rh' });
      expect(await m.slots.getCandidateDepartment('a@x.tn')).toEqual({ status: 'ok', department: 'etudes' });
      expect(await m.slots.getCandidateDepartment('b@x.tn')).toEqual({ status: 'invalid-department' });
      expect(await m.slots.getCandidateDepartment('c@x.tn')).toEqual({ status: 'no-candidature' });
      expect(await m.slots.getCandidatureNameByEmail('a@x.tn')).toBe('Ali Ben');
      expect(await m.slots.getCandidatureNameByEmail('c@x.tn')).toBeNull();
    });
  });

  describe('releaseMismatchedBookings', () => {
    it('libère la réservation qui ne correspond plus au département de la candidature', async () => {
      const id = await makeSlot({ department: 'it' });
      await m.slots.bookSlot(id, 'a@x.tn', 'it');

      expect(await m.slots.releaseMismatchedBookings('a@x.tn', 'it')).toBe(false); // cohérent : rien à faire
      expect(await m.slots.releaseMismatchedBookings('a@x.tn', 'marketing')).toBe(true);

      const stored = (await m.db.collection('slots').doc(id).get()).data();
      expect(stored?.booked).toBe(false);
      expect(stored).not.toHaveProperty('bookedByEmail');
    });
  });

  describe('assignSlot (changement de créneau par l’admin)', () => {
    it('déplace le candidat : nouveau créneau pris, ancien libéré, dans la même transaction', async () => {
      const oldId = await makeSlot({ time: '09:00' });
      const newId = await makeSlot({ time: '10:00' });
      await m.slots.bookSlot(oldId, 'a@x.tn', 'it');

      const result = await m.slots.assignSlot(newId, 'a@x.tn', 'it');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.previous?.id).toBe(oldId);

      const oldDoc = (await m.db.collection('slots').doc(oldId).get()).data();
      const newDoc = (await m.db.collection('slots').doc(newId).get()).data();
      expect(oldDoc?.booked).toBe(false);
      expect(oldDoc).not.toHaveProperty('bookedByEmail');
      expect(newDoc).toMatchObject({ booked: true, bookedByEmail: 'a@x.tn' });
    });

    it('attribue un créneau à un candidat qui n’en avait pas (previous = null)', async () => {
      const id = await makeSlot();
      const result = await m.slots.assignSlot(id, 'a@x.tn', 'it');
      expect(result.ok && result.previous).toBeNull();
    });

    it('« same-slot », « already-booked », « wrong-department », « not-found »', async () => {
      const id = await makeSlot({ time: '09:00' });
      const other = await makeSlot({ time: '10:00', department: 'marketing' });
      await m.slots.bookSlot(id, 'a@x.tn', 'it');

      expect(await m.slots.assignSlot(id, 'a@x.tn', 'it')).toEqual({ ok: false, reason: 'same-slot' });
      expect(await m.slots.assignSlot(id, 'b@x.tn', 'it')).toEqual({ ok: false, reason: 'already-booked' });
      expect(await m.slots.assignSlot(other, 'b@x.tn', 'it')).toEqual({ ok: false, reason: 'wrong-department' });
      expect(await m.slots.assignSlot('inconnu', 'b@x.tn', 'it')).toEqual({ ok: false, reason: 'not-found' });
    });
  });

  describe('updateSlot', () => {
    it('modifie l’heure et le mode d’un créneau libre', async () => {
      const id = await makeSlot();
      const result = await m.slots.updateSlot(id, { time: '11:00', mode: 'en-ligne' });
      expect(result.ok && result.slot).toMatchObject({ time: '11:00', mode: 'en-ligne' });
    });

    it('« not-found »', async () => {
      expect(await m.slots.updateSlot('inconnu', { time: '11:00' })).toEqual({ ok: false, reason: 'not-found' });
    });

    it('« duplicate » quand la cible existe déjà', async () => {
      const a = await makeSlot({ time: '09:00' });
      await makeSlot({ time: '10:00' });
      expect(await m.slots.updateSlot(a, { time: '10:00' })).toEqual({ ok: false, reason: 'duplicate' });
    });

    it('« department-locked » : on ne change pas le département d’un créneau réservé', async () => {
      const id = await makeSlot();
      await m.slots.bookSlot(id, 'a@x.tn', 'it');
      expect(await m.slots.updateSlot(id, { department: 'marketing' })).toEqual({ ok: false, reason: 'department-locked' });
    });

    it('efface reminderSentAt quand l’horaire d’un créneau réservé change (le rappel repartira)', async () => {
      const id = await makeSlot();
      await m.slots.bookSlot(id, 'a@x.tn', 'it');
      await m.db.collection('slots').doc(id).update({ reminderSentAt: '2026-10-11T08:00:00Z' });

      await m.slots.updateSlot(id, { time: '11:00' });
      const stored = (await m.db.collection('slots').doc(id).get()).data();
      expect(stored).not.toHaveProperty('reminderSentAt');
      expect(stored?.bookedByEmail).toBe('a@x.tn'); // le candidat suit son créneau
    });

    it('conserve reminderSentAt quand seul le mode change', async () => {
      const id = await makeSlot();
      await m.slots.bookSlot(id, 'a@x.tn', 'it');
      await m.db.collection('slots').doc(id).update({ reminderSentAt: '2026-10-11T08:00:00Z' });

      await m.slots.updateSlot(id, { mode: 'en-ligne' });
      expect((await m.db.collection('slots').doc(id).get()).data()?.reminderSentAt).toBe('2026-10-11T08:00:00Z');
    });
  });

  describe('deleteSlot / releaseSlot', () => {
    it('supprime un créneau libre mais refuse un créneau réservé', async () => {
      const free = await makeSlot({ time: '09:00' });
      const booked = await makeSlot({ time: '10:00' });
      await m.slots.bookSlot(booked, 'a@x.tn', 'it');

      expect(await m.slots.deleteSlot(booked)).toEqual({ ok: false, reason: 'booked' });
      expect((await m.slots.deleteSlot(free)).ok).toBe(true);
      expect((await m.db.collection('slots').doc(free).get()).exists).toBe(false);
      expect(await m.slots.deleteSlot('inconnu')).toEqual({ ok: false, reason: 'not-found' });
    });

    it('releaseSlot libère une réservation et renvoie l’e-mail concerné', async () => {
      const id = await makeSlot();
      await m.slots.bookSlot(id, 'a@x.tn', 'it');
      const result = await m.slots.releaseSlot(id);
      expect(result.ok && result.email).toBe('a@x.tn');
      expect(await m.slots.releaseSlot(id)).toEqual({ ok: false, reason: 'not-booked' });
      expect(await m.slots.releaseSlot('inconnu')).toEqual({ ok: false, reason: 'not-found' });
    });
  });

  describe('rappels 24 h (claimDueReminders)', () => {
    // Créneau : lundi 12 octobre 2026 à 09:00 heure de Tunis = 08:00 UTC.
    const START = Date.UTC(2026, 9, 12, 8, 0);
    const at = (msBeforeStart: number) => new Date(START - msBeforeStart);
    const HOUR = 3_600_000;

    async function bookedSlot() {
      const id = await makeSlot({ date: '2026-10-12', time: '09:00' });
      await m.slots.bookSlot(id, 'a@x.tn', 'it');
      return id;
    }

    it('réserve le rappel quand l’entretien a lieu dans moins de 24 h', async () => {
      const id = await bookedSlot();
      const due = await m.slots.claimDueReminders(at(23.5 * HOUR));
      expect(due).toEqual([
        { slotId: id, email: 'a@x.tn', date: '2026-10-12', time: '09:00', department: 'it', mode: 'presentiel' },
      ]);
    });

    it('ne réserve rien à plus de 24 h de l’entretien', async () => {
      await bookedSlot();
      expect(await m.slots.claimDueReminders(at(24.5 * HOUR))).toEqual([]);
    });

    it('ne réserve rien une fois l’entretien commencé', async () => {
      await bookedSlot();
      expect(await m.slots.claimDueReminders(at(-1 * 60_000))).toEqual([]);
    });

    it('ignore les créneaux libres', async () => {
      await makeSlot({ date: '2026-10-12', time: '09:00' });
      expect(await m.slots.claimDueReminders(at(10 * HOUR))).toEqual([]);
    });

    it('n’envoie un rappel qu’UNE seule fois (2e passage = vide)', async () => {
      await bookedSlot();
      expect(await m.slots.claimDueReminders(at(10 * HOUR))).toHaveLength(1);
      expect(await m.slots.claimDueReminders(at(9 * HOUR))).toEqual([]);
    });

    it('CONCURRENCE : deux exécutions simultanées du cron ne dupliquent jamais un rappel', async () => {
      await bookedSlot();
      const [r1, r2] = await Promise.all([m.slots.claimDueReminders(at(10 * HOUR)), m.slots.claimDueReminders(at(10 * HOUR))]);
      expect(r1.length + r2.length).toBe(1);
    });

    it('releaseReminderClaim permet de réessayer après un échec d’envoi', async () => {
      const id = await bookedSlot();
      await m.slots.claimDueReminders(at(10 * HOUR));
      await m.slots.releaseReminderClaim(id);
      expect(await m.slots.claimDueReminders(at(9 * HOUR))).toHaveLength(1);
    });
  });
});
