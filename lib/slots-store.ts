// lib/slots-store.ts
//
// Créneaux d'entretien persistés dans Firestore (collection "slots").
// Utilisé uniquement côté serveur (routes API), via Firebase Admin.
//
// Modèle : un document = un créneau (date + heure + département).
// Les créneaux de départements différents sont PARALLÈLES : à 09:00 le
// même jour, il existe un document par département. Un candidat ne
// consulte et ne réserve que les créneaux de SON département (celui
// choisi dans son formulaire de candidature). L'administration, elle,
// voit et gère tous les créneaux (voir la section "Administration").

import { FieldValue, type DocumentData, type DocumentReference } from 'firebase-admin/firestore';
import { getAdminDb } from './firebase-admin';
import {
  DEFAULT_INTERVIEW_MODE,
  DEPARTMENT_KEYS,
  REMINDER_LEAD_HOURS,
  departmentStoredValues,
  getSlotStartMs,
  normalizeDepartment,
  normalizeInterviewMode,
  type DepartmentKey,
  type InterviewMode,
} from './interview';

export type Slot = {
  id: string;
  date: string; // "2026-10-12"
  time: string; // "09:30"
  department: DepartmentKey;
  /** Présentiel ou en ligne — choisi par l'admin pour chaque créneau. */
  mode: InterviewMode;
  booked: boolean;
};

/** Créneau tel que vu par l'administration (avec l'e-mail du candidat). */
export type AdminSlot = Slot & { bookedByEmail?: string };

const COLLECTION = 'slots';

// Document témoin : évite de recréer la grille à chaque requête (et de
// ressusciter des créneaux que les RH auraient supprimés à la main).
// Pour forcer une nouvelle génération : supprimer meta/slots-grid.
const META_COLLECTION = 'meta';
const META_DOC = 'slots-grid';
const GRID_VERSION = 2;

/** Jours et heures de la campagne — à ajuster avant le premier déploiement. */
const SLOT_DAYS = ['2026-10-12', '2026-10-13', '2026-10-14'];
const SLOT_HOURS = ['09:00', '09:30', '10:30', '11:00', '14:00', '14:30', '15:30', '16:00'];

let gridChecked = false;

function slotDocId(date: string, time: string, department: DepartmentKey): string {
  return `${date}_${time.replace(':', '')}_${department}`;
}

function toSlot(id: string, data: DocumentData): Slot | null {
  const department = normalizeDepartment(data.department);
  if (!department || typeof data.date !== 'string' || typeof data.time !== 'string') return null;
  return {
    id,
    date: data.date,
    time: data.time,
    department,
    mode: normalizeInterviewMode(data.mode),
    booked: Boolean(data.booked),
  };
}

function toAdminSlot(id: string, data: DocumentData): AdminSlot | null {
  const slot = toSlot(id, data);
  if (!slot) return null;
  const email = typeof data.bookedByEmail === 'string' && data.bookedByEmail ? data.bookedByEmail : undefined;
  return email ? { ...slot, bookedByEmail: email } : slot;
}

function sortSlots(a: Slot, b: Slot): number {
  if (a.date !== b.date) return a.date.localeCompare(b.date);
  return a.time.localeCompare(b.time);
}

async function createIfMissing(ref: DocumentReference, data: DocumentData): Promise<void> {
  try {
    await ref.create(data);
  } catch (err) {
    // 6 = ALREADY_EXISTS : un autre appel concurrent l'a déjà créé, sans risque.
    if ((err as { code?: number }).code !== 6) throw err;
  }
}

/**
 * Garantit que la grille parallèle existe : un créneau par (jour, heure,
 * département). Additif et idempotent — ne supprime ni ne modifie jamais
 * un créneau existant (réservé ou non) ; il complète seulement ceux qui
 * manquent (ex. l'ancienne grille n'avait qu'un département par heure et
 * aucun créneau "Dev co").
 */
