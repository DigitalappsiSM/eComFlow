/**
 * Tema de la interfaz: intercalado claro/oscuro.
 *
 * - `light` (por defecto) = el diseño actual, sin cambios.
 * - `dark` = superficies de contenido en oscuro (se activa con
 *   `data-theme="dark"` en <html>; ver los overrides en index.css).
 *
 * La elección se recuerda en `localStorage`. La aplicación pre-paint (sin
 * parpadeo) la hace un script inline en index.html; aquí se mantiene la fuente
 * de verdad para el toggle en tiempo de ejecución.
 */

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'ecomflow-theme';

/**
 * Lee el tema efectivo: la elección guardada por el usuario si existe; si no,
 * la preferencia del sistema (`prefers-color-scheme`). `light` si falla el
 * acceso. Debe coincidir con el script pre-paint de index.html.
 */
export function getStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/** Aplica el tema al documento (marca/limpia `data-theme` en <html>). */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'dark') root.setAttribute('data-theme', 'dark');
  else root.removeAttribute('data-theme');
}

/** Aplica y persiste el tema elegido. */
export function setTheme(theme: Theme): void {
  applyTheme(theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Sin persistencia (modo privado / almacenamiento bloqueado): no es crítico.
  }
}
