/**
 * Repositorio del Dashboard de Avance Operativo Ecommerce (§10).
 *
 * Lee EXCLUSIVAMENTE de Firestore. A diferencia del dashboard anterior:
 *  - Consulta únicamente Ecommerce (`tipo_operacion == 'ECOMMERCE'`).
 *  - Elimina el límite arbitrario de 1,500 líneas: pagina hasta recuperar TODAS
 *    las líneas relevantes (`fetchAllPages`).
 *  - Une con `campaign_operations` en lotes seguros de 10.
 *  - Proyecta cada línea a `RawDashboardLine` (timestamps ya como epoch ms) para
 *    que la consolidación y las métricas sean puras y testables.
 *
 * No escribe ni borra datos. No instala listeners de tiempo real.
 */

import {
  collection,
  documentId,
  getDocs,
  limit as fbLimit,
  orderBy,
  query,
  startAfter,
  where,
  type QueryDocumentSnapshot,
  type Timestamp,
} from 'firebase/firestore';
import { requireDb } from '@/lib/firebase';
import { COLLECTIONS } from '@/lib/collections';
import type { CampaignLine } from '@/types/campaign';
import type { CampaignOperation } from '@/types/operations';
import { CHECK_KEYS, type CheckKey } from '@/domain/progress';
import { fetchAllPages, type RawDashboardLine } from '@/domain/ecommerce-dashboard';

export const ECOMMERCE_TIPO_OPERACION = 'ECOMMERCE';
const PAGE_SIZE = 500;
const OPS_BATCH = 10; // límite de Firestore para `in`.

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function tsToMillis(ts: Timestamp | null | undefined): number | null {
  if (!ts || typeof ts.toMillis !== 'function') return null;
  try {
    return ts.toMillis();
  } catch {
    return null;
  }
}

function rawChecksFromOperation(op: CampaignOperation | undefined): RawDashboardLine['checks'] {
  const out: Partial<Record<CheckKey, { value: boolean; updatedAtMs: number | null }>> = {};
  if (!op?.checks) return out;
  for (const key of CHECK_KEYS) {
    const state = op.checks[key];
    if (!state) continue;
    out[key] = { value: state.value ?? false, updatedAtMs: tsToMillis(state.updated_at) };
  }
  return out;
}

function toRawDashboardLine(line: CampaignLine, op: CampaignOperation | undefined): RawDashboardLine {
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
    checks: rawChecksFromOperation(op),
    operationUpdatedAtMs: tsToMillis(op?.updated_at),
  };
}

export interface EcommerceDashboardData {
  lines: RawDashboardLine[];
  /** Total de líneas Ecommerce recuperadas (sin truncar). */
  fetched: number;
  loadedAt: Date;
}

/**
 * Recupera TODAS las líneas Ecommerce activas/vigentes y las une con su
 * operación. Pagina sin truncar (§10). Excluye canceladas en memoria
 * (`cancelled != true`, §2) tras la consulta, para tolerar documentos
 * históricos sin el campo.
 */
export async function fetchEcommerceDashboardLines(): Promise<EcommerceDashboardData> {
  const db = requireDb();

  const fetchPage = async (cursor: QueryDocumentSnapshot | null) => {
    const constraints = [
      where('tipo_operacion', '==', ECOMMERCE_TIPO_OPERACION),
      where('active', '==', true),
      where('is_current', '==', true),
      orderBy('fecha_fijacion', 'asc'),
      fbLimit(PAGE_SIZE),
    ];
    const q = cursor
      ? query(collection(db, COLLECTIONS.campaignLines), ...constraints, startAfter(cursor))
      : query(collection(db, COLLECTIONS.campaignLines), ...constraints);
    const snap = await getDocs(q);
    const items = snap.docs;
    // Cursor null cuando la página no se llenó (no hay más).
    const nextCursor = items.length < PAGE_SIZE ? null : (items[items.length - 1] ?? null);
    return { items, cursor: nextCursor };
  };

  const docs = await fetchAllPages<QueryDocumentSnapshot, QueryDocumentSnapshot>(fetchPage);
  const lines = docs
    .map((d) => d.data() as CampaignLine)
    .filter((l) => l.cancelled !== true);

  // Join con operaciones por id (== campaign_line_id) en lotes de 10, en paralelo.
  const ids = lines.map((l) => l.campaign_line_id);
  const opsById = new Map<string, CampaignOperation>();
  const groups = chunk(ids, OPS_BATCH).filter((g) => g.length > 0);
  const snaps = await Promise.all(
    groups.map((group) =>
      getDocs(query(collection(db, COLLECTIONS.campaignOperations), where(documentId(), 'in', group))),
    ),
  );
  for (const snap of snaps) {
    snap.forEach((d) => opsById.set(d.id, d.data() as CampaignOperation));
  }

  return {
    lines: lines.map((line) => toRawDashboardLine(line, opsById.get(line.campaign_line_id))),
    fetched: lines.length,
    loadedAt: new Date(),
  };
}
