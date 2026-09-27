import { adminDb } from "@/lib/firebase-admin";

const DOC_PATH = "settings/global";

interface AppSettings {
  recruitmentOpen: boolean;
  message?: string;
}

const DEFAULT_SETTINGS: AppSettings = { recruitmentOpen: true };

export async function getSettings(): Promise<AppSettings> {
  const snap = await adminDb.doc(DOC_PATH).get();
  return snap.exists ? { ...DEFAULT_SETTINGS, ...snap.data() } : DEFAULT_SETTINGS;
}

export async function updateSettings(partial: Partial<AppSettings>) {
  await adminDb.doc(DOC_PATH).set(partial, { merge: true });
  return getSettings();
}