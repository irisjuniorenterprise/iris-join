// Accessibilité automatisée (axe-core). On ne bloque que sur les violations
// « critical » pour éviter le bruit ; passez à ['serious', 'critical'] quand
// le site est propre. Un contrôle automatique ne remplace pas un test manuel
// au clavier et au lecteur d'écran.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Les écrans de connexion utilisent une configuration Firebase factice : le SDK tente
// de joindre *.firebaseapp.com / googleapis.com. Selon le réseau et le DNS de la machine,
// cette tentative échoue vite ou traîne plusieurs dizaines de secondes, et l'écran reste
// sur « Vérification de la connexion… » (donc sans bouton Google). On fait échouer ces
// requêtes immédiatement : le résultat ne dépend plus du réseau.
test.beforeEach(async ({ page }) => {
  await page.route(/^https?:\/\/[^/]*(firebaseapp\.com|googleapis\.com|google\.com|gstatic\.com)/i, (route) =>
    route.abort(),
  );
});

for (const path of ['/', '/candidature', '/entretien', '/resultats']) {
  test(`aucune violation critique d’accessibilité sur ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const critical = violations.filter((v) => v.impact === 'critical');
    expect(critical, critical.map((v) => `${v.id}: ${v.help}`).join('\n')).toEqual([]);
  });
}

test('le parcours de connexion est atteignable au clavier', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/candidature');
  const signIn = page.getByRole('button', { name: /se connecter avec google/i }).first();
  // On attend d'abord la fin de l'écran de chargement, avec un message d'échec explicite.
  await expect(signIn).toBeVisible({ timeout: 25_000 });
  await signIn.focus();
  await expect(signIn).toBeFocused();
});