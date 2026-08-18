import { useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { getStoredTheme, setTheme, type Theme } from '@/lib/theme';

/**
 * Botón sol/luna para intercalar claro/oscuro. Vive en el header (shell oscuro
 * en ambos temas), por eso usa colores claros sobre vidrio.
 */
export function ThemeToggle() {
  const [theme, setThemeState] = useState<Theme>(() => getStoredTheme());
  const isDark = theme === 'dark';

  function toggle() {
    const next: Theme = isDark ? 'light' : 'dark';
    setTheme(next);
    setThemeState(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="focus-ring rounded-lg p-2 text-slate-300 hover:bg-white/10"
      aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      title={isDark ? 'Modo claro' : 'Modo oscuro'}
    >
      {isDark ? (
        <Sun className="h-5 w-5" aria-hidden="true" />
      ) : (
        <Moon className="h-5 w-5" aria-hidden="true" />
      )}
    </button>
  );
}
