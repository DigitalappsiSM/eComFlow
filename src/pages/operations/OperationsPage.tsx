import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { EmptyState, ErrorState, LoadingState } from '@/components/feedback/States';
import { StatusBadge } from '@/components/operations/StatusBadge';
import { LineDetailDrawer } from '@/components/operations/LineDetailDrawer';
import { CancellationModal } from '@/components/operations/CancellationModal';
import { FilterBar } from '@/components/filters/FilterBar';
import { useOperations } from '@/features/operations/useOperations';
import { usePermissions } from '@/hooks/usePermissions';
import { computeStatus, type CampaignStatus } from '@/domain/campaign-status';
import { CHECK_KEYS, type CheckKey } from '@/domain/progress';
import { isCheckRequiredForLine, requiredChecksForLine } from '@/domain/operation-rules';
import { todayIso } from '@/lib/dates';
import { parseDrilldownParams, STATUS_LABELS as ECOMMERCE_STATUS_LABELS } from '@/domain/ecommerce-dashboard';
import { cancelledOperationalDates, isLineFullyCancelled } from '@/domain/line-cancellation';
import type { OperationRow } from '@/repositories/operations.repository';

/** Columnas ordenables de la tabla operativa. */
type SortKey = 'cliente' | 'operacion' | 'periodo' | 'articulo' | 'avance' | 'estado';
type SortState = { key: SortKey | null; dir: 'asc' | 'desc' };

// Orden de severidad para la columna Estado (problemas primero).
const STATUS_SORT: Record<CampaignStatus, number> = {
  at_risk: 0,
  incomplete: 1,
  pending: 2,
  live: 3,
  upcoming: 4,
  completed: 5,
  cancelled: 6,
};

function sortValue(row: OperationRow, key: SortKey, today: string): string | number {
  switch (key) {
    case 'cliente':
      return `${row.line.cliente_original ?? ''} ${row.line.numero_campaña_original ?? ''}`.toLowerCase();
    case 'operacion':
      return `${row.line.tipo_operacion ?? ''} ${row.line.cadena ?? ''}`.toLowerCase();
    case 'periodo':
      return row.line.periodo_inicio ?? row.line.fecha_fijacion ?? '';
    case 'articulo':
      return (row.line.placement_name_snapshot ?? '').toLowerCase();
    case 'avance':
      return row.progress;
    case 'estado':
      return STATUS_SORT[
        computeStatus({
          fechaFijacion: row.line.fecha_fijacion,
          fechaRetirada: row.line.fecha_retirada,
          checks: row.checks,
          cancelled: row.line.cancelled,
          today,
          requiredChecks: requiredChecksForLine(row.line),
        })
      ];
  }
}

