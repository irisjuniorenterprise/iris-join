import { defineConfig, devices } from '@playwright/test';

// Port dédié aux tests : 3000 est très souvent déjà occupé (json-server, un autre
// projet Next…), et Playwright testerait alors le mauvais site sans le dire.
const PORT = Number(process.env.PORT ?? 3100);
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

// Réutiliser un serveur déjà lancé reste possible, mais seulement sur demande
// explicite (PW_REUSE_SERVER=1). Par défaut, si le port est pris, Playwright
// s'arrête avec un message clair au lieu de tester un autre programme.
const REUSE_SERVER = process.env.PW_REUSE_SERVER === '1';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  // Vérifie, avant tout test, que le site joint est bien IRIS JOIN.
  globalSetup: './tests/e2e/global-setup.ts',
  use: {
    baseURL: BASE_URL,
    locale: 'fr-FR',
    timezoneId: 'Africa/Tunis',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
  ],
  // Démarre le site automatiquement, sauf si PLAYWRIGHT_BASE_URL pointe vers un site déjà en ligne.
  // Par défaut : build de production (comme en ligne, sans compilation à la volée qui fait
  // dépasser les délais au premier accès). PW_DEV=1 : serveur de développement, plus rapide à lancer.
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: process.env.PW_DEV === '1' ? 'npm run dev' : 'npm run build && npm run start',
        url: BASE_URL,
        reuseExistingServer: REUSE_SERVER,
        timeout: 300_000,
        env: {
          // Valeurs factices : suffisent pour afficher les écrans de connexion (aucun appel réseau
          // tant que personne ne se connecte).
          NEXT_PUBLIC_FIREBASE_API_KEY: 'fake-api-key',
          NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'demo-iris-join.firebaseapp.com',
          NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'demo-iris-join',
          NEXT_PUBLIC_FIREBASE_APP_ID: '1:000000000000:web:0000000000000000',
          NEXT_PUBLIC_SITE_URL: BASE_URL,
          ADMIN_EMAILS: 'admin@example.com',
          PORT: String(PORT),

          // ISOLATION DE LA VRAIE BASE : Next charge aussi .env.local (build ET start).
          // Si ce fichier contient les clés Firebase Admin, les tests liraient la vraie
          // base Firestore, donc la vraie fenêtre de candidature (fermée / pas encore
          // ouverte) : /candidature afficherait alors « Période terminée » à la place du
          // bouton « Se connecter avec Google ». Une variable définie ici, même vide,
          // n'est jamais écrasée par .env.local : Firebase Admin reste NON configuré
          // (fenêtres sans limite = ouvert) et les tests ne touchent jamais aux vraies données.
          FIREBASE_PROJECT_ID: '',
          FIREBASE_CLIENT_EMAIL: '',
          FIREBASE_PRIVATE_KEY: '',
          // Aucun e-mail réel ne doit partir pendant les tests.
          SMTP_HOST: '',
          SMTP_USER: '',
          SMTP_PASS: '',
          RH_NOTIFICATION_EMAIL: '',
        },
      },
});