import { getRecruitmentState } from "@/lib/recruitment";

export function assertServiceOpen() {
  const state = getRecruitmentState();
  if (state !== "open") {
    throw new Response(
      JSON.stringify({ error: "recruitment-closed", state }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }
}
