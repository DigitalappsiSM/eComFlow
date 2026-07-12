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
  /** Fin del periodo operativo (semana/catorcena). Vence antes que la campaña. */
  periodoFin?: string | null;
  /** Continuidad respecto al periodo inmediato anterior. */
  tipoCampanaPeriodo?: 'fijacion' | 'continua' | null;
  /** Baja lógica de la línea (cancelada). */
  cancelled?: boolean;
}

/** Estado operativo de una línea respecto a hoy (por periodo operativo). */
export type OperationalStatus = 'vencido' | 'en_curso' | 'futuro';

/** Inicio operativo de la línea: periodo si existe; si no, la campaña. */
export function lineStart(line: MetricLine): IsoDate {
  return line.periodoInicio ?? line.fechaFijacion;
}

/** Fin operativo de la línea: periodo si existe; si no, la campaña. */
export function lineEnd(line: MetricLine): IsoDate {
  return line.periodoFin ?? line.fechaRetirada;
}

/**
 * Clasifica una línea contra `today` usando su **periodo operativo**:
 * - `vencido`: el periodo ya terminó (fin < hoy).
 * - `futuro`: el periodo aún no empieza (inicio > hoy).
 * - `en_curso`: hoy cae dentro del periodo.
 */
export function operationalStatusOf(line: MetricLine, today: IsoDate): OperationalStatus {
  if (lineEnd(line) < today) return 'vencido';
  if (lineStart(line) > today) return 'futuro';
  return 'en_curso';
}

