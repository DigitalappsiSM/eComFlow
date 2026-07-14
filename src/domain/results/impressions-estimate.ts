/**
 * Proyección de impresiones (§14) cuando Kevel no las envía (impresiones = 0 con
 * clics > 0). Se estima a partir del **CTR de las líneas CATEGORY BANNER** del
 * mismo periodo (con impresiones reales), usando **Unique Clicks** como base
 * (la misma métrica de clics que usa el reporte consolidado). Solo se guarda en
 * un campo SEPARADO y marcado: la impresión real de Kevel (0) nunca se altera —
 * se conservan las "dos verdades".
 *
 * CTR_ref = Σ(unique_clicks) / Σ(impressions) de CATEGORY BANNER
 * estimación = round(unique_clicks / CTR_ref).
 */

import type { KevelNormalizedRow } from '@/types/results';
import type { EnrichedResultRow } from './kevel-validation';

function norm(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase();
}

/** ¿La línea corresponde a un CATEGORY BANNER (según los textos Kevel)? */
export function isCategoryBanner(row: KevelNormalizedRow): boolean {
  const hay = norm(`${row.ad_type} ${row.ad} ${row.creative} ${row.flight} ${row.campaign}`);
  return hay.includes('CATEGORY BANNER') || hay.includes('CATEGORYBANNER');
}

interface Acc {
  uniqueClicks: number;
  impressions: number;
}

/**
 * Construye el CTR de referencia por periodo: SUM(clics)/SUM(impresiones) de las
 * líneas CATEGORY BANNER con impresiones reales. Cascada de respaldo: CTR global
 * de CATEGORY BANNER → CTR global de todo lo que tenga impresiones. 0 si nada.
 */
export function buildReferenceCtr(enriched: readonly EnrichedResultRow[]): (periodId: string) => number {
  const perPeriodCb = new Map<string, Acc>();
  const globalCb: Acc = { uniqueClicks: 0, impressions: 0 };
  const globalAll: Acc = { uniqueClicks: 0, impressions: 0 };

  for (const e of enriched) {
    const r = e.row;
    if (r.impressions <= 0) continue;
    globalAll.uniqueClicks += r.unique_clicks;
    globalAll.impressions += r.impressions;
    if (isCategoryBanner(r)) {
      globalCb.uniqueClicks += r.unique_clicks;
      globalCb.impressions += r.impressions;
      const g = perPeriodCb.get(e.period_id) ?? { uniqueClicks: 0, impressions: 0 };
      g.uniqueClicks += r.unique_clicks;
      g.impressions += r.impressions;
      perPeriodCb.set(e.period_id, g);
    }
  }

  const ctr = (a: Acc): number => (a.impressions > 0 ? a.uniqueClicks / a.impressions : 0);

  return (periodId: string): number => {
    const p = perPeriodCb.get(periodId);
    if (p && p.impressions > 0) return ctr(p);
    if (globalCb.impressions > 0) return ctr(globalCb);
    return ctr(globalAll);
  };
}

export interface EstimateSummary {
  estimatedRows: number;
  estimatedImpressions: number;
}

/**
 * Rellena `impressions_estimated` de las filas con clics > 0 e impresiones = 0.
 * Muta las filas (más eficiente para miles de filas) y devuelve un resumen.
 */
export function applyImpressionEstimates(enriched: EnrichedResultRow[]): EstimateSummary {
  const refCtr = buildReferenceCtr(enriched);
  let estimatedRows = 0;
  let estimatedImpressions = 0;

  for (const e of enriched) {
    if (e.row.unique_clicks > 0 && e.row.impressions === 0) {
      const ctr = refCtr(e.period_id);
      if (ctr > 0) {
        const est = Math.round(e.row.unique_clicks / ctr);
        e.impressions_estimated = est;
        e.impressions_is_estimated = true;
        estimatedRows += 1;
        estimatedImpressions += est;
      }
    }
  }
  return { estimatedRows, estimatedImpressions };
}
