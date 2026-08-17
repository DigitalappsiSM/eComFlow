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
  type DocumentReference,
  type Firestore,
} from 'firebase/firestore';
import { requireDb } from '@/lib/firebase';
import { COLLECTIONS } from '@/lib/collections';
import { memoizeAsync } from '@/lib/memoize';
import type { ImportStoreLookup } from '@/domain/import-pipeline';
import type { ImportPlan, RowPlan } from '@/domain/import-pipeline';
import type { ExistingLineRef } from '@/domain/import-classification';
import {
  lineInScope,
  shouldApplyReconciliation,
  type ReconciliationCandidate,
  type ScopeCandidateLine,
  type ScopeFilter,
} from '@/domain/reconciliation';
import { adapterForLine } from '@/domain/retailers/registry';
import { normalizeChain } from '@/domain/retailers/default.adapter';
import type { CampaignLine } from '@/types/campaign';
import type { Placement, PlacementRequirement } from '@/types/placement';
import type { ImportScope } from '@/types/import';
import type { IsoDate } from '@/lib/dates';
import { computeProgress } from '@/domain/progress';
import { initialChecksForImportedLine, requiredChecksForLine } from '@/domain/operation-rules';

/** Tope de lectura de la conciliación para no descargar la colección entera. */
const RECONCILIATION_READ_LIMIT = 3000;

// ----------------------------- Lookups ------------------------------------

/**
 * Lookup de Firestore para clasificar la importación. Cada método cachea su
 * resultado por clave durante la sesión (una sola lectura por clave repetida);
 * los errores no se cachean (ver `memoizeAsync`). El resultado funcional es
 * idéntico al de una consulta directa.
 */
