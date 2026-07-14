import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { Upload, Download, CheckCircle2, FileWarning } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { EmptyState, LoadingState, ErrorState } from '@/components/feedback/States';
import { IssuesList } from '@/components/results/IssuesList';
import { usePermissions } from '@/hooks/usePermissions';
import { useResultsImport } from '@/features/results/useResultsImport';
import { downloadValidationReport } from '@/features/results/validation-report';

export function ResultsNewImportPage() {
  const { can } = usePermissions();
  const canImport = can('results.import');
  const { state, selectFile, confirmImport, reset } = useResultsImport();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <AppLayout title="Resultados · Nueva carga" description="Importa un reporte CSV exportado desde Kevel">
      {!canImport ? (
        <EmptyState title="Sin permiso" description="No tienes permiso para importar resultados." />
      ) : (
        <div className="space-y-4">
          <div className="card p-5">
            <h2 className="text-base font-bold text-slate-900">Importar reporte Kevel</h2>
            <p className="mt-1 text-xs text-slate-400">
              Solo archivos <strong>.csv</strong> con el contrato Kevel (42 columnas). El archivo se valida en tu
              navegador; solo se guardan los datos procesados, agregados y las incidencias.
            </p>
            <div className="mt-4">
              <input
                ref={inputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void selectFile(file);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={state.status === 'processing' || state.status === 'writing'}
                className="focus-ring inline-flex items-center gap-2 rounded-lg bg-accent-blue px-4 py-2 text-sm font-medium text-white hover:bg-accent-blue/90 disabled:opacity-60"
              >
                <Upload className="h-4 w-4" aria-hidden="true" /> Seleccionar archivo CSV
              </button>
            </div>
          </div>

          {state.status === 'processing' && <LoadingState label={state.message} />}
          {state.status === 'error' && <ErrorState description={state.message} onRetry={reset} />}

          {state.status === 'writing' && (
            <div className="card p-5">
              <p className="mb-2 text-sm text-slate-700">Guardando resultados… {state.done}/{state.total}</p>
              <div className="h-2 w-full rounded-full bg-slate-100">
                <div
                  className="h-2 rounded-full bg-accent-blue transition-all"
                  style={{ width: `${state.total ? Math.round((state.done / state.total) * 100) : 0}%` }}
                />
              </div>
            </div>
          )}

          {state.status === 'done' && (
            <div className="card flex flex-col items-start gap-2 p-5">
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-accent-green">
                <CheckCircle2 className="h-5 w-5" aria-hidden="true" /> Importación completada
              </span>
              <p className="text-sm text-slate-600">
                Se guardaron <strong>{state.rows}</strong> resultados diarios y <strong>{state.weekly}</strong>{' '}
                resultados semanales.
              </p>
              <div className="flex gap-3">
                <button onClick={reset} className="focus-ring rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  Cargar otro
                </button>
                <Link to="/resultados/historial" className="focus-ring rounded-lg bg-accent-blue px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-blue/90">
                  Ver historial
                </Link>
              </div>
            </div>
          )}

          {state.status === 'validated' && (
            <>
              <div className="card p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-800">{state.fileName}</h3>
                    <p className="text-xs text-slate-500">
                      {state.plan.enriched.length} líneas diarias
                      {state.plan.mergedRows > 0 && ` (${state.plan.mergedRows} filas agrupadas)`} ·{' '}
                      {state.plan.periodIds.length} periodo(s) ·{' '}
                      <span className="font-semibold text-red-600">{state.plan.errorCount} error(es)</span> ·{' '}
                      <span className="font-semibold text-amber-700">{state.plan.warningCount} aviso(s)</span>
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {state.plan.issues.length > 0 && (
                      <button
                        onClick={() =>
                          downloadValidationReport(state.plan.issues, `validacion-${state.fileName}.csv`)
                        }
                        className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <Download className="h-4 w-4" aria-hidden="true" /> Descargar reporte
                      </button>
                    )}
                    <button onClick={reset} className="focus-ring rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
                      Cancelar
                    </button>
                    <button
                      onClick={() => void confirmImport()}
                      disabled={state.plan.blocks}
                      title={state.plan.blocks ? 'Corrige los errores antes de importar' : undefined}
                      className="focus-ring inline-flex items-center gap-1.5 rounded-lg bg-accent-blue px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-blue/90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Confirmar importación
                    </button>
                  </div>
                </div>
                {state.plan.blocks && (
                  <p className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                    <FileWarning className="h-4 w-4" aria-hidden="true" /> El archivo tiene errores bloqueantes: no se
                    guardará nada hasta corregirlos.
                  </p>
                )}
              </div>

              {state.plan.issues.length > 0 ? (
                <div className="card overflow-hidden p-0">
                  <IssuesList issues={state.plan.issues} />
                </div>
              ) : (
                <div className="card p-5 text-sm text-accent-green">Sin incidencias. El archivo cumple el contrato.</div>
              )}
            </>
          )}
        </div>
      )}
    </AppLayout>
  );
}
