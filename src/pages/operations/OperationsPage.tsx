import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { EmptyState, ErrorState, LoadingState } from '@/components/feedback/States';
import { StatusBadge } from '@/components/operations/StatusBadge';
import { LineDetailDrawer } from '@/components/operations/LineDetailDrawer';
import { FilterBar } from '@/components/filters/FilterBar';
import { useOperations } from '@/features/operations/useOperations';
import { usePermissions } from '@/hooks/usePermissions';
import { computeStatus } from '@/domain/campaign-status';
import { CHECK_KEYS, type CheckKey } from '@/domain/progress';
import { isCheckRequiredForLine, requiredChecksForLine } from '@/domain/operation-rules';
import { todayIso } from '@/lib/dates';
import type { OperationRow } from '@/repositories/operations.repository';

const CHECK_LABELS: Record<CheckKey, string> = {
  correo_enviado: 'Correo',
  artes: 'Artes',
  validacion: 'Validación',
  link: 'Link',
  kevel: 'Kevel',
  testigos_app: 'T. App',
  testigos_web: 'T. Web',
};


const CONTINUITY_LABELS: Record<string, string> = {
  fijacion: 'Fijación',
  continua: 'Continua',
};

function OperationBadge({ value }: { value: string | null | undefined }) {
  const label = value || 'Sin tipo';
  const tone = label === 'DIGITAL SIGNAGE' ? 'bg-violet-50 text-accent-violet' : 'bg-blue-50 text-accent-blue';
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}>{label}</span>;
}

function ContinuityBadge({ value }: { value: string | null | undefined }) {
  const label = value ? CONTINUITY_LABELS[value] ?? value : 'Sin clasificar';
  const tone = value === 'continua' ? 'bg-green-50 text-accent-green' : 'bg-amber-50 text-amber-700';
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}>{label}</span>;
}