export function buildFirestoreLookup(db: Firestore = requireDb()): ImportStoreLookup {
  const getGroupId = memoizeAsync<string, string | null>(async (groupKey) => {
    const snap = await getDoc(doc(db, COLLECTIONS.campaignGroups, groupKey));
    return snap.exists() ? groupKey : null;
  });
  const getSpaceId = memoizeAsync<string, string | null>(async (spaceKey) => {
    const snap = await getDoc(doc(db, COLLECTIONS.campaignSpaces, spaceKey));
    return snap.exists() ? spaceKey : null;
  });
  const getLine = memoizeAsync<string, (ExistingLineRef & { id: string }) | null>(async (lineKey) => {
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
      // Proyección para presencia/restauración (§7): detectar bajas
      // `not_in_source` sin cargar toda la entidad.
      inactiveReason: l.inactive_reason ?? null,
      sourceStatus: l.source_status ?? null,
      cancelled: l.cancelled ?? false,
    };
  });
  const getSpaceLines = memoizeAsync<string, ExistingLineRef[]>(async (spaceId) => {
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
  });

  return {
    getGroupId: (groupKey) => getGroupId(groupKey),
    getSpaceId: (spaceKey) => getSpaceId(spaceKey),
    getLine: (lineKey) => getLine(lineKey),
    getSpaceLines: (spaceId) => getSpaceLines(spaceId),
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

// ------------------------- Conciliación de fuente -------------------------

/** Construye el filtro de alcance normalizado a partir del alcance detectado. */
export function buildScopeFilter(scope: ImportScope): ScopeFilter {
  return {
    coveredPeriods: scope.covered_periods ?? [],
    chainKeys: new Set((scope.scope_chains ?? []).map((c) => normalizeChain(c))),
    operationTypes: new Set(scope.scope_operation_types ?? []),
    windowStart: scope.scope_start_date,
    windowEnd: scope.scope_end_date,
  };
}

function toScopeCandidateLine(l: CampaignLine): ScopeCandidateLine {
  const identityStrategy = l.identity_strategy ?? adapterForLine(l).identityStrategy;
  const candidate: ReconciliationCandidate = {
    campaignLineId: l.campaign_line_id,
    campaignSpaceId: l.campaign_space_id,
    campaignGroupId: l.campaign_group_id,
    clienteOriginal: l.cliente_original,
    numeroCampanaOriginal: l.numero_campaña_original,
    placementName: l.placement_name_snapshot,
    creatividadIdOriginal: l.creatividad_id_original,
    periodoOriginal: l.periodo_original ?? null,
    periodoInicio: l.periodo_inicio ?? null,
    periodoFin: l.periodo_fin ?? null,
    cadena: l.cadena ?? null,
    tipoOperacion: l.tipo_operacion ?? null,
  };
  return {
    candidate,
    identityStrategy,
    cadenaKey: normalizeChain(l.cadena ?? ''),
    tipoOperacion: l.tipo_operacion ?? null,
    periodoCodigo: l.periodo_codigo ?? null,
    periodoInicio: l.periodo_inicio ?? null,
    periodoFin: l.periodo_fin ?? null,
    activationStart: l.activation_start ?? null,
    activationEnd: l.activation_end ?? null,
  };
}

/**
 * Líneas activas/actuales que pertenecen al alcance confirmado (§7). Consulta
 * por la ventana de `periodo_inicio` (no descarga toda la colección) y aplica la
 * membresía exacta/contención en memoria. Incluye ambas estrategias de
 * identidad: `period_range` por periodo exacto y `campaign_range` por contención
 * de su rango de activación en la ventana confirmada.
 */
export async function fetchActiveLinesInScope(
  scope: ImportScope,
  db: Firestore = requireDb(),
): Promise<ScopeCandidateLine[]> {
  const filter = buildScopeFilter(scope);
  if (
    filter.coveredPeriods.length === 0 ||
    !filter.windowStart ||
    !filter.windowEnd ||
    filter.operationTypes.size === 0
  ) {
    return [];
  }

  const q = query(
    collection(db, COLLECTIONS.campaignLines),
    where('active', '==', true),
    where('is_current', '==', true),
    where('periodo_inicio', '>=', filter.windowStart),
    where('periodo_inicio', '<=', filter.windowEnd),
    limit(RECONCILIATION_READ_LIMIT),
  );
  const snap = await getDocs(q);

  const result: ScopeCandidateLine[] = [];
  snap.forEach((d) => {
    const line = toScopeCandidateLine(d.data() as CampaignLine);
    if (lineInScope(line, filter)) result.push(line);
  });
  return result;
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
  /** Líneas dadas de baja lógica por ausencia (conciliación autoritativa). */
  missingRows: number;
  /** Líneas restauradas por reaparición. */
  restoredRows: number;
  reconciliationStatus: 'skipped' | 'blocked' | 'completed';
}

const PROCESSING_VERSION = 'v2-source-reconciliation';

type Op =
  | { kind: 'set'; path: [string, string]; data: Record<string, unknown> }
  | { kind: 'update'; path: [string, string]; data: Record<string, unknown> };

const WRITE_LIMIT = 400;
const FAILURE_REASON_MAX = 500;

/** Confirma un lote etiquetando el origen del error con la fase (observabilidad). */
async function commitPhase(phase: string, batch: ReturnType<typeof writeBatch>): Promise<void> {
  try {
    await batch.commit();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`[${phase}] ${msg}`);
  }
}

/**
 * Marca la importación como fallida (best-effort) conservando la fase del error.
 * Si el propio update de `failed` falla, se ignora para NO perder el error
 * original, que se propaga desde `runImport`.
 */
