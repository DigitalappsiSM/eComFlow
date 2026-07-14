import { useMemo, useState, type ReactNode } from 'react';
import { BarChart3, MousePointerClick, Percent, Users, Flag, Package, Tag, CalendarRange } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { EmptyState, ErrorState, LoadingState } from '@/components/feedback/States';
import { FilterBar } from '@/components/filters/FilterBar';
import { distinctOptions, sortedOptions, type FilterValues } from '@/components/filters/filter-utils';
import { usePermissions } from '@/hooks/usePermissions';
import { useResultsDashboard } from '@/features/results/useResultsDashboard';
import { ClicksRankBar, DeviceDonut, ResultsTrendChart } from '@/components/results/ResultsCharts';
import {
  clicksOf,
  computeByDevice,
  computePeriodTrend,
  computeResultsKpis,
  impressionsOf,
  monthName,
  rankBy,
  type ResultsLine,
  type ResultsView,
} from '@/domain/results/results-metrics';

type DashView = ResultsView | 'compare';
const VIEW_LABEL: Record<DashView, string> = {
  real: 'Real Kevel',
  effective: 'Efectiva (estimadas)',
  adjusted: 'Ajustada',
  compare: 'Comparar',
};

const DEVICE_LABEL: Record<string, string> = { app: 'App', mobile: 'Mobile', desktop: 'Desktop', unknown: 'Sin dispositivo' };
const nf = new Intl.NumberFormat('es-MX');
const pct = (v: number) => `${(v * 100).toFixed(2)}%`;

