/**
 * Escritura de una importación Kevel (§8, §9, §11, §26). Solo colecciones
 * `results_*` (dominio aislado). Nunca escribe en colecciones operativas.
 *
 * - Deduplica por `file_hash` (ID del doc de importación).
 * - Bloquea traslapes de rango con importaciones completadas.
 * - `results_daily` es inmutable (IDs deterministas por clave diaria).
 * - Consolida y escribe `results_weekly`.
 * - Registra incidencias y auditoría append-only en colecciones `results_*`.
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
import type { ResultsImportMeta, ValidationIssue } from '@/types/results';
import type { EnrichedResultRow } from '@/domain/results/kevel-validation';
import type { WeeklyResult } from '@/domain/results/consolidation';

interface Actor {
  uid: string;
  email: string;
}

const BATCH_LIMIT = 450;

function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && aEnd >= bStart;
}

/** Devuelve la importación existente con ese file_hash (o null). */
export async function findImportByFileHash(fileHash: string): Promise<ResultsImportMeta | null> {
  const db = requireDb();
  const snap = await getDoc(doc(db, COLLECTIONS.resultsImports, fileHash));
  return snap.exists() ? (snap.data() as ResultsImportMeta) : null;
}

/** Importaciones completadas cuyo rango se traslapa con [start, end]. */
export async function findOverlappingImports(
  start: string,
  end: string,
): Promise<ResultsImportMeta[]> {
  const db = requireDb();
  const snap = await getDocs(
    query(collection(db, COLLECTIONS.resultsImports), where('status', '==', 'completed')),
  );
  return snap.docs
    .map((d) => d.data() as ResultsImportMeta)
    .filter((imp) => rangesOverlap(start, end, imp.actual_start_date, imp.actual_end_date));
}

export async function fetchResultsImports(max = 50): Promise<ResultsImportMeta[]> {
  const db = requireDb();
  const snap = await getDocs(collection(db, COLLECTIONS.resultsImports));
  return snap.docs
    .map((d) => d.data() as ResultsImportMeta)
    .sort((a, b) => b.actual_end_date.localeCompare(a.actual_end_date))
    .slice(0, max);
}

export async function fetchValidationIssues(importId: string): Promise<ValidationIssue[]> {
  const db = requireDb();
  const snap = await getDocs(
    query(collection(db, COLLECTIONS.resultsValidationIssues), where('results_import_id', '==', importId)),
  );
  return snap.docs.map((d) => d.data() as ValidationIssue);
}

/** IDs de los `results_daily` ya escritos para esta importación (para reanudar). */
async function fetchDailyKeysByImport(importId: string): Promise<Set<string>> {
  const db = requireDb();
  const snap = await getDocs(
    query(collection(db, COLLECTIONS.resultsDaily), where('results_import_id', '==', importId)),
  );
  return new Set(snap.docs.map((d) => d.id));
}

/** Claves de los `results_weekly` ya escritos para esta importación (para reanudar). */
async function fetchWeeklyKeysByImport(importId: string): Promise<Set<string>> {
  const db = requireDb();
  const snap = await getDocs(
    query(collection(db, COLLECTIONS.resultsWeekly), where('source_import_ids', 'array-contains', importId)),
  );
  return new Set(snap.docs.map((d) => d.id));
}

/** ¿Ya hay incidencias registradas para esta importación? (evita duplicarlas al reanudar). */
async function hasIssuesForImport(importId: string): Promise<boolean> {
  const db = requireDb();
  const snap = await getDocs(
    query(collection(db, COLLECTIONS.resultsValidationIssues), where('results_import_id', '==', importId)),
  );
  return !snap.empty;
}

