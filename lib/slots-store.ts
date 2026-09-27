import { adminDb } from "@/lib/firebase-admin";

const COLLECTION = "slots";

const DEMO_SLOTS = [
  { date: "2026-10-12", time: "09:00" },
  { date: "2026-10-12", time: "10:00" },
  { date: "2026-10-12", time: "11:00" },
  { date: "2026-10-13", time: "14:00" },
  { date: "2026-10-13", time: "15:00" },
  { date: "2026-10-14", time: "09:00" },
];

export async function ensureSlotsSeeded() {
  const snap = await adminDb.collection(COLLECTION).limit(1).get();
  if (!snap.empty) return;

  const batch = adminDb.batch();
  DEMO_SLOTS.forEach((slot) => {
    const ref = adminDb.collection(COLLECTION).doc();
    batch.set(ref, { ...slot, booked: false, bookedByEmail: null });
  });
  await batch.commit();
}

export async function listAvailableSlots() {
  await ensureSlotsSeeded();
  const snap = await adminDb.collection(COLLECTION).orderBy("date").orderBy("time").get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}