async function ensureSlotGrid(): Promise<void> {
  if (gridChecked) return;

  const db = getAdminDb();
  if (!db) throw new Error('firestore-not-configured');

  const metaRef = db.collection(META_COLLECTION).doc(META_DOC);
  const meta = await metaRef.get();
  if (meta.exists && Number(meta.data()?.version) >= GRID_VERSION) {
    gridChecked = true;
    return;
  }

  const snapshot = await db.collection(COLLECTION).get();
  const existing = new Set<string>();
  for (const doc of snapshot.docs) {
    const slot = toSlot(doc.id, doc.data());
    if (slot) existing.add(slotDocId(slot.date, slot.time, slot.department));
  }

  const writes: Promise<void>[] = [];
  for (const date of SLOT_DAYS) {
    for (const time of SLOT_HOURS) {
      for (const department of DEPARTMENT_KEYS) {
        const id = slotDocId(date, time, department);
        if (existing.has(id)) continue;
        writes.push(
          createIfMissing(db.collection(COLLECTION).doc(id), {
            date,
            time,
            department,
            mode: DEFAULT_INTERVIEW_MODE,
            booked: false,
          }),
        );
      }
    }
  }
  await Promise.all(writes);

  await metaRef.set({ version: GRID_VERSION, updatedAt: new Date().toISOString() });
  gridChecked = true;
}

/**
 * Créneaux d'UN département, triés par date puis heure. Requête sur un
 * seul champ : aucun index composite à créer dans la console Firestore.
 */
export async function getSlotsForDepartment(department: DepartmentKey): Promise<Slot[]> {
  const db = getAdminDb();
  if (!db) throw new Error('firestore-not-configured');

  await ensureSlotGrid();

  const snapshot = await db
    .collection(COLLECTION)
    .where('department', 'in', departmentStoredValues(department))
    .get();

  return snapshot.docs
    .map((doc) => toSlot(doc.id, doc.data()))
    .filter((slot): slot is Slot => slot !== null)
    .sort(sortSlots);
}

/* ------------------------------------------------------------------ */
/* Candidat                                                             */
/* ------------------------------------------------------------------ */

export type CandidateLookup =
  | { status: 'no-candidature' }
  | { status: 'invalid-department' }
  | { status: 'ok'; department: DepartmentKey };

/**
 * Département choisi par l'e-mail dans son formulaire de candidature
 * (collection "candidatures"). C'est la seule source de vérité pour
 * savoir quels créneaux un candidat a le droit de voir et de réserver.
 */
export async function getCandidateDepartment(email: string): Promise<CandidateLookup> {
  const db = getAdminDb();
  if (!db) throw new Error('firestore-not-configured');

  const snapshot = await db.collection('candidatures').where('email', '==', email).limit(1).get();
  if (snapshot.empty) return { status: 'no-candidature' };

  const department = normalizeDepartment(snapshot.docs[0].data().departement);
  if (!department) return { status: 'invalid-department' };

  return { status: 'ok', department };
}

/** Nom complet du candidat associé à cet e-mail (ou null si aucune candidature). */
export async function getCandidatureNameByEmail(email: string): Promise<string | null> {
  const db = getAdminDb();
  if (!db) throw new Error('firestore-not-configured');

  const snapshot = await db.collection('candidatures').where('email', '==', email).limit(1).get();
  if (snapshot.empty) return null;

  const nomPrenom = snapshot.docs[0].data().nomPrenom;
  return typeof nomPrenom === 'string' && nomPrenom.trim() ? nomPrenom.trim() : null;
}

/** Réservation existante de l'e-mail (ou null). */
export async function getBookingForEmail(email: string): Promise<Slot | null> {
  const db = getAdminDb();
  if (!db) throw new Error('firestore-not-configured');

  const snapshot = await db.collection(COLLECTION).where('bookedByEmail', '==', email).limit(1).get();
  if (snapshot.empty) return null;

  return toSlot(snapshot.docs[0].id, snapshot.docs[0].data());
}

/**
 * Libère les réservations de l'e-mail qui ne correspondent plus au
 * département de sa candidature (cas : le candidat renvoie son formulaire
 * en changeant de département). Renvoie true si un créneau a été libéré.
 */
export async function releaseMismatchedBookings(
  email: string,
  department: DepartmentKey,
): Promise<boolean> {
  const db = getAdminDb();
  if (!db) throw new Error('firestore-not-configured');

  const snapshot = await db.collection(COLLECTION).where('bookedByEmail', '==', email).get();
  const batch = db.batch();
  let released = false;

  for (const doc of snapshot.docs) {
    if (normalizeDepartment(doc.data().department) === department) continue;
    batch.update(doc.ref, {
      booked: false,
      bookedByEmail: FieldValue.delete(),
      reminderSentAt: FieldValue.delete(),
    });
    released = true;
  }

  if (released) await batch.commit();
  return released;
}

