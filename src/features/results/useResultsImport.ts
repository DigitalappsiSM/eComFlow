import { useCallback, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { fileHashSha256 } from '@/lib/hashing';
import { KEVEL_TEMPLATE_VERSION, type ResultsImportMeta, type ValidationIssue } from '@/types/results';
import { parseKevelPlan } from './parse-kevel';
import { consolidateWeekly } from '@/domain/results/consolidation';
import type { KevelValidationResult } from '@/domain/results/kevel-validation';
import { fetchActivePeriods } from '@/repositories/results/periods.repository';
import {
  commitResultsImport,
  findImportByFileHash,
  findOverlappingImports,
} from '@/repositories/results/results-import.repository';

interface ValidatedState {
  status: 'validated';
  fileName: string;
  fileHash: string;
  plan: KevelValidationResult;
}

export type ResultsImportState =
  | { status: 'idle' }
  | { status: 'processing'; message: string }
  | ValidatedState
  | { status: 'writing'; done: number; total: number }
  | { status: 'done'; importId: string; rows: number; weekly: number }
  | { status: 'error'; message: string };

function block(code: string, description: string, suggested: string): ValidationIssue {
  return {
    severity: 'error',
    code,
    row_number: null,
    field: null,
    received_value: null,
    description,
    suggested_action: suggested,
    blocks_import: true,
  };
}

function withExtraIssues(plan: KevelValidationResult, extra: ValidationIssue[]): KevelValidationResult {
  if (extra.length === 0) return plan;
  const issues = [...extra, ...plan.issues];
  const errorCount = issues.filter((i) => i.severity === 'error').length;
  return { ...plan, issues, errorCount, blocks: errorCount > 0 };
}

/**
 * Compacta incidencias para persistencia: guarda hasta `perCode` ejemplos por
 * código + un resumen con el total. El detalle completo siempre está en el
 * reporte descargable de la validación.
 */
const MAX_ISSUES_PER_CODE = 20;
function compressIssues(issues: ValidationIssue[], perCode = MAX_ISSUES_PER_CODE): ValidationIssue[] {
  const byCode = new Map<string, ValidationIssue[]>();
  for (const i of issues) {
    const list = byCode.get(i.code) ?? [];
    list.push(i);
    byCode.set(i.code, list);
  }
  const out: ValidationIssue[] = [];
  for (const [code, list] of byCode) {
    out.push(...list.slice(0, perCode));
    if (list.length > perCode) {
      out.push({
        ...list[0]!,
        row_number: null,
        received_value: String(list.length),
        description: `… y ${list.length - perCode} incidencia(s) más con código ${code} (total ${list.length}).`,
      });
    }
  }
  return out;
}

/**
 * Acota una operación de red para que un cuelgue (sin conexión, permisos, etc.)
 * se convierta en un error accionable en vez de dejar la UI colgada.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Tiempo de espera agotado al ${label}. Revisa tu conexión o los permisos de Firestore.`)),
        ms,
      ),
    ),
  ]);
}

const NET_TIMEOUT_MS = 45_000;

export function useResultsImport() {
  const { firebaseUser, appUser } = useAuth();
  const [state, setState] = useState<ResultsImportState>({ status: 'idle' });

  const actor = useMemo(
    () => (firebaseUser && appUser ? { uid: firebaseUser.uid, email: appUser.email } : null),
    [firebaseUser, appUser],
  );

  const reset = useCallback(() => setState({ status: 'idle' }), []);

  const selectFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setState({ status: 'error', message: 'Solo se aceptan archivos .csv exportados desde Kevel.' });
      return;
    }
    try {
      const progress = (message: string) => setState({ status: 'processing', message });

      progress('Leyendo el archivo…');
      const [text, buffer] = await Promise.all([file.text(), file.arrayBuffer()]);

      progress('Calculando la huella del archivo…');
      const fileHash = await fileHashSha256(buffer);

      progress('Cargando el catálogo de periodos…');
      const periods = await withTimeout(fetchActivePeriods(), NET_TIMEOUT_MS, 'cargar el catálogo de periodos');

      const extra: ValidationIssue[] = [];
      if (periods.length === 0) {
        extra.push(
          block(
            'NO_PERIOD_CATALOG',
            'No hay catálogo de periodos ecommerce cargado.',
            'Siembre ecommerce_periods antes de importar resultados.',
          ),
        );
      }

      progress('Validando las filas del archivo…');
      const parsed = await parseKevelPlan(text, periods);

      progress('Verificando duplicados y traslapes…');
      const duplicate = await withTimeout(findImportByFileHash(fileHash), NET_TIMEOUT_MS, 'verificar duplicados');
      if (duplicate?.status === 'completed') {
        extra.push(
          block('FILE_ALREADY_IMPORTED', 'Este archivo ya fue procesado.', 'No es necesario reimportarlo.'),
        );
      } else if (duplicate) {
        // Carga previa interrumpida (p. ej. se cerró la pestaña): se puede reanudar.
        extra.push({
          severity: 'warning',
          code: 'IMPORT_RESUME',
          row_number: null,
          field: null,
          received_value: duplicate.status,
          description: 'Existe una carga interrumpida de este archivo; al confirmar se reanudará y completará.',
          suggested_action: 'Confirma la importación para terminar de escribir las filas faltantes.',
          blocks_import: false,
        });
      }
      if (parsed.actualStartDate && parsed.actualEndDate) {
        const overlaps = await withTimeout(
          findOverlappingImports(parsed.actualStartDate, parsed.actualEndDate),
          NET_TIMEOUT_MS,
          'verificar traslapes de rango',
        );
        const others = overlaps.filter((o: ResultsImportMeta) => o.file_hash !== fileHash);
        if (others.length > 0) {
          extra.push(
            block(
              'RANGE_OVERLAP',
              `El rango se traslapa con otra importación (${others.map((o) => o.file_name).join(', ')}).`,
              'Los reportes no deben encimarse.',
            ),
          );
        }
      }

      setState({ status: 'validated', fileName: file.name, fileHash, plan: withExtraIssues(parsed, extra) });
    } catch (err) {
      setState({ status: 'error', message: err instanceof Error ? err.message : 'Error al procesar el archivo.' });
    }
  }, []);

  const confirmImport = useCallback(async () => {
    if (state.status !== 'validated' || state.plan.blocks || !actor) return;
    const { plan, fileName, fileHash } = state;
    try {
      const { weekly, reconciliation } = consolidateWeekly(plan.enriched, fileHash);
      if (!reconciliation.ok) {
        setState({ status: 'error', message: 'La reconciliación semanal falló; no se guardó nada.' });
        return;
      }
      const total = plan.enriched.length + weekly.length;
      setState({ status: 'writing', done: 0, total });
      await commitResultsImport({
        fileName,
        fileHash,
        templateVersion: KEVEL_TEMPLATE_VERSION,
        declaredStart: plan.actualStartDate,
        declaredEnd: plan.actualEndDate,
        actualStart: plan.actualStartDate,
        actualEnd: plan.actualEndDate,
        periodIds: plan.periodIds,
        enriched: plan.enriched,
        weekly,
        issues: compressIssues(plan.issues.filter((i) => i.severity === 'warning')),
        warningCount: plan.warningCount,
        actor,
        onProgress: (done, t) => setState({ status: 'writing', done, total: t }),
      });
      setState({ status: 'done', importId: fileHash, rows: plan.enriched.length, weekly: weekly.length });
    } catch (err) {
      setState({ status: 'error', message: err instanceof Error ? err.message : 'Error al guardar la importación.' });
    }
  }, [state, actor]);

  return { state, selectFile, confirmImport, reset };
}
