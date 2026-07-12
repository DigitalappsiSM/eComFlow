/**
 * Seguimiento operativo (§12, §13, §24, §41). Lee y escribe EN Firestore.
 *
 * Cada cambio operativo (check, responsable, comentario) se escribe junto con
 * su registro de auditoría en el MISMO lote lógico (§24). El avance se recalcula
 * automáticamente; nunca se captura a mano (§12).
 */

import {
  collection,
  doc,
  documentId,
  getDocs,
  limit as fbLimit,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  where,
  writeBatch,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { requireDb } from '@/lib/firebase';
import { COLLECTIONS } from '@/lib/collections';
import {
  computeProgress,
  initialCheckValues,
  type CheckKey,
  type CheckValues,
} from '@/domain/progress';
import { requiredChecksForLine } from '@/domain/operation-rules';
import type { CampaignLine } from '@/types/campaign';
import type { CampaignComment, CampaignOperation } from '@/types/operations';
import type { ChangeHistoryEntry } from '@/types/audit';

export interface OperationRow {
  line: CampaignLine;
  operationId: string;
  checks: CheckValues;
  responsable: string | null;
  progress: number;
  comentarios: string;
}

export interface OperationsPage {
  rows: OperationRow[];
  cursor: QueryDocumentSnapshot | null;
  hasMore: boolean;
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

/** Página de líneas operativas con su operación asociada (join por id). */
export async function fetchOperationsPage(
  pageSize: number,
  cursor: QueryDocumentSnapshot | null = null,
): Promise<OperationsPage> {
  const db = requireDb();
  const constraints = [
    where('active', '==', true),
    where('is_current', '==', true),
    orderBy('fecha_fijacion', 'desc'),
    fbLimit(pageSize + 1),
  ];
  const q = cursor
    ? query(collection(db, COLLECTIONS.campaignLines), ...constraints, startAfter(cursor))
    : query(collection(db, COLLECTIONS.campaignLines), ...constraints);

  const snap = await getDocs(q);
  const docs = snap.docs.slice(0, pageSize);
  const hasMore = snap.docs.length > pageSize;
  const lines = docs.map((d) => d.data() as CampaignLine);

  // Operaciones por id (== campaign_line_id) en lotes de 10.
  const ids = lines.map((l) => l.campaign_line_id);
  const opsById = new Map<string, CampaignOperation>();
  for (const group of chunk(ids, 10)) {
    if (group.length === 0) continue;
    const opsSnap = await getDocs(
      query(collection(db, COLLECTIONS.campaignOperations), where(documentId(), 'in', group)),
    );
    opsSnap.forEach((d) => opsById.set(d.id, d.data() as CampaignOperation));
  }

  const rows: OperationRow[] = lines.map((line) => {
    const op = opsById.get(line.campaign_line_id);
    const checks = checksFromOperation(op);
    return {
      line,
      operationId: line.campaign_line_id,
      checks,
      responsable: op?.responsable_operativo ?? null,
      progress: computeProgress(checks, requiredChecksForLine(line)),
      comentarios: op?.comentarios ?? '',
    };
  });

  return { rows, cursor: docs.at(-1) ?? null, hasMore };
}

export interface EntityIds {
  campaign_line_id: string;
  campaign_space_id: string;
  campaign_group_id: string;
}

interface AuditActor {
  uid: string;
  email: string;
}

function historyData(
  db: ReturnType<typeof requireDb>,
  ids: EntityIds,
  actor: AuditActor,
  changeType: ChangeHistoryEntry['change_type'],
  origin: ChangeHistoryEntry['origin'],
  fieldName: string | null,
  previous: unknown,
  next: unknown,
) {
  const id = doc(collection(db, COLLECTIONS.changeHistory)).id;
  return {
    ref: doc(db, COLLECTIONS.changeHistory, id),
    data: {
      change_id: id,
      entity_type: 'campaign_operation',
      entity_id: ids.campaign_line_id,
      campaign_group_id: ids.campaign_group_id,
      campaign_space_id: ids.campaign_space_id,
      campaign_line_id: ids.campaign_line_id,
      import_id: null,
      change_type: changeType,
      field_name: fieldName,
      previous_value: previous,
      new_value: next,
      origin,
      created_at: serverTimestamp(),
      created_by: actor.uid,
      created_by_email: actor.email,
    },
  };
}

/** Cambia un check, recalcula el avance y audita, todo en un lote (§12, §24). */
export async function updateCheck(
  ids: EntityIds,
  currentChecks: CheckValues,
  key: CheckKey,
  newValue: boolean,
  actor: AuditActor,
  requiredChecks?: readonly CheckKey[],
): Promise<number> {
  const db = requireDb();
  const nextChecks: CheckValues = { ...currentChecks, [key]: newValue };
  const progress = computeProgress(nextChecks, requiredChecks);

  const batch = writeBatch(db);
  batch.update(doc(db, COLLECTIONS.campaignOperations, ids.campaign_line_id), {
    [`checks.${key}`]: { value: newValue, updated_at: serverTimestamp(), updated_by: actor.uid },
    porcentaje_avance: progress,
    updated_at: serverTimestamp(),
    updated_by: actor.uid,
  });
  const hist = historyData(db, ids, actor, 'check_changed', 'manual_operation', key, !newValue, newValue);
  batch.set(hist.ref, hist.data);
  await batch.commit();
  return progress;
}

/** Asigna responsable operativo y audita (§24). */
export async function assignResponsable(
  ids: EntityIds,
  previous: string | null,
  responsable: string | null,
  actor: AuditActor,
): Promise<void> {
  const db = requireDb();
  const batch = writeBatch(db);
  batch.update(doc(db, COLLECTIONS.campaignOperations, ids.campaign_line_id), {
    responsable_operativo: responsable,
    updated_at: serverTimestamp(),
    updated_by: actor.uid,
  });
  const hist = historyData(db, ids, actor, 'responsible_changed', 'assignment', 'responsable_operativo', previous, responsable);
  batch.set(hist.ref, hist.data);
  await batch.commit();
}

/** Agrega un comentario (colección independiente, sin sobrescribir) y audita (§13). */
export async function addComment(
  ids: EntityIds,
  comment: string,
  actor: AuditActor,
): Promise<void> {
  const db = requireDb();
  const commentId = doc(collection(db, COLLECTIONS.campaignComments)).id;
  const batch = writeBatch(db);
  batch.set(doc(db, COLLECTIONS.campaignComments, commentId), {
    comment_id: commentId,
    campaign_line_id: ids.campaign_line_id,
    campaign_space_id: ids.campaign_space_id,
    campaign_group_id: ids.campaign_group_id,
    comment,
    created_at: serverTimestamp(),
    created_by: actor.uid,
    edited_at: null,
    edited_by: null,
    active: true,
  });
  const hist = historyData(db, ids, actor, 'comment_added', 'comment', null, null, comment);
  batch.set(hist.ref, hist.data);
  await batch.commit();
}

/** Baja lógica de un comentario (active=false) + auditoría (§13). */
export async function archiveComment(
  commentId: string,
  ids: EntityIds,
  actor: AuditActor,
): Promise<void> {
  const db = requireDb();
  const batch = writeBatch(db);
  batch.update(doc(db, COLLECTIONS.campaignComments, commentId), {
    active: false,
    edited_at: serverTimestamp(),
    edited_by: actor.uid,
  });
  const hist = historyData(db, ids, actor, 'comment_archived', 'comment', 'active', true, false);
  batch.set(hist.ref, hist.data);
  await batch.commit();
}

export async function fetchComments(lineId: string): Promise<CampaignComment[]> {
  const db = requireDb();
  const q = query(
    collection(db, COLLECTIONS.campaignComments),
    where('campaign_line_id', '==', lineId),
    where('active', '==', true),
    orderBy('created_at', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as CampaignComment);
}

export async function fetchLineHistory(lineId: string, max = 50): Promise<ChangeHistoryEntry[]> {
  const db = requireDb();
  const q = query(
    collection(db, COLLECTIONS.changeHistory),
    where('campaign_line_id', '==', lineId),
    orderBy('created_at', 'desc'),
    fbLimit(max),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as ChangeHistoryEntry);
}
