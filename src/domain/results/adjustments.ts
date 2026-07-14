/**
 * Ajustes comerciales semanales (§16–§23). Dominio PURO y testeable.
 *
 * Principios inviolables:
 *  - Los resultados reales (results_daily / results_weekly) NUNCA se modifican.
 *  - Solo se ajustan métricas ABSOLUTAS enteras: impressions, clicks,
 *    unique_clicks. Nunca ratios (CTR se recalcula).
 *  - La instrucción agregada (override o delta) se DISTRIBUYE proporcionalmente
 *    entre los documentos semanales del alcance, usando como base la MISMA
 *    métrica real. Base total = 0 → se BLOQUEA (no se reparte de otra forma).
 *  - Redondeo entero por MAYORES RESIDUOS: la suma repartida es EXACTAMENTE el
 *    total solicitado; el desempate es determinista por weekly_result_id.
 *  - No se permite un total ajustado negativo.
 */

export type AdjustmentMetric = 'impressions' | 'clicks' | 'unique_clicks';
export type AdjustmentOperation = 'override' | 'delta';
export type AdjustmentStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'archived';

export type AdjustmentScope =
  | 'period'
  | 'campaign_period'
  | 'flight_period'
  | 'creative_period'
  | 'advertiser_period'
  | 'device_period'
  | 'site_period'
  | 'placement_period'
  | 'custom_weekly_scope';

/** Documento semanal dentro del alcance, con su valor REAL de la métrica. */
export interface ScopeWeekly {
  weekly_result_id: string;
  real_value: number;
}

export interface AllocateInput {
  metric: AdjustmentMetric;
  operation: AdjustmentOperation;
  /** Total ajustado deseado (operación override). */
  requestedAdjustedTotal?: number;
  /** Cuánto sumar/restar (operación delta). */
  requestedDelta?: number;
  scope: readonly ScopeWeekly[];
}

/** Allocation materializada por documento semanal (§21). */
export interface Allocation {
  weekly_result_id: string;
  metric: AdjustmentMetric;
  weekly_real_value: number;
  weekly_scope_real_total: number;
  weekly_real_share: number;
  requested_adjusted_total: number;
  requested_delta: number;
  allocated_delta: number;
  allocated_adjusted_value: number;
  raw_decimal_allocation: number;
  rounded_allocation: number;
  rounding_remainder: number;
  rounding_rank: number;
  allocation_method: 'largest_remainder';
  allocation_basis_metric: AdjustmentMetric;
}

export interface AllocateResult {
  ok: boolean;
  error?: 'BASE_ZERO' | 'EMPTY_SCOPE' | 'NEGATIVE_TOTAL' | 'MISSING_TARGET';
  errorMessage?: string;
  scopeRealTotal: number;
  targetTotal: number;
  allocations: Allocation[];
}

function floor(x: number): number {
  return Math.floor(x);
}

/**
 * Distribuye una instrucción agregada proporcionalmente al valor real de cada
 * documento del alcance (§20). Devuelve las allocations con redondeo por
 * mayores residuos que suman EXACTAMENTE el total objetivo.
 */
