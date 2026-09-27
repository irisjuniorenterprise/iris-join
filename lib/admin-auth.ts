import { NextRequest } from "next/server";
import { verifyIdToken } from "@/lib/firebase-admin";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim());

export async function requireAdmin(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const idToken = authHeader?.replace("Bearer ", "");
  if (!idToken) throw new Response("Non authentifie", { status: 401 });

  const decoded = await verifyIdToken(idToken);
  if (!ADMIN_EMAILS.includes(decoded.email!)) {
    throw new Response("Acces refuse", { status: 403 });
  }
  return decoded;
}