/**
 * Réserve un créneau de façon atomique (transaction Firestore) : évite
 * qu'une course entre deux candidats réserve deux fois le même créneau.
 * Empêche aussi un même email de réserver plusieurs créneaux, et de
 * réserver un créneau d'un autre département que le sien.
 */
export async function bookSlot(
  slotId: string,
  email: string,
  department: DepartmentKey,
): Promise<
  | { ok: true; slot: Slot }
  | { ok: false; reason: 'already-booked' | 'not-found' | 'duplicate-email' | 'wrong-department' }
> {
  const db = getAdminDb();
  if (!db) throw new Error('firestore-not-configured');

  const ref = db.collection(COLLECTION).doc(slotId);

  return db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists) return { ok: false, reason: 'not-found' as const };

    const slot = toSlot(doc.id, doc.data() as DocumentData);
    if (!slot) return { ok: false, reason: 'not-found' as const };

    if (slot.department !== department) return { ok: false, reason: 'wrong-department' as const };
    if (slot.booked) return { ok: false, reason: 'already-booked' as const };

    // Un candidat ne doit avoir qu'un seul entretien réservé à la fois.
    const existing = await tx.get(
      db.collection(COLLECTION).where('bookedByEmail', '==', email).limit(1),
    );
    if (!existing.empty) return { ok: false, reason: 'duplicate-email' as const };

    tx.update(ref, { booked: true, bookedByEmail: email, reminderSentAt: FieldValue.delete() });
    return { ok: true, slot: { ...slot, booked: true } };
  });
}

/* ================================================================== */
/* Administration                                                       */
/* ================================================================== */

/** Tous les créneaux (tous départements), avec l'e-mail des réservations. */
export async function listAllSlots(): Promise<AdminSlot[]> {
  const db = getAdminDb();
  if (!db) throw new Error('firestore-not-configured');

  await ensureSlotGrid();

  const snapshot = await db.collection(COLLECTION).get();
  return snapshot.docs
    .map((doc) => toAdminSlot(doc.id, doc.data()))
    .filter((slot): slot is AdminSlot => slot !== null)
    .sort((a, b) => sortSlots(a, b) || a.department.localeCompare(b.department));
}

export type NewSlot = {
  date: string;
  time: string;
  department: DepartmentKey;
  mode?: InterviewMode;
};

/**
 * Crée des créneaux. Les combinaisons (date, heure, département) qui
 * existent déjà sont ignorées — jamais de doublon.
 */
export async function createSlots(items: NewSlot[]): Promise<{ created: number; skipped: number }> {
  const db = getAdminDb();
  if (!db) throw new Error('firestore-not-configured');

  const snapshot = await db.collection(COLLECTION).get();
  const existing = new Set<string>();
  for (const doc of snapshot.docs) {
    const slot = toSlot(doc.id, doc.data());
    if (slot) existing.add(slotDocId(slot.date, slot.time, slot.department));
  }

  let created = 0;
  let skipped = 0;
  const writes: Promise<void>[] = [];

  for (const item of items) {
    const key = slotDocId(item.date, item.time, item.department);
    if (existing.has(key)) {
      skipped += 1;
      continue;
    }
    existing.add(key);
    created += 1;

    const data = {
      date: item.date,
      time: item.time,
      department: item.department,
      mode: item.mode ?? DEFAULT_INTERVIEW_MODE,
      booked: false,
    };
    writes.push(
      (async () => {
        try {
          await db.collection(COLLECTION).doc(key).create(data);
        } catch (err) {
          // L'ID déterministe est pris par un créneau modifié depuis (même ID,
          // autres date/heure) : on crée alors avec un ID automatique.
          if ((err as { code?: number }).code !== 6) throw err;
          await db.collection(COLLECTION).add(data);
        }
      })(),
    );
  }

  await Promise.all(writes);
  return { created, skipped };
}

export type SlotPatch = {
  date?: string;
  time?: string;
  department?: DepartmentKey;
  mode?: InterviewMode;
};

/**
 * Modifie la date, l'heure, le département ou le mode d'un créneau. Un
 * créneau réservé peut être déplacé dans le temps (le candidat le suit),
 * mais pas changé de département (il ne correspondrait plus à sa
 * candidature). Si la date ou l'heure d'un créneau réservé change, le
 * rappel « 24 h avant » sera renvoyé pour le nouvel horaire.
 */