export function OperationsPage() {
  const ops = useOperations(500);
  const { can } = usePermissions();
  const canWrite = can('operations.write');
  const [selected, setSelected] = useState<OperationRow | null>(null);
  const today = todayIso();

  return (
    <AppLayout title="Seguimiento operativo" description="Estado y avance de cada línea operativa">
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">
            Fijación desde
          </label>
          <input
            type="date"
            value={ops.fijacionDesde}
            onChange={(e) => ops.setFijacionDesde(e.target.value)}
            max={ops.fijacionHasta || undefined}
            className="focus-ring rounded-lg border border-slate-300 px-3 py-2 text-sm"
            aria-label="Fijación desde"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">
            Fijación hasta
          </label>
          <input
            type="date"
            value={ops.fijacionHasta}
            onChange={(e) => ops.setFijacionHasta(e.target.value)}
            min={ops.fijacionDesde || undefined}
            className="focus-ring rounded-lg border border-slate-300 px-3 py-2 text-sm"
            aria-label="Fijación hasta"
          />
        </div>
        {(ops.fijacionDesde || ops.fijacionHasta) && (
          <button
            type="button"
            onClick={() => {
              ops.setFijacionDesde('');
              ops.setFijacionHasta('');
            }}
            className="focus-ring rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Limpiar fechas
          </button>
        )}
      </div>

      <FilterBar
        fields={ops.filterFields}
        values={ops.filters}
        onChange={ops.setFilter}
        onClear={ops.clearFilters}
        search={{
          value: ops.search,
          onChange: ops.setSearch,
          placeholder: 'Buscar cliente, campaña, creatividad…',
        }}
        meta={`${ops.rows.length} de ${ops.totalLoaded} líneas`}
      />

      {ops.status === 'loading' && <LoadingState label="Cargando líneas operativas…" />}
      {ops.status === 'error' && <ErrorState description={ops.message ?? undefined} onRetry={ops.reload} />}

      {ops.status === 'ready' &&
        (ops.rows.length === 0 ? (
          <EmptyState
            title="Sin líneas operativas"
            description="Cuando se procese una importación, las líneas aparecerán aquí para su seguimiento."
          />
        ) : (
          <>
            {canWrite && ops.visiblePendingCount > 0 && (
              <div className="mb-3 flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-slate-600">
                  Hay <strong>{ops.visiblePendingCount}</strong> línea(s) filtrada(s) con checks pendientes.
                </p>
                <button
                  type="button"
                  disabled={ops.bulkStatus === 'saving'}
                  onClick={() => void ops.markAllVisibleChecks()}
                  className="focus-ring inline-flex w-fit items-center gap-1.5 rounded-lg bg-accent-blue px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-blue/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {ops.bulkStatus === 'saving'
                    ? 'Rellenando…'
                    : `Rellenar todo lo filtrado (${ops.visiblePendingCount})`}
                </button>
              </div>
            )}
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[1450px] text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50">
                  <tr className="text-left text-xs uppercase text-slate-500">
                    <th className="sticky left-0 bg-slate-50 px-3 py-2 font-medium">Cliente / Campaña</th>
                    <th className="px-3 py-2 font-medium">Operación</th>
                    <th className="px-3 py-2 font-medium">Periodo</th>
                    <th className="px-3 py-2 font-medium">Artículo</th>
                    <th className="px-3 py-2 font-medium">Creatividad</th>
                    {CHECK_KEYS.map((k) => (
                      <th key={k} className="px-2 py-2 text-center font-medium">
                        {CHECK_LABELS[k]}
                      </th>
                    ))}
                    <th className="px-3 py-2 font-medium">Comentarios</th>
                    <th className="px-3 py-2 font-medium">Avance</th>
                    <th className="px-3 py-2 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {ops.rows.map((row) => {
                    const required = requiredChecksForLine(row.line);
                    const status = computeStatus({
                      fechaFijacion: row.line.fecha_fijacion,
                      fechaRetirada: row.line.fecha_retirada,
                      checks: row.checks,
                      cancelled: row.line.cancelled,
                      today,
                      requiredChecks: required,
                    });
                    const hasPendingChecks = required.some((k) => !row.checks[k]);
                    const canMarkAll = canWrite && hasPendingChecks;
                    const savingLine = ops.savingLineId === row.line.campaign_line_id;
                    return (
                      <tr key={row.line.campaign_line_id} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="sticky left-0 bg-white px-3 py-2">
                          <button
                            onClick={() => setSelected(row)}
                            className="focus-ring text-left"
                          >
                            <span className="block font-medium text-accent-blue">
                              {row.line.cliente_original}
                            </span>
                            <span className="block text-xs text-slate-500">
                              {row.line.numero_campaña_original}
                            </span>
                          </button>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-col gap-1">
                            <OperationBadge value={row.line.tipo_operacion} />
                            <span className="text-xs text-slate-400">{row.line.cadena ?? 'Sin cadena'}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-col gap-1">
                            <span className="font-medium text-slate-700">{row.line.periodo_codigo || row.line.periodo_original || '—'}</span>
                            <ContinuityBadge value={row.line.tipo_campana_periodo} />
                            <span className="text-[11px] text-slate-400">
                              {row.line.periodo_inicio ?? row.line.fecha_fijacion} →{' '}
                              {row.line.periodo_fin ?? row.line.fecha_retirada}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-slate-600">{row.line.placement_name_snapshot}</td>
                        <td className="px-3 py-2">
                          <span className="block font-mono text-xs text-slate-600">
                            {row.line.creatividad_id_original}
                          </span>
                          <span className="block max-w-44 truncate text-xs text-slate-400">
                            {row.line.creatividad_descripcion_original || row.line.creatividad_titulo_original || 'Sin descripción'}
                          </span>
                        </td>
                        {CHECK_KEYS.map((k) => {
                          const required = isCheckRequiredForLine(row.line, k);
                          return (
                            <td key={k} className="px-2 py-2 text-center">
                              {required ? (
                                <button
                                  type="button"
                                  disabled={!canWrite}
                                  onClick={() => void ops.toggleCheck(row, k)}
                                  aria-pressed={row.checks[k]}
                                  aria-label={`${CHECK_LABELS[k]} ${row.checks[k] ? 'completado' : 'pendiente'}`}
                                  className={`focus-ring h-5 w-5 rounded border ${
                                    row.checks[k]
                                      ? 'border-accent-green bg-accent-green text-white'
                                      : 'border-slate-300 bg-white text-transparent'
                                  } ${canWrite ? 'cursor-pointer' : 'cursor-default'}`}
                                >
                                  ✓
                                </button>
                              ) : (
                                <span className="text-xs text-slate-300" title="No aplica">
                                  —
                                </span>
                              )}
                            </td>
                          );
                        })}
                        <td className="px-3 py-2">
                          <textarea
                            key={row.comentarios ?? ''}
                            defaultValue={row.comentarios ?? ''}
                            disabled={!canWrite}
                            rows={2}
                            onBlur={(e) => {
                              if (e.target.value.trim() !== (row.comentarios ?? '')) {
                                void ops.setComment(row, e.target.value);
                              }
                            }}
                            placeholder="Agregar nota…"
                            className="focus-ring w-48 resize-y rounded border border-transparent px-1.5 py-1 text-sm hover:border-slate-300 focus:border-slate-300 disabled:bg-transparent"
                            aria-label="Comentarios de la línea"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-col gap-1.5">
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-16 rounded-full bg-slate-100">
                                <div
                                  className="h-1.5 rounded-full bg-accent-blue"
                                  style={{ width: `${row.progress}%` }}
                                />
                              </div>
                              <span className="text-xs tabular-nums text-slate-500">{row.progress}%</span>
                            </div>
                            {canMarkAll && (
                              <button
                                type="button"
                                disabled={savingLine}
                                onClick={() => void ops.markLineChecks(row)}
                                className="focus-ring w-fit rounded border border-accent-blue px-2 py-0.5 text-[11px] font-medium text-accent-blue hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
                                title="Rellenar todos los checks obligatorios de esta línea"
                              >
                                {savingLine ? 'Rellenando…' : 'Rellenar todo'}
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <StatusBadge status={status} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {ops.hasMore && (
              <div className="mt-4 text-center">
                <button
                  onClick={ops.loadMore}
                  className="focus-ring rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cargar más
                </button>
              </div>
            )}
          </>
        ))}

      {selected && <LineDetailDrawer row={selected} onClose={() => setSelected(null)} />}
    </AppLayout>
  );
}
