/**
 * Validación de una importación Kevel (§6, §7). Puro y testeable.
 *
 * Cubre las reglas verificables SOLO con el archivo (contrato, rango declarado
 * vs real, periodos, claves diarias duplicadas, IDs, métricas imposibles,
 * CTR recalculado, nombres inconsistentes por ID). Las reglas que dependen de
 * Firestore (file_hash ya procesado, traslape con otra importación, claves ya
 * existentes, mapeos/vínculos) se verifican en el repositorio / fases siguientes.
 */

import type { EcommercePeriod, KevelNormalizedRow, ValidationIssue } from '@/types/results';
import { dailyKey } from './identity';
import { findPeriodForDate } from './periods';

/** Tolerancia para comparar CTR reportado vs recalculado. */
const CTR_TOL_FRACTION = 0.0005; // si CTR viene como fracción (0.0123)
const CTR_TOL_PERCENT = 0.05; // si CTR viene como porcentaje (1.23)

const REQUIRED_ID_FIELDS: { key: keyof KevelNormalizedRow; label: string }[] = [
  { key: 'campaign_id', label: 'CampaignId' },
  { key: 'flight_id', label: 'FlightId' },
  { key: 'creative_id', label: 'CreativeId' },
  { key: 'ad_type_id', label: 'AdTypeId' },
  { key: 'site_id', label: 'SiteId' },
  { key: 'ad_id', label: 'AdId' },
];

const ABSOLUTE_METRICS = [
  'impressions',
  'unfiltered_impressions',
  'invalid_ua_impressions',
  'clicks',
  'invalid_ua_clicks',
  'test_clicks',
  'duplicate_impression_clicks',
  'duplicate_ip_clicks',
  'suspicious_clicks',
  'unique_clicks',
  'unfiltered_clicks',
] as const;

function strongName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

/** Info del número de campaña extraído del texto Campaign (§13). */
export function campaignNumberInfo(campaign: string): {
  number: string | null;
  status: 'ok' | 'none' | 'multiple';
} {
  const text = (campaign ?? '').trim();
  const lead = /^(\d+)/.exec(text);
  const allNums = text.match(/\d+/g) ?? [];
  if (!lead) return { number: null, status: 'none' };
  if (allNums.length > 1) return { number: null, status: 'multiple' };
  return { number: lead[1] ?? null, status: 'ok' };
}

/** CTR/Unique CTR real recalculado desde métricas absolutas. */
export function recalcCtr(clicks: number, impressions: number): number {
  return impressions > 0 ? clicks / impressions : 0;
}

function ctrMatches(reported: number, expected: number): boolean {
  return (
    Math.abs(reported - expected) <= CTR_TOL_FRACTION ||
    Math.abs(reported - expected * 100) <= CTR_TOL_PERCENT
  );
}

/** Fila enriquecida lista para persistir (periodo asignado + clave + CTR real). */
export interface EnrichedResultRow {
  row: KevelNormalizedRow;
  period_id: string;
  result_key_raw: string;
  result_key_hash: string;
  ctr: number;
  unique_ctr: number;
  warnings: string[];
}

export interface KevelValidationInput {
  meta: { declaredStart: string; declaredEnd: string };
  rows: KevelNormalizedRow[];
  periods: readonly EcommercePeriod[];
  /** Issues estructurales previos (del parser). */
  structuralIssues?: ValidationIssue[];
}

export interface KevelValidationResult {
  issues: ValidationIssue[];
  blocks: boolean;
  errorCount: number;
  warningCount: number;
  actualStartDate: string;
  actualEndDate: string;
  periodIds: string[];
  /** Filas agrupadas por clave diaria repetida (mismo cliente/soporte). */
  mergedRows: number;
  enriched: EnrichedResultRow[];
}

