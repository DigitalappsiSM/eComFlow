/** Tipos y utilidades de filtros (separado del componente para fast-refresh). */

export interface FilterField {
  key: string;
  label: string;
  /** Opciones disponibles (valores presentes en los datos). */
  options: string[];
}

export type FilterValues = Record<string, string>;

/** Valores distintos no vacíos, ordenados alfabéticamente, para poblar un filtro. */
export function distinctOptions<T>(
  items: readonly T[],
  pick: (t: T) => string | null | undefined,
): string[] {
  const set = new Set<string>();
  for (const it of items) {
    const v = (pick(it) ?? '').trim();
    if (v !== '') set.add(v);
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'es'));
}

/**
 * Opciones distintas ordenadas por una clave asociada (p. ej. fecha de inicio
 * en ISO), para períodos cronológicos (semana/catorcena).
 */
export function sortedOptions<T>(
  items: readonly T[],
  pickLabel: (t: T) => string | null | undefined,
  pickSortKey: (t: T) => string | null | undefined,
): string[] {
  const map = new Map<string, string>();
  for (const it of items) {
    const label = (pickLabel(it) ?? '').trim();
    if (label === '') continue;
    if (!map.has(label)) map.set(label, (pickSortKey(it) ?? '').trim());
  }
  return [...map.entries()]
    .sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0], 'es'))
    .map((e) => e[0]);
}
