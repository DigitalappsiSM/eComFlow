/**
 * Puente entre Seguimiento operativo y el estado operativo Ecommerce (§11).
 *
 * Mapea una línea + sus checks al modelo del dashboard para poder FILTRAR el
 * seguimiento por el mismo estado operativo que muestran las gráficas. Para
 * agrupaciones históricas de La Comer, esto evalúa la línea fuente individual
 * (el drill-down puede mostrar las líneas fuente); el dashboard consolida.
 */

import type { CampaignLine } from '@/types/campaign';
import { CHECK_KEYS, type CheckValues } from '@/domain/progress';
import {
  consolidateCreatives,
  operationalStatusOf,
  type OperationalStatus,
  type RawDashboardLine,
} from '@/domain/ecommerce-dashboard';

export type { OperationalStatus, DrilldownFilters } from '@/domain/ecommerce-dashboard';

function lineToRaw(line: CampaignLine, checks: CheckValues): RawDashboardLine {
  return {
    campaignLineId: line.campaign_line_id,
    campaignSpaceId: line.campaign_space_id,
    campaignGroupId: line.campaign_group_id,
    clienteKey: line.cliente_key,
    clienteOriginal: line.cliente_original,
    numeroCampana: line.numero_campaña_original ?? '',
    placementId: line.placement_id,
    placementNameSnapshot: line.placement_name_snapshot ?? null,
    creatividadIdKey: line.creatividad_id_key,
    creatividadIdOriginal: line.creatividad_id_original,
    cadena: line.cadena ?? null,
    tipoOperacion: line.tipo_operacion ?? null,
    retailerId: line.retailer_id ?? null,
    activationDates: line.activation_dates ?? null,
    activationStart: line.activation_start ?? null,
    activationEnd: line.activation_end ?? null,
    periodoOriginal: line.periodo_original ?? null,
    periodoInicio: line.periodo_inicio ?? null,
    periodoFin: line.periodo_fin ?? null,
    fechaFijacion: line.fecha_fijacion,
    fechaRetirada: line.fecha_retirada,
    cancelled: line.cancelled ?? false,
    cancelledDates: line.cancelled_dates ?? [],
    cancelledFrom: line.cancelled_from ?? null,
    reactivatedDates: line.reactivated_dates ?? [],
    checks: Object.fromEntries(
      CHECK_KEYS.filter((k) => checks[k]).map((k) => [k, { value: true, updatedAtMs: null }]),
    ),
    operationUpdatedAtMs: null,
  };
}

/** Estado operativo Ecommerce de una sola línea (para filtrar el drill-down). */
export function rowEcommerceStatus(
  line: CampaignLine,
  checks: CheckValues,
  today: string,
): OperationalStatus {
  const [creative] = consolidateCreatives([lineToRaw(line, checks)]);
  return operationalStatusOf(creative!, today);
}
