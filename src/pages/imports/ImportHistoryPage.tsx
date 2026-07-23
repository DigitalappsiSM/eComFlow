import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { EmptyState, ErrorState, LoadingState } from '@/components/feedback/States';
import { fetchRecentImports } from '@/repositories/imports.repository';
import type { ImportRecord, ImportStatus } from '@/types/import';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; imports: ImportRecord[] };

const STATUS_STYLES: Partial<Record<ImportStatus, string>> = {
  processed: 'bg-green-50 text-accent-green',
  partially_processed: 'bg-amber-50 text-amber-700',
  rejected: 'bg-red-50 text-red-600',
  failed: 'bg-red-50 text-red-600',
  cancelled: 'bg-slate-100 text-slate-500',
  processing: 'bg-blue-50 text-accent-blue',
};

function fmtDate(ts: ImportRecord['uploaded_at']): string {
  const anyTs = ts as { toDate?: () => Date } | null;
  if (anyTs?.toDate) return anyTs.toDate().toLocaleString('es-MX');
  return '—';
}

export function ImportHistoryPage() {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    fetchRecentImports(25)
      .then((imports) => active && setState({ status: 'ready', imports }))
      .catch(
        (err: unknown) =>
          active &&
          setState({
            status: 'error',
            message: err instanceof Error ? err.message : 'Error desconocido.',
          }),
      );
    return () => {
      active = false;
    };
  }, []);

  return (
    <AppLayout title="Historial de cargas" description="Importaciones procesadas y su resultado">
      {state.status === 'loading' && <LoadingState />}
      {state.status === 'error' && <ErrorState description={state.message} />}
      {state.status === 'ready' &&
        (state.imports.length === 0 ? (
          <EmptyState
            title="Sin importaciones registradas"
            description="Cuando confirme una carga desde «Nueva carga», aparecerá aquí."
          />
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                  <th className="px-4 py-3 font-medium">Archivo</th>
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  <th className="px-4 py-3 font-medium">Total</th>
                  <th className="px-4 py-3 font-medium">Nuevos</th>
                  <th className="px-4 py-3 font-medium">Actualizados</th>
                  <th className="px-4 py-3 font-medium">Sin cambios</th>
                  <th className="px-4 py-3 font-medium">Rechazados</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {state.imports.map((imp) => (
                  <tr key={imp.import_id} className="border-b border-slate-100">
                    <td className="px-4 py-3 text-slate-700">{imp.file_name}</td>
                    <td className="px-4 py-3 text-slate-500">{fmtDate(imp.uploaded_at)}</td>
                    <td className="px-4 py-3 tabular-nums">{imp.total_rows}</td>
                    <td className="px-4 py-3 tabular-nums">{imp.new_lines}</td>
                    <td className="px-4 py-3 tabular-nums">{imp.updated_rows}</td>
                    <td className="px-4 py-3 tabular-nums">{imp.unchanged_rows}</td>
                    <td className="px-4 py-3 tabular-nums">{imp.rejected_rows}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          STATUS_STYLES[imp.status] ?? 'bg-slate-100 text-slate-500'
                        }`}
                        title={imp.status === 'failed' ? imp.failure_reason ?? undefined : undefined}
                      >
                        {imp.status}
                      </span>
                      {imp.status === 'failed' && imp.failure_reason && (
                        <p className="mt-1 max-w-xs text-xs text-red-600" title={imp.failure_reason}>
                          {imp.failure_reason}
                        </p>
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
