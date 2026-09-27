import { z } from "zod";
import { adminDb } from "@/lib/firebase-admin";

export const candidatureSchema = z.object({
  prenom: z.string().min(2),
  nom: z.string().min(2),
  telephone: z.string().min(8),
  departement: z.enum(["conseil", "marketing", "dev", "rh", "finance"]),
  motivation: z.string().min(50).max(2000),
  cvUrl: z.string().url().optional(),
});

export type CandidatureInput = z.infer<typeof candidatureSchema>;

const COLLECTION = "candidatures";

export async function upsertCandidature(email: string, data: CandidatureInput) {
  const ref = adminDb.collection(COLLECTION).doc(email);
  const existing = await ref.get();
  const now = new Date().toISOString();

  await ref.set(
    {
      ...data,
      email,
      updatedAt: now,
      createdAt: existing.exists ? existing.data()?.createdAt : now,
    },
    { merge: true }
  );

  return { isNew: !existing.exists };
}

export async function getCandidatureByEmail(email: string) {
  const snap = await adminDb.collection(COLLECTION).doc(email).get();
  return snap.exists ? snap.data() : null;
}