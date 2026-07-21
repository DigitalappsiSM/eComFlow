import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { EmptyState, ErrorState, LoadingState } from '@/components/feedback/States';
import { fetchResultsImports } from '@/repositories/results/results-import.repository';
import type { ResultsImportMeta, ResultsImportStatus } from '@/types/results';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; imports: ResultsImportMeta[] };

/** Etiqueta y tono legibles por estado (una carga a medias es "interrumpida"). */
const STATUS_UI: Record<ResultsImportStatus, { label: string; tone: string }> = {
  completed: { label: 'Completada', tone: 'bg-green-50 text-accent-green' },
  writing: { label: 'Interrumpida', tone: 'bg-amber-50 text-amber-700' },
  validating: { label: 'Validando', tone: 'bg-slate-100 text-slate-500' },
  ready: { label: 'Lista', tone: 'bg-slate-100 text-slate-500' },
  failed: { label: 'Fallida', tone: 'bg-red-50 text-red-600' },
};

export function ResultsImportHistoryPage() {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    fetchResultsImports()
      .then((imports) => active && setState({ status: 'ready', imports }))
      .catch((err: unknown) => active && setState({ status: 'error', message: err instanceof Error ? err.message : 'Error.' }));
    return () => {
      active = false;
    };
  }, []);

  return (
    <AppLayout title="Resultados · Historial de cargas" description="Importaciones Kevel procesadas">
      {state.status === 'loading' && <LoadingState />}
      {state.status === 'error' && <ErrorState description={state.message} />}
      {state.status === 'ready' &&
        (state.imports.length === 0 ? (
          <EmptyState title="Sin importaciones" description="Aún no se ha procesado ningún reporte Kevel." />
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Archivo</th>
                  <th className="px-4 py-2 font-medium">Rango</th>
                  <th className="px-4 py-2 text-right font-medium">Periodos</th>
                  <th className="px-4 py-2 text-right font-medium">Filas</th>
                  <th className="px-4 py-2 text-right font-medium">Avisos</th>
                  <th className="px-4 py-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {state.imports.map((imp) => (
                  <tr key={imp.results_import_id} className="border-t border-slate-100">
                    <td className="max-w-64 truncate px-4 py-2 font-medium text-slate-700" title={imp.file_name}>
                      {imp.file_name}
                    </td>
                    <td className="px-4 py-2 text-slate-600">
                      {imp.actual_start_date} → {imp.actual_end_date}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-500">{imp.period_ids.length}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-500">{imp.total_rows}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-amber-700">{imp.warning_count}</td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_UI[imp.status]?.tone ?? 'bg-slate-100 text-slate-500'}`}>
                        {STATUS_UI[imp.status]?.label ?? imp.status}
                      </span>
                      {imp.status === 'writing' && (
                        <span className="ml-2 text-[11px] text-slate-400">Vuelve a subir el archivo para completarla.</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </AppLayout>
  );
}
