/**
 * Resolución de artículo → placement_id (§14, §20 paso 2).
 *
 * Coincidencia EXACTA contra el nombre autorizado o un alias configurado, tras
 * normalización técnica. Sin fuzzy matching, sin corrección de nombres.
 */

import { normalizeKey } from './normalization';

export interface PlacementCatalogItem {
  placement_id: string;
  nombre: string;
  aliases?: string[];
  active: boolean;
}

export interface PlacementIndex {
  /** Devuelve el placement_id o null si no hay coincidencia exacta. */
  resolve(articulo: string): string | null;
}

export function buildPlacementIndex(items: readonly PlacementCatalogItem[]): PlacementIndex {
  const byNormalized = new Map<string, string>();

  for (const item of items) {
    if (!item.active) continue;
    const names = [item.nombre, ...(item.aliases ?? [])];
    for (const name of names) {
      const key = normalizeKey(name);
      if (key !== '') byNormalized.set(key, item.placement_id);
    }
  }

  return {
    resolve(articulo: string): string | null {
      return byNormalized.get(normalizeKey(articulo)) ?? null;
    },
  };
}
