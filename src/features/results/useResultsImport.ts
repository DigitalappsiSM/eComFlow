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
      setState({ status: 'processing', message: 'Leyendo y validando el archivo…' });
      const [text, buffer] = await Promise.all([file.text(), file.arrayBuffer()]);
      const fileHash = await fileHashSha256(buffer);
      const periods = await fetchActivePeriods();

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

      const parsed = await parseKevelPlan(text, periods);

      const duplicate = await findImportByFileHash(fileHash);
      if (duplicate) {
        extra.push(
          block('FILE_ALREADY_IMPORTED', 'Este archivo ya fue procesado.', 'No es necesario reimportarlo.'),
        );
      }
      if (parsed.actualStartDate && parsed.actualEndDate) {
        const overlaps = await findOverlappingImports(parsed.actualStartDate, parsed.actualEndDate);
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
        issues: plan.issues.filter((i) => i.severity === 'warning'),
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