async function markImportFailed(
  db: Firestore,
  importRef: DocumentReference,
  user: { uid: string },
  err: unknown,
): Promise<void> {
  const reason = (err instanceof Error ? err.message : String(err)).slice(0, FAILURE_REASON_MAX);
  try {
    const batch = writeBatch(db);
    batch.update(importRef, {
      status: 'failed',
      finished_at: serverTimestamp(),
      failure_reason: reason,
      updated_at: serverTimestamp(),
      updated_by: user.uid,
    });
    await batch.commit();
  } catch {
    // No se pudo marcar failed: se conserva y propaga el error original.
  }
}

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
    // created_by/created_at requeridos por las reglas (createdByIsCaller).
    created_by: user.uid,
    created_at: now(),
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
    processing_version: PROCESSING_VERSION,
    // Conciliación (se actualizan al cerrar; base retrocompatible).
    missing_rows: 0,
    restored_rows: 0,
    reconciliation_status: 'skipped' as const,
    reconciliation_blocked_reasons: plan.reconciliation?.blockedReasons ?? [],
  };
  const startBatch = writeBatch(db);
  startBatch.set(importRef, importBase);
  // Fase "iniciar importación": si falla aquí, no hay registro que marcar failed.
  await commitPhase('iniciar importación', startBatch);

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

  // Deduplicación dentro de la importación: muchas filas comparten el mismo
  // grupo/espacio (IDs deterministas). Cada documento se escribe UNA sola vez
  // para no reenviar created_at y violar immutableCreation en la 2ª escritura.
  const touchedGroups = new Set<string>();
  const touchedSpaces = new Set<string>();

  // Presencia/restauración (§9.3–§9.4): las filas `unchanged` refrescan
  // presencia (touch); las líneas `not_in_source` que reaparecen se restauran.
  const touchLineIds = new Set<string>();
  interface RestoreTarget { lineId: string; groupId: string; spaceId: string; previousSourceStatus: string | null }
  const restoreTargets: RestoreTarget[] = [];

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

    // Presencia/restauración de líneas ENTRANTES existentes (§6). Se resuelve
    // en fases posteriores; aquí sólo se recolectan los objetivos.
    if (row.identity && row.presenceAction === 'restore') {
      restoreTargets.push({
        lineId: row.identity.campaignLineKey,
        groupId: row.identity.campaignGroupKey,
        spaceId: row.identity.campaignSpaceKey,
        previousSourceStatus: row.existingLine?.sourceStatus ?? 'not_in_source',
      });
    } else if (row.identity && row.result === 'unchanged') {
      // `unchanged` presente en el archivo → touch de presencia (§3.5).
      touchLineIds.add(row.identity.campaignLineKey);
    }

    if (
      row.result === 'rejected' ||
      row.result === 'excluded_by_type' ||
      row.result === 'unchanged' ||
      !row.identity ||
      !row.normalized
    ) {
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
    const tipoOperacion = row.extra?.tipoOperacion ?? null;
    const periodo = {
      periodo_original: row.extra?.periodoOriginal ?? null,
      periodo_codigo: row.extra?.periodoCodigo ?? null,
      periodo_tipo: row.extra?.periodoTipo ?? null,
      periodo_inicio: row.extra?.periodoInicio ?? null,
      periodo_fin: row.extra?.periodoFin ?? null,
      tipo_campana_periodo: row.extra?.tipoCampanaPeriodo ?? null,
    };
    // Retailer + consolidación de activaciones diarias (solo se escriben los
    // campos de activación cuando la línea las tiene, p. ej. La Comer).
    const retailerInfo: Record<string, unknown> = {
      retailer_id: row.extra?.retailerId ?? null,
      period_granularity: row.extra?.periodGranularity ?? null,
    };
    if (row.extra?.activationDates) {
      retailerInfo.activation_dates = row.extra.activationDates;
      retailerInfo.period_ids = row.extra.periodIds ?? [];
      retailerInfo.external_line_ids = row.extra.externalLineIds ?? [];
      retailerInfo.activation_start = row.extra.activationStart ?? null;
      retailerInfo.activation_end = row.extra.activationEnd ?? null;
      retailerInfo.activation_count = row.extra.activationCount ?? 0;
    }

    const createsGroup = row.result === 'new_campaign';
    const createsSpace = row.result === 'new_campaign' || row.result === 'new_space';
    const createsLine =
      row.result === 'new_campaign' ||
      row.result === 'new_space' ||
      row.result === 'new_line' ||
      row.result === 'creativity_change';

    if (createsGroup && !touchedGroups.has(id.campaignGroupKey)) {
      touchedGroups.add(id.campaignGroupKey);
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
      if (!touchedSpaces.has(id.campaignSpaceKey)) {
        touchedSpaces.add(id.campaignSpaceKey);
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
      }
    } else if (!touchedSpaces.has(id.campaignSpaceKey)) {
      // Espacio existente en Firestore: refrescar presencia/retirada una vez.
      touchedSpaces.add(id.campaignSpaceKey);
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
          // Conciliación de fuente (§3): la línea entrante está presente.
          identity_strategy: row.extra?.identityStrategy ?? null,
          source_status: 'present',
          inactive_reason: null,
          missing_since_import_id: null,
          missing_detected_at: null,
          last_seen_at: now(),
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
          tipo_operacion: tipoOperacion,
          linea_campana: lineaCampana,
          ...periodo,
          ...retailerInfo,
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

      // Operación inicial: Ecommerce continua hereda checks salvo testigos;
      // Digital Signage sólo requiere artes y no usa herencia especial.
      const initialChecks = initialChecksForImportedLine({
        tipoOperacion,
        tipoCampanaPeriodo: row.extra?.tipoCampanaPeriodo,
      });
      // Checks obligatorios de la LÍNEA (excluye "Artes" en Sponsored Product).
      const requiredChecks = requiredChecksForLine({
        tipo_operacion: tipoOperacion,
        retailer_id: (row.extra?.retailerId ?? null) as string | null,
        cadena,
        placement_name_snapshot: placementName,
      });
      ops.push({
        kind: 'set',
        path: [COLLECTIONS.campaignOperations, id.campaignLineKey],
        data: {
          campaign_operation_id: id.campaignLineKey,
          campaign_line_id: id.campaignLineKey,
          campaign_space_id: id.campaignSpaceKey,
          campaign_group_id: id.campaignGroupKey,
          checks: Object.fromEntries(
            Object.entries(initialChecks).map(([k, value]) => [
              k,
              { value, updated_at: now(), updated_by: user.uid },
            ]),
          ),
          comentarios: '',
          responsable_operativo: null,
          porcentaje_avance: computeProgress(initialChecks, requiredChecks),
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
            created_by: user.uid,
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
          ...periodo,
          content_hash: id.contentHash,
          present_in_latest_import: true,
          // Touch de presencia (§3.5): la línea sigue presente en la fuente. No
          // se toca `active` ni `cancelled`; si estaba `not_in_source` la fase
          // de restauración la reactiva por separado.
          identity_strategy: row.extra?.identityStrategy ?? null,
          source_status: row.presenceAction === 'restore' ? 'restored' : 'present',
          last_seen_at: now(),
          updated_at: now(),
          updated_by: user.uid,
          last_import_id: importId,
        },
      });
      changeHistory('campaign_line', id.campaignLineKey, 'date_changed', row, 'fecha_retirada', null, n.fechaRetiradaIso);
    }
  }

  // Ejecución por FASES (§9). El registro imports/{id} ya existe: un error en
  // cualquier fase se marca `failed` (best-effort) conservando la fase; el error
  // original se propaga siempre. El orden garantiza que NO se desactiva nada
  // antes de confirmar los upserts entrantes.
  let batchNo = 0;
  const commitOps = async (phase: string, phaseOps: Op[]): Promise<void> => {
    for (let i = 0; i < phaseOps.length; i += WRITE_LIMIT) {
      const slice = phaseOps.slice(i, i + WRITE_LIMIT);
      const batch = writeBatch(db);
      for (const op of slice) {
        const ref = doc(db, op.path[0], op.path[1]);
        if (op.kind === 'set') batch.set(ref, op.data);
        else batch.update(ref, op.data);
      }
      await commitPhase(phase, batch);
      batchNo += 1;
    }
  };

  const changeHistoryLineOp = (fields: {
    groupId: string;
    spaceId: string;
    lineId: string;
    changeType: string;
    previous: unknown;
    next: unknown;
  }): Op => {
    const cid = doc(collection(db, COLLECTIONS.changeHistory)).id;
    return {
      kind: 'set',
      path: [COLLECTIONS.changeHistory, cid],
      data: {
        change_id: cid,
        entity_type: 'campaign_line',
        entity_id: fields.lineId,
        campaign_group_id: fields.groupId,
        campaign_space_id: fields.spaceId,
        campaign_line_id: fields.lineId,
        import_id: importId,
        change_type: fields.changeType,
        field_name: 'source_status',
        previous_value: fields.previous,
        new_value: fields.next,
        origin: 'excel_import',
        created_at: now(),
        created_by: user.uid,
        created_by_email: user.email,
      },
    };
  };

  const coverageMode = ctx.scope.coverage_mode ?? 'additive';
  const reconciliation = plan.reconciliation;
  const reconcileEligible = reconciliation?.eligible ?? false;
  const doReconcile = shouldApplyReconciliation(coverageMode, reconcileEligible);

  // Espacios/grupos afectados por bajas o restauraciones → recálculo de actividad.
  const affectedSpaces = new Set<string>();
  const affectedGroups = new Set<string>();
  let restoredRows = 0;
  let missingRows = 0;

  try {
    // Fase 1 (§9.2): escribir/actualizar entidades presentes en el archivo.
    await commitOps('escribir filas entrantes', ops);
    ctx.onProgress?.(ops.length, ops.length, batchNo);

    // Fase 2 (§9.3): touch de presencia de filas `unchanged`.
    const touchOps: Op[] = [];
    for (const lineId of touchLineIds) {
      touchOps.push({
        kind: 'update',
        path: [COLLECTIONS.campaignLines, lineId],
        data: {
          present_in_latest_import: true,
          source_status: 'present',
          last_seen_at: now(),
          updated_at: now(),
          updated_by: user.uid,
          last_import_id: importId,
        },
      });
    }
    await commitOps('actualizar presencia', touchOps);

    // Fase 3 (§9.4): restaurar líneas `not_in_source` que reaparecieron. Sólo
    // se restaura si TODAVÍA estaba inactiva por esa razón (idempotencia §9).
    if (restoreTargets.length > 0) {
      const snaps = await Promise.all(
        restoreTargets.map((t) => getDoc(doc(db, COLLECTIONS.campaignLines, t.lineId))),
      );
      const restoreOps: Op[] = [];
      restoreTargets.forEach((t, i) => {
        const snap = snaps[i]!;
        if (!snap.exists()) return;
        const l = snap.data() as CampaignLine;
        if (l.active === true || l.inactive_reason !== 'not_in_source') return; // ya restaurada
        restoreOps.push({
          kind: 'update',
          path: [COLLECTIONS.campaignLines, t.lineId],
          data: {
            active: true,
            source_status: 'restored',
            inactive_reason: null,
            present_in_latest_import: true,
            restored_in_import_id: importId,
            restored_at: now(),
            missing_since_import_id: null,
            missing_detected_at: null,
            last_seen_at: now(),
            updated_at: now(),
            updated_by: user.uid,
            last_import_id: importId,
          },
        });
        restoreOps.push(
          changeHistoryLineOp({
            groupId: t.groupId,
            spaceId: t.spaceId,
            lineId: t.lineId,
            changeType: 'source_restored',
            previous: 'not_in_source',
            next: 'restored',
          }),
        );
        affectedSpaces.add(t.spaceId);
        affectedGroups.add(t.groupId);
        restoredRows += 1;
      });
      await commitOps('restaurar líneas', restoreOps);
    }

    // Fase 4 (§9.5): conciliar ausencias. SÓLO en modo autoritativo elegible.
    if (doReconcile && reconciliation && reconciliation.missing.length > 0) {
      const missing = reconciliation.missing;
      const snaps = await Promise.all(
        missing.map((m) => getDoc(doc(db, COLLECTIONS.campaignLines, m.campaignLineId))),
      );
      const deactivateOps: Op[] = [];
      missing.forEach((m, i) => {
        const snap = snaps[i]!;
        if (!snap.exists()) return;
        const l = snap.data() as CampaignLine;
        // Idempotencia: sólo dar de baja si TODAVÍA estaba activa/presente.
        if (l.active !== true) return;
        const previousSourceStatus = l.source_status ?? 'present';
        deactivateOps.push({
          kind: 'update',
          path: [COLLECTIONS.campaignLines, m.campaignLineId],
          data: {
            active: false,
            source_status: 'not_in_source',
            inactive_reason: 'not_in_source',
            present_in_latest_import: false,
            missing_since_import_id: importId,
            missing_detected_at: now(),
            updated_at: now(),
            updated_by: user.uid,
            last_import_id: importId,
            // NO se tocan: is_current, cancelled, claves, operación, checks.
          },
        });
        deactivateOps.push(
          changeHistoryLineOp({
            groupId: m.campaignGroupId,
            spaceId: m.campaignSpaceId,
            lineId: m.campaignLineId,
            changeType: 'source_missing',
            previous: previousSourceStatus,
            next: 'not_in_source',
          }),
        );
        affectedSpaces.add(m.campaignSpaceId);
        affectedGroups.add(m.campaignGroupId);
        missingRows += 1;
      });
      await commitOps('conciliar ausencias EKON', deactivateOps);
    }

    // Fase 5 (§11): recalcular actividad de espacios y grupos afectados. Un padre
    // queda activo si conserva al menos un hijo activo; sólo se registra el
    // cambio de actividad cuando el valor realmente cambia.
    if (affectedSpaces.size > 0 || affectedGroups.size > 0) {
      const parentOps: Op[] = [];
      for (const spaceId of affectedSpaces) {
        const [snap, childActive] = await Promise.all([
          getDoc(doc(db, COLLECTIONS.campaignSpaces, spaceId)),
          hasActiveChild(db, 'campaign_space_id', spaceId),
        ]);
        if (!snap.exists()) continue;
        const current = (snap.data() as { active?: boolean }).active ?? false;
        if (current === childActive) continue;
        parentOps.push({
          kind: 'update',
          path: [COLLECTIONS.campaignSpaces, spaceId],
          data: {
            active: childActive,
            updated_at: now(),
            updated_by: user.uid,
            last_import_id: importId,
          },
        });
      }
      for (const groupId of affectedGroups) {
        const [snap, childActive] = await Promise.all([
          getDoc(doc(db, COLLECTIONS.campaignGroups, groupId)),
          hasActiveChild(db, 'campaign_group_id', groupId),
        ]);
        if (!snap.exists()) continue;
        const current = (snap.data() as { active?: boolean }).active ?? false;
        if (current === childActive) continue;
        parentOps.push({
          kind: 'update',
          path: [COLLECTIONS.campaignGroups, groupId],
          data: {
            active: childActive,
            updated_at: now(),
            updated_by: user.uid,
            last_import_id: importId,
          },
        });
      }
      await commitOps('recalcular jerarquía', parentOps);
    }

    // Fase 6 (§9.7, §22): cerrar el registro de importación.
    const status: RunImportResult['status'] =
      plan.summary.rejected > 0 && plan.summary.valid > 0
        ? 'partially_processed'
        : 'processed';
    const reconciliationStatus: RunImportResult['reconciliationStatus'] =
      coverageMode === 'authoritative' ? (reconcileEligible ? 'completed' : 'blocked') : 'skipped';
    const finishBatch = writeBatch(db);
    finishBatch.update(importRef, {
      status,
      finished_at: now(),
      last_confirmed_batch: batchNo,
      missing_rows: missingRows,
      restored_rows: restoredRows,
      reconciliation_status: reconciliationStatus,
      reconciliation_blocked_reasons: reconciliation?.blockedReasons ?? [],
      updated_at: now(),
      updated_by: user.uid,
    });
    await commitPhase('cerrar importación', finishBatch);
    ctx.onProgress?.(ops.length, ops.length, batchNo);

    return { importId, status, missingRows, restoredRows, reconciliationStatus };
  } catch (err) {
    await markImportFailed(db, importRef, user, err);
    throw err;
  }
}

/**
 * ¿El padre (espacio o grupo) conserva al menos una línea activa? Consulta por
 * una sola igualdad (auto-indexada) y evalúa `active` en memoria para no exigir
 * un índice compuesto nuevo. Acota la lectura por seguridad.
 */
async function hasActiveChild(
  db: Firestore,
  field: 'campaign_space_id' | 'campaign_group_id',
  parentId: string,
): Promise<boolean> {
  const snap = await getDocs(
    query(collection(db, COLLECTIONS.campaignLines), where(field, '==', parentId), limit(500)),
  );
  return snap.docs.some((d) => (d.data() as { active?: boolean }).active === true);
}
