import { useMemo, useState } from 'react';
import {
  Flag,
  Image,
  Boxes,
  Users,
  Layers,
  CalendarRange,
  AlertTriangle,
  Activity,
} from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { EmptyState, ErrorState, LoadingState } from '@/components/feedback/States';
import { FilterBar } from '@/components/filters/FilterBar';
import { distinctOptions, sortedOptions, type FilterValues } from '@/components/filters/filter-utils';
import { useDashboardData } from '@/features/dashboard/useDashboardData';
import {
  ChainBar,
  ClientTypeStacked,
  MonthlyArea,
  PeriodBar,
  StatusPie,
  TipoDonut,
  TopClientsBar,
} from '@/components/dashboard/DashboardCharts';
import {
  computeActiveClients,
  computeAttentionByClient,
  computeChainLoad,
  computeClientTypeMatrix,
  computeDashboardMetrics,
  computeMonthlyOperationTrend,
  computeOperationalStatusBreakdown,
  computePeriodLoad,
  computeTipoOperationDistribution,
  computeTopClients,
  filterActiveInPeriod,
  lineMonthKey,
  operationalStatusOf,
  type MetricLine,
  type OperationalStatus,
} from '@/domain/dashboard-metrics';
import { todayIso, type DateRange } from '@/lib/dates';
import type { ReactNode } from 'react';

// Rango amplio: el "cruce de vigencia" no debe vaciar el dashboard. El alcance
// temporal se maneja con los filtros de Periodo / Mes (semana/catorcena del archivo).
const WIDE_PERIOD: DateRange = { start: '0001-01-01', end: '9999-12-31' };

const OP_STATUS_LABEL: Record<OperationalStatus, string> = {
  vencido: 'Vencido',
  en_curso: 'En curso',
  futuro: 'Futuro',
};
const CONTINUITY_LABEL: Record<'fijacion' | 'continua', string> = {
  fijacion: 'Fijación',
  continua: 'Continua',
};

const DEFINITIONS: { term: string; detail: string }[] = [
  { term: 'Cliente activo', detail: 'Cliente con al menos una línea vigente que cruza el periodo.' },
  { term: 'Campaña', detail: 'Agrupación por Cliente + Número de campaña.' },
  { term: 'Línea', detail: 'Una Creatividad ID dentro de un espacio (cadena/artículo).' },
  { term: 'Pieza requerida', detail: 'Nº de soportes / requisitos obligatorios aplicables.' },
  { term: 'Vencido', detail: 'El periodo operativo (fin) ya pasó respecto a hoy.' },
  { term: 'En curso', detail: 'Hoy cae dentro del periodo operativo.' },
  { term: 'Futuro', detail: 'El periodo operativo aún no comienza.' },
  { term: 'Continuidad', detail: 'Fijación (inicia) o Continua (viene del periodo anterior).' },
];

function applyFilters(lines: readonly MetricLine[], f: FilterValues, today: string): MetricLine[] {
  return lines.filter(
    (l) =>
      (!f.periodo || (l.periodoOriginal ?? '') === f.periodo) &&
      (!f.mes || lineMonthKey(l) === f.mes) &&
      (!f.cadena || (l.cadena ?? '') === f.cadena) &&
      (!f.tipo || (l.tipoOperacion ?? '') === f.tipo) &&
      (!f.cliente || (l.clienteOriginal ?? '') === f.cliente) &&
      (!f.estado || OP_STATUS_LABEL[operationalStatusOf(l, today)] === f.estado) &&
      (!f.continuidad || (l.tipoCampanaPeriodo ? CONTINUITY_LABEL[l.tipoCampanaPeriodo] : '') === f.continuidad),
  );
}

