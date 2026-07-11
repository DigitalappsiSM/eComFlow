/**
 * Capa Firestore del importador (§20, §22–§25).
 *
 * - Búsquedas para clasificar (ImportStoreLookup) con IDs deterministas:
 *   el id de cada documento ES su clave hash canónica, por lo que reimportar
 *   el mismo dato es idempotente.
 * - Escritura por lotes con `writeBatch` + `serverTimestamp`, progreso visible
 *   y detección de doble importación por `file_hash`.
 *
 * Nota: la reanudación fina desde el último lote confirmado queda como
 * limitación conocida; la idempotencia por IDs deterministas + el bloqueo por
 * file_hash evitan duplicar entidades al reintentar.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  where,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import { requireDb } from '@/lib/firebase';
import { COLLECTIONS } from '@/lib/collections';
import type { ImportStoreLookup } from '@/domain/import-pipeline';
import type { ImportPlan, RowPlan } from '@/domain/import-pipeline';
import type { ExistingLineRef } from '@/domain/import-classification';
import type { CampaignLine } from '@/types/campaign';
import type { Placement, PlacementRequirement } from '@/types/placement';
import type { ImportScope } from '@/types/import';
import type { IsoDate } from '@/lib/dates';

// ----------------------------- Lookups ------------------------------------

export function buildFirestoreLookup(db: Firestore = requireDb()): ImportStoreLookup {
  return {
    async getGroupId(groupKey) {
      const snap = await getDoc(doc(db, COLLECTIONS.campaignGroups, groupKey));
      return snap.exists() ? groupKey : null;
    },
    async getSpaceId(spaceKey) {
      const snap = await getDoc(doc(db, COLLECTIONS.campaignSpaces, spaceKey));
      return snap.exists() ? spaceKey : null;
    },
    async getLine(lineKey) {
      const snap = await getDoc(doc(db, COLLECTIONS.campaignLines, lineKey));
      if (!snap.exists()) return null;
      const l = snap.data() as CampaignLine;
      return {
        id: lineKey,
        campaignLineKey: l.campaign_line_key,
        creatividadIdKey: l.creatividad_id_key,
        contentHash: l.content_hash,
        isCurrent: l.is_current,
        active: l.active,
      };
    },
    async getSpaceLines(spaceId) {
      const q = query(
        collection(db, COLLECTIONS.campaignLines),
        where('campaign_space_id', '==', spaceId),
        where('active', '==', true),
      );
      const snap = await getDocs(q);
      const refs: ExistingLineRef[] = [];
      snap.forEach((d) => {
        const l = d.data() as CampaignLine;
        refs.push({
          campaignLineKey: l.campaign_line_key,
          creatividadIdKey: l.creatividad_id_key,
          contentHash: l.content_hash,
          isCurrent: l.is_current,
          active: l.active,
        });
      });
      return refs;
    },
  };
}

/** Bloqueo de doble importación por file_hash (§25). */
export async function findImportByFileHash(
  fileHash: string,
  db: Firestore = requireDb(),
): Promise<boolean> {
  const q = query(
    collection(db, COLLECTIONS.imports),
    where('file_hash', '==', fileHash),
    where('status', 'in', ['processed', 'partially_processed', 'processing']),
    limit(1),
  );
  const snap = await getDocs(q);
  return !snap.empty;
}

// ------------------------- Requerimientos ---------------------------------

export async function fetchPlacementCatalog(
  db: Firestore = requireDb(),
): Promise<{ names: Map<string, string>; requirements: Map<string, PlacementRequirement[]> }> {
  const names = new Map<string, string>();
  const psnap = await getDocs(collection(db, COLLECTIONS.placements));
  psnap.forEach((d) => {
    const p = d.data() as Placement;
    names.set(p.placement_id, p.nombre);
  });

  const requirements = new Map<string, PlacementRequirement[]>();
  const rsnap = await getDocs(collection(db, COLLECTIONS.placementRequirements));
  rsnap.forEach((d) => {
    const r = d.data() as PlacementRequirement;
    if (!r.active) return;
    const list = requirements.get(r.placement_id) ?? [];
    list.push(r);
    requirements.set(r.placement_id, list);
  });

  return { names, requirements };
}

/** Requisitos aplicables por vigencia a la fecha de fijación (§15). */
export function computeApplicableRequirements(
  reqs: readonly PlacementRequirement[],
  fechaFijacion: IsoDate,
): PlacementRequirement[] {
  return reqs.filter(
    (r) =>
      r.fecha_inicio_vigencia <= fechaFijacion &&
      (r.fecha_fin_vigencia === null || r.fecha_fin_vigencia >= fechaFijacion),
  );
}

// ----------------------------- Writer -------------------------------------