function dailyDoc(e: EnrichedResultRow, importId: string, actor: Actor) {
  const r = e.row;
  return {
    result_key_hash: e.result_key_hash,
    result_key_raw: e.result_key_raw,
    results_import_id: importId,
    period_id: e.period_id,
    date: r.date,
    // Identificadores y nombres originales Kevel (§9).
    advertiser: r.advertiser,
    advertiser_id: r.advertiser_id,
    campaign: r.campaign,
    campaign_id: r.campaign_id,
    flight: r.flight,
    flight_id: r.flight_id,
    creative: r.creative,
    creative_id: r.creative_id,
    ad: r.ad,
    ad_id: r.ad_id,
    ad_type: r.ad_type,
    ad_type_id: r.ad_type_id,
    site: r.site,
    site_id: r.site_id,
    zone: r.zone,
    zone_id: r.zone_id,
    rate_type: r.rate_type,
    flight_start_date: r.flight_start_date,
    flight_end_date: r.flight_end_date,
    device: r.device,
    // Métricas numéricas normalizadas (§9).
    impressions: r.impressions,
    unfiltered_impressions: r.unfiltered_impressions,
    invalid_ua_impressions: r.invalid_ua_impressions,
    clicks: r.clicks,
    invalid_ua_clicks: r.invalid_ua_clicks,
    test_clicks: r.test_clicks,
    duplicate_impression_clicks: r.duplicate_impression_clicks,
    duplicate_ip_clicks: r.duplicate_ip_clicks,
    suspicious_clicks: r.suspicious_clicks,
    unique_clicks: r.unique_clicks,
    unfiltered_clicks: r.unfiltered_clicks,
    // Impresiones estimadas (§14): separadas del dato real (impressions).
    impressions_estimated: e.impressions_estimated,
    impressions_is_estimated: e.impressions_is_estimated,
    revenue: r.revenue,
    gmv: r.gmv,
    price: r.price,
    // Ratios: recalculados + reportados (referencia).
    ctr: e.ctr,
    unique_ctr: e.unique_ctr,
    ctr_reported: r.ctr_reported,
    unique_ctr_reported: r.unique_ctr_reported,
    warnings: e.warnings,
    created_at: serverTimestamp(),
    created_by: actor.uid,
  };
}

function weeklyDoc(w: WeeklyResult, actor: Actor) {
  return {
    ...w,
    created_at: serverTimestamp(),
    created_by: actor.uid,
    updated_at: serverTimestamp(),
    updated_by: actor.uid,
  };
}

export interface CommitResultsImportInput {
  fileName: string;
  fileHash: string;
  templateVersion: string;
  declaredStart: string;
  declaredEnd: string;
  actualStart: string;
  actualEnd: string;
  periodIds: string[];
  enriched: EnrichedResultRow[];
  weekly: WeeklyResult[];
  issues: ValidationIssue[];
  warningCount: number;
  actor: Actor;
  onProgress?: (done: number, total: number) => void;
}

async function commitChunks<T>(
  items: readonly T[],
  writeItem: (batch: ReturnType<typeof writeBatch>, item: T) => void,
  onChunk?: (done: number) => void,
): Promise<void> {
  const db = requireDb();
  for (let i = 0; i < items.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const item of items.slice(i, i + BATCH_LIMIT)) writeItem(batch, item);
    await batch.commit();
    onChunk?.(Math.min(i + BATCH_LIMIT, items.length));
  }
}

/**
 * Escribe la importación completa. Reanudable: si una carga previa quedó a medias
 * (p. ej. se cerró la pestaña), re-ejecutar con el mismo archivo escribe solo los
 * documentos faltantes y la cierra. Los `results_daily`/`results_weekly` son
 * inmutables (IDs deterministas), por eso los ya escritos se OMITEN en lugar de
 * reescribirse: reescribirlos violaría las reglas de inmutabilidad.
 */
