/**
 * Ajustes comerciales (§16–§23). Solo colecciones `results_*`. Los resultados
 * reales NUNCA se tocan: los ajustes viven en sus propias colecciones y las
 * allocations se materializan al aprobar.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import { requireDb } from '@/lib/firebase';
import { COLLECTIONS } from '@/lib/collections';
import {
  allocateProportional,
  buildAdjustedMap,
  scopeIdsHash,
  type AdjustedMap,
  type AdjustmentMetric,
  type AdjustmentOperation,
  type AdjustmentScope,
  type AdjustmentStatus,
  type Allocation,
  type ScopeWeekly,
} from '@/domain/results/adjustments';

interface Actor {
  uid: string;
  email: string;
}

export interface AdjustmentSetDoc {
  adjustment_set_id: string;
  name: string;
  description: string;
  period_ids: string[];
  scope_start_date: string;
  scope_end_date: string;
  status: AdjustmentStatus;
  version: number;
  is_official: boolean;
  active: boolean;
  created_by_email?: string;
}

export interface WeeklyAdjustmentDoc {
  adjustment_id: string;
  adjustment_set_id: string;
  scope: AdjustmentScope;
  metric: AdjustmentMetric;
  operation: AdjustmentOperation;
  period_ids: string[];
  weekly_result_ids: string[];
  weekly_real_total: number;
  requested_adjusted_total: number;
  requested_delta: number;
  reason: string;
  commercial_comment: string;
  reference: string;
  status: AdjustmentStatus;
  scope_ids_hash: string;
  created_by_email?: string;
}

export async function fetchAdjustmentSets(): Promise<AdjustmentSetDoc[]> {
  const db = requireDb();
  const snap = await getDocs(query(collection(db, COLLECTIONS.resultsAdjustmentSets), where('active', '==', true)));
  return snap.docs.map((d) => d.data() as AdjustmentSetDoc);
}

export async function fetchAdjustmentsOfSet(setId: string): Promise<WeeklyAdjustmentDoc[]> {
  const db = requireDb();
  const snap = await getDocs(
    query(collection(db, COLLECTIONS.resultsWeeklyAdjustments), where('adjustment_set_id', '==', setId)),
  );
  return snap.docs.map((d) => d.data() as WeeklyAdjustmentDoc);
}

/** Modelo de lectura ajustado: allocations de los ajustes APROBADOS (§23). */
export async function fetchApprovedAdjustedMap(): Promise<AdjustedMap> {
  const db = requireDb();
  const snap = await getDocs(collection(db, COLLECTIONS.resultsWeeklyAdjustmentAllocations));
  const allocations = snap.docs.map((d) => d.data() as Allocation);
  return buildAdjustedMap(allocations);
}

function auditRef(db: ReturnType<typeof requireDb>, entityId: string, changeType: string, actor: Actor, extra: Record<string, unknown> = {}) {
  const id = doc(collection(db, COLLECTIONS.resultsAdjustmentHistory)).id;
  return {
    ref: doc(db, COLLECTIONS.resultsAdjustmentHistory, id),
    data: {
      change_id: id,
      entity_id: entityId,
      change_type: changeType,
      created_at: serverTimestamp(),
      created_by: actor.uid,
      created_by_email: actor.email,
      ...extra,
    },
  };
}

/** Crea un escenario (set) en borrador (§18). */
export async function createAdjustmentSet(
  input: { name: string; description: string; period_ids: string[]; scope_start_date: string; scope_end_date: string },
  actor: Actor,
): Promise<string> {
  const db = requireDb();
  const id = doc(collection(db, COLLECTIONS.resultsAdjustmentSets)).id;
  const batch = writeBatch(db);
  batch.set(doc(db, COLLECTIONS.resultsAdjustmentSets, id), {
    adjustment_set_id: id,
    name: input.name,
    description: input.description,
    period_ids: input.period_ids,
    scope_start_date: input.scope_start_date,
    scope_end_date: input.scope_end_date,
    status: 'draft',
    version: 1,
    is_official: false,
    active: true,
    created_at: serverTimestamp(),
    created_by: actor.uid,
    created_by_email: actor.email,
    updated_at: serverTimestamp(),
    updated_by: actor.uid,
  });
  const h = auditRef(db, id, 'set_created', actor);
  batch.set(h.ref, h.data);
  await batch.commit();
  return id;
}

/**
 * Crea un ajuste semanal (borrador) con su alcance real. `scope` son los
 * documentos semanales seleccionados con su valor real de la métrica (ya
 * calculado en cliente desde results_weekly).
 */