export interface RunImportContext {
  plan: ImportPlan;
  file: { name: string; size: number; hash: string };
  scope: ImportScope;
  user: { uid: string; email: string };
  templateVersion: string;
  catalog: { names: Map<string, string>; requirements: Map<string, PlacementRequirement[]> };
  onProgress?: (confirmed: number, total: number, batch: number) => void;
}

export interface RunImportResult {
  importId: string;
  status: 'processed' | 'partially_processed';
}

type Op =
  | { kind: 'set'; path: [string, string]; data: Record<string, unknown> }
  | { kind: 'update'; path: [string, string]; data: Record<string, unknown> };

const WRITE_LIMIT = 400;

/**
 * Ejecuta la importación confirmada: escribe entidades, operación, snapshots de
 * requisitos, historial e import_rows por lotes, y actualiza el registro de
 * importación al final (§22 no se marca finalizada hasta confirmar todo).
 */
export async function runImport(ctx: RunImportContext): Promise<RunImportResult> {
  const db = requireDb();
  const { plan, file, user } = ctx;
  const now = () => serverTimestamp();
  const importId = doc(collection(db, COLLECTIONS.imports)).id;

  const audit = () => ({
    created_at: now(),
    created_by: user.uid,
    updated_at: now(),
    updated_by: user.uid,
    first_import_id: importId,
    last_import_id: importId,
  });

  // 1) Registro de importación en estado 'processing' (commit inmediato).
  const importRef = doc(db, COLLECTIONS.imports, importId);
  const importBase = {
    import_id: importId,
    file_name: file.name,
    file_size: file.size,
    file_hash: file.hash,
    template_version: ctx.templateVersion,
    import_scope: ctx.scope,
    status: 'processing' as const,
    uploaded_at: now(),
    uploaded_by: user.uid,
    total_rows: plan.summary.total,
    valid_rows: plan.summary.valid,
    new_campaigns: plan.summary.new_campaigns,
    new_spaces: plan.summary.new_spaces,
    new_lines: plan.summary.new_lines,
    updated_rows: plan.summary.updated,
    unchanged_rows: plan.summary.unchanged,
    rejected_rows: plan.summary.rejected,
    creativity_changes: plan.summary.creativity_changes,
    possible_replacements: plan.summary.possible_replacements,
    general_rejection_reason: plan.generalRejection,
    started_at: now(),
    finished_at: null,
    last_confirmed_batch: 0,
    processing_version: 'v1',
  };
  const startBatch = writeBatch(db);
  startBatch.set(importRef, importBase);
  await startBatch.commit();

  // 2) Construir todas las operaciones de escritura.
  const ops: Op[] = [];

  const changeHistory = (
    entityType: string,
    entityId: string,
    changeType: string,
    row: RowPlan,
    fieldName: string | null,
    previous: unknown,
    next: unknown,
  ): void => {
    const id = doc(collection(db, COLLECTIONS.changeHistory)).id;
    ops.push({
      kind: 'set',
      path: [COLLECTIONS.changeHistory, id],
      data: {
        change_id: id,
        entity_type: entityType,
        entity_id: entityId,
        campaign_group_id: row.identity?.campaignGroupKey ?? null,
        campaign_space_id: row.identity?.campaignSpaceKey ?? null,
        campaign_line_id: row.identity?.campaignLineKey ?? null,
        import_id: importId,
        change_type: changeType,
        field_name: fieldName,
        previous_value: previous,
        new_value: next,
        origin: 'excel_import',
        created_at: now(),
        created_by: user.uid,
        created_by_email: user.email,
      },
    });
  };

  for (const row of plan.rows) {
    // import_rows: SIEMPRE (incluye rechazos) con id determinista.
    const importRowId = `${importId}__${row.rowNumber}`;
    ops.push({
      kind: 'set',
      path: [COLLECTIONS.importRows, importRowId],
      data: {
        import_row_id: importRowId,
        import_id: importId,
        row_number: row.rowNumber,
        received_data: row.raw,
        normalized_data: row.normalized ?? {},
        result: row.result,
        campaign_group_id: row.identity?.campaignGroupKey ?? null,
        campaign_space_id: row.identity?.campaignSpaceKey ?? null,
        campaign_line_id: row.identity?.campaignLineKey ?? null,
        error_field: row.errors[0]?.error_field ?? null,
        received_value: row.errors[0]?.received_value ?? null,
        error_code: row.errors[0]?.error_code ?? null,
        error_reason: row.errors[0]?.error_reason ?? null,
        suggested_action: row.errors[0]?.suggested_action ?? null,
        created_at: now(),
        created_by: user.uid,
      },
    });

    if (row.result === 'rejected' || row.result === 'unchanged' || !row.identity || !row.normalized) {
      continue;
    }

    const id = row.identity;
    const n = row.normalized;
    const placementId = row.placementId!;
    const applicable = computeApplicableRequirements(
      ctx.catalog.requirements.get(placementId) ?? [],
      n.fechaFijacionIso,
    );
    // Piezas: si la plantilla las trae (Ekon → Nº Soportes) se usan; si no, se
    // cuentan los requisitos obligatorios aplicables del catálogo.
    const requiredPieces =
      row.extra?.requiredPieces ?? applicable.filter((r) => r.obligatorio).length;
    const placementName =
      row.extra?.placementName ?? ctx.catalog.names.get(placementId) ?? placementId;
    const cadena = row.extra?.cadena ?? null;
    const lineaCampana = row.extra?.lineaCampana ?? null;

    const createsGroup = row.result === 'new_campaign';
    const createsSpace = row.result === 'new_campaign' || row.result === 'new_space';
    const createsLine =
      row.result === 'new_campaign' ||
      row.result === 'new_space' ||
      row.result === 'new_line' ||
      row.result === 'creativity_change';

    if (createsGroup) {
      ops.push({
        kind: 'set',
        path: [COLLECTIONS.campaignGroups, id.campaignGroupKey],
        data: {
          campaign_group_id: id.campaignGroupKey,
          campaign_group_key: id.campaignGroupKey,
          campaign_group_key_raw: id.campaignGroupKeyRaw,
          cliente_original: n.cliente,
          cliente_key: id.clienteKey,
          numero_campaña_original: n.numeroCampana,
          numero_campaña_key: id.numeroCampanaKey,
          anunciante: n.anunciante,
          active: true,
          ...audit(),
        },
      });
      changeHistory('campaign_group', id.campaignGroupKey, 'created', row, null, null, id.campaignGroupKeyRaw);
    }

    if (createsSpace) {
      ops.push({
        kind: 'set',
        path: [COLLECTIONS.campaignSpaces, id.campaignSpaceKey],
        data: {
          campaign_space_id: id.campaignSpaceKey,
          campaign_group_id: id.campaignGroupKey,
          campaign_space_key: id.campaignSpaceKey,
          campaign_space_key_raw: id.campaignSpaceKeyRaw,
          placement_id: placementId,
          placement_name_snapshot: placementName,
          cadena,
          fecha_fijacion: n.fechaFijacionIso,
          fecha_retirada: n.fechaRetiradaIso,
          creatividad_titulo_original: n.creatividadTitulo,
          creatividad_titulo_key: id.creatividadTituloKey,
          creatividad_descripcion_original: n.creatividadDescripcion,
          creatividad_descripcion_key: id.creatividadDescripcionKey,
          anunciante: n.anunciante,
          active: true,
          present_in_latest_import: true,
          first_seen_at: now(),
          last_seen_at: now(),
          ...audit(),
        },
      });
      changeHistory('campaign_space', id.campaignSpaceKey, 'created', row, null, null, id.campaignSpaceKeyRaw);
    } else {
      // Espacio existente: refrescar presencia y, si cambió, la retirada.
      ops.push({
        kind: 'update',
        path: [COLLECTIONS.campaignSpaces, id.campaignSpaceKey],
        data: {
          fecha_retirada: n.fechaRetiradaIso,
          present_in_latest_import: true,
          last_seen_at: now(),
          updated_at: now(),
          updated_by: user.uid,
          last_import_id: importId,
        },
      });
    }

    if (createsLine) {
      ops.push({
        kind: 'set',
        path: [COLLECTIONS.campaignLines, id.campaignLineKey],
        data: {
          campaign_line_id: id.campaignLineKey,
          campaign_group_id: id.campaignGroupKey,
          campaign_space_id: id.campaignSpaceKey,
          campaign_line_key: id.campaignLineKey,
          campaign_line_key_raw: id.campaignLineKeyRaw,
          creatividad_id_original: n.creatividadId,
          creatividad_id_key: id.creatividadIdKey,
          is_current: true,
          active: true,
          present_in_latest_import: true,
          replaces_campaign_line_id: null,
          replaced_by_campaign_line_id: null,
          replacement_status: row.result === 'creativity_change' ? 'pending_review' : 'not_applicable',
          content_hash: id.contentHash,
          cliente_key: id.clienteKey,
          cliente_original: n.cliente,
          numero_campaña_original: n.numeroCampana,
          placement_id: placementId,
          placement_name_snapshot: placementName,
          cadena,
          linea_campana: lineaCampana,
          fecha_fijacion: n.fechaFijacionIso,
          fecha_retirada: n.fechaRetiradaIso,
          creatividad_titulo_original: n.creatividadTitulo,
          creatividad_descripcion_original: n.creatividadDescripcion,
          anunciante: n.anunciante,
          required_pieces: requiredPieces,
          cancelled: false,
          ...audit(),
        },
      });
      changeHistory(
        'campaign_line',
        id.campaignLineKey,
        row.result === 'creativity_change' ? 'creativity_detected' : 'created',
        row,
        null,
        null,
        n.creatividadId,
      );

      // Operación inicial: todos los checks en false (§9, §12).
      ops.push({
        kind: 'set',
        path: [COLLECTIONS.campaignOperations, id.campaignLineKey],
        data: {
          campaign_operation_id: id.campaignLineKey,
          campaign_line_id: id.campaignLineKey,
          campaign_space_id: id.campaignSpaceKey,
          campaign_group_id: id.campaignGroupKey,
          checks: Object.fromEntries(
            ['correo_enviado', 'artes', 'validacion', 'link', 'kevel', 'testigos_app', 'testigos_web'].map(
              (k) => [k, { value: false, updated_at: now(), updated_by: user.uid }],
            ),
          ),
          comentarios: '',
          responsable_operativo: null,
          porcentaje_avance: 0,
          created_at: now(),
          created_by: user.uid,
          updated_at: now(),
          updated_by: user.uid,
        },
      });

      // Snapshot de requisitos aplicables (§15).
      for (const req of applicable) {
        const snapId = `${id.campaignLineKey}__${req.requirement_id}`;
        ops.push({
          kind: 'set',
          path: [COLLECTIONS.campaignLineRequirements, snapId],
          data: {
            campaign_line_requirement_id: snapId,
            campaign_line_id: id.campaignLineKey,
            campaign_space_id: id.campaignSpaceKey,
            campaign_group_id: id.campaignGroupKey,
            requirement_id: req.requirement_id,
            placement_id: placementId,
            canal: req.canal,
            dispositivo: req.dispositivo,
            variante: req.variante,
            ancho: req.ancho,
            alto: req.alto,
            peso_maximo: req.peso_maximo,
            unidad_peso: req.unidad_peso,
            formatos_permitidos: req.formatos_permitidos,
            obligatorio: req.obligatorio,
            requirement_snapshot_version: 1,
            created_at: now(),
          },
        });
      }

      // Cambio detectado pendiente de revisión ante posible sustitución (§9, §43).
      if (row.result === 'creativity_change' && row.possibleReplacement) {
        const dcId = id.campaignLineKey;
        ops.push({
          kind: 'set',
          path: [COLLECTIONS.detectedChanges, dcId],
          data: {
            detected_change_id: dcId,
            type: 'possible_replacement',
            status: 'pending',
            campaign_group_id: id.campaignGroupKey,
            campaign_space_id: id.campaignSpaceKey,
            campaign_line_id: id.campaignLineKey,
            import_id: importId,
            detail: `Nueva Creatividad ID ${n.creatividadId} en un espacio con creatividad vigente.`,
            reviewed_at: null,
            reviewed_by: null,
            review_comment: null,
            created_at: now(),
            created_by: user.uid,
          },
        });
      }
    } else if (row.result === 'updated_line') {
      // Actualización de línea existente (p. ej. fecha de retirada).
      ops.push({
        kind: 'update',
        path: [COLLECTIONS.campaignLines, id.campaignLineKey],
        data: {
          fecha_retirada: n.fechaRetiradaIso,
          required_pieces: requiredPieces,
          content_hash: id.contentHash,
          present_in_latest_import: true,
          updated_at: now(),
          updated_by: user.uid,
          last_import_id: importId,
        },
      });
      changeHistory('campaign_line', id.campaignLineKey, 'date_changed', row, 'fecha_retirada', null, n.fechaRetiradaIso);
    }
  }

  // 3) Confirmar en lotes con progreso.
  let confirmed = 0;
  let batchNo = 0;
  for (let i = 0; i < ops.length; i += WRITE_LIMIT) {
    const slice = ops.slice(i, i + WRITE_LIMIT);
    const batch = writeBatch(db);
    for (const op of slice) {
      const ref = doc(db, op.path[0], op.path[1]);
      if (op.kind === 'set') batch.set(ref, op.data);
      else batch.update(ref, op.data);
    }
    await batch.commit();
    confirmed += slice.length;
    batchNo += 1;
    ctx.onProgress?.(confirmed, ops.length, batchNo);
  }

  // 4) Finalizar el registro de importación (§22).
  const status: RunImportResult['status'] =
    plan.summary.rejected > 0 && plan.summary.valid > 0
      ? 'partially_processed'
      : 'processed';
  const finishBatch = writeBatch(db);
  finishBatch.update(importRef, {
    status,
    finished_at: now(),
    last_confirmed_batch: batchNo,
  });
  await finishBatch.commit();

  return { importId, status };
}
