/**
 * Registro de adaptadores por retailer. La resolución por cadena está
 * centralizada aquí: los componentes/repos NO deben comparar `cadena === 'LA COMER'`.
 */

import { defaultRetailerAdapter } from './default.adapter';
import { laComerAdapter } from './la-comer.adapter';
import { sorianaAdapter } from './soriana.adapter';
import type { RetailerAdapter } from './types';

/** Orden de resolución: específicos primero, genérico al final. */
export const RETAILER_ADAPTERS: readonly RetailerAdapter[] = [
  laComerAdapter,
  sorianaAdapter,
  defaultRetailerAdapter,
];

/** Resuelve el adaptador para una cadena (siempre devuelve uno; default si ninguno). */
export function resolveRetailerAdapter(chain: string | null | undefined): RetailerAdapter {
  const value = chain ?? '';
  for (const adapter of RETAILER_ADAPTERS) {
    if (adapter.matchesChain(value)) return adapter;
  }
  return defaultRetailerAdapter;
}

/** Resuelve por retailer_id explícito (para líneas ya persistidas). */
export function adapterByRetailerId(retailerId: string | null | undefined): RetailerAdapter | null {
  if (!retailerId) return null;
  return RETAILER_ADAPTERS.find((a) => a.retailerId === retailerId) ?? null;
}

/**
 * Adaptador de una línea ya persistida: usa retailer_id si existe, si no lo
 * resuelve por cadena (compatibilidad con documentos históricos).
 */
export function adapterForLine(line: { retailer_id?: string | null; cadena?: string | null }): RetailerAdapter {
  return adapterByRetailerId(line.retailer_id ?? null) ?? resolveRetailerAdapter(line.cadena ?? '');
}
