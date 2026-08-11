/**
 * Normalización defensiva EN MEMORIA de La Comer (§6) — nunca escribe Firestore.
 *
 * La Comer carga periodos diarios que son FECHAS DE ACTIVACIÓN, no líneas
 * operativas independientes. Aquí se agrupan las líneas por:
 *
 *   cliente/campaña + artículo/placement + Creatividad ID
 *
 * de modo que:
 *  - Un artículo con CARRUSEL HOME y otro con SPONSORED PRODUCT → dos espacios.
 *  - Veinte periodos diarios del mismo artículo y Creatividad ID → una sola
 *    creatividad.
 *  - Un cambio de Creatividad ID → otra línea.
 *  - Título, descripción, periodo diario y fechas de fijación/retirada NO
 *    separan la identidad usada por el dashboard.
 *
 * Las fechas se consolidan en `activationDates` respetando huecos reales (no se
 * asume activación en fechas intermedias no declaradas). Cuando no existe
 * `activation_dates` en datos históricos, se derivan de `periodo_original`,
 * `periodo_inicio` y `periodo_fin`.
 *
 * Los checks se consolidan tomando, por cada check, el valor de la actualización
 * más reciente (`checks.<key>.updated_at`; si falta, el `updated_at` de la
 * operación). Se conserva `legacyLineIds` para historial y drill-down.
 */

import { CHECK_KEYS, initialCheckValues, type CheckKey, type CheckValues } from '@/domain/progress';
import { requiredChecksForLine } from '@/domain/operation-rules';
import { adapterForLine } from '@/domain/retailers/registry';
import { sortUniqueDates } from '@/domain/retailers/period-formatting';
import { periodDatesOf } from '@/pages/campaigns/ecommerceEmail';
import { addDaysIso, mexicoCityDate } from './time';
import { splitApplicableChecks } from './checks';
import type { DashboardCreative, RawDashboardLine } from './types';

const EM_DASH = '—';

/** Artículo derivado del placement ("CADENA / ARTÍCULO" → "ARTÍCULO"). */
function articleFromPlacement(name: string | null | undefined): string {
  const value = (name ?? '').trim();
  const sep = value.indexOf(' / ');
  return (sep >= 0 ? value.slice(sep + 3) : value).trim();
}

function ruleLine(line: RawDashboardLine) {
  return {
    tipo_operacion: line.tipoOperacion,
    retailer_id: line.retailerId,
    cadena: line.cadena,
    placement_name_snapshot: line.placementNameSnapshot ?? '',
  };
}

/** ¿La línea corresponde a un retailer que consolida por rango de campaña (La Comer)? */
export function isCampaignRangeLine(line: RawDashboardLine): boolean {
  return adapterForLine(ruleLine(line)).identityStrategy === 'campaign_range';
}

/** Expande un rango ISO [start,end] a sus días (declarados). Cap defensivo. */
function expandIsoRange(start: string, end: string): string[] {
  const s = sortUniqueDates([start, end]);
  if (s.length === 0) return [];
  const from = s[0]!;
  const to = s[s.length - 1]!;
  const out: string[] = [];
  let cur = from;
  for (let i = 0; i < 400 && cur !== '' && cur <= to; i += 1) {
    out.push(cur);
    cur = addDaysIso(cur, 1);
  }
  return out;
}

/**
 * Fechas de activación DECLARADAS por una sola línea (día a día). Prioridad:
 * `activation_dates` → `periodo_original` (formato fecha) → `periodo_inicio/fin`
 * → fijación. Nunca inventa días intermedios no declarados.
 */
export function lineActivationDates(line: RawDashboardLine): string[] {
  const explicit = sortUniqueDates(line.activationDates ?? []);
  if (explicit.length) return explicit;
  const fromLabel = periodDatesOf(line.periodoOriginal ?? '');
  if (fromLabel.length) return fromLabel;
  if (line.periodoInicio && line.periodoFin) return expandIsoRange(line.periodoInicio, line.periodoFin);
  if (line.periodoInicio) return sortUniqueDates([line.periodoInicio]);
  return line.fechaFijacion ? sortUniqueDates([line.fechaFijacion]) : [];
}

/** Ventana operativa de una línea NO consolidada (general): activación→periodo→fijación. */
function generalWindow(line: RawDashboardLine): { start: string; end: string } {
  return {
    start: line.activationStart ?? line.periodoInicio ?? line.fechaFijacion ?? '',
    end: line.activationEnd ?? line.periodoFin ?? line.fechaRetirada ?? '',
  };
}

/** Clave de consolidación de La Comer: campaña + artículo/placement + Creatividad ID. */
function groupKeyFor(line: RawDashboardLine): string {
  const base =
    line.campaignGroupId ||
    `${line.clienteKey}#${line.numeroCampana.trim().toLowerCase()}`;
  return `${base}||${line.placementId}||${line.creatividadIdKey}`;
}

