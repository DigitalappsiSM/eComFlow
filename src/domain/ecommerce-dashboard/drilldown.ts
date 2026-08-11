/**
 * Filtros de drill-down hacia Seguimiento operativo (§11).
 *
 * Las gráficas y KPIs accionables abren `/operacion` con filtros precargados vía
 * parámetros de URL. Ejemplo:
 *
 *   /operacion?tipo=ECOMMERCE&weekStart=2026-08-14&weekEnd=2026-08-20
 *             &cliente=MABE&pendingCheck=artes&status=en_preparacion
 *
 * Aquí viven la construcción y la lectura de esos parámetros (puras y testables).
 */

import type { CheckKey } from '@/domain/progress';
import type { OperationalStatus } from './status';
import { ALL_STATUSES } from './status';
import { CHECK_ORDER } from './checks';

export interface DrilldownFilters {
  tipo?: string;
  weekStart?: string;
  weekEnd?: string;
  cliente?: string;
  pendingCheck?: CheckKey;
  status?: OperationalStatus;
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Construye el query string de drill-down (omite claves vacías). */
export function buildDrilldownParams(filters: DrilldownFilters): string {
  const params = new URLSearchParams();
  if (filters.tipo) params.set('tipo', filters.tipo);
  if (filters.weekStart) params.set('weekStart', filters.weekStart);
  if (filters.weekEnd) params.set('weekEnd', filters.weekEnd);
  if (filters.cliente) params.set('cliente', filters.cliente);
  if (filters.pendingCheck) params.set('pendingCheck', filters.pendingCheck);
  if (filters.status) params.set('status', filters.status);
  return params.toString();
}

/** Ruta completa `/operacion?...` para navegar al drill-down. */
export function buildDrilldownHref(filters: DrilldownFilters): string {
  const qs = buildDrilldownParams(filters);
  return qs ? `/operacion?${qs}` : '/operacion';
}

/** Lee filtros de drill-down desde `URLSearchParams`. Ignora valores inválidos. */
export function parseDrilldownParams(params: URLSearchParams): DrilldownFilters {
  const out: DrilldownFilters = {};
  const tipo = params.get('tipo')?.trim();
  if (tipo) out.tipo = tipo;

  const weekStart = params.get('weekStart')?.trim();
  if (weekStart && ISO_RE.test(weekStart)) out.weekStart = weekStart;
  const weekEnd = params.get('weekEnd')?.trim();
  if (weekEnd && ISO_RE.test(weekEnd)) out.weekEnd = weekEnd;

  const cliente = params.get('cliente')?.trim();
  if (cliente) out.cliente = cliente;

  const pendingCheck = params.get('pendingCheck')?.trim() as CheckKey | undefined;
  if (pendingCheck && CHECK_ORDER.includes(pendingCheck)) out.pendingCheck = pendingCheck;

  const status = params.get('status')?.trim() as OperationalStatus | undefined;
  if (status && ALL_STATUSES.includes(status)) out.status = status;

  return out;
}

/** ¿Hay al menos un filtro de drill-down presente? */
export function hasDrilldownFilters(filters: DrilldownFilters): boolean {
  return Object.values(filters).some((v) => !!v);
}
