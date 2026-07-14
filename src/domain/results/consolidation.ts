/**
 * Consolidación semanal (§11). Puro y testeable.
 *
 * Agrupa las filas diarias por clave semanal (period_id + dimensiones), SUMA las
 * métricas absolutas y RECALCULA los ratios (nunca promedia CTR, §11). Incluye
 * reconciliación daily↔weekly.
 */

import type { IsoDate } from '@/lib/dates';
import type { ResultDevice } from '@/types/results';
import { weeklyKey } from './identity';
import type { EnrichedResultRow } from './kevel-validation';

export interface WeeklyResult {
  weekly_result_key_hash: string;
  weekly_result_key_raw: string;
  period_id: string;

  campaign_id: string;
  flight_id: string;
  creative_id: string;
  ad_type_id: string;
  site_id: string;
  zone_id: string;
  ad_id: string;
  advertiser_id: string;

  advertiser: string;
  campaign: string;
  flight: string;
  creative: string;
  ad_type: string;
  site: string;
  zone: string;
  device: ResultDevice;

  impressions: number;
  clicks: number;
  unique_clicks: number;
  unfiltered_impressions: number;
  unfiltered_clicks: number;
  invalid_ua_impressions: number;
  invalid_ua_clicks: number;
  test_clicks: number;
  duplicate_impression_clicks: number;
  duplicate_ip_clicks: number;
  suspicious_clicks: number;

  ctr: number;
  unique_ctr: number;
  filtered_clicks: number;

  revenue: number;
  gmv: number;

  delivery_days: number;
  first_delivery_date: IsoDate | null;
  last_delivery_date: IsoDate | null;
  source_result_count: number;
  source_import_ids: string[];
}

const ABS_FIELDS = [
  'impressions',
  'clicks',
  'unique_clicks',
  'unfiltered_impressions',
  'unfiltered_clicks',
  'invalid_ua_impressions',
  'invalid_ua_clicks',
  'test_clicks',
  'duplicate_impression_clicks',
  'duplicate_ip_clicks',
  'suspicious_clicks',
] as const;

export interface Reconciliation {
  ok: boolean;
  diffs: Partial<Record<(typeof ABS_FIELDS)[number], { daily: number; weekly: number }>>;
}

export interface ConsolidationResult {
  weekly: WeeklyResult[];
  reconciliation: Reconciliation;
}

/**
 * Consolida filas diarias enriquecidas en resultados semanales para los periodos
 * afectados. `importId` se añade a `source_import_ids`.
 */
export function consolidateWeekly(
  enriched: readonly EnrichedResultRow[],
  importId: string,
): ConsolidationResult {
  const groups = new Map<string, WeeklyResult>();
  const deliveryDates = new Map<string, Set<IsoDate>>();

  for (const e of enriched) {
    if (e.period_id === '') continue; // sin periodo no se consolida (ya es bloqueante)
    const r = e.row;
    const key = weeklyKey(e.period_id, r);
    let w = groups.get(key.weekly_result_key_hash);
    if (!w) {
      w = {
        weekly_result_key_hash: key.weekly_result_key_hash,
        weekly_result_key_raw: key.weekly_result_key_raw,
        period_id: e.period_id,
        campaign_id: r.campaign_id,
        flight_id: r.flight_id,
        creative_id: r.creative_id,
        ad_type_id: r.ad_type_id,
        site_id: r.site_id,
        zone_id: r.zone_id,
        ad_id: r.ad_id,
        advertiser_id: r.advertiser_id,
        advertiser: r.advertiser,
        campaign: r.campaign,
        flight: r.flight,
        creative: r.creative,
        ad_type: r.ad_type,
        site: r.site,
        zone: r.zone,
        device: r.device,
        impressions: 0,
        clicks: 0,
        unique_clicks: 0,
        unfiltered_impressions: 0,
        unfiltered_clicks: 0,
        invalid_ua_impressions: 0,
        invalid_ua_clicks: 0,
        test_clicks: 0,
        duplicate_impression_clicks: 0,
        duplicate_ip_clicks: 0,
        suspicious_clicks: 0,
        ctr: 0,
        unique_ctr: 0,
        filtered_clicks: 0,
        revenue: 0,
        gmv: 0,
        delivery_days: 0,
        first_delivery_date: null,
        last_delivery_date: null,
        source_result_count: 0,
        source_import_ids: [importId],
      };
      groups.set(key.weekly_result_key_hash, w);
      deliveryDates.set(key.weekly_result_key_hash, new Set());
    }

    for (const f of ABS_FIELDS) w[f] += r[f];
    w.revenue += r.revenue ?? 0;
    w.gmv += r.gmv ?? 0;
    w.source_result_count += 1;
    if (r.impressions > 0 && r.date) deliveryDates.get(key.weekly_result_key_hash)!.add(r.date);
  }

  // Cierre: ratios recalculados, filtered_clicks y ventana de entrega.
  for (const [hash, w] of groups) {
    w.ctr = w.impressions > 0 ? w.clicks / w.impressions : 0;
    w.unique_ctr = w.impressions > 0 ? w.unique_clicks / w.impressions : 0;
    w.filtered_clicks = w.unfiltered_clicks - w.clicks;
    const days = [...(deliveryDates.get(hash) ?? new Set<IsoDate>())].sort();
    w.delivery_days = days.length;
    w.first_delivery_date = days[0] ?? null;
    w.last_delivery_date = days[days.length - 1] ?? null;
  }

  // Reconciliación daily ↔ weekly para métricas absolutas.
  const diffs: Reconciliation['diffs'] = {};
  for (const f of ABS_FIELDS) {
    const dailyTotal = enriched.reduce((acc, e) => (e.period_id ? acc + e.row[f] : acc), 0);
    const weeklyTotal = [...groups.values()].reduce((acc, w) => acc + w[f], 0);
    if (dailyTotal !== weeklyTotal) diffs[f] = { daily: dailyTotal, weekly: weeklyTotal };
  }

  return {
    weekly: [...groups.values()],
    reconciliation: { ok: Object.keys(diffs).length === 0, diffs },
  };
}