export async function createWeeklyAdjustment(
  input: {
    adjustment_set_id: string;
    scope: AdjustmentScope;
    metric: AdjustmentMetric;
    operation: AdjustmentOperation;
    period_ids: string[];
    scopeWeekly: ScopeWeekly[];
    requestedAdjustedTotal?: number;
    requestedDelta?: number;
    reason: string;
    commercial_comment: string;
    reference: string;
  },
  actor: Actor,
): Promise<{ id: string }> {
  const db = requireDb();
  // Se valida la distribución antes de guardar (base cero / negativo bloquean).
  const alloc = allocateProportional({
    metric: input.metric,
    operation: input.operation,
    requestedAdjustedTotal: input.requestedAdjustedTotal,
    requestedDelta: input.requestedDelta,
    scope: input.scopeWeekly,
  });
  if (!alloc.ok) throw new Error(alloc.errorMessage ?? 'Ajuste inválido.');

  const id = doc(collection(db, COLLECTIONS.resultsWeeklyAdjustments)).id;
  const ids = input.scopeWeekly.map((s) => s.weekly_result_id);
  const batch = writeBatch(db);
  batch.set(doc(db, COLLECTIONS.resultsWeeklyAdjustments, id), {
    adjustment_id: id,
    adjustment_set_id: input.adjustment_set_id,
    scope: input.scope,
    metric: input.metric,
    operation: input.operation,
    period_ids: input.period_ids,
    weekly_result_ids: ids,
    weekly_real_total: alloc.scopeRealTotal,
    requested_adjusted_total: input.operation === 'override' ? alloc.targetTotal : 0,
    requested_delta: input.operation === 'delta' ? Math.round(input.requestedDelta ?? 0) : 0,
    reason: input.reason,
    commercial_comment: input.commercial_comment,
    reference: input.reference,
    status: 'draft',
    scope_ids_hash: scopeIdsHash(ids),
    scope_weekly_result_count: ids.length,
    created_at: serverTimestamp(),
    created_by: actor.uid,
    created_by_email: actor.email,
    updated_at: serverTimestamp(),
    updated_by: actor.uid,
  });
  const h = auditRef(db, id, 'adjustment_created', actor, { adjustment_set_id: input.adjustment_set_id });
  batch.set(h.ref, h.data);
  await batch.commit();
  return { id };
}

/** Cambia el estado de un set (enviar a aprobación / rechazar / archivar). */
export async function setAdjustmentSetStatus(
  setId: string,
  status: AdjustmentStatus,
  actor: Actor,
): Promise<void> {
  const db = requireDb();
  const batch = writeBatch(db);
  const patch: Record<string, unknown> = { status, updated_at: serverTimestamp(), updated_by: actor.uid };
  if (status === 'pending_approval') {
    patch.submitted_at = serverTimestamp();
    patch.submitted_by = actor.uid;
  }
  if (status === 'rejected') {
    patch.rejected_at = serverTimestamp();
    patch.rejected_by = actor.uid;
  }
  if (status === 'archived') {
    patch.archived_at = serverTimestamp();
    patch.archived_by = actor.uid;
  }
  batch.set(doc(db, COLLECTIONS.resultsAdjustmentSets, setId), patch, { merge: true });
  const h = auditRef(db, setId, `set_${status}`, actor);
  batch.set(h.ref, h.data);
  await batch.commit();
}

/**
 * Aprueba un set: recalcula el alcance real actual, bloquea si cambió, detecta
 * superposición aprobada sobre la misma métrica+documento, materializa las
 * allocations y marca el set aprobado/oficial (§22, §17). `currentScope`
 * provee, por ajuste, el valor real ACTUAL de cada documento del alcance.
 */
export async function approveAdjustmentSet(
  setId: string,
  adjustments: WeeklyAdjustmentDoc[],
  currentScope: Map<string, ScopeWeekly[]>, // adjustment_id -> alcance real actual
  actor: Actor,
): Promise<void> {
  const db = requireDb();

  // Superposición: no dos allocations oficiales sobre la misma métrica+documento.
  const seen = new Set<string>();
  const batch = writeBatch(db);

  for (const adj of adjustments) {
    const scopeNow = currentScope.get(adj.adjustment_id) ?? [];
    const idsNow = scopeNow.map((s) => s.weekly_result_id);
    if (scopeIdsHash(idsNow) !== adj.scope_ids_hash) {
      throw new Error(`El alcance del ajuste ${adj.adjustment_id} cambió desde su creación; recréalo.`);
    }
    const alloc = allocateProportional({
      metric: adj.metric,
      operation: adj.operation,
      requestedAdjustedTotal: adj.operation === 'override' ? adj.requested_adjusted_total : undefined,
      requestedDelta: adj.operation === 'delta' ? adj.requested_delta : undefined,
      scope: scopeNow,
    });
    if (!alloc.ok) throw new Error(alloc.errorMessage ?? `Ajuste ${adj.adjustment_id} inválido.`);

    for (const a of alloc.allocations) {
      const key = `${a.weekly_result_id}|${a.metric}`;
      if (seen.has(key)) {
        throw new Error(`Conflicto: dos ajustes tocan ${a.metric} del mismo resultado semanal.`);
      }
      seen.add(key);
      const allocId = `${adj.adjustment_id}|${a.weekly_result_id}|${a.metric}`;
      batch.set(doc(db, COLLECTIONS.resultsWeeklyAdjustmentAllocations, allocId), {
        ...a,
        allocation_id: allocId,
        adjustment_set_id: setId,
        adjustment_id: adj.adjustment_id,
        period_id: adj.period_ids[0] ?? '',
        allocation_version: 1,
        created_at: serverTimestamp(),
        created_by: actor.uid,
      });
    }
    batch.set(
      doc(db, COLLECTIONS.resultsWeeklyAdjustments, adj.adjustment_id),
      { status: 'approved', updated_at: serverTimestamp(), updated_by: actor.uid },
      { merge: true },
    );
  }

  batch.set(
    doc(db, COLLECTIONS.resultsAdjustmentSets, setId),
    {
      status: 'approved',
      is_official: true,
      approved_at: serverTimestamp(),
      approved_by: actor.uid,
      updated_at: serverTimestamp(),
      updated_by: actor.uid,
    },
    { merge: true },
  );
  const h = auditRef(db, setId, 'set_approved', actor, { allocations: seen.size });
  batch.set(h.ref, h.data);
  await batch.commit();
}

export async function fetchAdjustmentSet(setId: string): Promise<AdjustmentSetDoc | null> {
  const db = requireDb();
  const snap = await getDoc(doc(db, COLLECTIONS.resultsAdjustmentSets, setId));
  return snap.exists() ? (snap.data() as AdjustmentSetDoc) : null;
}
