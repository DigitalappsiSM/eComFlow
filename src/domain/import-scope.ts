/**
 * Derivación del ALCANCE de una importación EKON a partir de sus filas (§4.3).
 * Lógica PURA y testeable.
 *
 * No se usa `min(fecha)`/`max(fecha)` como cobertura: se construye la lista de
 * periodos discretos y EXACTOS que aparecen en el archivo, de modo que un
 * archivo con S33 y S35 no marque S34 como ausente.
 */

import type { IsoDate } from '@/lib/dates';
import type {
  ImportCoverageMode,
  ImportCoveredPeriod,
  ImportScope,
} from '@/types/import';
import type { RowPlan } from './import-pipeline';
import { reconcilableOperationTypes } from './reconciliation';

/** Resultados de fila que SÍ representan una línea persistible entrante (§8.1). */
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

function periodType(tipo: string | undefined): ImportCoveredPeriod['type'] {
  if (tipo === 'semana') return 'semana';
  if (tipo === 'catorcena') return 'catorcena';
  return 'otro';
}

export interface DeriveScopeResult {
  /** Alcance detectado (sin `coverage_mode`, lo fija la confirmación). */
  scope: Omit<ImportScope, 'coverage_mode'> & { coverage_mode?: ImportCoverageMode };
  /** Motivos que bloquean la conciliación autoritativa (§8.7). */
  blockedReasons: string[];
  /** true si se detectó al menos un periodo con fechas válidas. */
  hasParseablePeriods: boolean;
}

/**
 * Deriva el alcance de las filas del plan. Sólo las filas digitales válidas con
 * periodo parseable aportan al universo entrante; las rechazadas y excluidas por
 * tipo no participan. Las filas rechazadas NO bloquean la conciliación (decisión
 * de negocio): no se importan, pero no impiden conciliar los tipos elegibles.
 */
export function deriveEkonScope(rows: readonly RowPlan[]): DeriveScopeResult {
  const periodByKey = new Map<string, ImportCoveredPeriod>();
  const chains = new Set<string>();
  const operationTypes = new Set<string>();
  const clients = new Set<string>();
  const campaigns = new Set<string>();

  for (const row of rows) {
    if (row.result === 'rejected') continue;
    if (row.result === 'excluded_by_type') continue;
    if (!PERSISTIBLE_RESULTS.has(row.result)) continue;

    const extra = row.extra;
    const start = extra?.periodoInicio ?? '';
    const end = extra?.periodoFin ?? '';
    // Sin periodo parseable: no aporta al alcance (§4.3).
    if (!start || !end) continue;

    const code = (extra?.periodoCodigo ?? '').trim().toUpperCase();
    const key = code ? `${code}|${start}|${end}` : `${start}|${end}`;
    if (!periodByKey.has(key)) {
      periodByKey.set(key, {
        code,
        type: periodType(extra?.periodoTipo),
        start: start as IsoDate,
        end: end as IsoDate,
      });
    }

    const cadena = (extra?.cadena ?? '').trim();
    if (cadena) chains.add(cadena);
    const tipo = extra?.tipoOperacion ?? null;
    if (tipo) operationTypes.add(tipo);
    if (row.normalized?.cliente) clients.add(row.normalized.cliente);
    if (row.normalized?.numeroCampana) campaigns.add(row.normalized.numeroCampana);
  }

  // Orden: por fecha de inicio y luego por código (§4.3).
  const covered = [...periodByKey.values()].sort(
    (a, b) => a.start.localeCompare(b.start) || a.code.localeCompare(b.code),
  );

  const scopeStart = covered.length > 0 ? covered[0]!.start : null;
  const scopeEnd =
    covered.length > 0
      ? covered.reduce<IsoDate>((max, p) => (p.end > max ? p.end : max), covered[0]!.end)
      : null;

  // Tipos que además son CONCILIABLES (ECOMMERCE, DIGITAL SIGNAGE, TOMATURNOS).
  const reconcilableTypes = reconcilableOperationTypes(operationTypes);

  const blockedReasons: string[] = [];
  if (covered.length === 0) {
    blockedReasons.push('No se detectaron periodos con fechas válidas en el archivo.');
  }
  if (covered.some((p) => !p.start || !p.end)) {
    blockedReasons.push('Algún periodo detectado no tiene fecha de inicio o fin.');
  }
  if (chains.size === 0) {
    blockedReasons.push('El archivo no contiene cadenas identificables.');
  }
  if (reconcilableTypes.size === 0) {
    blockedReasons.push(
      'El archivo no contiene tipos de operación conciliables (ECOMMERCE, DIGITAL SIGNAGE o TOMATURNOS).',
    );
  }

  const scope: DeriveScopeResult['scope'] = {
    scope_type: 'partial',
    scope_clients: [...clients].sort(),
    scope_start_date: scopeStart,
    scope_end_date: scopeEnd,
    scope_campaigns: [...campaigns].sort(),
    is_complete_scope: false,
    source_system: 'ekon',
    covered_periods: covered,
    scope_chains: [...chains].sort(),
    scope_operation_types: [...operationTypes].sort(),
  };

  return { scope, blockedReasons, hasParseablePeriods: covered.length > 0 };
}
