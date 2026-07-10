import { test, expect } from '@playwright/test';

/**
 * Flujo crítico: un usuario sin sesión NO entra al dashboard y es enviado a
 * la pantalla de inicio de sesión (§59). Requiere `npm run dev` (lo levanta
 * Playwright automáticamente).
 */
test('usuario sin sesión es redirigido a /login', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'eComFlow Next' })).toBeVisible();
  await expect(page.getByLabel('Correo electrónico')).toBeVisible();
});