export async function updateSlot(
  id: string,
  patch: SlotPatch,
): Promise<
  | { ok: true; slot: AdminSlot; previous: AdminSlot }
  | { ok: false; reason: 'not-found' | 'duplicate' | 'department-locked' }
> {
  const db = getAdminDb();
  if (!db) throw new Error('firestore-not-configured');

  const ref = db.collection(COLLECTION).doc(id);

  return db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    const previous = doc.exists ? toAdminSlot(doc.id, doc.data() as DocumentData) : null;
    if (!previous) return { ok: false, reason: 'not-found' as const };

    const next = {
      date: patch.date ?? previous.date,
      time: patch.time ?? previous.time,
      department: patch.department ?? previous.department,
      mode: patch.mode ?? previous.mode,
    };

    if (previous.booked && next.department !== previous.department) {
      return { ok: false, reason: 'department-locked' as const };
    }

    const scheduleChanged =
      next.date !== previous.date ||
      next.time !== previous.time ||
      next.department !== previous.department;
    const unchanged = !scheduleChanged && next.mode === previous.mode;

    if (!unchanged) {
      if (scheduleChanged) {
        const sameDay = await tx.get(db.collection(COLLECTION).where('date', '==', next.date));
        const clash = sameDay.docs.some((d) => {
          if (d.id === id) return false;
          const other = toSlot(d.id, d.data());
          return !!other && other.time === next.time && other.department === next.department;
        });
        if (clash) return { ok: false, reason: 'duplicate' as const };
      }

      const timeChanged = next.date !== previous.date || next.time !== previous.time;
      tx.update(ref, {
        ...next,
        // Nouvel horaire d'un créneau réservé : le rappel repart pour ce nouvel horaire.
        ...(previous.booked && timeChanged ? { reminderSentAt: FieldValue.delete() } : {}),
      });
    }

    return { ok: true, slot: { ...previous, ...next }, previous };
  });
}

/** Supprime un créneau LIBRE (un créneau réservé doit d'abord être libéré). */
export async function deleteSlot(
  id: string,
): Promise<{ ok: true; slot: AdminSlot } | { ok: false; reason: 'not-found' | 'booked' }> {
  const db = getAdminDb();
  if (!db) throw new Error('firestore-not-configured');

  const ref = db.collection(COLLECTION).doc(id);

  return db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    const slot = doc.exists ? toAdminSlot(doc.id, doc.data() as DocumentData) : null;
    if (!slot) return { ok: false, reason: 'not-found' as const };
    if (slot.booked) return { ok: false, reason: 'booked' as const };

    tx.delete(ref);
    return { ok: true, slot };
  });
}

/**
 * Attribue un créneau LIBRE à un candidat, en libérant son éventuel
 * créneau actuel dans la même transaction (changement de créneau demandé
 * par e-mail). Le créneau doit appartenir au département du candidat.
 */
export async function assignSlot(
  slotId: string,
  email: string,
  department: DepartmentKey,
): Promise<
  | { ok: true; slot: AdminSlot; previous: AdminSlot | null }
  | { ok: false; reason: 'not-found' | 'wrong-department' | 'already-booked' | 'same-slot' }
> {
  const db = getAdminDb();
  if (!db) throw new Error('firestore-not-configured');

  const ref = db.collection(COLLECTION).doc(slotId);

  return db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    const target = doc.exists ? toAdminSlot(doc.id, doc.data() as DocumentData) : null;
    if (!target) return { ok: false, reason: 'not-found' as const };

    if (target.department !== department) return { ok: false, reason: 'wrong-department' as const };

    if (target.booked) {
      return target.bookedByEmail === email
        ? { ok: false, reason: 'same-slot' as const }
        : { ok: false, reason: 'already-booked' as const };
    }

    const current = await tx.get(db.collection(COLLECTION).where('bookedByEmail', '==', email));
    const previousDocs = current.docs.filter((d) => d.id !== slotId);
    const previous = previousDocs.length
      ? toAdminSlot(previousDocs[0].id, previousDocs[0].data())
      : null;

    tx.update(ref, { booked: true, bookedByEmail: email, reminderSentAt: FieldValue.delete() });
    for (const prev of previousDocs) {
      tx.update(prev.ref, {
        booked: false,
        bookedByEmail: FieldValue.delete(),
        reminderSentAt: FieldValue.delete(),
      });
    }

    return { ok: true, slot: { ...target, booked: true, bookedByEmail: email }, previous };
  });
}

