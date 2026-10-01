import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PORT ?? 3000);
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
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
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: process.env.CI ? 'npm run build && npm run start' : 'npm run dev',
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 240_000,
        env: {
          // Valeurs factices : suffisent pour afficher les écrans de connexion (aucun appel réseau
          // tant que personne ne se connecte). Firebase Admin reste volontairement NON configuré.
          NEXT_PUBLIC_FIREBASE_API_KEY: 'fake-api-key',
          NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'demo-iris-join.firebaseapp.com',
          NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'demo-iris-join',
          NEXT_PUBLIC_FIREBASE_APP_ID: '1:000000000000:web:0000000000000000',
          NEXT_PUBLIC_SITE_URL: BASE_URL,
          ADMIN_EMAILS: 'admin@example.com',
          PORT: String(PORT),
        },
      },
});
