import { useMemo, useState } from 'react';
import { Flag, LayoutGrid, Image, Images, Boxes, Users } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { EmptyState, ErrorState, LoadingState } from '@/components/feedback/States';
import { FilterBar } from '@/components/filters/FilterBar';
import { distinctOptions, type FilterValues } from '@/components/filters/filter-utils';
import { useDashboardData } from '@/features/dashboard/useDashboardData';
import {
  computeDashboardMetrics,
  computeLineBreakdown,
  computePlacementDistribution,
  type BreakdownItem,
  type MetricLine,
} from '@/domain/dashboard-metrics';
import { getWeekRange, todayIso } from '@/lib/dates';

const DEFINITIONS: { term: string; detail: string }[] = [
  { term: 'Campaña', detail: 'Agrupación por Cliente + Número de campaña.' },
  { term: 'Espacio', detail: 'Cada combinación operativa única (cadena/artículo + creatividad).' },
  { term: 'Línea', detail: 'Una Creatividad ID dentro de un espacio concreto.' },
  { term: 'Creatividad única', detail: 'Conteo de Creatividad ID distintos.' },
  { term: 'Pieza requerida', detail: 'Nº de soportes / requisitos aplicables.' },
  { term: 'Activa', detail: 'Su vigencia se cruza con el periodo seleccionado.' },
];

function applyFilters(lines: readonly MetricLine[], f: FilterValues): MetricLine[] {
  return lines.filter(
    (l) =>
      (!f.cadena || (l.cadena ?? '') === f.cadena) &&
      (!f.tipo || (l.tipoOperacion ?? '') === f.tipo) &&
      (!f.cliente || (l.clienteOriginal ?? '') === f.cliente),
  );
}

export function DashboardPage() {
  const period = useMemo(() => getWeekRange(todayIso()), []);
  const { state, reload } = useDashboardData();
  const [filters, setFilters] = useState<FilterValues>({});

  const lines = useMemo<MetricLine[]>(
    () => (state.status === 'ready' ? state.lines : []),
    [state],
  );

  const filtered = useMemo(() => applyFilters(lines, filters), [lines, filters]);
  const metrics = useMemo(() => computeDashboardMetrics(filtered, period), [filtered, period]);
  const distribution = useMemo(
    () => computePlacementDistribution(filtered, period),
    [filtered, period],
  );
  const byTipo = useMemo(
    () => computeLineBreakdown(filtered, period, (l) => l.tipoOperacion ?? '(sin clasificar)'),
    [filtered, period],
  );
  const byCadena = useMemo(
    () => computeLineBreakdown(filtered, period, (l) => l.cadena ?? '(sin cadena)'),
    [filtered, period],
  );

  const fields = [
    { key: 'cadena', label: 'Cadena', options: distinctOptions(lines, (l) => l.cadena) },
    { key: 'tipo', label: 'Tipo', options: distinctOptions(lines, (l) => l.tipoOperacion) },
    { key: 'cliente', label: 'Cliente', options: distinctOptions(lines, (l) => l.clienteOriginal) },
  ];

  return (
    <AppLayout title="Dashboard" description="Resumen general de campañas y operación">
      <div className="mb-3 text-xs text-slate-500">
        Periodo (semana viernes→jueves): <strong>{period.start}</strong> a{' '}
        <strong>{period.end}</strong>
      </div>

      {state.status === 'loading' && <LoadingState label="Cargando métricas…" />}
      {state.status === 'error' && <ErrorState description={state.message} onRetry={() => void reload()} />}

      {state.status === 'ready' && (
        <>
          <FilterBar
            fields={fields}
            values={filters}
            onChange={(key, value) => setFilters((f) => ({ ...f, [key]: value }))}
            onClear={() => setFilters({})}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <KpiCard label="Campañas activas" value={metrics.campanasActivas} icon={Flag} accent="blue" />
            <KpiCard label="Espacios activos" value={metrics.espaciosActivos} icon={LayoutGrid} accent="green" />
            <KpiCard label="Líneas operativas" value={metrics.lineasActivas} icon={Image} accent="violet" />
            <KpiCard label="Creatividades únicas" value={metrics.creatividadesUnicas} icon={Images} accent="teal" />
            <KpiCard label="Piezas requeridas" value={metrics.piezasRequeridas} icon={Boxes} accent="orange" />
            <KpiCard label="Clientes activos" value={metrics.clientesActivos} icon={Users} accent="blue" />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
            <section className="card p-5 lg:col-span-2" aria-labelledby="dist-heading">
              <h2 id="dist-heading" className="mb-3 text-sm font-semibold text-slate-800">
                Distribución por artículo (espacios activos)
              </h2>
              {distribution.length === 0 ? (
                <EmptyState title="Sin espacios activos en el periodo" />
              ) : (
                <ul className="space-y-2">
                  {distribution.map((d) => (
                    <li key={d.placementId} className="flex items-center gap-3 text-sm">
                      <span className="w-48 truncate text-slate-600" title={d.placementId}>
                        {d.placementId}
                      </span>
                      <div className="h-2 flex-1 rounded-full bg-slate-100">
                        <div className="h-2 rounded-full bg-accent-blue" style={{ width: `${d.percentage}%` }} />
                      </div>
                      <span className="w-16 text-right tabular-nums text-slate-500">
                        {d.spaces} ({d.percentage}%)
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="card p-5" aria-labelledby="defs-heading">
              <h2 id="defs-heading" className="mb-3 text-sm font-semibold text-slate-800">
                Definiciones de conteos
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

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <BreakdownCard title="Por tipo de operación" items={byTipo} color="bg-accent-violet" />
            <BreakdownCard title="Por cadena" items={byCadena} color="bg-accent-teal" />
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

function BreakdownCard({ title, items, color }: { title: string; items: BreakdownItem[]; color: string }) {
  return (
    <section className="card p-5" aria-label={title}>
      <h2 className="mb-3 text-sm font-semibold text-slate-800">{title}</h2>
      {items.length === 0 ? (
        <EmptyState title="Sin datos en el periodo" />
      ) : (
        <ul className="space-y-2">
          {items.map((d) => (
            <li key={d.label} className="flex items-center gap-3 text-sm">
              <span className="w-40 truncate text-slate-600" title={d.label}>
                {d.label}
              </span>
              <div className="h-2 flex-1 rounded-full bg-slate-100">
                <div className={`h-2 rounded-full ${color}`} style={{ width: `${d.percentage}%` }} />
              </div>
              <span className="w-24 text-right tabular-nums text-slate-500">
                {d.lines} · {d.requiredPieces} pz
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