export function DashboardPage() {
  const period = WIDE_PERIOD;
  const today = todayIso();
  const { state, reload } = useDashboardData();
  const [filters, setFilters] = useState<FilterValues>({});

  const lines = useMemo<MetricLine[]>(
    () => (state.status === 'ready' ? state.lines : []),
    [state],
  );

  const filtered = useMemo(() => applyFilters(lines, filters, today), [lines, filters, today]);

  const metrics = useMemo(() => computeDashboardMetrics(filtered, period), [filtered, period]);
  const clientesActivos = useMemo(() => computeActiveClients(filtered, period), [filtered, period]);
  const topClients = useMemo(() => computeTopClients(filtered, period), [filtered, period]);
  const tipoDist = useMemo(
    () => computeTipoOperationDistribution(filtered, period),
    [filtered, period],
  );
  const monthly = useMemo(() => computeMonthlyOperationTrend(filtered), [filtered]);
  const periodLoad = useMemo(() => computePeriodLoad(filtered), [filtered]);
  const chainLoad = useMemo(() => computeChainLoad(filtered, period), [filtered, period]);
  const statusBreakdown = useMemo(
    () => computeOperationalStatusBreakdown(filtered, today),
    [filtered, today],
  );
  const clientTypeMatrix = useMemo(
    () => computeClientTypeMatrix(filtered, period),
    [filtered, period],
  );
  const attention = useMemo(() => computeAttentionByClient(filtered, today), [filtered, today]);
  const periodosActivos = useMemo(() => {
    const set = new Set<string>();
    for (const l of filterActiveInPeriod(filtered, period)) {
      if (l.periodoOriginal) set.add(l.periodoOriginal);
    }
    return set.size;
  }, [filtered, period]);

  const fields = [
    {
      key: 'periodo',
      label: 'Periodo',
      options: sortedOptions(lines, (l) => l.periodoOriginal, (l) => l.periodoInicio),
    },
    { key: 'mes', label: 'Mes', options: distinctOptions(lines, (l) => lineMonthKey(l)) },
    { key: 'cadena', label: 'Cadena', options: distinctOptions(lines, (l) => l.cadena) },
    { key: 'tipo', label: 'Tipo', options: distinctOptions(lines, (l) => l.tipoOperacion) },
    { key: 'cliente', label: 'Cliente', options: distinctOptions(lines, (l) => l.clienteOriginal) },
    {
      key: 'estado',
      label: 'Estado',
      options: distinctOptions(lines, (l) => OP_STATUS_LABEL[operationalStatusOf(l, today)]),
    },
    {
      key: 'continuidad',
      label: 'Continuidad',
      options: distinctOptions(lines, (l) =>
        l.tipoCampanaPeriodo ? CONTINUITY_LABEL[l.tipoCampanaPeriodo] : '',
      ),
    },
  ];

  return (
    <AppLayout title="Dashboard operativo" description="Visión 360 de campañas y operación">
      {state.status === 'loading' && <LoadingState label="Cargando métricas…" />}
      {state.status === 'error' && <ErrorState description={state.message} onRetry={() => void reload()} />}

      {state.status === 'ready' && (
        <>
          <FilterBar
            fields={fields}
            values={filters}
            onChange={(key, value) => setFilters((f) => ({ ...f, [key]: value }))}
            onClear={() => setFilters({})}
            meta={`${filtered.length} de ${lines.length} líneas`}
          />

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
            <KpiCard label="Clientes activos" value={clientesActivos} icon={Users} accent="blue" />
            <KpiCard label="Campañas activas" value={metrics.campanasActivas} icon={Flag} accent="green" />
            <KpiCard label="Líneas operativas" value={metrics.lineasActivas} icon={Image} accent="violet" />
            <KpiCard label="Piezas requeridas" value={metrics.piezasRequeridas} icon={Boxes} accent="orange" />
            <KpiCard label="Tipos activos" value={tipoDist.length} icon={Layers} accent="teal" />
            <KpiCard label="Periodos activos" value={periodosActivos} icon={CalendarRange} accent="blue" />
            <KpiCard label="Líneas vencidas" value={statusBreakdown.vencido} icon={AlertTriangle} accent="red" />
            <KpiCard label="En curso" value={statusBreakdown.enCurso} icon={Activity} accent="green" />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
            <ChartCard
              title="Principales clientes"
              subtitle="Top 8 por líneas operativas activas"
              isEmpty={topClients.length === 0}
              className="lg:col-span-2"
            >
              <TopClientsBar data={topClients} />
            </ChartCard>
            <ChartCard
              title="Tipos de operación"
              subtitle="Distribución de líneas activas"
              isEmpty={tipoDist.length === 0}
            >
              <TipoDonut data={tipoDist} />
            </ChartCard>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
            <ChartCard
              title="Operación por mes"
              subtitle="Líneas por mes de inicio operativo"
              isEmpty={monthly.length === 0}
              className="lg:col-span-2"
            >
              <MonthlyArea data={monthly} />
            </ChartCard>
            <ChartCard
              title="Estado operativo"
              subtitle="Vencido / En curso / Futuro"
              isEmpty={statusBreakdown.total === 0}
            >
              <StatusPie breakdown={statusBreakdown} />
            </ChartCard>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6">
            <ChartCard
              title="Carga por periodo"
              subtitle="Líneas por semana / catorcena"
              isEmpty={periodLoad.length === 0}
            >
              <PeriodBar data={periodLoad} />
            </ChartCard>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <ChartCard
              title="Clientes por tipo de operación"
              subtitle="Top 8 clientes, apilado por tipo"
              isEmpty={clientTypeMatrix.rows.length === 0}
            >
              <ClientTypeStacked matrix={clientTypeMatrix} />
            </ChartCard>
            <ChartCard
              title="Carga por cadena"
              subtitle="Top 10 cadenas por líneas activas"
              isEmpty={chainLoad.length === 0}
            >
              <ChainBar data={chainLoad} />
            </ChartCard>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
            <section className="card overflow-hidden p-0 lg:col-span-2" aria-labelledby="attn-heading">
              <div className="border-b border-slate-100 p-5">
                <h2 id="attn-heading" className="text-sm font-semibold text-slate-800">
                  Atención requerida
                </h2>
                <p className="text-xs text-slate-400">
                  Líneas vencidas por cliente, periodo y tipo (pendientes de cierre)
                </p>
              </div>
              {attention.length === 0 ? (
                <EmptyState title="Sin líneas vencidas" description="Nada pendiente de cierre en el filtro actual." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-4 py-2 font-medium">Cliente</th>
                        <th className="px-4 py-2 font-medium">Periodo</th>
                        <th className="px-4 py-2 font-medium">Tipo</th>
                        <th className="px-4 py-2 text-right font-medium">Vencidas</th>
                        <th className="px-4 py-2 text-right font-medium">Piezas</th>
                        <th className="px-4 py-2 font-medium">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attention.slice(0, 12).map((r) => (
                        <tr key={`${r.cliente}|${r.periodo}|${r.tipo}`} className="border-t border-slate-100">
                          <td className="max-w-52 truncate px-4 py-2 font-medium text-slate-700" title={r.cliente}>
                            {r.cliente}
                          </td>
                          <td className="px-4 py-2 text-slate-600">{r.periodo}</td>
                          <td className="px-4 py-2 text-slate-600">{r.tipo}</td>
                          <td className="px-4 py-2 text-right tabular-nums font-semibold text-red-600">
                            {r.expiredLines}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums text-slate-500">{r.requiredPieces}</td>
                          <td className="px-4 py-2">
                            <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-600">
                              Vencido
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="card p-5" aria-labelledby="defs-heading">
              <h2 id="defs-heading" className="mb-3 text-sm font-semibold text-slate-800">
                Definiciones
              </h2>
              <dl className="space-y-2 text-xs">
                {DEFINITIONS.map((d) => (
                  <div key={d.term}>
                    <dt className="font-semibold text-slate-700">{d.term}</dt>
                    <dd className="text-slate-500">{d.detail}</dd>
                  </div>
                ))}
              </dl>
            </section>
          </div>

          {lines.length === 0 && (
            <div className="mt-6">
              <EmptyState
                title="La base de datos está vacía"
                description="Cuando se procese una importación, las métricas aparecerán aquí."
              />
            </div>
          )}
        </>
      )}
    </AppLayout>
  );
}

function ChartCard({
  title,
  subtitle,
  isEmpty,
  emptyLabel,
  className,
  children,
}: {
  title: string;
  subtitle?: string;
  isEmpty: boolean;
  emptyLabel?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`card p-5 ${className ?? ''}`} aria-label={title}>
      <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
      {subtitle && <p className="mb-3 text-xs text-slate-400">{subtitle}</p>}
      {isEmpty ? <EmptyState title={emptyLabel ?? 'Sin datos en el periodo'} /> : children}
    </section>
  );
}