function SortHeader({
  label,
  col,
  sort,
  onSort,
  className,
}: {
  label: string;
  col: SortKey;
  sort: SortState;
  onSort: (col: SortKey) => void;
  className?: string;
}) {
  const active = sort.key === col;
  return (
    <th className={`px-3 py-2 font-medium ${className ?? ''}`}>
      <button
        type="button"
        onClick={() => onSort(col)}
        className="focus-ring inline-flex items-center gap-1 uppercase hover:text-slate-700"
        aria-label={`Ordenar por ${label}`}
      >
        {label}
        <span className={`text-[10px] ${active ? 'text-accent-blue' : 'text-slate-300'}`}>
          {active ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </button>
    </th>
  );
}

const CHECK_LABELS: Record<CheckKey, string> = {
  correo_enviado: 'Correo',
  artes: 'Artes',
  validacion: 'Validación',
  link: 'Link',
  kevel: 'Ad server',
  testigos_app: 'T. App',
  testigos_web: 'T. Web',
};


const CONTINUITY_LABELS: Record<string, string> = {
  fijacion: 'Fijación',
  continua: 'Continua',
};

function DrilldownChip({ label }: { label: string }) {
  return (
    <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-accent-blue ring-1 ring-blue-200">
      {label}
    </span>
  );
}

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
  const [searchParams, setSearchParams] = useSearchParams();
  // Filtros iniciales del drill-down del dashboard (solo al montar, §11).
  const initialDrilldown = useMemo(() => parseDrilldownParams(searchParams), []); // eslint-disable-line react-hooks/exhaustive-deps
  const ops = useOperations(500, initialDrilldown);
  const { can } = usePermissions();
  const canWrite = can('operations.write');
  const [selected, setSelected] = useState<OperationRow | null>(null);
  const [cancellationTarget, setCancellationTarget] = useState<OperationRow | null>(null);
  const [sort, setSort] = useState<SortState>({ key: null, dir: 'asc' });
  const today = todayIso();

  const handleSort = (col: SortKey) =>
    setSort((prev) => (prev.key === col ? { key: col, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key: col, dir: 'asc' }));

  // Firma del CONJUNTO de filas (ids); cambia al filtrar o cargar más, pero NO
  // cuando solo cambia un check. El orden se calcula sobre esta firma para que
  // marcar un check NO reordene la tabla en vivo (las filas no "saltan"): el
  // orden se recalcula solo al cambiar de columna/dirección, filtro o página.
  const idSignature = ops.rows.map((r) => r.line.campaign_line_id).join('|');
  const orderedIds = useMemo(() => {
    if (!sort.key) return null;
    const key = sort.key;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...ops.rows]
      .sort((a, b) => {
        const va = sortValue(a, key, today);
        const vb = sortValue(b, key, today);
        const cmp =
          typeof va === 'number' && typeof vb === 'number'
            ? va - vb
            : String(va).localeCompare(String(vb), 'es');
        return cmp !== 0 ? cmp * dir : a.line.campaign_line_id.localeCompare(b.line.campaign_line_id);
      })
      .map((r) => r.line.campaign_line_id);
    // `ops.rows` se omite a propósito: usamos `idSignature` para no reordenar al marcar checks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort, idSignature, today]);

  // Reproyecta el orden congelado a las filas ACTUALES (checks al día) y
  // deduplica por id, evitando claves repetidas de React.
  const sortedRows = useMemo(() => {
    const byId = new Map(ops.rows.map((r) => [r.line.campaign_line_id, r]));
    if (!orderedIds) return [...byId.values()];
    const seen = new Set<string>();
    const out: OperationRow[] = [];
    for (const id of orderedIds) {
      const r = byId.get(id);
      if (r && !seen.has(id)) {
        out.push(r);
        seen.add(id);
      }
    }
    for (const r of ops.rows) {
      if (!seen.has(r.line.campaign_line_id)) {
        out.push(r);
        seen.add(r.line.campaign_line_id);
      }
    }
    return out;
  }, [orderedIds, ops.rows]);

  return (
    <AppLayout title="Seguimiento operativo" description="Estado y avance de cada línea operativa">
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">
            Desde
          </label>
          <input
            type="date"
            value={ops.fijacionDesde}
            onChange={(e) => ops.setFijacionDesde(e.target.value)}
            className="focus-ring rounded-lg border border-slate-300 px-3 py-2 text-sm"
            aria-label="Rango operativo desde"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">
            Hasta
          </label>
          <input
            type="date"
            value={ops.fijacionHasta}
            onChange={(e) => ops.setFijacionHasta(e.target.value)}
            className="focus-ring rounded-lg border border-slate-300 px-3 py-2 text-sm"
            aria-label="Rango operativo hasta"
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
        {ops.rangeInvalid && (
          <p role="alert" className="self-center text-xs font-medium text-red-600">
            El rango es inválido: «Desde» es posterior a «Hasta».
          </p>
        )}
        <p className="w-full text-xs text-slate-400">
          Por defecto se muestran las líneas del mes anterior, el actual y el siguiente. Ajusta «Desde/Hasta» para
          consultar otras fechas.
        </p>
      </div>

      {(ops.pendingCheck || ops.statusFilter || ops.filters.cliente || ops.filters.tipo) && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-sm">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Filtros del dashboard:</span>
          {ops.filters.tipo && <DrilldownChip label={`Tipo: ${ops.filters.tipo}`} />}
          {ops.filters.cliente && <DrilldownChip label={`Cliente: ${ops.filters.cliente}`} />}
          {(ops.fijacionDesde || ops.fijacionHasta) && (
            <DrilldownChip label={`Semana: ${ops.fijacionDesde || '…'} → ${ops.fijacionHasta || '…'}`} />
          )}
          {ops.pendingCheck && <DrilldownChip label={`Check pendiente: ${CHECK_LABELS[ops.pendingCheck]}`} />}
          {ops.statusFilter && <DrilldownChip label={`Estado: ${ECOMMERCE_STATUS_LABELS[ops.statusFilter]}`} />}
          <button
            type="button"
            onClick={() => {
              ops.clearDrilldown();
              setSearchParams({}, { replace: true });
            }}
            className="focus-ring ml-auto rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            Limpiar filtros del dashboard
          </button>
        </div>
      )}

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

      {ops.cancelledCount > 0 && (
        <label className="mb-3 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={ops.showCancelled}
            onChange={(event) => ops.setShowCancelled(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-accent-blue"
          />
          Mostrar canceladas ({ops.cancelledCount})
        </label>
      )}

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
            <div className="card hidden overflow-x-auto md:block">
              <table className="w-full min-w-[1550px] text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50">
                  <tr className="text-left text-xs uppercase text-slate-500">
                    <SortHeader label="Cliente / Campaña" col="cliente" sort={sort} onSort={handleSort} className="sticky left-0 bg-slate-50" />
                    <SortHeader label="Operación" col="operacion" sort={sort} onSort={handleSort} />
                    <SortHeader label="Periodo" col="periodo" sort={sort} onSort={handleSort} />
                    <SortHeader label="Artículo" col="articulo" sort={sort} onSort={handleSort} />
                    <th className="px-3 py-2 font-medium">Creatividad</th>
                    {CHECK_KEYS.map((k) => (
                      <th key={k} className="px-2 py-2 text-center font-medium">
                        {CHECK_LABELS[k]}
                      </th>
                    ))}
                    <th className="px-3 py-2 font-medium">Comentarios</th>
                    <SortHeader label="Avance" col="avance" sort={sort} onSort={handleSort} />
                    <SortHeader label="Estado" col="estado" sort={sort} onSort={handleSort} />
                    <th className="px-3 py-2 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((row) => {
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
                    const fullyCancelled = isLineFullyCancelled(row.line, today);
                    const cancelledDays = cancelledOperationalDates(row.line).length;
                    const canMarkAll = canWrite && hasPendingChecks && !fullyCancelled;
                    const savingLine = ops.savingLineId === row.line.campaign_line_id;
                    return (
                      <tr key={row.line.campaign_line_id} className={`border-t border-slate-100 hover:bg-slate-50 ${fullyCancelled ? 'opacity-65' : ''}`}>
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
                                  disabled={!canWrite || fullyCancelled}
                                  onClick={() => void ops.toggleCheck(row, k)}
                                  aria-pressed={row.checks[k]}
                                  aria-label={`${CHECK_LABELS[k]} ${row.checks[k] ? 'completado' : 'pendiente'}`}
                                  className={`focus-ring h-5 w-5 rounded border ${
                                    row.checks[k]
                                      ? 'border-accent-green bg-accent-green text-white'
                                      : 'border-slate-300 bg-white text-transparent'
                                  } ${canWrite && !fullyCancelled ? 'cursor-pointer' : 'cursor-default opacity-50'}`}
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
                            disabled={!canWrite || fullyCancelled}
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
                        <td className="px-3 py-2">
                          {canWrite && row.line.tipo_operacion === 'ECOMMERCE' && (
                            <button
                              type="button"
                              onClick={() => setCancellationTarget(row)}
                              className="focus-ring whitespace-nowrap rounded-lg border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                            >
                              {cancelledDays > 0 ? `Gestionar (${cancelledDays})` : 'Cancelar'}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Vista de tarjetas para móvil/tablet chico (sin scroll lateral). */}
            <div className="space-y-3 md:hidden">
              {sortedRows.map((row) => {
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
                const fullyCancelled = isLineFullyCancelled(row.line, today);
                const cancelledDays = cancelledOperationalDates(row.line).length;
                const canMarkAll = canWrite && hasPendingChecks && !fullyCancelled;
                const savingLine = ops.savingLineId === row.line.campaign_line_id;
                return (
                  <div key={row.line.campaign_line_id} className={`card p-4 ${fullyCancelled ? 'opacity-65' : ''}`}>
                    <div className="flex items-start justify-between gap-2">
                      <button onClick={() => setSelected(row)} className="focus-ring min-w-0 text-left">
                        <span className="block truncate font-semibold text-accent-blue">
                          {row.line.cliente_original}
                        </span>
                        <span className="block text-xs text-slate-500">{row.line.numero_campaña_original}</span>
                      </button>
                      <StatusBadge status={status} />
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <OperationBadge value={row.line.tipo_operacion} />
                      <ContinuityBadge value={row.line.tipo_campana_periodo} />
                      <span className="text-xs text-slate-400">{row.line.cadena ?? 'Sin cadena'}</span>
                    </div>

                    <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                      <div className="min-w-0">
                        <dt className="text-[10px] uppercase tracking-wide text-slate-400">Periodo</dt>
                        <dd className="truncate text-slate-700">
                          {row.line.periodo_codigo || row.line.periodo_original || '—'}
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-[10px] uppercase tracking-wide text-slate-400">Artículo</dt>
                        <dd className="truncate text-slate-700" title={row.line.placement_name_snapshot}>
                          {row.line.placement_name_snapshot}
                        </dd>
                      </div>
                    </dl>

                    <div className="mt-3">
                      <p className="mb-1.5 text-[10px] uppercase tracking-wide text-slate-400">Checks</p>
                      <div className="flex flex-wrap gap-1.5">
                        {CHECK_KEYS.map((k) =>
                          isCheckRequiredForLine(row.line, k) ? (
                            <button
                              key={k}
                              type="button"
                              disabled={!canWrite || fullyCancelled}
                              onClick={() => void ops.toggleCheck(row, k)}
                              aria-pressed={row.checks[k]}
                              className={`focus-ring inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${
                                row.checks[k]
                                  ? 'border-accent-green bg-green-50 text-accent-green'
                                  : 'border-slate-300 bg-white text-slate-500'
                              } ${canWrite && !fullyCancelled ? '' : 'opacity-60'}`}
                            >
                              <span aria-hidden="true">{row.checks[k] ? '✓' : '○'}</span>
                              {CHECK_LABELS[k]}
                            </button>
                          ) : null,
                        )}
                      </div>
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      <div className="h-1.5 flex-1 rounded-full bg-slate-100">
                        <div className="h-1.5 rounded-full bg-accent-blue" style={{ width: `${row.progress}%` }} />
                      </div>
                      <span className="text-xs tabular-nums text-slate-500">{row.progress}%</span>
                      {canMarkAll && (
                        <button
                          type="button"
                          disabled={savingLine}
                          onClick={() => void ops.markLineChecks(row)}
                          className="focus-ring rounded border border-accent-blue px-2 py-0.5 text-[11px] font-medium text-accent-blue hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {savingLine ? 'Rellenando…' : 'Rellenar todo'}
                        </button>
                      )}
                    </div>

                    <textarea
                      key={row.comentarios ?? ''}
                      defaultValue={row.comentarios ?? ''}
                      disabled={!canWrite || fullyCancelled}
                      rows={2}
                      onBlur={(e) => {
                        if (e.target.value.trim() !== (row.comentarios ?? '')) {
                          void ops.setComment(row, e.target.value);
                        }
                      }}
                      placeholder="Agregar comentario…"
                      className="focus-ring mt-3 w-full resize-y rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm disabled:bg-transparent"
                      aria-label="Comentarios de la línea"
                    />
                    {canWrite && row.line.tipo_operacion === 'ECOMMERCE' && (
                      <button
                        type="button"
                        onClick={() => setCancellationTarget(row)}
                        className="focus-ring mt-3 w-full rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                      >
                        {cancelledDays > 0 ? `Gestionar cancelación (${cancelledDays})` : 'Cancelar línea o fechas'}
                      </button>
                    )}
                  </div>
                );
              })}
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

      {selected && (
        <LineDetailDrawer
          row={selected}
          onClose={() => setSelected(null)}
          onManageCancellation={(row) => {
            setSelected(null);
            setCancellationTarget(row);
          }}
        />
      )}
      {cancellationTarget && (
        <CancellationModal
          row={cancellationTarget}
          busy={ops.savingLineId === cancellationTarget.line.campaign_line_id}
          onClose={() => setCancellationTarget(null)}
          onSubmit={(command) => ops.setLineCancellation(cancellationTarget, command)}
        />
      )}
    </AppLayout>
  );
}
