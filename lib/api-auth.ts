import { NextRequest } from "next/server";
import { verifyIdToken } from "@/lib/firebase-admin";

export async function requireAuth(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const idToken = authHeader?.replace("Bearer ", "");

  if (!idToken) {
    throw new Response("Non authentifie", { status: 401 });
  }

  try {
    return await verifyIdToken(idToken);
  } catch {
    throw new Response("Token invalide", { status: 401 });
  }
}
