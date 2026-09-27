import { adminDb } from "@/lib/firebase-admin";

export async function bookSlot(slotId: string, email: string) {
  const slotRef = adminDb.collection("slots").doc(slotId);

  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(slotRef);

    if (!snap.exists) {
      throw new Response(JSON.stringify({ error: "slot-not-found" }), { status: 404 });
    }

    const slot = snap.data()!;
    if (slot.booked) {
      throw new Response(JSON.stringify({ error: "slot-already-booked" }), { status: 409 });
    }

    tx.update(slotRef, {
      booked: true,
      bookedByEmail: email,
      bookedAt: new Date().toISOString(),
    });

    return { slotId, ...slot, booked: true, bookedByEmail: email };
  });
}

export async function getCandidateBooking(email: string) {
  const snap = await adminDb
    .collection("slots")
    .where("bookedByEmail", "==", email)
    .limit(1)
    .get();

  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
}
