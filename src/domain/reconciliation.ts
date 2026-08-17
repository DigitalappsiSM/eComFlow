/**
 * Conciliación de PRESENCIA de fuente EKON (§3, §6, §8). Lógica PURA y
 * testeable, separada de la clasificación de identidad/contenido.
 *
 * La ausencia de una línea sólo es significativa cuando el archivo cubre el
 * MISMO alcance confirmado: mismos periodos discretos, cadenas y tipos. No se
 * compara todo Firestore contra cualquier Excel.
 *
 * Reglas de membresía por estrategia de identidad:
 *  - `period_range` (Soriana/genérico): coincidencia EXACTA de periodo
 *    (inicio + fin [+ código]) con uno de los periodos confirmados.
 *  - `campaign_range` (La Comer): la línea consolida activaciones diarias en un
 *    solo documento; sólo entra al alcance si su rango de activación queda
 *    CONTENIDO por completo en la ventana confirmada (evita dar de baja una
 *    campaña porque el Excel omita días sueltos: cualquier fila de la campaña la
 *    mantiene presente; sólo falta si desaparece la línea completa).
 */

import type { IsoDate } from '@/lib/dates';
import type { ImportCoveredPeriod, ImportScope } from '@/types/import';
import type { RowPlan } from './import-pipeline';
import type { IdentityStrategy } from './retailers/types';

/** Resultados de fila que representan una línea entrante persistible (§8.1). */
const PERSISTIBLE_RESULTS = new Set<RowPlan['result']>([
  'new_campaign',
  'new_space',
  'new_line',
  'updated_line',
  'updated_space',
  'unchanged',
  'creativity_change',
  'possible_replacement',
]);

/**
 * Tipos de operación que PUEDEN conciliarse (marcarse como no incluidos al
 * faltar). El resto se importa normalmente pero nunca se desactiva por ausencia.
 * Decisión de negocio (fija en código; editar aquí para ampliarla).
 */
export const RECONCILABLE_OPERATION_TYPES: ReadonlySet<string> = new Set([
  'ECOMMERCE',
  'DIGITAL SIGNAGE',
  'TOMATURNOS',
]);

/** Subconjunto de tipos detectados que además son conciliables. */
export function reconcilableOperationTypes(detected: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const t of detected) {
    if (RECONCILABLE_OPERATION_TYPES.has(t)) out.add(t);
  }
  return out;
}

/** Acción de presencia sobre una línea entrante que ya existe (§6). */
export type PresenceAction = 'touch' | 'restore';

/**
 * Proyección de una línea ausente candidata a baja lógica (§6). Contiene lo
 * necesario para escribir la baja, su auditoría y mostrarla en la vista previa.
 */
export interface ReconciliationCandidate {
  campaignLineId: string;
  campaignSpaceId: string;
  campaignGroupId: string;
  clienteOriginal: string;
  numeroCampanaOriginal: string;
  placementName: string;
  creatividadIdOriginal: string;
  periodoOriginal: string | null;
  periodoInicio: IsoDate | null;
  periodoFin: IsoDate | null;
  cadena: string | null;
  tipoOperacion: string | null;
}

/**
 * Línea activa/actual leída de Firestore, lista para evaluar su membresía en el
 * alcance. `cadenaKey` y `tipoOperacion` ya vienen normalizados por el
 * repositorio para comparar sin fuzzy matching.
 */
export interface ScopeCandidateLine {
  candidate: ReconciliationCandidate;
  identityStrategy: IdentityStrategy;
  /** Cadena normalizada (misma normalización que `ScopeFilter.chainKeys`). */
  cadenaKey: string;
  tipoOperacion: string | null;
  periodoCodigo: string | null;
  periodoInicio: IsoDate | null;
  periodoFin: IsoDate | null;
  /** Rango de activación consolidado (campaign_range). Cae a periodo_* si falta. */
  activationStart: IsoDate | null;
  activationEnd: IsoDate | null;
}

/** Alcance confirmado ya normalizado para comparación (lo arma el repositorio). */
export interface ScopeFilter {
  coveredPeriods: readonly ImportCoveredPeriod[];
  /** Cadenas normalizadas incluidas en el alcance. */
  chainKeys: ReadonlySet<string>;
  /** Tipos de operación incluidos en el alcance. */
  operationTypes: ReadonlySet<string>;
  /** Ventana mínima/máxima de los periodos confirmados (para campaign_range). */
  windowStart: IsoDate | null;
  windowEnd: IsoDate | null;
}

function matchesExactPeriod(
  line: ScopeCandidateLine,
  periods: readonly ImportCoveredPeriod[],
): boolean {
  const start = line.periodoInicio;
  const end = line.periodoFin;
  if (!start || !end) return false;
  return periods.some((p) => {
    if (p.start !== start || p.end !== end) return false;
    // Si ambos tienen código, deben coincidir; si alguno no lo tiene, basta la
    // coincidencia de fechas (§5.1: "periodo_codigo cuando exista").
    if (p.code && line.periodoCodigo) return p.code === line.periodoCodigo;
    return true;
  });
}

