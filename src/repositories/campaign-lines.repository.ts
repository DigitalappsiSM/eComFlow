/**
 * Repositorio de líneas operativas (§26). Lee EXCLUSIVAMENTE de Firestore.
 *
 * Para el dashboard se cargan las líneas actuales/activas, se unen con su
 * operación (checks) y se proyectan a `MetricLine` con el avance real. Las
 * métricas de cumplimiento se calculan en cliente sobre esa proyección (§54:
 * sin servidor, agregaciones en el navegador).
 */

import {
  collection,
  documentId,
  getDocs,
  limit as fbLimit,
  query,
  where,
  type Timestamp,
} from 'firebase/firestore';
import { requireDb } from '@/lib/firebase';
import { COLLECTIONS } from '@/lib/collections';
import type { CampaignLine } from '@/types/campaign';
import type { CampaignOperation } from '@/types/operations';
import type { MetricLine } from '@/domain/dashboard-metrics';
import {
  computeProgress,
  initialCheckValues,
  type CheckKey,
  type CheckValues,
} from '@/domain/progress';
import { requiredChecksForLine } from '@/domain/operation-rules';

function baseMetricLine(line: CampaignLine): MetricLine {
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

/** Retrocompatibilidad: proyección sin datos operativos. */
function toMetricLine(line: CampaignLine): MetricLine {
  return baseMetricLine(line);
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function checksFromOperation(op: CampaignOperation | undefined): CheckValues {
  const base = initialCheckValues();
  if (!op?.checks) return base;
  (Object.keys(base) as CheckKey[]).forEach((k) => {
    base[k] = op.checks[k]?.value ?? false;
  });
  return base;
}

function tsToIso(ts: Timestamp | null | undefined): string {
  if (!ts || typeof ts.toDate !== 'function') return '';
  try {
    return ts.toDate().toISOString().slice(0, 10);
  } catch {
    return '';
  }
}

/** Enriquece una línea con el avance real de checks de su operación. */
function toOperationalMetricLine(line: CampaignLine, op: CampaignOperation | undefined): MetricLine {
  const metric = baseMetricLine(line);
  const required = requiredChecksForLine(line);
  const checks = checksFromOperation(op);
  const pendingChecks = required.filter((k) => !checks[k]);
  const complete = pendingChecks.length === 0;

  let completedAtIso: string | null = null;
  if (complete && op?.checks) {
    let maxIso = '';
    for (const k of required) {
      const iso = tsToIso(op.checks[k]?.updated_at);
      if (iso > maxIso) maxIso = iso;
    }
    completedAtIso = maxIso || null;
  }

  return {
    ...metric,
    progress: computeProgress(checks, required),
    complete,
    pendingChecks,
    requiredChecksCount: required.length,
    completedAtIso,
    responsable: op?.responsable_operativo ?? null,
  };
}

/**
 * Carga las líneas actuales y activas para el dashboard, SIN datos operativos.
 * Se conserva para consumidores ligeros que no necesitan el avance de checks.
 */
export async function fetchActiveLinesForDashboard(maxLines = 2000): Promise<MetricLine[]> {
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

/**
 * Carga las líneas activas y su operación (checks) para el dashboard de
 * cumplimiento. Une por id (`campaign_line_id`) en lotes de 10 (límite de
 * Firestore para `in`), en paralelo. Limitada por defecto para no descargar
 * colecciones completas (§53, §54).
 */
export async function fetchOperationalLinesForDashboard(maxLines = 1500): Promise<MetricLine[]> {
  const db = requireDb();
  const q = query(
    collection(db, COLLECTIONS.campaignLines),
    where('active', '==', true),
    where('is_current', '==', true),
    fbLimit(maxLines),
  );
  const snap = await getDocs(q);
  const lines = snap.docs.map((d) => d.data() as CampaignLine);

  const ids = lines.map((l) => l.campaign_line_id);
  const opsById = new Map<string, CampaignOperation>();
  const groups = chunk(ids, 10).filter((g) => g.length > 0);
  const results = await Promise.all(
    groups.map((group) =>
      getDocs(
        query(collection(db, COLLECTIONS.campaignOperations), where(documentId(), 'in', group)),
      ),
    ),
  );
  for (const res of results) {
    res.forEach((d) => opsById.set(d.id, d.data() as CampaignOperation));
  }

  return lines.map((line) => toOperationalMetricLine(line, opsById.get(line.campaign_line_id)));
}