function applyFilters(lines: readonly ResultsLine[], f: FilterValues): ResultsLine[] {
  const q = (f.search ?? '').trim().toLowerCase();
  return lines.filter((l) => {
    if (f.periodo && l.period_code !== f.periodo) return false;
    if (f.mes && monthName(l.month) !== f.mes) return false;
    if (f.cliente && l.cliente !== f.cliente) return false;
    if (f.campana && l.campaign !== f.campana) return false;
    if (f.articulo && l.articulo !== f.articulo) return false;
    if (f.categoria && l.categoria !== f.categoria) return false;
    if (f.device && DEVICE_LABEL[l.device] !== f.device) return false;
    if (f.site && l.site !== f.site) return false;
    if (q !== '') {
      const hay = [l.cliente, l.campaign, l.flight, l.articulo, l.categoria, l.creative, l.site].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function ResultsDashboardPage() {
  const { can } = usePermissions();
  const { state, lines, reload } = useResultsDashboard();
  const [filters, setFilters] = useState<FilterValues>({});
  const [dashView, setDashView] = useState<DashView>('real');
  const [limit, setLimit] = useState(50);

  // En "Comparar" las gráficas/tabla usan la vista ajustada; los KPIs muestran
  // real vs ajustado lado a lado.
  const view: ResultsView = dashView === 'compare' ? 'adjusted' : dashView;
  const compare = dashView === 'compare';

  const filtered = useMemo(() => applyFilters(lines, filters), [lines, filters]);
  const kpis = useMemo(() => computeResultsKpis(filtered, view), [filtered, view]);
  const kpisReal = useMemo(() => computeResultsKpis(filtered, 'real'), [filtered]);
  const kpisAdjusted = useMemo(() => computeResultsKpis(filtered, 'adjusted'), [filtered]);
  const adjustedCount = useMemo(() => filtered.filter((l) => l.has_adjustment).length, [filtered]);
  const trend = useMemo(() => computePeriodTrend(filtered, view), [filtered, view]);
  const byCategoria = useMemo(() => rankBy(filtered, (l) => l.categoria, view), [filtered, view]);
  const byCliente = useMemo(() => rankBy(filtered, (l) => l.cliente, view), [filtered, view]);
  const byCampana = useMemo(() => rankBy(filtered, (l) => l.campaign, view), [filtered, view]);
  const byArticulo = useMemo(() => rankBy(filtered, (l) => l.articulo, view), [filtered, view]);
  const byDevice = useMemo(() => computeByDevice(filtered, view), [filtered, view]);

  const tableRows = useMemo(
    () =>
      [...filtered]
        .sort((a, b) => a.period_start.localeCompare(b.period_start) || b.clicks - a.clicks)
        .slice(0, limit),
    [filtered, limit],
  );

  const fields = [
    { key: 'periodo', label: 'Periodo', options: sortedOptions(lines, (l) => l.period_code, (l) => l.period_start) },
    { key: 'mes', label: 'Mes', options: distinctOptions(lines, (l) => monthName(l.month)) },
    { key: 'cliente', label: 'Cliente', options: distinctOptions(lines, (l) => l.cliente) },
    { key: 'campana', label: 'Campaña', options: distinctOptions(lines, (l) => l.campaign) },
    { key: 'articulo', label: 'Artículo', options: distinctOptions(lines, (l) => l.articulo) },
    { key: 'categoria', label: 'Categoría', options: distinctOptions(lines, (l) => l.categoria) },
    { key: 'device', label: 'Dispositivo', options: distinctOptions(lines, (l) => DEVICE_LABEL[l.device]) },
    { key: 'site', label: 'Site', options: distinctOptions(lines, (l) => l.site) },
  ];

  if (!can('results.read')) {
    return (
      <AppLayout title="Resultados · Dashboard" description="Desempeño de campañas y espacios a partir de reportes Kevel">
        <EmptyState title="Sin permiso" description="No tienes permiso para ver resultados." />
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Resultados Ecommerce" description="Desempeño de campañas y espacios a partir de reportes Kevel">
      {state.status === 'loading' && <LoadingState label="Cargando resultados…" />}
      {state.status === 'error' && <ErrorState description={state.message} onRetry={() => void reload()} />}

      {state.status === 'ready' &&
        (lines.length === 0 ? (
          <EmptyState
            title="Sin resultados"
            description="Aún no hay consolidado semanal. Importa un reporte Kevel en «Nueva carga»."
          />
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex flex-wrap rounded-lg border border-slate-200 bg-white p-0.5 text-sm">
                {(['real', 'effective', 'adjusted', 'compare'] as DashView[]).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setDashView(v)}
                    className={`focus-ring rounded-md px-3 py-1.5 font-medium ${
                      dashView === v ? 'bg-accent-blue text-white' : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {VIEW_LABEL[v]}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {adjustedCount > 0 && (dashView === 'adjusted' || compare) && (
                  <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-accent-blue">
                    {nf.format(adjustedCount)} fila(s) con ajuste aprobado
                  </span>
                )}
                {kpis.impressionsEstimated > 0 && (
                  <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                    {nf.format(kpis.impressionsEstimated)} impresiones estimadas
                  </span>
                )}
              </div>
            </div>

            <FilterBar
              fields={fields}
              values={filters}
              onChange={(key, value) => setFilters((f) => ({ ...f, [key]: value }))}
              onClear={() => setFilters({})}
              search={{ value: filters.search ?? '', onChange: (v) => setFilters((f) => ({ ...f, search: v })), placeholder: 'Buscar cliente, campaña, artículo, categoría…' }}
              meta={`${filtered.length} de ${lines.length} filas`}
            />

            {compare ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <CompareCard label="Impresiones" real={kpisReal.impressions} adjusted={kpisAdjusted.impressions} />
                <CompareCard label="Clics (únicos)" real={kpisReal.clicks} adjusted={kpisAdjusted.clicks} />
                <CompareCard label="CTR" real={kpisReal.ctr} adjusted={kpisAdjusted.ctr} isPct />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
                <KpiCard label="Impresiones" value={nf.format(kpis.impressions)} icon={BarChart3} accent="blue" />
                <KpiCard label="Clics (únicos)" value={nf.format(kpis.clicks)} icon={MousePointerClick} accent="violet" />
                <KpiCard label="CTR" value={pct(kpis.ctr)} icon={Percent} accent="teal" />
                <KpiCard label="Clientes" value={kpis.clientes} icon={Users} accent="green" />
                <KpiCard label="Campañas" value={kpis.campanas} icon={Flag} accent="orange" />
                <KpiCard label="Artículos" value={kpis.articulos} icon={Package} accent="blue" />
                <KpiCard label="Categorías" value={kpis.categorias} icon={Tag} accent="violet" />
                <KpiCard label="Periodos" value={kpis.periodos} icon={CalendarRange} accent="teal" />
              </div>
            )}

            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
              <ChartCard title="Evolución por periodo" subtitle="Impresiones (área) y clics (línea); el pico de clics va marcado en rojo" className="lg:col-span-2" isEmpty={trend.length === 0}>
                <ResultsTrendChart data={trend} />
              </ChartCard>
              <ChartCard title="Por dispositivo" subtitle="Clics por App / Mobile / Desktop" isEmpty={byDevice.length === 0}>
                <DeviceDonut data={byDevice} />
              </ChartCard>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
              <ChartCard title="Categorías más visitadas" subtitle="Top 10 por clics" isEmpty={byCategoria.length === 0}>
                <ClicksRankBar data={byCategoria} color="palette" />
              </ChartCard>
              <ChartCard title="Clientes con más clics" subtitle="Top 10 por clics" isEmpty={byCliente.length === 0}>
                <ClicksRankBar data={byCliente} color="#2563eb" />
              </ChartCard>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
              <ChartCard title="Campañas con más clics" subtitle="Top 10 por clics" isEmpty={byCampana.length === 0}>
                <ClicksRankBar data={byCampana} color="#7c3aed" />
              </ChartCard>
              <ChartCard title="Artículos (espacios) con más clics" subtitle="Top 10 por clics" isEmpty={byArticulo.length === 0}>
                <ClicksRankBar data={byArticulo} color="#0d9488" />
              </ChartCard>
            </div>

            <section className="card mt-6 overflow-hidden p-0" aria-labelledby="res-table">
              <div className="border-b border-slate-100 p-5">
                <h2 id="res-table" className="text-sm font-semibold text-slate-800">Detalle consolidado</h2>
                <p className="text-xs text-slate-400">Semana · Cliente · Campaña · Artículo · Categoría (orden cronológico)</p>
              </div>
              {tableRows.length === 0 ? (
                <EmptyState title="Sin filas" description="Ajusta los filtros." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[980px] text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-3 py-2 font-medium">Mes</th>
                        <th className="px-3 py-2 font-medium">Semana</th>
                        <th className="px-3 py-2 font-medium">Cliente</th>
                        <th className="px-3 py-2 font-medium">Campaña</th>
                        <th className="px-3 py-2 font-medium">Artículo</th>
                        <th className="px-3 py-2 font-medium">Categoría</th>
                        <th className="px-3 py-2 font-medium">Device</th>
                        <th className="px-3 py-2 text-right font-medium">Impresiones</th>
                        <th className="px-3 py-2 text-right font-medium">Clics</th>
                        <th className="px-3 py-2 text-right font-medium">CTR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tableRows.map((l, i) => {
                        const imp = impressionsOf(l, view);
                        const clk = clicksOf(l, view);
                        return (
                          <tr key={i} className="border-t border-slate-100 hover:bg-slate-50">
                            <td className="px-3 py-2 text-slate-500">{monthName(l.month)}</td>
                            <td className="px-3 py-2 font-medium text-slate-700">{l.period_code}</td>
                            <td className="max-w-40 truncate px-3 py-2 text-slate-600" title={l.cliente}>{l.cliente}</td>
                            <td className="max-w-40 truncate px-3 py-2 text-slate-600" title={l.campaign}>{l.campaign}</td>
                            <td className="px-3 py-2 text-slate-600">{l.articulo}</td>
                            <td className="px-3 py-2 text-slate-500">{l.categoria}</td>
                            <td className="px-3 py-2 text-slate-500">{DEVICE_LABEL[l.device]}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                              {nf.format(imp)}
                              {view === 'effective' && l.impressions_estimated > 0 && (
                                <span className="ml-1 text-[10px] text-amber-600">+est</span>
                              )}
                              {view === 'adjusted' && l.has_adjustment && (
                                <span className="ml-1 text-[10px] text-accent-blue">aj</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-slate-700">{nf.format(clk)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-slate-500">{pct(imp > 0 ? clk / imp : 0)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {filtered.length > tableRows.length && (
                <div className="border-t border-slate-100 p-3 text-center">
                  <button
                    onClick={() => setLimit((n) => n + 50)}
                    className="focus-ring rounded-lg border border-slate-300 px-4 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Cargar más ({filtered.length - tableRows.length} restantes)
                  </button>
                </div>
              )}
            </section>
          </>
        ))}
    </AppLayout>
  );
}

function CompareCard({ label, real, adjusted, isPct = false }: { label: string; real: number; adjusted: number; isPct?: boolean }) {
  const fmt = (v: number) => (isPct ? pct(v) : nf.format(v));
  const diff = adjusted - real;
  const diffPct = real !== 0 ? diff / real : 0;
  const tone = diff > 0 ? 'text-accent-green' : diff < 0 ? 'text-red-600' : 'text-slate-400';
  return (
    <div className="card p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <div className="mt-2 grid grid-cols-2 gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Real</p>
          <p className="text-lg font-bold text-slate-900 tabular-nums">{fmt(real)}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Ajustado</p>
          <p className="text-lg font-bold text-slate-900 tabular-nums">{fmt(adjusted)}</p>
        </div>
      </div>
      <p className={`mt-2 text-xs font-medium tabular-nums ${tone}`}>
        {diff >= 0 ? '+' : ''}{isPct ? pct(diff) : nf.format(diff)}
        {!isPct && real !== 0 && ` (${diff >= 0 ? '+' : ''}${(diffPct * 100).toFixed(1)}%)`}
      </p>
    </div>
  );
}

function ChartCard({ title, subtitle, isEmpty, className, children }: { title: string; subtitle?: string; isEmpty: boolean; className?: string; children: ReactNode }) {
  return (
    <section className={`card p-5 ${className ?? ''}`} aria-label={title}>
      <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
      {subtitle && <p className="mb-3 text-xs text-slate-400">{subtitle}</p>}
      {isEmpty ? <EmptyState title="Sin datos" /> : children}
    </section>
  );
}
