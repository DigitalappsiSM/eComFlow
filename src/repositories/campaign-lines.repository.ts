/**
 * Repositorio de líneas operativas (§26). Lee EXCLUSIVAMENTE de Firestore.
 *
 * Para el dashboard se cargan las líneas actuales/activas y se proyectan a
 * `MetricLine`. Las métricas se calculan en cliente sobre esa proyección
 * (§54: sin servidor, agregaciones en el navegador).
 */

import {
  collection,
  getDocs,
  limit as fbLimit,
  query,
  where,
} from 'firebase/firestore';
import { requireDb } from '@/lib/firebase';
import { COLLECTIONS } from '@/lib/collections';
import type { CampaignLine } from '@/types/campaign';
import type { MetricLine } from '@/domain/dashboard-metrics';

function toMetricLine(line: CampaignLine): MetricLine {
  return {
    campaignGroupId: line.campaign_group_id,
    campaignSpaceId: line.campaign_space_id,
    campaignLineId: line.campaign_line_id,
    clienteKey: line.cliente_key,
    clienteOriginal: line.cliente_original,
    creatividadIdKey: line.creatividad_id_key,
    placementId: line.placement_id,
    fechaFijacion: line.fecha_fijacion,
    fechaRetirada: line.fecha_retirada,
    isCurrent: line.is_current,
    active: line.active,
    requiredPieces: line.required_pieces ?? 0,
    tipoOperacion: line.tipo_operacion ?? null,
    cadena: line.cadena ?? null,
    periodoOriginal: line.periodo_original ?? null,
    periodoInicio: line.periodo_inicio ?? null,
    periodoFin: line.periodo_fin ?? null,
    tipoCampanaPeriodo: line.tipo_campana_periodo ?? null,
    cancelled: line.cancelled ?? false,
  };
}

/**
 * Carga las líneas actuales y activas para el dashboard. Limitada por defecto
 * para no descargar colecciones completas (§53, §54). Una versión posterior
 * usará agregados precalculados para volúmenes grandes.
 */
export async function fetchActiveLinesForDashboard(
  maxLines = 2000,
): Promise<MetricLine[]> {
  const db = requireDb();
  const q = query(
    collection(db, COLLECTIONS.campaignLines),
    where('active', '==', true),
    where('is_current', '==', true),
    fbLimit(maxLines),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => toMetricLine(d.data() as CampaignLine));
}