export async function commitResultsImport(input: CommitResultsImportInput): Promise<string> {
  const db = requireDb();
  const importId = input.fileHash;
  const total = input.enriched.length + input.weekly.length;
  let done = 0;
  const bump = (n: number) => {
    done = n;
    input.onProgress?.(done, total);
  };

  // ¿Reanudación? Si el doc de importación ya existe y no está completado, algunos
  // documentos diarios/semanales pueden estar escritos: se omiten (son inmutables).
  const priorSnap = await getDoc(doc(db, COLLECTIONS.resultsImports, importId));
  const isNew = !priorSnap.exists();
  const resuming = !isNew && (priorSnap.data() as ResultsImportMeta).status !== 'completed';
  const [existingDaily, existingWeekly] = resuming
    ? await Promise.all([fetchDailyKeysByImport(importId), fetchWeeklyKeysByImport(importId)])
    : [new Set<string>(), new Set<string>()];

  // Doc de importación (status writing).
  const meta: ResultsImportMeta & Record<string, unknown> = {
    results_import_id: importId,
    file_name: input.fileName,
    file_hash: input.fileHash,
    template_version: input.templateVersion,
    declared_start_date: input.declaredStart,
    declared_end_date: input.declaredEnd,
    actual_start_date: input.actualStart,
    actual_end_date: input.actualEnd,
    period_ids: input.periodIds,
    status: 'writing',
    total_rows: input.enriched.length,
    error_count: 0,
    warning_count: input.warningCount,
  };
  await (async () => {
    const batch = writeBatch(db);
    batch.set(
      doc(db, COLLECTIONS.resultsImports, importId),
      {
        ...meta,
        // created_* solo en la creación inicial; no se pisa al reanudar.
        ...(isNew ? { created_at: serverTimestamp(), created_by: input.actor.uid } : {}),
        updated_at: serverTimestamp(),
        updated_by: input.actor.uid,
      },
      { merge: true },
    );
    await batch.commit();
  })();

  // results_daily (inmutable) por lotes; se escriben solo los faltantes.
  const pendingDaily = input.enriched.filter((e) => !existingDaily.has(e.result_key_hash));
  await commitChunks(
    pendingDaily,
    (batch, e) => batch.set(doc(db, COLLECTIONS.resultsDaily, e.result_key_hash), dailyDoc(e, importId, input.actor)),
    (d) => bump(existingDaily.size + d),
  );

  // results_weekly consolidado por lotes; se escriben solo los faltantes.
  const pendingWeekly = input.weekly.filter((w) => !existingWeekly.has(w.weekly_result_key_hash));
  await commitChunks(
    pendingWeekly,
    (batch, w) => batch.set(doc(db, COLLECTIONS.resultsWeekly, w.weekly_result_key_hash), weeklyDoc(w, input.actor)),
    (d) => bump(input.enriched.length + existingWeekly.size + d),
  );

  // Incidencias (advertencias) + auditoría. Al reanudar, solo si aún no existen.
  const writeIssues = !resuming || !(await hasIssuesForImport(importId));
  if (writeIssues) {
    await commitChunks(input.issues, (batch, issue) => {
      const id = doc(collection(db, COLLECTIONS.resultsValidationIssues)).id;
      batch.set(doc(db, COLLECTIONS.resultsValidationIssues, id), {
        ...issue,
        issue_id: id,
        results_import_id: importId,
        created_at: serverTimestamp(),
        created_by: input.actor.uid,
      });
    });
  }

  await (async () => {
    const batch = writeBatch(db);
    // Cierra la importación.
    batch.set(
      doc(db, COLLECTIONS.resultsImports, importId),
      { status: 'completed', updated_at: serverTimestamp(), updated_by: input.actor.uid },
      { merge: true },
    );
    // Auditoría append-only del módulo Resultados.
    const histId = doc(collection(db, COLLECTIONS.resultsChangeHistory)).id;
    batch.set(doc(db, COLLECTIONS.resultsChangeHistory, histId), {
      change_id: histId,
      entity_type: 'results_import',
      entity_id: importId,
      change_type: 'import_completed',
      new_value: `${input.enriched.length} filas · ${input.weekly.length} semanales`,
      created_at: serverTimestamp(),
      created_by: input.actor.uid,
      created_by_email: input.actor.email,
    });
    await batch.commit();
  })();

  bump(total);
  return importId;
}