/** Libère un créneau réservé (annulation de l'entretien). */
export async function releaseSlot(
  slotId: string,
): Promise<
  | { ok: true; slot: AdminSlot; email: string }
  | { ok: false; reason: 'not-found' | 'not-booked' }
> {
  const db = getAdminDb();
  if (!db) throw new Error('firestore-not-configured');

  const ref = db.collection(COLLECTION).doc(slotId);

  return db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    const slot = doc.exists ? toAdminSlot(doc.id, doc.data() as DocumentData) : null;
    if (!slot) return { ok: false, reason: 'not-found' as const };
    if (!slot.booked || !slot.bookedByEmail) return { ok: false, reason: 'not-booked' as const };

    const email = slot.bookedByEmail;
    tx.update(ref, {
      booked: false,
      bookedByEmail: FieldValue.delete(),
      reminderSentAt: FieldValue.delete(),
    });
    return { ok: true, slot: { ...slot, booked: false, bookedByEmail: undefined }, email };
  });
}

/* ================================================================== */
/* Rappels (24 h avant l'entretien)                                     */
/* ================================================================== */

export type DueReminder = {
  slotId: string;
  email: string;
  date: string;
  time: string;
  department: DepartmentKey;
  mode: InterviewMode;
};

/**
 * Réserve (« claim ») les rappels à envoyer maintenant : créneaux réservés
 * dont l'entretien commence dans moins de 24 h (et pas encore commencé) et
 * dont le rappel n'a pas déjà été envoyé. Chaque créneau est marqué
 * `reminderSentAt` dans une transaction AVANT l'envoi : deux exécutions
 * simultanées du cron ne peuvent donc jamais envoyer deux fois le même
 * rappel. Si l'envoi échoue, appeler releaseReminderClaim() pour réessayer
 * à la prochaine exécution.
 */
export async function claimDueReminders(now: Date = new Date()): Promise<DueReminder[]> {
  const db = getAdminDb();
  if (!db) throw new Error('firestore-not-configured');

  const nowMs = now.getTime();
  const limitMs = nowMs + REMINDER_LEAD_HOURS * 60 * 60 * 1000;

  // Un seul champ filtré : aucun index composite nécessaire.
  const snapshot = await db.collection(COLLECTION).where('booked', '==', true).get();

  const candidates = snapshot.docs.filter((doc) => {
    const data = doc.data();
    if (data.reminderSentAt) return false;
    if (typeof data.bookedByEmail !== 'string' || !data.bookedByEmail) return false;
    const slot = toSlot(doc.id, data);
    if (!slot) return false;
    const startMs = getSlotStartMs(slot.date, slot.time);
    return Number.isFinite(startMs) && startMs > nowMs && startMs <= limitMs;
  });

  const claimed: DueReminder[] = [];

  for (const candidate of candidates) {
    const result = await db.runTransaction(async (tx): Promise<DueReminder | null> => {
      const doc = await tx.get(candidate.ref);
      const data = doc.data();
      if (!doc.exists || !data) return null;

      const slot = toSlot(doc.id, data);
      const email = typeof data.bookedByEmail === 'string' ? data.bookedByEmail : '';
      if (!slot || !slot.booked || !email || data.reminderSentAt) return null;

      const startMs = getSlotStartMs(slot.date, slot.time);
      if (!Number.isFinite(startMs) || startMs <= nowMs || startMs > limitMs) return null;

      tx.update(candidate.ref, { reminderSentAt: new Date().toISOString() });
      return {
        slotId: doc.id,
        email,
        date: slot.date,
        time: slot.time,
        department: slot.department,
        mode: slot.mode,
      };
    });
    if (result) claimed.push(result);
  }

  return claimed;
}

/** Annule la réservation d'un rappel dont l'envoi a échoué (nouvelle tentative au prochain passage). */
export async function releaseReminderClaim(slotId: string): Promise<void> {
  const db = getAdminDb();
  if (!db) throw new Error('firestore-not-configured');
  await db.collection(COLLECTION).doc(slotId).update({ reminderSentAt: FieldValue.delete() });
}
