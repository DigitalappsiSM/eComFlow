/**
 * Métricas del Dashboard de Resultados (§14, §15). Puras y testeables sobre el
 * consolidado semanal (`results_weekly`) enriquecido con el catálogo de periodos.
 *
 * Clave: los "clics" del reporte son **Unique Clicks**; el CTR se recalcula
 * SUM(clicks)/SUM(impressions) — nunca se promedia. La vista "efectiva" usa
 * `impressions_effective` (real + estimado) sin pisar el dato real.
 */

import type { WeeklyResult } from './consolidation';
import type { AdjustedMap } from './adjustments';
import type { EcommercePeriod, ResultDevice } from '@/types/results';

/** Línea de resultados lista para métricas (semanal + metadata de periodo). */
export interface ResultsLine {
  weekly_result_id: string;
  period_id: string;
  period_code: string;
  period_label: string;
  period_start: string;
  month: number;
  quarter: number;
  year: number;

  cliente: string; // Advertiser (§13: Cliente = Advertiser mientras no haya mapping)
  campaign: string;
  campaign_id: string;
  flight: string; // "espacio" completo, p. ej. "CATEGORY BANNER <N1 JUGUETES>"
  articulo: string; // parte antes de <> ("CATEGORY BANNER")
  categoria: string; // parte dentro de <> ("N1 JUGUETES")
  creative: string;
  device: ResultDevice;
  site: string;

  impressions: number; // real Kevel
  impressions_estimated: number;
  impressions_effective: number; // real + estimado
  clicks: number; // Unique Clicks (base del reporte)
  raw_clicks: number; // Clicks (informativo)
  filtered_clicks: number;
  suspicious_clicks: number;

  // Vista AJUSTADA (§23): valores ajustados por allocations aprobadas. Si no hay
  // ajuste, son iguales al real (nunca se suma real + ajustado en la misma fila).
  adjusted_impressions: number;
  adjusted_clicks: number;
  has_adjustment: boolean;
}

