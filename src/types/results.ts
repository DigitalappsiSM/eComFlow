/**
 * Tipos del módulo Resultados Ecommerce (Kevel). Dominio INDEPENDIENTE del
 * operativo (§3): estos tipos nunca se mezclan con los de campañas/operación.
 */

import type { IsoDate } from '@/lib/dates';

export const KEVEL_TEMPLATE_VERSION = 'v1';

/** Severidad de una incidencia de validación (§7). */
export type IssueSeverity = 'error' | 'warning';

/** Incidencia de validación de una importación (§7). */
export interface ValidationIssue {
  severity: IssueSeverity;
  code: string;
  row_number: number | null;
  field: string | null;
  received_value: string | null;
  description: string;
  suggested_action: string;
  blocks_import: boolean;
}

/** Dispositivo derivado (§9). */
export type ResultDevice = 'desktop' | 'mobile' | 'app' | 'unknown';

/** Periodo ecommerce (semana viernes→jueves) del catálogo compartido (§10). */
export interface EcommercePeriod {
  period_id: string;
  code: string; // p. ej. "S29"
  year: number; // año del jueves operativo (§12)
  start_date: IsoDate; // viernes
  end_date: IsoDate; // jueves
  month: number; // 1..12 del jueves
  quarter: number; // 1..4 del jueves
  active: boolean;
}

/** Fila Kevel normalizada (una fila diaria del CSV, ya tipada). */
export interface KevelNormalizedRow {
  row_number: number;
  date: IsoDate;
  advertiser: string;
  campaign: string;
  flight: string;
  ad: string;
  rate_type: string;
  price: number | null;
  creative: string;
  ad_type: string;
  site: string;
  zone: string;
  // Métricas absolutas normalizadas.
  impressions: number;
  unfiltered_impressions: number;
  invalid_ua_impressions: number;
  clicks: number;
  invalid_ua_clicks: number;
  test_clicks: number;
  duplicate_impression_clicks: number;
  duplicate_ip_clicks: number;
  suspicious_clicks: number;
  unique_clicks: number;
  unfiltered_clicks: number;
  // Ratios reportados por Kevel (se validan, no se confía en ellos para sumar).
  ctr_reported: number | null;
  unique_ctr_reported: number | null;
  cvr: number | null;
  cvr_impressions: number | null;
  cvr_clicks: number | null;
  cpc: number | null;
  revenue: number | null;
  gmv: number | null;
  ecpm: number | null;
  roas: number | null;
  // Identificadores.
  campaign_id: string;
  flight_id: string;
  flight_start_date: IsoDate | null;
  flight_end_date: IsoDate | null;
  advertiser_id: string;
  creative_id: string;
  ad_type_id: string;
  site_id: string;
  zone_id: string;
  ad_id: string;
  // Derivados.
  device: ResultDevice;
}

/** Estado de una importación de resultados (§8, §26). */
export type ResultsImportStatus = 'validating' | 'ready' | 'writing' | 'completed' | 'failed';

export interface ResultsImportMeta {
  results_import_id: string;
  file_name: string;
  file_hash: string;
  template_version: string;
  declared_start_date: IsoDate;
  declared_end_date: IsoDate;
  actual_start_date: IsoDate;
  actual_end_date: IsoDate;
  period_ids: string[];
  status: ResultsImportStatus;
  total_rows: number;
  error_count: number;
  warning_count: number;
}
