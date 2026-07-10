/**
 * Cambios detectados y sustituciones (§9, §43, §24).
 *
 * La resolución de una posible sustitución NUNCA es automática: el usuario
 * confirma si la nueva creatividad SUSTITUYE a una anterior o es ADICIONAL, o
 * rechaza el cambio. Cada acción actualiza la línea, el cambio detectado y la
 * auditoría en el mismo lote lógico.
 */

import {
  collection,
  doc,
  getDocs,
  limit as fbLimit,
  orderBy,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import { requireDb } from '@/lib/firebase';
import { COLLECTIONS } from '@/lib/collections';
import type { CampaignLine } from '@/types/campaign';
import type { DetectedChange, DetectedChangeStatus } from '@/types/audit';

interface Actor {
  uid: string;
  email: string;
}

export async function fetchDetectedChanges(
  status: DetectedChangeStatus = 'pending',
  max = 100,
): Promise<DetectedChange[]> {
  const db = requireDb();
  const q = query(
    collection(db, COLLECTIONS.detectedChanges),
    where('status', '==', status),
    orderBy('created_at', 'desc'),
    fbLimit(max),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as DetectedChange);
}

/** Líneas vigentes candidatas a ser sustituidas (mismo espacio, distinta línea). */
export async function fetchReplacementCandidates(
  spaceId: string,
  excludeLineId: string,
): Promise<CampaignLine[]> {
  const db = requireDb();
  const q = query(
    collection(db, COLLECTIONS.campaignLines),
    where('campaign_space_id', '==', spaceId),
    where('active', '==', true),
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => d.data() as CampaignLine)
    .filter((l) => l.is_current && l.campaign_line_id !== excludeLineId);
}

function auditRef(db: ReturnType<typeof requireDb>) {
  const id = doc(collection(db, COLLECTIONS.changeHistory)).id;
  return { id, ref: doc(db, COLLECTIONS.changeHistory, id) };
}

function baseHistory(
  change: DetectedChange,
  actor: Actor,
  changeId: string,
  changeType: 'replacement_confirmed' | 'replacement_rejected' | 'status_changed',
  previous: unknown,
  next: unknown,
) {
  return {
    change_id: changeId,
    entity_type: 'campaign_line' as const,
    entity_id: change.campaign_line_id ?? '',
    campaign_group_id: change.campaign_group_id,
    campaign_space_id: change.campaign_space_id,
    campaign_line_id: change.campaign_line_id,
    import_id: change.import_id,
    change_type: changeType,
    field_name: 'replacement_status',
    previous_value: previous,
    new_value: next,
    origin: 'manual_operation' as const,
    created_at: serverTimestamp(),
    created_by: actor.uid,
    created_by_email: actor.email,
  };
}

function markReviewed(status: DetectedChangeStatus, actor: Actor, comment: string | null) {
  return {
    status,
    reviewed_at: serverTimestamp(),
    reviewed_by: actor.uid,
    review_comment: comment,
  };
}

/**
 * Confirma que la nueva línea (change.campaign_line_id) SUSTITUYE a
 * `replacedLineId`: relaciona ambas, retira la anterior (is_current=false) y
 * resuelve el cambio detectado (§9).
 */
export async function confirmReplacement(
  change: DetectedChange,
  replacedLineId: string,
  actor: Actor,
  comment: string | null = null,
): Promise<void> {
  const db = requireDb();
  const newLineId = change.campaign_line_id;
  if (!newLineId) throw new Error('El cambio detectado no referencia una línea.');

  const batch = writeBatch(db);
  batch.update(doc(db, COLLECTIONS.campaignLines, newLineId), {
    replaces_campaign_line_id: replacedLineId,
    replacement_status: 'replacement',
    updated_at: serverTimestamp(),
    updated_by: actor.uid,
  });
  batch.update(doc(db, COLLECTIONS.campaignLines, replacedLineId), {
    replaced_by_campaign_line_id: newLineId,
    is_current: false,
    replacement_status: 'replacement',
    updated_at: serverTimestamp(),
    updated_by: actor.uid,
  });
  batch.update(doc(db, COLLECTIONS.detectedChanges, change.detected_change_id), {
    ...markReviewed('resolved', actor, comment),
  });
  const h = auditRef(db);
  batch.set(h.ref, baseHistory(change, actor, h.id, 'replacement_confirmed', 'pending_review', 'replacement'));
  await batch.commit();
}

/** Marca la nueva creatividad como ADICIONAL (no sustituye) y resuelve el cambio. */
export async function markAdditional(
  change: DetectedChange,
  actor: Actor,
  comment: string | null = null,
): Promise<void> {
  const db = requireDb();
  const newLineId = change.campaign_line_id;
  if (!newLineId) throw new Error('El cambio detectado no referencia una línea.');

  const batch = writeBatch(db);
  batch.update(doc(db, COLLECTIONS.campaignLines, newLineId), {
    replacement_status: 'additional',
    updated_at: serverTimestamp(),
    updated_by: actor.uid,
  });
  batch.update(doc(db, COLLECTIONS.detectedChanges, change.detected_change_id), {
    ...markReviewed('resolved', actor, comment),
  });
  const h = auditRef(db);
  batch.set(h.ref, baseHistory(change, actor, h.id, 'status_changed', 'pending_review', 'additional'));
  await batch.commit();
}

/** Rechaza el cambio detectado (§43). */
export async function rejectChange(
  change: DetectedChange,
  actor: Actor,
  comment: string | null = null,
): Promise<void> {
  const db = requireDb();
  const batch = writeBatch(db);
  if (change.campaign_line_id) {
    batch.update(doc(db, COLLECTIONS.campaignLines, change.campaign_line_id), {
      replacement_status: 'rejected',
      updated_at: serverTimestamp(),
      updated_by: actor.uid,
    });
  }
  batch.update(doc(db, COLLECTIONS.detectedChanges, change.detected_change_id), {
    ...markReviewed('rejected', actor, comment),
  });
  const h = auditRef(db);
  batch.set(h.ref, baseHistory(change, actor, h.id, 'replacement_rejected', 'pending_review', 'rejected'));
  await batch.commit();
}
