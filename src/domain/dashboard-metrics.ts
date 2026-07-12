/**
 * Métricas del dashboard (§36, §37, §38).
 *
 * Todas las métricas se calculan EXCLUSIVAMENTE a partir de datos de Firestore
 * (nunca desde un Excel). Aquí viven como funciones puras y testables sobre
 * proyecciones ya cargadas del repositorio.
 *
 * "Activas" (vigencia cruza el periodo) NO se mezcla con "Trabajadas"
 * (tuvieron actividad operativa en el periodo, calculado desde change_history).
 */

import { periodOverlaps, type DateRange, type IsoDate } from '@/lib/dates';

/** Proyección mínima de una línea operativa para métricas. */
export interface MetricLine {
  campaignGroupId: string;
  campaignSpaceId: string;
  campaignLineId: string;
  clienteKey: string;
  clienteOriginal?: string;
  creatividadIdKey: string;
  placementId: string;
  fechaFijacion: IsoDate;
  fechaRetirada: IsoDate;
  isCurrent: boolean;
  active: boolean;
  /** Piezas requeridas obligatorias aplicables a esta línea (§15, §36). */
  requiredPieces: number;
  /** Dimensiones de retail media (plantilla Ekon). */
  tipoOperacion?: string | null;
  cadena?: string | null;
  periodoOriginal?: string | null;
  periodoInicio?: string | null;
}

export interface DashboardMetrics {
  clientesActivos: number;
  campanasActivas: number;
  espaciosActivos: number;
  lineasActivas: number;
  creatividadesUnicas: number;
  piezasRequeridas: number;
}

/** Filtra las líneas actuales/activas cuya vigencia cruza el periodo (§37). */
export function filterActiveInPeriod(
  lines: readonly MetricLine[],
  period: DateRange,
): MetricLine[] {
  return lines.filter(
    (l) =>
      l.active &&
      l.isCurrent &&
      periodOverlaps(l.fechaFijacion, l.fechaRetirada, period),
  );
}

export function computeDashboardMetrics(
  lines: readonly MetricLine[],
  period: DateRange,
): DashboardMetrics {
  const active = filterActiveInPeriod(lines, period);

  const clientes = new Set<string>();
  const campanas = new Set<string>();
  const espacios = new Set<string>();
  const lineas = new Set<string>();
  const creatividades = new Set<string>();
  let piezas = 0;

  for (const l of active) {
    clientes.add(l.clienteKey);
    campanas.add(l.campaignGroupId);
    espacios.add(l.campaignSpaceId);
    lineas.add(l.campaignLineId);
    creatividades.add(l.creatividadIdKey);
    piezas += l.requiredPieces;
  }

  return {
    clientesActivos: clientes.size,
    campanasActivas: campanas.size,
    espaciosActivos: espacios.size,
    lineasActivas: lineas.size,
    creatividadesUnicas: creatividades.size,
    piezasRequeridas: piezas,
  };
}

/** Distribución de espacios por placement (§39, gráfica de dona). */
export interface PlacementDistributionItem {
  placementId: string;
  spaces: number;
  percentage: number;
}

export function computePlacementDistribution(
  lines: readonly MetricLine[],
  period: DateRange,
): PlacementDistributionItem[] {
  const active = filterActiveInPeriod(lines, period);
  const spacesByPlacement = new Map<string, Set<string>>();

  for (const l of active) {
    if (!spacesByPlacement.has(l.placementId)) {
      spacesByPlacement.set(l.placementId, new Set());
    }
    spacesByPlacement.get(l.placementId)!.add(l.campaignSpaceId);
  }

  const totalSpaces = Array.from(spacesByPlacement.values()).reduce(
    (acc, set) => acc + set.size,
    0,
  );

  const items: PlacementDistributionItem[] = Array.from(
    spacesByPlacement.entries(),
  ).map(([placementId, set]) => ({
    placementId,
    spaces: set.size,
    percentage: totalSpaces === 0 ? 0 : Math.round((set.size / totalSpaces) * 100),
  }));

  return items.sort((a, b) => b.spaces - a.spaces);
}

/** Desglose por una dimensión (tipo de operación, cadena) sobre líneas activas. */
export interface BreakdownItem {
  label: string;
  lines: number;
  requiredPieces: number;
  percentage: number;
}

export function computeLineBreakdown(
  lines: readonly MetricLine[],
  period: DateRange,
  keyOf: (line: MetricLine) => string,
): BreakdownItem[] {
  const active = filterActiveInPeriod(lines, period);
  const byKey = new Map<string, { lines: number; pieces: number }>();
  for (const l of active) {
    const k = keyOf(l) || '(sin dato)';
    const cur = byKey.get(k) ?? { lines: 0, pieces: 0 };
    cur.lines += 1;
    cur.pieces += l.requiredPieces;
    byKey.set(k, cur);
  }
  const total = active.length;
  return Array.from(byKey.entries())
    .map(([label, v]) => ({
      label,
      lines: v.lines,
      requiredPieces: v.pieces,
      percentage: total === 0 ? 0 : Math.round((v.lines / total) * 100),
    }))
    .sort((a, b) => b.lines - a.lines);
}

/** Evento mínimo de auditoría para "trabajadas" (§38). */
export interface WorkedChange {
  campaignGroupId: string;
  createdAtIso: IsoDate;
}

/**
 * Campañas TRABAJADAS en el periodo: distintas campañas con al menos un evento
 * de `change_history` dentro del periodo (§38).
 */
export function computeWorkedCampaigns(
  changes: readonly WorkedChange[],
  period: DateRange,
): number {
  const worked = new Set<string>();
  for (const c of changes) {
    if (c.createdAtIso >= period.start && c.createdAtIso <= period.end) {
      worked.add(c.campaignGroupId);
    }
  }
  return worked.size;
}
