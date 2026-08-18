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
  runTransaction,
  serverTimestamp,
  startAfter,
  where,
  writeBatch,
  type QueryConstraint,
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
import {
  applyCancellationCommand,
  operationalDatesForLine,
  type CancellationCommand,
  type CancellationPatch,
} from '@/domain/line-cancellation';
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

/** Ventana operativa a consultar (ISO). Acota por la fecha de FIN (retirada). */
export interface OperationsWindow {
  /** Solo líneas cuya retirada es >= a esta fecha (no cargar lo ya cerrado). */
  from: string;
}

/** ¿El error de Firestore es por índice faltante/en construcción? */
function isMissingIndexError(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  const msg = err instanceof Error ? err.message.toLowerCase() : '';
  return code === 'failed-precondition' || msg.includes('requires an index') || msg.includes('index');
}

/**
 * Página de líneas operativas con su operación asociada (join por id).
 *
 * Acota por `window.from` sobre la fecha de RETIRADA (no la de fijación) para no
 * perder campañas continuas: su fijación es antigua pero su retirada sigue
 * vigente. Si el índice `(active, is_current, fecha_retirada)` aún no existe,
 * cae a la consulta amplia por fijación (sin acotar) para no romper la vista
 * mientras el índice se construye; el filtrado fino por rango se hace en cliente.
 */
export async function fetchOperationsPage(
  pageSize: number,
  cursor: QueryDocumentSnapshot | null = null,
  window?: OperationsWindow,
): Promise<OperationsPage> {
  const db = requireDb();

  const runQuery = async (constraints: QueryConstraint[]) => {
    const q = cursor
      ? query(collection(db, COLLECTIONS.campaignLines), ...constraints, startAfter(cursor))
      : query(collection(db, COLLECTIONS.campaignLines), ...constraints);
    return getDocs(q);
  };

  let snap;
  if (window?.from) {
    try {
      snap = await runQuery([
        where('active', '==', true),
        where('is_current', '==', true),
        where('fecha_retirada', '>=', window.from),
        orderBy('fecha_retirada', 'asc'),
        fbLimit(pageSize + 1),
      ]);
    } catch (err) {
      if (!isMissingIndexError(err)) throw err;
      // Fallback sin acotar (índice en construcción): el rango se filtra en cliente.
      snap = await runQuery([
        where('active', '==', true),
        where('is_current', '==', true),
        orderBy('fecha_fijacion', 'desc'),
        fbLimit(pageSize + 1),
      ]);
    }
  } else {
    snap = await runQuery([
      where('active', '==', true),
      where('is_current', '==', true),
      orderBy('fecha_fijacion', 'desc'),
      fbLimit(pageSize + 1),
    ]);
  }

  const docs = snap.docs.slice(0, pageSize);
  const hasMore = snap.docs.length > pageSize;
  const lines = docs.map((d) => d.data() as CampaignLine);

  // Operaciones por id (== campaign_line_id) en lotes de 10, en paralelo
  // (Firestore limita `in` a 10). El paralelo mantiene rápida la carga.
  const ids = lines.map((l) => l.campaign_line_id);
  const opsById = new Map<string, CampaignOperation>();
  const groups = chunk(ids, 10).filter((g) => g.length > 0);
  const opsSnaps = await Promise.all(
    groups.map((group) =>
      getDocs(query(collection(db, COLLECTIONS.campaignOperations), where(documentId(), 'in', group))),
    ),
  );
  for (const opsSnap of opsSnaps) {
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

export type { CancellationCommand, CancellationPatch } from '@/domain/line-cancellation';

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

/**
 * Cancela o reactiva fechas de una línea Ecommerce en una transacción.
 * La lectura dentro de la transacción evita que dos usuarios sobrescriban
 * cambios concurrentes. La importación EKON no toca estos campos.
 */
export async function updateLineCancellation(
  ids: EntityIds,
  command: CancellationCommand,
  actor: AuditActor,
  today: string,
): Promise<CancellationPatch> {
  const db = requireDb();
  const lineRef = doc(db, COLLECTIONS.campaignLines, ids.campaign_line_id);
  const historyRef = doc(collection(db, COLLECTIONS.changeHistory));

  return runTransaction(db, async (transaction) => {
    const snap = await transaction.get(lineRef);
    if (!snap.exists()) throw new Error('La línea ya no existe. Actualiza la vista e inténtalo de nuevo.');

    const line = snap.data() as CampaignLine;
    if ((line.tipo_operacion ?? '').trim().toUpperCase() !== 'ECOMMERCE') {
      throw new Error('La cancelación manual sólo está disponible para líneas Ecommerce.');
    }
    if (
      (command.action === 'cancel_dates' || command.action === 'reactivate_dates') &&
      command.dates.length === 0
    ) {
      throw new Error('Selecciona al menos una fecha.');
    }
    if (command.action === 'cancel_from') {
      const schedule = operationalDatesForLine(line);
      if (!schedule.includes(command.effectiveFrom)) {
        throw new Error('La fecha efectiva debe pertenecer al periodo operativo de la línea.');
      }
    }
    if (
      (command.action === 'cancel_from' || command.action === 'cancel_dates') &&
      command.reason === 'other' &&
      command.comment.trim() === ''
    ) {
      throw new Error('Escribe un comentario cuando el motivo sea «Otro».');
    }

    const patch = applyCancellationCommand(line, command, today);
    const isCancellation = command.action === 'cancel_from' || command.action === 'cancel_dates';
    const timestampFields = isCancellation
      ? { cancelled_at: serverTimestamp(), cancelled_by: actor.uid }
      : {
          reactivated_at: serverTimestamp(),
          reactivated_by: actor.uid,
          ...(command.action === 'reactivate_all'
            ? { cancelled_at: null, cancelled_by: null }
            : {}),
        };

    transaction.update(lineRef, {
      ...patch,
      ...timestampFields,
      updated_at: serverTimestamp(),
      updated_by: actor.uid,
    });
    transaction.set(historyRef, {
      change_id: historyRef.id,
      entity_type: 'campaign_line',
      entity_id: ids.campaign_line_id,
      campaign_group_id: ids.campaign_group_id,
      campaign_space_id: ids.campaign_space_id,
      campaign_line_id: ids.campaign_line_id,
      import_id: null,
      change_type: isCancellation ? 'line_dates_cancelled' : 'line_dates_reactivated',
      field_name: 'cancelled_dates',
      previous_value: {
        cancelled: line.cancelled ?? false,
        cancelled_dates: line.cancelled_dates ?? [],
        cancelled_from: line.cancelled_from ?? null,
        reactivated_dates: line.reactivated_dates ?? [],
      },
      new_value: {
        ...patch,
        command: command.action,
      },
      origin: 'manual_operation',
      created_at: serverTimestamp(),
      created_by: actor.uid,
      created_by_email: actor.email,
    });

    return patch;
  });
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

/** Actualiza la nota/comentario operativo de la línea (campo en la operación) + auditoría. */
export async function updateOperationComment(
  ids: EntityIds,
  previous: string,
  comment: string,
  actor: AuditActor,
): Promise<void> {
  const db = requireDb();
  const batch = writeBatch(db);
  batch.update(doc(db, COLLECTIONS.campaignOperations, ids.campaign_line_id), {
    comentarios: comment,
    updated_at: serverTimestamp(),
    updated_by: actor.uid,
  });
  const hist = historyData(db, ids, actor, 'comment_edited', 'comment', 'comentarios', previous, comment);
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