const MONTHS = [
  '', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export function monthName(month: number): string {
  return MONTHS[month] ?? '';
}

/** Separa el Flight en artículo (antes de <>) y categoría (dentro de <>). */
export function parseFlight(flight: string): { articulo: string; categoria: string } {
  const m = /^(.*?)\s*<\s*(.*?)\s*>\s*$/.exec((flight ?? '').trim());
  if (m) return { articulo: (m[1] ?? '').trim() || '(sin artículo)', categoria: (m[2] ?? '').trim() || '(sin categoría)' };
  const f = (flight ?? '').trim();
  return { articulo: f || '(sin artículo)', categoria: '(sin categoría)' };
}

/** Une los documentos semanales con el catálogo de periodos → líneas de métricas. */
export function buildResultsLines(
  weekly: readonly WeeklyResult[],
  periods: readonly EcommercePeriod[],
  adjusted?: AdjustedMap,
): ResultsLine[] {
  const byId = new Map(periods.map((p) => [p.period_id, p]));
  const out: ResultsLine[] = [];
  for (const w of weekly) {
    const p = byId.get(w.period_id);
    const { articulo, categoria } = parseFlight(w.flight);
    const adj = adjusted?.get(w.weekly_result_key_hash);
    out.push({
      weekly_result_id: w.weekly_result_key_hash,
      period_id: w.period_id,
      period_code: p?.code ?? w.period_id,
      period_label: p ? `${p.code} · ${p.start_date}` : w.period_id,
      period_start: p?.start_date ?? '',
      month: p?.month ?? 0,
      quarter: p?.quarter ?? 0,
      year: p?.year ?? 0,
      cliente: (w.advertiser ?? '').trim() || '(sin cliente)',
      campaign: w.campaign,
      campaign_id: w.campaign_id,
      flight: w.flight,
      articulo,
      categoria,
      creative: w.creative,
      device: w.device,
      site: (w.site ?? '').trim() || '(sin site)',
      impressions: w.impressions,
      impressions_estimated: w.impressions_estimated,
      impressions_effective: w.impressions_effective,
      clicks: w.unique_clicks,
      raw_clicks: w.clicks,
      filtered_clicks: w.filtered_clicks,
      suspicious_clicks: w.suspicious_clicks,
      adjusted_impressions: adj?.impressions ?? w.impressions,
      adjusted_clicks: adj?.unique_clicks ?? w.unique_clicks,
      has_adjustment: adj !== undefined,
    });
  }
  return out;
}

/** Vista de resultados: real Kevel, efectiva (con estimadas) o ajustada (§16). */
export type ResultsView = 'real' | 'effective' | 'adjusted';

export function impressionsOf(line: ResultsLine, view: ResultsView): number {
  if (view === 'effective') return line.impressions_effective;
  if (view === 'adjusted') return line.adjusted_impressions;
  return line.impressions;
}

/** Clics según la vista (ajustada usa los clics ajustados; el resto, únicos reales). */
export function clicksOf(line: ResultsLine, view: ResultsView): number {
  return view === 'adjusted' ? line.adjusted_clicks : line.clicks;
}

function ctr(clicks: number, impressions: number): number {
  return impressions > 0 ? clicks / impressions : 0;
}

export interface ResultsKpis {
  impressions: number;
  impressionsEstimated: number;
  clicks: number;
  ctr: number;
  clientes: number;
  campanas: number;
  articulos: number;
  categorias: number;
  periodos: number;
  filteredClicks: number;
  suspiciousClicks: number;
}

export function computeResultsKpis(lines: readonly ResultsLine[], view: ResultsView): ResultsKpis {
  const clientes = new Set<string>();
  const campanas = new Set<string>();
  const articulos = new Set<string>();
  const categorias = new Set<string>();
  const periodos = new Set<string>();
  let impressions = 0;
  let impressionsEstimated = 0;
  let clicks = 0;
  let filteredClicks = 0;
  let suspiciousClicks = 0;

  for (const l of lines) {
    const imp = impressionsOf(l, view);
    impressions += imp;
    impressionsEstimated += l.impressions_estimated;
    clicks += clicksOf(l, view);
    filteredClicks += l.filtered_clicks;
    suspiciousClicks += l.suspicious_clicks;
    if (imp > 0 || clicksOf(l, view) > 0) {
      clientes.add(l.cliente);
      campanas.add(l.campaign_id || l.campaign);
      articulos.add(l.articulo);
      categorias.add(l.categoria);
      periodos.add(l.period_id);
    }
  }
  return {
    impressions,
    impressionsEstimated,
    clicks,
    ctr: ctr(clicks, impressions),
    clientes: clientes.size,
    campanas: campanas.size,
    articulos: articulos.size,
    categorias: categorias.size,
    periodos: periodos.size,
    filteredClicks,
    suspiciousClicks,
  };
}

/** Evolución por periodo (cronológica) con marca de picos. */
export interface PeriodPoint {
  period_id: string;
  code: string;
  sortKey: string;
  impressions: number;
  clicks: number;
  ctr: number;
  isPeakClicks: boolean;
  isPeakImpressions: boolean;
}

export function computePeriodTrend(lines: readonly ResultsLine[], view: ResultsView): PeriodPoint[] {
  const byPeriod = new Map<string, { code: string; sortKey: string; impressions: number; clicks: number }>();
  for (const l of lines) {
    const cur = byPeriod.get(l.period_id) ?? { code: l.period_code, sortKey: l.period_start || l.period_code, impressions: 0, clicks: 0 };
    cur.impressions += impressionsOf(l, view);
    cur.clicks += clicksOf(l, view);
    byPeriod.set(l.period_id, cur);
  }
  const points = [...byPeriod.entries()]
    .map(([period_id, v]) => ({
      period_id,
      code: v.code,
      sortKey: v.sortKey,
      impressions: v.impressions,
      clicks: v.clicks,
      ctr: ctr(v.clicks, v.impressions),
      isPeakClicks: false,
      isPeakImpressions: false,
    }))
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  const maxClicks = Math.max(0, ...points.map((p) => p.clicks));
  const maxImpr = Math.max(0, ...points.map((p) => p.impressions));
  for (const p of points) {
    p.isPeakClicks = maxClicks > 0 && p.clicks === maxClicks;
    p.isPeakImpressions = maxImpr > 0 && p.impressions === maxImpr;
  }
  return points;
}

/** Ranking genérico por una dimensión, ordenado por clics (desc). */
export interface RankItem {
  key: string;
  impressions: number;
  clicks: number;
  ctr: number;
}

export function rankBy(
  lines: readonly ResultsLine[],
  keyOf: (l: ResultsLine) => string,
  view: ResultsView,
): RankItem[] {
  const byKey = new Map<string, { impressions: number; clicks: number }>();
  for (const l of lines) {
    const k = keyOf(l) || '(sin dato)';
    const cur = byKey.get(k) ?? { impressions: 0, clicks: 0 };
    cur.impressions += impressionsOf(l, view);
    cur.clicks += clicksOf(l, view);
    byKey.set(k, cur);
  }
  return [...byKey.entries()]
    .map(([key, v]) => ({ key, impressions: v.impressions, clicks: v.clicks, ctr: ctr(v.clicks, v.impressions) }))
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions || a.key.localeCompare(b.key, 'es'));
}

/** Distribución por dispositivo. */
export interface DeviceSlice {
  device: ResultDevice;
  impressions: number;
  clicks: number;
}
export function computeByDevice(lines: readonly ResultsLine[], view: ResultsView): DeviceSlice[] {
  const order: ResultDevice[] = ['app', 'mobile', 'desktop', 'unknown'];
  const byDev = new Map<ResultDevice, DeviceSlice>();
  for (const l of lines) {
    const cur = byDev.get(l.device) ?? { device: l.device, impressions: 0, clicks: 0 };
    cur.impressions += impressionsOf(l, view);
    cur.clicks += clicksOf(l, view);
    byDev.set(l.device, cur);
  }
  return [...byDev.values()].sort((a, b) => order.indexOf(a.device) - order.indexOf(b.device));
}
