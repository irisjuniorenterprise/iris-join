// Garde-fou exécuté une fois avant les tests E2E : s'assure que l'adresse testée
// est bien le site IRIS JOIN. Sans lui, si un autre programme occupe le port
// (json-server, un autre projet…), les tests échouent avec des erreurs
// trompeuses (« JSON Server » comme titre, robots.txt introuvable…) — et certains
// tests passent même à tort (un 404 étranger ressemble à un refus d'accès).
import type { FullConfig } from '@playwright/test';

export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use.baseURL;
  if (!baseURL) return;

  let html: string;
  try {
    html = await (await fetch(baseURL, { redirect: 'follow' })).text();
  } catch (err) {
    throw new Error(`[e2e] Impossible de joindre ${baseURL} : ${String(err)}`);
  }

  if (!/<title>[^<]*IRIS JOIN/i.test(html)) {
    const title = /<title>([^<]*)<\/title>/i.exec(html)?.[1] ?? '(aucun titre)';
    throw new Error(
      `[e2e] ${baseURL} ne répond pas avec IRIS JOIN (titre reçu : « ${title} »). ` +
        'Un autre programme occupe sans doute ce port : arrêtez-le, ou changez de port ' +
        '(variable PORT, ex. PORT=3200).',
    );
  }
}
