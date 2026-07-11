/**
 * Clasificación de Artículo → Tipo de operación (retail media).
 *
 * Los tipos son EXTENSIBLES. El catálogo base vive en código (los artículos
 * conocidos al día de hoy); cualquier clasificación adicional se guarda en
 * `app_settings.articulo_tipos` y tiene prioridad. Si un artículo no está en
 * ninguno, el importador pide clasificarlo antes de continuar (no se adivina).
 */

import { normalizeKey } from './normalization';

export type TipoOperacion = string;

/** Tipos conocidos por defecto (se pueden agregar más desde la clasificación). */
export const DEFAULT_TIPOS: TipoOperacion[] = [
  'GRAFICA',
  'ECOMMERCE',
  'DIGITAL SIGNAGE',
  'TOMATURNOS',
];

/** Catálogo base Artículo → Tipo (texto original; se normaliza al construir). */
export const DEFAULT_ARTICULO_TIPOS: ReadonlyArray<readonly [string, TipoOperacion]> = [
  ['ALARM-MEDIA', 'GRAFICA'],
  ['ARCO DE ENTRADA', 'GRAFICA'],
  ['ARCO DE PASILLO', 'GRAFICA'],
  ['ARCO DE PASILLO 3D', 'GRAFICA'],
  ['ASADORES', 'GRAFICA'],
  ['BUNDLE BOOST', 'ECOMMERCE'],
  ['CART-MEDIA', 'GRAFICA'],
  ['CATEGORY BANNER', 'ECOMMERCE'],
  ['CATEGORY MEDIA_WEB', 'ECOMMERCE'],
  ['CENEFA', 'GRAFICA'],
  ['CENEFA C/REJILLA', 'GRAFICA'],
  ['CINTILLO DE CAJA', 'GRAFICA'],
  ['COPETE DIGITAL', 'DIGITAL SIGNAGE'],
  ['COPETE MUPI', 'GRAFICA'],
  ['CUBO LED', 'DIGITAL SIGNAGE'],
  ['DANGLER', 'GRAFICA'],
  ['DISPENSADOR BOLSA', 'GRAFICA'],
  ['ELECTROSTÁTICO', 'GRAFICA'],
  ['ESPECTACULAR IN STORE', 'DIGITAL SIGNAGE'],
  ['FEE C DIGITAL', 'TOMATURNOS'],
  ['FLOOR-MEDIA XL', 'GRAFICA'],
  ['HOME BANNER', 'ECOMMERCE'],
  ['HOME CENTRAL', 'ECOMMERCE'],
  ['HOME SLIDER', 'ECOMMERCE'],
  ['MEGA MUPI DIGITAL', 'DIGITAL SIGNAGE'],
  ['MIS LISTAS HEADER', 'ECOMMERCE'],
  ['MUPI', 'GRAFICA'],
  ['OPE CABECERA', 'GRAFICA'],
  ['OPE ELECTROSTÁTICO', 'GRAFICA'],
  ['OPE MARCO GLORIFICADOR', 'GRAFICA'],
  ['PACK PROMOS', 'ECOMMERCE'],
  ['PLUMA', 'GRAFICA'],
  ['SEARCH BANNER', 'ECOMMERCE'],
  ['STOPPER CON CARGA', 'GRAFICA'],
  ['STOPPER XL', 'GRAFICA'],
  ['STOPPER XL LED', 'GRAFICA'],
  ['STOPPER-MEDIA', 'GRAFICA'],
  ['V´S', 'DIGITAL SIGNAGE'],
  ['VIDEOWALL', 'DIGITAL SIGNAGE'],
  ['VOLUMÉTRICO CON CARGA', 'GRAFICA'],
];

/** Clave técnica de un artículo para el mapa (normalización idéntica a claves). */
export function articuloKey(articulo: string): string {
  return normalizeKey(articulo);
}

export interface TipoClassifier {
  /** Devuelve el tipo o null si el artículo no está catalogado. */
  resolve(articulo: string): TipoOperacion | null;
}

/**
 * Construye el clasificador combinando el catálogo base con el mapa
 * personalizado (guardado en app_settings). El personalizado tiene prioridad.
 * `customMap` está keyeado por clave normalizada de artículo.
 */
export function buildTipoClassifier(
  customMap: Record<string, TipoOperacion> = {},
): TipoClassifier {
  const map = new Map<string, TipoOperacion>();
  for (const [articulo, tipo] of DEFAULT_ARTICULO_TIPOS) {
    map.set(articuloKey(articulo), tipo);
  }
  for (const [key, tipo] of Object.entries(customMap)) {
    map.set(key, tipo);
  }
  return {
    resolve(articulo: string): TipoOperacion | null {
      return map.get(articuloKey(articulo)) ?? null;
    },
  };
}

/** Artículos distintos (texto original) que NO están catalogados. */
export function unclassifiedArticulos(
  articulos: readonly string[],
  classifier: TipoClassifier,
): string[] {
  const seen = new Set<string>();
  const unknown: string[] = [];
  for (const a of articulos) {
    const key = articuloKey(a);
    if (classifier.resolve(a) === null && !seen.has(key)) {
      seen.add(key);
      unknown.push(a.trim());
    }
  }
  return unknown;
}

/** Lista de tipos disponibles = base + los que aparezcan en el mapa custom. */
export function availableTipos(customMap: Record<string, TipoOperacion> = {}): string[] {
  const set = new Set<string>(DEFAULT_TIPOS);
  for (const tipo of Object.values(customMap)) set.add(tipo);
  return [...set];
}
