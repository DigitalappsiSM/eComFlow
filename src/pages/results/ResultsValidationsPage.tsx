import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { EmptyState, ErrorState, LoadingState } from '@/components/feedback/States';
import { IssuesList } from '@/components/results/IssuesList';
import {
  fetchResultsImports,
  fetchValidationIssues,
} from '@/repositories/results/results-import.repository';
import { downloadValidationReport } from '@/features/results/validation-report';
import type { ResultsImportMeta, ValidationIssue } from '@/types/results';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; imports: ResultsImportMeta[] };

export function ResultsValidationsPage() {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [selected, setSelected] = useState<ResultsImportMeta | null>(null);
  const [issues, setIssues] = useState<ValidationIssue[] | null>(null);

  useEffect(() => {
    let active = true;
    fetchResultsImports()
      .then((imports) => active && setState({ status: 'ready', imports }))
      .catch((err: unknown) => active && setState({ status: 'error', message: err instanceof Error ? err.message : 'Error.' }));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selected) return;
    let active = true;
    setIssues(null);
    fetchValidationIssues(selected.results_import_id)
      .then((list) => active && setIssues(list))
      .catch(() => active && setIssues([]));
    return () => {
      active = false;
    };
  }, [selected]);

  return (
    <AppLayout title="Resultados · Validaciones" description="Incidencias registradas por importación">
      {state.status === 'loading' && <LoadingState />}
      {state.status === 'error' && <ErrorState description={state.message} />}
      {state.status === 'ready' &&
        (state.imports.length === 0 ? (
          <EmptyState title="Sin importaciones" description="No hay incidencias que revisar todavía." />
        ) : (
          <div className="space-y-4">
            <div className="card p-4">
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">
                Importación
              </label>
              <select
                value={selected?.results_import_id ?? ''}
                onChange={(e) =>
                  setSelected(state.imports.find((i) => i.results_import_id === e.target.value) ?? null)
                }
                className="focus-ring w-full max-w-lg rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm"
              >
                <option value="">Selecciona una importación…</option>
                {state.imports.map((imp) => (
                  <option key={imp.results_import_id} value={imp.results_import_id}>
                    {imp.file_name} · {imp.actual_start_date}→{imp.actual_end_date} · {imp.warning_count} aviso(s)
                  </option>
                ))}
              </select>
            </div>

            {selected && issues === null && <LoadingState label="Cargando incidencias…" />}
            {selected && issues !== null && (
              issues.length === 0 ? (
                <EmptyState title="Sin incidencias registradas" description="Esta importación no generó advertencias." />
              ) : (
                <div className="card overflow-hidden p-0">
                  <div className="flex items-center justify-between border-b border-slate-100 p-4">
                    <h3 className="text-sm font-semibold text-slate-800">{issues.length} incidencia(s)</h3>
                    <button
                      onClick={() => downloadValidationReport(issues, `validacion-${selected.file_name}.csv`)}
                      className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <Download className="h-4 w-4" aria-hidden="true" /> Descargar reporte
                    </button>
                  </div>
                  <IssuesList issues={issues} />
                </div>
              )
            )}
          </div>
        ))}
    </AppLayout>
  );
}