export function allocateProportional(input: AllocateInput): AllocateResult {
  const { metric, operation, scope } = input;
  const scopeRealTotal = scope.reduce((a, s) => a + s.real_value, 0);
  const base: AllocateResult = { ok: false, scopeRealTotal, targetTotal: 0, allocations: [] };

  if (scope.length === 0) {
    return { ...base, error: 'EMPTY_SCOPE', errorMessage: 'El alcance no incluye resultados semanales.' };
  }
  if (scopeRealTotal <= 0) {
    // Base cero: no se puede repartir proporcionalmente ni con otra base (§20).
    return {
      ...base,
      error: 'BASE_ZERO',
      errorMessage: `El total real de ${metric} en el alcance es 0: no se puede distribuir el ajuste.`,
    };
  }

  const requestedAdjustedTotal =
    operation === 'override' ? input.requestedAdjustedTotal : undefined;
  const requestedDelta = operation === 'delta' ? input.requestedDelta : undefined;

  let targetTotal: number;
  if (operation === 'override') {
    if (requestedAdjustedTotal === undefined) {
      return { ...base, error: 'MISSING_TARGET', errorMessage: 'Falta el total ajustado (override).' };
    }
    targetTotal = Math.round(requestedAdjustedTotal);
    if (targetTotal < 0) {
      return { ...base, error: 'NEGATIVE_TOTAL', errorMessage: 'El total ajustado no puede ser negativo.' };
    }
  } else {
    if (requestedDelta === undefined) {
      return { ...base, error: 'MISSING_TARGET', errorMessage: 'Falta el delta a repartir.' };
    }
    targetTotal = scopeRealTotal + Math.round(requestedDelta);
    if (targetTotal < 0) {
      return { ...base, error: 'NEGATIVE_TOTAL', errorMessage: 'El total ajustado (real + delta) no puede ser negativo.' };
    }
  }

  const delta = operation === 'delta' ? Math.round(requestedDelta!) : targetTotal - scopeRealTotal;

  // 1) Valor decimal crudo por documento y piso.
  interface Work {
    s: ScopeWeekly;
    share: number;
    raw: number;
    floored: number;
    remainder: number;
    extra: number;
    rank: number;
  }
  const work: Work[] = scope.map((s) => {
    const share = s.real_value / scopeRealTotal;
    const raw = operation === 'override' ? targetTotal * share : s.real_value + delta * share;
    const fl = floor(raw);
    return { s, share, raw, floored: fl, remainder: raw - fl, extra: 0, rank: 0 };
  });

  // 2) Reparto de residuos (mayores residuos) para cuadrar exactamente el total.
  const sumFloor = work.reduce((a, w) => a + w.floored, 0);
  let deficit = targetTotal - sumFloor;

  const ordered = [...work].sort(
    (a, b) => b.remainder - a.remainder || a.s.weekly_result_id.localeCompare(b.s.weekly_result_id),
  );
  ordered.forEach((w, i) => {
    w.rank = i + 1;
    if (deficit > 0) {
      w.extra = 1;
      deficit -= 1;
    }
  });

  const allocations: Allocation[] = work.map((w) => {
    const allocated = w.floored + w.extra;
    return {
      weekly_result_id: w.s.weekly_result_id,
      metric,
      weekly_real_value: w.s.real_value,
      weekly_scope_real_total: scopeRealTotal,
      weekly_real_share: w.share,
      requested_adjusted_total: operation === 'override' ? targetTotal : 0,
      requested_delta: operation === 'delta' ? delta : 0,
      allocated_delta: allocated - w.s.real_value,
      allocated_adjusted_value: allocated,
      raw_decimal_allocation: w.raw,
      rounded_allocation: allocated,
      rounding_remainder: w.remainder,
      rounding_rank: w.rank,
      allocation_method: 'largest_remainder',
      allocation_basis_metric: metric,
    };
  });

  return { ok: true, scopeRealTotal, targetTotal, allocations };
}

// ---------------------------------------------------------------------------
// Modelo de lectura AJUSTADO (§23): valor ajustado por documento y métrica.
// ---------------------------------------------------------------------------

/** Valores ajustados aplicados (por métrica) a un documento semanal. */
export interface AdjustedValues {
  impressions?: number;
  clicks?: number;
  unique_clicks?: number;
}

export type AdjustedMap = Map<string, AdjustedValues>;

/**
 * Construye el modelo de lectura ajustado a partir de las allocations APROBADAS.
 * `weekly_result_id + metric` → valor ajustado. Si un documento no tiene
 * allocation para una métrica, el dashboard usa el valor real (§23).
 */
export function buildAdjustedMap(allocations: readonly Allocation[]): AdjustedMap {
  const map: AdjustedMap = new Map();
  for (const a of allocations) {
    const cur = map.get(a.weekly_result_id) ?? {};
    cur[a.metric] = a.allocated_adjusted_value;
    map.set(a.weekly_result_id, cur);
  }
  return map;
}

/** Hash determinista del alcance (ids ordenados) para detectar cambios (§22). */
export function scopeIdsHash(weeklyResultIds: readonly string[]): string {
  return [...weeklyResultIds].sort().join('|');
}

// ---------------------------------------------------------------------------
// Máquina de estados del ajuste (§17). Aprobado = inmutable.
// ---------------------------------------------------------------------------

const TRANSITIONS: Record<AdjustmentStatus, AdjustmentStatus[]> = {
  draft: ['pending_approval', 'archived'],
  pending_approval: ['approved', 'rejected', 'draft'],
  approved: ['archived'],
  rejected: ['draft', 'archived'],
  archived: [],
};

export function canTransition(from: AdjustmentStatus, to: AdjustmentStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Un ajuste aprobado no puede editarse; para corregir se crea una nueva versión. */
export function isEditable(status: AdjustmentStatus): boolean {
  return status === 'draft';
}
