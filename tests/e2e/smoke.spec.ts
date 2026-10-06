// Tests système « fumée » : le site est lancé pour de vrai (Next + navigateur)
// et on vérifie les parcours PUBLICS, sans aucune connexion Google.
// Les parcours connectés (candidat / admin) demandent l'émulateur Auth :
// voir tests/README.md, section « Étape suivante ».
import { expect, test } from '@playwright/test';

const SIGN_IN = /se connecter avec google/i;

test.describe('navigation publique', () => {
  test('la page d’accueil présente le portail et mène à la candidature', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/IRIS JOIN/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/rejoignez/i);

    await page.getByRole('link', { name: /déposer ma candidature/i }).first().click();
    await expect(page).toHaveURL(/\/candidature$/);
  });

  test('la page d’accueil annonce les 4 départements', async ({ page }) => {
    await page.goto('/');
    for (const dept of ['IT', 'Marketing', 'Études', 'Dév-Co']) {
      await expect(page.getByRole('heading', { name: dept, exact: true }).first()).toBeVisible();
    }
  });

  test('le lien d’évitement mène au contenu principal', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('a.skip-link')).toHaveAttribute('href', '#main');
    await expect(page.locator('main#main')).toBeAttached();
  });

  test('une URL inconnue affiche la page 404 avec un retour à l’accueil', async ({ page }) => {
    const response = await page.goto('/cette-page-n-existe-pas');
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/404/);
    await expect(page.getByRole('link', { name: /accueil/i }).first()).toBeVisible();
  });

  test('aucun débordement horizontal (responsive)', async ({ page }) => {
    for (const path of ['/', '/candidature', '/entretien', '/resultats']) {
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `débordement horizontal sur ${path}`).toBeLessThanOrEqual(1);
    }
  });
});

test.describe('écrans protégés par la connexion Google', () => {
  test('/candidature : titre du formulaire, connexion demandée, envoi impossible sans connexion', async ({ page }) => {
    await page.goto('/candidature');
    await expect(page.getByRole('heading', { name: /formulaire de candidature/i })).toBeVisible();
    await expect(page.getByRole('button', { name: SIGN_IN }).first()).toBeVisible();
    // Le formulaire est affiché (lecture seule tant que l'e-mail n'est pas vérifié) :
    // on vérifie donc qu'il est impossible d'envoyer, et que l'e-mail n'est pas pré-rempli.
    await expect(page.getByRole('button', { name: /envoyer ma candidature/i })).toBeDisabled();
    await expect(page.getByLabel(/adresse e-mail \(vérifiée\)/i)).toHaveValue('');
  });

  test('/entretien : connexion demandée, aucun créneau visible', async ({ page }) => {
    await page.goto('/entretien');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/entretien/i);
    await expect(page.getByRole('button', { name: SIGN_IN }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /^\d{2}:\d{2}$/ })).toHaveCount(0);
  });

  test('/resultats : connexion demandée, aucun résultat visible', async ({ page }) => {
    await page.goto('/resultats');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/résultat/i);
    await expect(page.getByRole('button', { name: SIGN_IN }).first()).toBeVisible();
    await expect(page.getByText(/félicitations|non accepté|absent à l/i)).toHaveCount(0);
  });

  test('/admin : page non indexée, sans aucune donnée pour un visiteur', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/administration/i);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await expect(page.getByText(/@/)).toHaveCount(0); // aucune adresse e-mail de candidat affichée
  });
});

test.describe('API : rien ne répond à un visiteur anonyme', () => {
  const protectedRoutes: Array<[method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string]> = [
    ['get', '/api/candidature'],
    ['post', '/api/candidature'],
    ['get', '/api/creneaux'],
    ['get', '/api/reservation'],
    ['post', '/api/reservation'],
    ['get', '/api/resultat'],
    ['get', '/api/admin/overview'],
    ['get', '/api/admin/deliberation'],
    ['put', '/api/admin/deliberation'],
    ['post', '/api/admin/deliberation'],
    ['post', '/api/admin/reservations'],
    ['get', '/api/admin/settings'],
    ['put', '/api/admin/settings'],
    ['post', '/api/admin/slots'],
    ['patch', '/api/admin/slots'],
    ['delete', '/api/admin/slots'],
  ];

  for (const [method, path] of protectedRoutes) {
    test(`${method.toUpperCase()} ${path} refuse l’accès`, async ({ request }) => {
      const response = await request[method](path, { data: {} });
      // 401/403 en production ; 500 si Firebase Admin n'est pas configuré (CI) — jamais 200.
      expect(response.status()).toBeGreaterThanOrEqual(400);
      expect(await response.text()).not.toMatch(/candidatures?"?:\s*\[/);
    });
  }
});

test.describe('SEO', () => {
  test('robots.txt interdit /admin et /api/ et publie le sitemap', async ({ request }) => {
    const body = await (await request.get('/robots.txt')).text();
    expect(body).toMatch(/Disallow:\s*\/admin/);
    expect(body).toMatch(/Disallow:\s*\/api\//);
    expect(body).toMatch(/Sitemap:.*\/sitemap\.xml/);
  });

  test('sitemap.xml liste candidature et entretien, jamais admin ni résultats', async ({ request }) => {
    const response = await request.get('/sitemap.xml');
    expect(response.ok()).toBe(true);
    const body = await response.text();
    expect(body).toContain('/candidature');
    expect(body).toContain('/entretien');
    expect(body).not.toContain('/admin');
    expect(body).not.toContain('/resultats');
  });

  test('/resultats n’est pas indexée', async ({ page }) => {
    await page.goto('/resultats');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  });
});