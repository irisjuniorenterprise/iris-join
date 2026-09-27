// lib/admin-auth.ts
//
// Contrôle d'accès de l'espace administration — SERVEUR uniquement.
// La liste des administrateurs vient de la variable d'environnement
// ADMIN_EMAILS (adresses séparées par des virgules). Le token Firebase est
// vérifié côté serveur à chaque requête : masquer le lien /admin ou
// contrôler l'accès dans l'interface ne suffit jamais à protéger les données.

import { NextResponse } from 'next/server';
import { getAdminAuth } from './firebase-admin';

export type AdminCheck =
  | { ok: true; email: string }
  | { ok: false; status: 401 | 403 | 500; message: string };

function getAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export async function requireAdmin(request: Request): Promise<AdminCheck> {
  const allowList = getAdminEmails();
  if (allowList.length === 0) {
    return {
      ok: false,
      status: 500,
      message: 'Aucun administrateur configuré (variable ADMIN_EMAILS manquante).',
    };
  }

  const auth = getAdminAuth();
  if (!auth) {
    return { ok: false, status: 500, message: 'Serveur mal configuré (Firebase Admin manquant).' };
  }

  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return { ok: false, status: 401, message: 'Connexion requise.' };
  }

  try {
    const decoded = await auth.verifyIdToken(token);
    const email = decoded.email?.toLowerCase();
    if (!email || !decoded.email_verified) {
      return { ok: false, status: 403, message: "Adresse e-mail non vérifiée." };
    }
    if (!allowList.includes(email)) {
      return {
        ok: false,
        status: 403,
        message: `Le compte ${decoded.email} n'est pas autorisé à accéder à l'administration.`,
      };
    }
    return { ok: true, email: decoded.email as string };
  } catch {
    return { ok: false, status: 401, message: 'Session invalide ou expirée. Reconnectez-vous.' };
  }
}

export function denyResponse(check: Extract<AdminCheck, { ok: false }>) {
  return NextResponse.json(
    { ok: false, message: check.message },
    { status: check.status, headers: { 'Cache-Control': 'no-store' } },
  );
}
