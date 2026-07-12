/** Tipos y utilidades de filtros (separado del componente para fast-refresh). */

export interface FilterField {
  key: string;
  label: string;
  /** Opciones disponibles (valores presentes en los datos). */
  options: string[];
}

export type FilterValues = Record<string, string>;

/** Valores distintos no vacíos, ordenados, para poblar un filtro. */
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