function withinWindow(line: ScopeCandidateLine, scope: ScopeFilter): boolean {
  const start = line.activationStart ?? line.periodoInicio;
  const end = line.activationEnd ?? line.periodoFin;
  if (!start || !end || !scope.windowStart || !scope.windowEnd) return false;
  return start >= scope.windowStart && end <= scope.windowEnd;
}

/**
 * ¿La línea pertenece al alcance confirmado? Debe cumplir cadena + tipo + la
 * regla de periodo de su estrategia de identidad.
 */
export function lineInScope(line: ScopeCandidateLine, scope: ScopeFilter): boolean {
  if (scope.chainKeys.size > 0 && !scope.chainKeys.has(line.cadenaKey)) return false;
  if (line.tipoOperacion === null || !scope.operationTypes.has(line.tipoOperacion)) return false;

  if (line.identityStrategy === 'campaign_range') {
    return withinWindow(line, scope);
  }
  return matchesExactPeriod(line, scope.coveredPeriods);
}

/**
 * Ausencias = líneas dentro del alcance cuya identidad determinista NO aparece
 * en el conjunto entrante. Deduplica por `campaign_line_id`.
 */
export function computeMissing(
  inScope: readonly ScopeCandidateLine[],
  incomingLineIds: ReadonlySet<string>,
): ReconciliationCandidate[] {
  const seen = new Set<string>();
  const missing: ReconciliationCandidate[] = [];
  for (const line of inScope) {
    const id = line.candidate.campaignLineId;
    if (seen.has(id)) continue;
    if (incomingLineIds.has(id)) continue;
    seen.add(id);
    missing.push(line.candidate);
  }
  return missing;
}

/**
 * Decide la acción de presencia para una línea ENTRANTE que ya existe (§6):
 *  - inactiva por `not_in_source`            → `restore` (reaparece).
 *  - activa                                  → `touch` (refresca presencia).
 *  - inactiva por CUALQUIER otra razón       → `null` (no se restaura sola).
 */
export function decidePresenceAction(existing: {
  active: boolean;
  inactiveReason?: string | null;
}): PresenceAction | null {
  if (existing.active) return 'touch';
  if (existing.inactiveReason === 'not_in_source') return 'restore';
  return null;
}

/**
 * Ids de líneas deterministas ENTRANTES en el archivo (§8.1): todas las filas
 * persistibles con identidad. Excluye rechazadas, excluidas por tipo y sin
 * identidad. Éste es el universo contra el que se detectan las ausencias.
 */
export function incomingLineIds(rows: readonly RowPlan[]): Set<string> {
  const ids = new Set<string>();
  for (const row of rows) {
    if (!PERSISTIBLE_RESULTS.has(row.result)) continue;
    const key = row.identity?.campaignLineKey;
    if (key) ids.add(key);
  }
  return ids;
}

/** Ids de líneas entrantes que estaban `not_in_source` y se restaurarán (§8.6). */
export function restoreLineIds(rows: readonly RowPlan[]): string[] {
  const ids: string[] = [];
  for (const row of rows) {
    if (row.presenceAction === 'restore' && row.identity?.campaignLineKey) {
      ids.push(row.identity.campaignLineKey);
    }
  }
  return ids;
}

/**
 * Ensambla el plan de conciliación (§8). Puro: recibe las líneas en alcance ya
 * leídas de Firestore y los conjuntos entrantes. `eligible` gobierna únicamente
 * si el modo `authoritative` puede aplicar bajas; el modo aditivo nunca depende
 * de él.
 */
export function assembleReconciliationPlan(input: {
  detectedScope: ImportScope;
  blockedReasons: readonly string[];
  incoming: ReadonlySet<string>;
  restoreIds: readonly string[];
  existingInScope: readonly ScopeCandidateLine[];
}): ImportReconciliationPlan {
  const missing = computeMissing(input.existingInScope, input.incoming);
  return {
    eligible: input.blockedReasons.length === 0,
    blockedReasons: [...input.blockedReasons],
    detectedScope: input.detectedScope,
    existingInScope: input.existingInScope.length,
    missing,
    restoreIds: [...input.restoreIds],
  };
}

/**
 * Compuerta de bajas lógicas (§9.5): SÓLO se aplican ausencias cuando el modo es
 * `authoritative` Y la conciliación es elegible. El modo aditivo y cualquier
 * bloqueo nunca desactivan datos.
 */
export function shouldApplyReconciliation(
  coverageMode: 'additive' | 'authoritative',
  eligible: boolean,
): boolean {
  return coverageMode === 'authoritative' && eligible;
}

/** Plan de conciliación de una importación (sección separada de `ImportPlan`). */
export interface ImportReconciliationPlan {
  /** true si la conciliación autoritativa puede aplicarse con seguridad. */
  eligible: boolean;
  /** Motivos por los que `authoritative` no es elegible (informativos). */
  blockedReasons: string[];
  /** Alcance detectado y efectivo (con periodos, cadenas y tipos). */
  detectedScope: ImportScope;
  /** Total de líneas activas/actuales encontradas dentro del alcance. */
  existingInScope: number;
  /** Líneas ausentes candidatas a baja lógica. */
  missing: ReconciliationCandidate[];
  /** Ids de líneas entrantes que estaban `not_in_source` y se restaurarán. */
  restoreIds: string[];
}