/** Mes (YYYY-MM) al que pertenece la línea, por su inicio operativo. */
export function lineMonthKey(line: MetricLine): string {
  return lineStart(line).slice(0, 7);
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

// ---------------------------------------------------------------------------
// Dashboard Operativo 360 — métricas visuales (funciones puras y testables).
// Todas operan sobre proyecciones `MetricLine` ya cargadas de Firestore.
// ---------------------------------------------------------------------------

const NO_CLIENT = '(sin cliente)';
const NO_TIPO = '(sin tipo)';
const NO_CHAIN = '(sin cadena)';
const NO_PERIOD = '(sin periodo)';

function clienteLabel(l: MetricLine): string {
  return (l.clienteOriginal ?? '').trim() || NO_CLIENT;
}

/** Nº de clientes distintos activos que cruzan el periodo. */
export function computeActiveClients(
  lines: readonly MetricLine[],
  period: DateRange,
): number {
  const clientes = new Set<string>();
  for (const l of filterActiveInPeriod(lines, period)) clientes.add(l.clienteKey);
  return clientes.size;
}

/** Principales clientes por nº de líneas activas (orden descendente). */
export interface ClientLoadItem {
  cliente: string;
  lines: number;
  requiredPieces: number;
}

export function computeTopClients(
  lines: readonly MetricLine[],
  period: DateRange,
): ClientLoadItem[] {
  const active = filterActiveInPeriod(lines, period);
  const byClient = new Map<string, ClientLoadItem>();
  for (const l of active) {
    const cliente = clienteLabel(l);
    const cur = byClient.get(cliente) ?? { cliente, lines: 0, requiredPieces: 0 };
    cur.lines += 1;
    cur.requiredPieces += l.requiredPieces;
    byClient.set(cliente, cur);
  }
  return [...byClient.values()].sort(
    (a, b) => b.lines - a.lines || a.cliente.localeCompare(b.cliente, 'es'),
  );
}

/** Distribución por tipo de operación (líneas activas). */
export interface TipoDistributionItem {
  tipo: string;
  lines: number;
  requiredPieces: number;
  percentage: number;
}

export function computeTipoOperationDistribution(
  lines: readonly MetricLine[],
  period: DateRange,
): TipoDistributionItem[] {
  const active = filterActiveInPeriod(lines, period);
  const byTipo = new Map<string, { lines: number; pieces: number }>();
  for (const l of active) {
    const tipo = (l.tipoOperacion ?? '').trim() || NO_TIPO;
    const cur = byTipo.get(tipo) ?? { lines: 0, pieces: 0 };
    cur.lines += 1;
    cur.pieces += l.requiredPieces;
    byTipo.set(tipo, cur);
  }
  const total = active.length;
  return [...byTipo.entries()]
    .map(([tipo, v]) => ({
      tipo,
      lines: v.lines,
      requiredPieces: v.pieces,
      percentage: total === 0 ? 0 : Math.round((v.lines / total) * 100),
    }))
    .sort((a, b) => b.lines - a.lines || a.tipo.localeCompare(b.tipo, 'es'));
}

/** Evolución mensual (por inicio operativo). Ordenada cronológicamente. */
export interface MonthlyTrendItem {
  month: string;
  lines: number;
  requiredPieces: number;
}

export function computeMonthlyOperationTrend(
  lines: readonly MetricLine[],
): MonthlyTrendItem[] {
  const byMonth = new Map<string, { lines: number; pieces: number }>();
  for (const l of lines) {
    const month = lineMonthKey(l);
    if (!month) continue;
    const cur = byMonth.get(month) ?? { lines: 0, pieces: 0 };
    cur.lines += 1;
    cur.pieces += l.requiredPieces;
    byMonth.set(month, cur);
  }
  return [...byMonth.entries()]
    .map(([month, v]) => ({ month, lines: v.lines, requiredPieces: v.pieces }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

/** Carga por periodo (semana/catorcena). Ordenada por inicio del periodo. */
export interface PeriodLoadItem {
  periodo: string;
  sortKey: string;
  lines: number;
  requiredPieces: number;
}

export function computePeriodLoad(lines: readonly MetricLine[]): PeriodLoadItem[] {
  const byPeriod = new Map<string, PeriodLoadItem>();
  for (const l of lines) {
    const periodo = (l.periodoOriginal ?? '').trim() || NO_PERIOD;
    const cur =
      byPeriod.get(periodo) ??
      { periodo, sortKey: l.periodoInicio ?? l.fechaFijacion ?? '', lines: 0, requiredPieces: 0 };
    cur.lines += 1;
    cur.requiredPieces += l.requiredPieces;
    byPeriod.set(periodo, cur);
  }
  return [...byPeriod.values()].sort(
    (a, b) => a.sortKey.localeCompare(b.sortKey) || a.periodo.localeCompare(b.periodo, 'es'),
  );
}

/** Carga por cadena (líneas activas). */
export interface ChainLoadItem {
  cadena: string;
  lines: number;
  requiredPieces: number;
}

export function computeChainLoad(
  lines: readonly MetricLine[],
  period: DateRange,
): ChainLoadItem[] {
  const active = filterActiveInPeriod(lines, period);
  const byChain = new Map<string, ChainLoadItem>();
  for (const l of active) {
    const cadena = (l.cadena ?? '').trim() || NO_CHAIN;
    const cur = byChain.get(cadena) ?? { cadena, lines: 0, requiredPieces: 0 };
    cur.lines += 1;
    cur.requiredPieces += l.requiredPieces;
    byChain.set(cadena, cur);
  }
  return [...byChain.values()].sort(
    (a, b) => b.lines - a.lines || a.cadena.localeCompare(b.cadena, 'es'),
  );
}

/** Desglose vencido / en curso / futuro (excluye canceladas). */
export interface OperationalStatusBreakdown {
  vencido: number;
  enCurso: number;
  futuro: number;
  total: number;
}

export function computeOperationalStatusBreakdown(
  lines: readonly MetricLine[],
  today: IsoDate,
): OperationalStatusBreakdown {
  const out: OperationalStatusBreakdown = { vencido: 0, enCurso: 0, futuro: 0, total: 0 };
  for (const l of lines) {
    if (l.cancelled) continue;
    out.total += 1;
    switch (operationalStatusOf(l, today)) {
      case 'vencido':
        out.vencido += 1;
        break;
      case 'en_curso':
        out.enCurso += 1;
        break;
      case 'futuro':
        out.futuro += 1;
        break;
    }
  }
  return out;
}

/**
 * Matriz cliente × tipo de operación (para barras apiladas). Devuelve la lista
 * de tipos presentes y una fila por cliente con un contador por tipo, ordenadas
 * por total descendente.
 */
export interface ClientTypeMatrix {
  tipos: string[];
  rows: Array<{ cliente: string; total: number } & Record<string, number | string>>;
}

export function computeClientTypeMatrix(
  lines: readonly MetricLine[],
  period: DateRange,
): ClientTypeMatrix {
  const active = filterActiveInPeriod(lines, period);
  const tipos = new Set<string>();
  const byClient = new Map<string, Map<string, number>>();
  for (const l of active) {
    const cliente = clienteLabel(l);
    const tipo = (l.tipoOperacion ?? '').trim() || NO_TIPO;
    tipos.add(tipo);
    if (!byClient.has(cliente)) byClient.set(cliente, new Map());
    const m = byClient.get(cliente)!;
    m.set(tipo, (m.get(tipo) ?? 0) + 1);
  }
  const tipoList = [...tipos].sort((a, b) => a.localeCompare(b, 'es'));
  const rows = [...byClient.entries()]
    .map(([cliente, m]) => {
      const row: { cliente: string; total: number } & Record<string, number | string> = {
        cliente,
        total: 0,
      };
      for (const t of tipoList) {
        const n = m.get(t) ?? 0;
        row[t] = n;
        row.total += n;
      }
      return row;
    })
    .sort((a, b) => b.total - a.total || a.cliente.localeCompare(b.cliente, 'es'));
  return { tipos: tipoList, rows };
}

/**
 * Atención requerida: líneas VENCIDAS agrupadas por cliente + periodo + tipo,
 * con su conteo de líneas y piezas. Ordenadas por líneas vencidas (desc).
 */
export interface AttentionRow {
  cliente: string;
  periodo: string;
  tipo: string;
  expiredLines: number;
  requiredPieces: number;
}

export function computeAttentionByClient(
  lines: readonly MetricLine[],
  today: IsoDate,
): AttentionRow[] {
  const byKey = new Map<string, AttentionRow>();
  for (const l of lines) {
    if (l.cancelled) continue;
    if (operationalStatusOf(l, today) !== 'vencido') continue;
    const cliente = clienteLabel(l);
    const periodo = (l.periodoOriginal ?? '').trim() || NO_PERIOD;
    const tipo = (l.tipoOperacion ?? '').trim() || NO_TIPO;
    const key = `${cliente}||${periodo}||${tipo}`;
    const cur = byKey.get(key) ?? { cliente, periodo, tipo, expiredLines: 0, requiredPieces: 0 };
    cur.expiredLines += 1;
    cur.requiredPieces += l.requiredPieces;
    byKey.set(key, cur);
  }
  return [...byKey.values()].sort(
    (a, b) =>
      b.expiredLines - a.expiredLines ||
      a.cliente.localeCompare(b.cliente, 'es') ||
      a.periodo.localeCompare(b.periodo, 'es'),
  );
}
