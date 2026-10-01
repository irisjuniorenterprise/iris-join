// Accessibilité automatisée (axe-core). On ne bloque que sur les violations
// « critical » pour éviter le bruit ; passez à ['serious', 'critical'] quand
// le site est propre. Un contrôle automatique ne remplace pas un test manuel
// au clavier et au lecteur d'écran.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

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
  await page.goto('/candidature');
  const signIn = page.getByRole('button', { name: /se connecter avec google/i }).first();
  await signIn.focus();
  await expect(signIn).toBeFocused();
});
