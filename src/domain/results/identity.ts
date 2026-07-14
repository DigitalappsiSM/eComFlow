/**
 * Identidad determinista de resultados (§8, §11). Claves de línea diaria y
 * semanal usadas como IDs de documento (idempotencia e integridad).
 */

import { stableHash } from '@/lib/hashing';
import type { KevelNormalizedRow } from '@/types/results';

const SEP = '|';

/** Dimensiones que identifican una línea (sin la fecha ni el periodo). */
function dimensionKey(row: Pick<
  KevelNormalizedRow,
  'campaign_id' | 'flight_id' | 'creative_id' | 'ad_type_id' | 'site_id' | 'zone_id' | 'ad_id'
>): string {
  return [
    row.campaign_id,
    row.flight_id,
    row.creative_id,
    row.ad_type_id,
    row.site_id,
    row.zone_id,
    row.ad_id,
  ].join(SEP);
}

export interface DailyKey {
  result_key_raw: string;
  result_key_hash: string;
}

/** Clave diaria: Date + CampaignId + FlightId + CreativeId + AdTypeId + SiteId + ZoneId + AdId (§8). */
export function dailyKey(row: KevelNormalizedRow): DailyKey {
  const raw = [row.date, dimensionKey(row)].join(SEP);
  return { result_key_raw: raw, result_key_hash: stableHash(raw) };
}

export interface WeeklyKey {
  weekly_result_key_raw: string;
  weekly_result_key_hash: string;
}

/** Clave semanal: period_id + mismas dimensiones (sin la fecha) (§11). */
export function weeklyKey(
  periodId: string,
  row: Pick<
    KevelNormalizedRow,
    'campaign_id' | 'flight_id' | 'creative_id' | 'ad_type_id' | 'site_id' | 'zone_id' | 'ad_id'
  >,
): WeeklyKey {
  const raw = [periodId, dimensionKey(row)].join(SEP);
  return { weekly_result_key_raw: raw, weekly_result_key_hash: stableHash(raw) };
}