interface CheckWinner {
  value: boolean;
  ts: number | null;
  hasKeyTs: boolean;
}

/**
 * Consolida los checks de un conjunto de líneas: por cada check gana el valor de
 * la actualización más reciente. Devuelve también la fecha (MX) de completado.
 */
export function consolidateChecks(lines: readonly RawDashboardLine[]): {
  checks: CheckValues;
  checkDates: Partial<Record<CheckKey, string>>;
} {
  const checks = initialCheckValues();
  const checkDates: Partial<Record<CheckKey, string>> = {};

  for (const key of CHECK_KEYS) {
    let best: CheckWinner | null = null;
    for (const line of lines) {
      const c = line.checks[key];
      const hasKeyTs = c?.updatedAtMs != null;
      const ts = c?.updatedAtMs ?? line.operationUpdatedAtMs ?? null;
      const value = c?.value ?? false;
      if (best === null) {
        best = { value, ts, hasKeyTs };
        continue;
      }
      const bt = best.ts ?? Number.NEGATIVE_INFINITY;
      const ct = ts ?? Number.NEGATIVE_INFINITY;
      if (ct > bt) {
        best = { value, ts, hasKeyTs };
      } else if (ct === bt) {
        // Empate de timestamp: preferir marca específica y luego el completado.
        if ((hasKeyTs && !best.hasKeyTs) || (hasKeyTs === best.hasKeyTs && value && !best.value)) {
          best = { value, ts, hasKeyTs };
        }
      }
    }
    checks[key] = best?.value ?? false;
    if (checks[key] && best?.ts != null) {
      checkDates[key] = mexicoCityDate(best.ts);
    }
  }

  return { checks, checkDates };
}

function representativeLine(lines: readonly RawDashboardLine[]): RawDashboardLine {
  // La más reciente por fijación: identifica mejor la línea vigente para el
  // drill-down puntual. Empate → la última del arreglo.
  return lines.reduce((best, l) => (l.fechaFijacion >= best.fechaFijacion ? l : best), lines[0]!);
}

function buildCreative(id: string, lines: readonly RawDashboardLine[]): DashboardCreative {
  const rep = representativeLine(lines);
  const isLaComer = isCampaignRangeLine(rep);

  let activationDates: string[];
  let activationStart: string;
  let activationEnd: string;
  if (isLaComer) {
    activationDates = sortUniqueDates(lines.flatMap(lineActivationDates));
    activationStart = activationDates[0] ?? rep.fechaFijacion;
    activationEnd = activationDates[activationDates.length - 1] ?? rep.fechaRetirada;
  } else {
    const win = generalWindow(rep);
    activationDates = [];
    activationStart = win.start;
    activationEnd = win.end;
  }

  const { checks, checkDates } = consolidateChecks(lines);
  const applicableAll = [...requiredChecksForLine(ruleLine(rep))];
  const { preparation, closing } = splitApplicableChecks(applicableAll);

  return {
    id,
    campaignLineId: rep.campaignLineId,
    legacyLineIds: lines.map((l) => l.campaignLineId),
    clienteKey: rep.clienteKey,
    clienteOriginal: rep.clienteOriginal,
    campaignGroupId: rep.campaignGroupId,
    numeroCampana: rep.numeroCampana,
    placementId: rep.placementId,
    article: articleFromPlacement(rep.placementNameSnapshot) || EM_DASH,
    creatividadIdKey: rep.creatividadIdKey,
    creatividadIdOriginal: rep.creatividadIdOriginal,
    cadena: rep.cadena,
    tipoOperacion: rep.tipoOperacion,
    retailerId: rep.retailerId,
    isLaComer,
    cancelled: lines.every((l) => l.cancelled),
    activationDates,
    activationStart,
    activationEnd,
    checks,
    checkDates,
    applicablePrep: preparation,
    applicableClosing: closing,
    applicableAll,
  };
}

/**
 * Consolida las líneas crudas en creatividades. Las líneas La Comer (rango de
 * campaña) se agrupan por campaña+artículo+Creatividad ID; el resto es una
 * creatividad por línea. Nunca escribe en Firestore.
 */
export function consolidateCreatives(lines: readonly RawDashboardLine[]): DashboardCreative[] {
  const groups = new Map<string, RawDashboardLine[]>();
  for (const line of lines) {
    // Solo La Comer (campaign_range) consolida; el resto queda 1:1 por línea.
    const key = isCampaignRangeLine(line) ? groupKeyFor(line) : `line::${line.campaignLineId}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(line);
    else groups.set(key, [line]);
  }
  return [...groups.entries()].map(([id, groupLines]) => buildCreative(id, groupLines));
}