function err(
  code: string,
  description: string,
  extra: Partial<ValidationIssue> = {},
): ValidationIssue {
  return {
    severity: 'error',
    code,
    row_number: null,
    field: null,
    received_value: null,
    description,
    suggested_action: 'Corrija el archivo en Kevel y vuelva a exportarlo.',
    blocks_import: true,
    ...extra,
  };
}
function warn(
  code: string,
  description: string,
  extra: Partial<ValidationIssue> = {},
): ValidationIssue {
  return {
    severity: 'warning',
    code,
    row_number: null,
    field: null,
    received_value: null,
    description,
    suggested_action: 'Revise; la importación puede continuar.',
    blocks_import: false,
    ...extra,
  };
}

/** Valida las reglas verificables con el archivo (§6 bloqueantes, §7 advertencias). */
export function validateKevelImport(input: KevelValidationInput): KevelValidationResult {
  const { meta, rows, periods } = input;
  const issues: ValidationIssue[] = [...(input.structuralIssues ?? [])];
  const enriched: EnrichedResultRow[] = [];

  const dates = rows.map((r) => r.date).filter((d) => d !== '');
  const actualStart = dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : '';
  const actualEnd = dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : '';

  // Rango declarado vs real (§6).
  if (meta.declaredStart && actualStart && meta.declaredStart !== actualStart) {
    issues.push(
      err('RANGE_START_MISMATCH', 'El inicio declarado no coincide con la primera fecha de datos.', {
        received_value: `declarado ${meta.declaredStart} · real ${actualStart}`,
      }),
    );
  }
  if (meta.declaredEnd && actualEnd && meta.declaredEnd !== actualEnd) {
    issues.push(
      err('RANGE_END_MISMATCH', 'El fin declarado no coincide con la última fecha de datos.', {
        received_value: `declarado ${meta.declaredEnd} · real ${actualEnd}`,
      }),
    );
  }

  // Nombres inconsistentes por ID (§6 material / §7 solo formato).
  const nameByIdChecks: { idField: keyof KevelNormalizedRow; nameField: keyof KevelNormalizedRow; label: string }[] = [
    { idField: 'campaign_id', nameField: 'campaign', label: 'Campaign' },
    { idField: 'advertiser_id', nameField: 'advertiser', label: 'Advertiser' },
    { idField: 'flight_id', nameField: 'flight', label: 'Flight' },
    { idField: 'creative_id', nameField: 'creative', label: 'Creative' },
    { idField: 'ad_type_id', nameField: 'ad_type', label: 'AdType' },
    { idField: 'site_id', nameField: 'site', label: 'Site' },
  ];
  for (const check of nameByIdChecks) {
    const byId = new Map<string, { raw: Set<string>; strong: Set<string> }>();
    for (const r of rows) {
      const id = String(r[check.idField] ?? '').trim();
      if (id === '') continue;
      const name = String(r[check.nameField] ?? '').trim();
      const entry = byId.get(id) ?? { raw: new Set(), strong: new Set() };
      entry.raw.add(name);
      entry.strong.add(strongName(name));
      byId.set(id, entry);
    }
    for (const [id, entry] of byId) {
      if (entry.strong.size > 1) {
        issues.push(
          err('ID_NAME_CONFLICT', `${check.label}Id ${id} tiene nombres materialmente distintos.`, {
            field: check.label,
            received_value: [...entry.raw].join(' | '),
          }),
        );
      } else if (entry.raw.size > 1) {
        issues.push(
          warn('ID_NAME_FORMAT', `${check.label}Id ${id} tiene el mismo nombre con formato distinto.`, {
            field: check.label,
            received_value: [...entry.raw].join(' | '),
          }),
        );
      }
    }
  }

  // Validación por fila + clave diaria + periodo.
  const enrichedByKey = new Map<string, EnrichedResultRow>();
  let mergedRows = 0;
  for (const r of rows) {
    const rn = r.row_number;
    const rowWarnings: string[] = [];

    // Métricas imposibles o no convertibles (§6).
    for (const m of ABSOLUTE_METRICS) {
      const v = r[m] as number;
      if (!Number.isFinite(v)) {
        issues.push(
          err('METRIC_UNCONVERTIBLE', `No se pudo convertir la métrica ${m} a número.`, {
            row_number: rn,
            field: m,
          }),
        );
      } else if (v < 0) {
        issues.push(
          err('METRIC_NEGATIVE', `La métrica ${m} es negativa (${v}).`, {
            row_number: rn,
            field: m,
            received_value: String(v),
          }),
        );
      }
    }
    if (Number.isFinite(r.unfiltered_impressions) && Number.isFinite(r.impressions) && r.unfiltered_impressions < r.impressions) {
      issues.push(
        err('UNFILTERED_LT_IMPRESSIONS', 'Unfiltered Impressions < Impressions.', {
          row_number: rn,
          received_value: `${r.unfiltered_impressions} < ${r.impressions}`,
        }),
      );
    }
    if (Number.isFinite(r.unfiltered_clicks) && Number.isFinite(r.clicks) && r.unfiltered_clicks < r.clicks) {
      issues.push(
        err('UNFILTERED_LT_CLICKS', 'Unfiltered Clicks < Clicks.', {
          row_number: rn,
          received_value: `${r.unfiltered_clicks} < ${r.clicks}`,
        }),
      );
    }

    // IDs obligatorios (§6).
    for (const f of REQUIRED_ID_FIELDS) {
      if (String(r[f.key] ?? '').trim() === '') {
        issues.push(
          err('MISSING_REQUIRED_ID', `Falta el identificador obligatorio ${f.label}.`, {
            row_number: rn,
            field: f.label,
          }),
        );
      }
    }

    // Fecha sin periodo ecommerce (§6, §10).
    const period = r.date ? findPeriodForDate(r.date, periods) : null;
    if (!r.date) {
      issues.push(err('INVALID_DATE', 'La fecha (Date) es inválida.', { row_number: rn, field: 'Date' }));
    } else if (!period) {
      issues.push(
        err('DATE_WITHOUT_PERIOD', `La fecha ${r.date} no está cubierta por ningún periodo ecommerce.`, {
          row_number: rn,
          field: 'Date',
          received_value: r.date,
          suggested_action: 'Cargue el periodo faltante en ecommerce_periods o corrija la fecha.',
        }),
      );
    }

    // CTR / Unique CTR vs recalculado (§6).
    const ctr = recalcCtr(r.clicks, r.impressions);
    const uctr = recalcCtr(r.unique_clicks, r.impressions);
    if (r.ctr_reported !== null && Number.isFinite(r.clicks) && Number.isFinite(r.impressions) && !ctrMatches(r.ctr_reported, ctr)) {
      issues.push(
        err('CTR_MISMATCH', 'El CTR reportado no coincide con clicks/impressions.', {
          row_number: rn,
          field: 'CTR',
          received_value: `reportado ${r.ctr_reported} · calculado ${ctr.toFixed(6)}`,
        }),
      );
    }
    if (r.unique_ctr_reported !== null && Number.isFinite(r.unique_clicks) && Number.isFinite(r.impressions) && !ctrMatches(r.unique_ctr_reported, uctr)) {
      issues.push(
        err('UNIQUE_CTR_MISMATCH', 'El Unique CTR reportado no coincide con unique_clicks/impressions.', {
          row_number: rn,
          field: 'Unique CTR',
          received_value: `reportado ${r.unique_ctr_reported} · calculado ${uctr.toFixed(6)}`,
        }),
      );
    }

    // --- Advertencias (§7) ---
    if (Number.isFinite(r.clicks) && Number.isFinite(r.impressions)) {
      if (r.clicks > 0 && r.impressions === 0) {
        rowWarnings.push('CLICKS_ZERO_IMPRESSIONS');
        issues.push(warn('CLICKS_ZERO_IMPRESSIONS', 'Hay clics con cero impresiones.', { row_number: rn }));
      } else if (r.clicks > r.impressions) {
        rowWarnings.push('MORE_CLICKS_THAN_IMPRESSIONS');
        issues.push(warn('MORE_CLICKS_THAN_IMPRESSIONS', 'Hay más clics que impresiones.', { row_number: rn }));
      }
    }
    if (period && r.flight_start_date && r.date < r.flight_start_date) {
      rowWarnings.push('DATE_BEFORE_FLIGHT');
      issues.push(warn('DATE_BEFORE_FLIGHT', `La fecha ${r.date} es anterior al inicio del Flight.`, { row_number: rn, field: 'Date' }));
    }
    if (period && r.flight_end_date && r.date > r.flight_end_date) {
      rowWarnings.push('DATE_AFTER_FLIGHT');
      issues.push(warn('DATE_AFTER_FLIGHT', `La fecha ${r.date} es posterior al fin del Flight.`, { row_number: rn, field: 'Date' }));
    }
    // Zone vacío/ZoneId cero NO es incidencia: Soriana no siempre lo envía.
    if (r.device === 'unknown') {
      rowWarnings.push('DEVICE_UNKNOWN');
      issues.push(warn('DEVICE_UNKNOWN', 'No se pudo derivar el dispositivo (AdType/Site/Zone).', { row_number: rn, field: 'AdType' }));
    }
    if (Number.isFinite(r.suspicious_clicks) && r.suspicious_clicks > 0) {
      rowWarnings.push('SUSPICIOUS_CLICKS');
      issues.push(warn('SUSPICIOUS_CLICKS', `Hay ${r.suspicious_clicks} clic(s) sospechoso(s).`, { row_number: rn, field: 'Suspicious Clicks (Bucket)' }));
    }
    const campInfo = campaignNumberInfo(r.campaign);
    if (campInfo.status === 'none') {
      rowWarnings.push('CAMPAIGN_NO_NUMBER');
    } else if (campInfo.status === 'multiple') {
      rowWarnings.push('CAMPAIGN_MULTIPLE_NUMBERS');
    }

    // Clave diaria repetida dentro del archivo: NO es error. Es el mismo
    // cliente/soporte reportado en varias filas (material distinto u otro dato
    // fuera de la clave) → se AGRUPA sumando las métricas (como el importador
    // Ekon agrupa filas de material).
    const key = dailyKey(r);
    const existing = enrichedByKey.get(key.result_key_hash);
    if (existing) {
      mergedRows += 1;
      for (const m of ABSOLUTE_METRICS) existing.row[m] += r[m];
      existing.row.revenue = (existing.row.revenue ?? 0) + (r.revenue ?? 0);
      existing.row.gmv = (existing.row.gmv ?? 0) + (r.gmv ?? 0);
      for (const w of rowWarnings) if (!existing.warnings.includes(w)) existing.warnings.push(w);
    } else {
      enrichedByKey.set(key.result_key_hash, {
        row: r,
        period_id: period?.period_id ?? '',
        result_key_raw: key.result_key_raw,
        result_key_hash: key.result_key_hash,
        ctr,
        unique_ctr: uctr,
        warnings: rowWarnings,
      });
    }
  }

  // Cierre de agrupación: recalcular ratios sobre los totales agrupados.
  for (const e of enrichedByKey.values()) {
    e.ctr = recalcCtr(e.row.clicks, e.row.impressions);
    e.unique_ctr = recalcCtr(e.row.unique_clicks, e.row.impressions);
    enriched.push(e);
  }
  if (mergedRows > 0) {
    issues.push(
      warn(
        'DUPLICATE_DAILY_KEY_MERGED',
        `${mergedRows} fila(s) con la misma clave diaria se agruparon (métricas sumadas).`,
        { received_value: String(mergedRows) },
      ),
    );
  }

  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;
  const periodIds = [...new Set(enriched.map((e) => e.period_id).filter((p) => p !== ''))].sort();

  return {
    issues,
    blocks: errorCount > 0,
    errorCount,
    warningCount,
    actualStartDate: actualStart,
    actualEndDate: actualEnd,
    periodIds,
    mergedRows,
    enriched,
  };
}
