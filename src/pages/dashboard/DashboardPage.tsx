import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Image,
  ListChecks,
  RefreshCw,
  Rocket,
  Timer,
  Users,
} from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { ErrorState, LoadingState } from '@/components/feedback/States';
import { useEcommerceDashboard } from '@/features/dashboard/useEcommerceDashboard';
import {
  CheckProgressChart,
  HistoricalEvolutionChart,
  PreparationByClientChart,
  StatusDistributionChart,
} from '@/components/dashboard/EcommerceDashboardCharts';
import {
  buildAggregateSeries,
  buildDrilldownHref,
  computeCheckProgress,
  computeClientCheckMatrix,
  computeFourWeeks,
  computePreparationByClient,
  computeWeekCard,
  computeWeekKpis,
  creativesForWeek,
  mexicoCityDate,
  CHECK_LABELS,
  CHECK_ORDER,
  type WeekSlot,
  type DrilldownFilters,
} from '@/domain/ecommerce-dashboard';
import { isInvalidRange } from '@/domain/operational-window';
import type { CheckKey } from '@/domain/progress';
import type { OperationalStatus } from '@/domain/ecommerce-dashboard';
import type { ReactNode } from 'react';

/** % con un decimal cuando el redondeo entero oculta cambios; «No aplica» si null (§8). */
function fmtPct(v: number | null): string {
  if (v === null) return 'No aplica';
  return Number.isInteger(v) ? `${v}%` : `${v.toFixed(1)}%`;
}

function accentForPct(pct: number | null): 'green' | 'orange' | 'red' | 'teal' {
  if (pct === null) return 'teal';
  if (pct >= 90) return 'green';
  if (pct >= 60) return 'orange';
  return 'red';
}

function formatLoadedAt(date: Date): string {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Mexico_City',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatWeekRange(week: { start: string; end: string }): string {
  const fmt = (iso: string) =>
    new Intl.DateTimeFormat('es-MX', { timeZone: 'UTC', day: '2-digit', month: 'short' }).format(
      new Date(`${iso}T00:00:00Z`),
    );
  return `${fmt(week.start)} – ${fmt(week.end)}`;
}

function heatTone(pct: number): string {
  if (pct >= 90) return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200';
  if (pct >= 60) return 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200';
  if (pct > 0) return 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200';
  return 'bg-slate-100 text-slate-500 dark:bg-white/5';
}

export function DashboardPage() {
  const { state, creatives, loadedAt, fetched, reload } = useEcommerceDashboard();
  const today = mexicoCityDate(Date.now());
  const weeks = useMemo(() => computeFourWeeks(today), [today]);
  const [selectedSlot, setSelectedSlot] = useState<WeekSlot>('current');
  const [customDesde, setCustomDesde] = useState('');
  const [customHasta, setCustomHasta] = useState('');

  const selectedWeek = weeks.find((w) => w.slot === selectedSlot) ?? weeks[1]!;
  const rangeInvalid = isInvalidRange(customDesde, customHasta);
  const useCustom = !!customDesde && !!customHasta && !rangeInvalid;
  const scope = useMemo(
    () => (useCustom ? { start: customDesde, end: customHasta } : { start: selectedWeek.start, end: selectedWeek.end }),
    [useCustom, customDesde, customHasta, selectedWeek.start, selectedWeek.end],
  );

  const inScope = useMemo(() => creativesForWeek(creatives, scope), [creatives, scope]);
  const kpis = useMemo(() => computeWeekKpis(inScope, today), [inScope, today]);
  const checkProgress = useMemo(() => computeCheckProgress(inScope), [inScope]);
  const prepByClient = useMemo(() => computePreparationByClient(inScope), [inScope]);
  const clientCheckMatrix = useMemo(() => computeClientCheckMatrix(inScope), [inScope]);

  // Comparativo de las cuatro tarjetas.
  const cards = useMemo(
    () => weeks.map((week) => ({ week, card: computeWeekCard(creatives, week, today) })),
    [weeks, creatives, today],
  );

  // Evolución histórica: semana en foco + semana anterior para comparación (§9).
  const evolution = useMemo(() => buildAggregateSeries(inScope), [inScope]);
  const previousWeek = weeks[0]!;
  const previousEvolution = useMemo(
    () => (useCustom ? { points: [], insufficient: true } : buildAggregateSeries(creativesForWeek(creatives, previousWeek))),
    [useCustom, creatives, previousWeek],
  );

  const navigate = useNavigate();
  const drill = (extra: Omit<DrilldownFilters, 'tipo' | 'weekStart' | 'weekEnd'>) => {
    navigate(buildDrilldownHref({ tipo: 'ECOMMERCE', weekStart: scope.start, weekEnd: scope.end, ...extra }));
  };

  return (
    <AppLayout
      title="Avance operativo Ecommerce"
      description="Progreso real de preparación y cierre por creatividad (semanas viernes→jueves)"
    >
      {state.status === 'loading' && <LoadingState label="Cargando creatividades Ecommerce y checks…" />}
      {state.status === 'error' && <ErrorState description={state.message} onRetry={() => void reload()} />}

      {state.status === 'ready' && (
        <div
          className="dashboard-canvas -m-4 min-h-[calc(100%+2rem)] rounded-tl-2xl p-4 text-slate-700 sm:-m-6 sm:min-h-[calc(100%+3rem)] sm:p-6 dark:text-slate-200"
        >
          {/* Barra superior: última actualización + Actualizar. */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {loadedAt ? (
                <>
                  Última actualización: <span className="font-medium text-slate-700 dark:text-slate-300">{formatLoadedAt(loadedAt)}</span>
                  {' · '}
                  <span className="tabular-nums">{fetched}</span> líneas Ecommerce · <span className="tabular-nums">{creatives.length}</span> creatividades
                </>
              ) : (
                '—'
              )}
            </p>
            <button
              type="button"
              onClick={() => void reload()}
              className="focus-ring inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-white/15 dark:bg-white/5 dark:text-slate-200 dark:shadow-none dark:hover:bg-white/10"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" /> Actualizar
            </button>
          </div>

          {/* Comparativo de cuatro semanas (tarjetas seleccionables). */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {cards.map(({ week, card }, i) => {
              const prev = i > 0 ? cards[i - 1]!.card : null;
              const selected = !useCustom && week.slot === selectedSlot;
              const delta = prev ? card.avgPreparation - prev.avgPreparation : null;
              return (
                <button
                  key={week.slot}
                  type="button"
                  onClick={() => {
                    setSelectedSlot(week.slot);
                    setCustomDesde('');
                    setCustomHasta('');
                  }}
                  className={`card rounded-2xl p-4 text-left transition ${
                    selected ? 'ring-2 ring-accent-blue' : 'hover:bg-slate-50 dark:hover:bg-white/[0.07]'
                  }`}
                  aria-pressed={selected}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-900">{week.label}</p>
                    {week.slot === 'current' && (
                      <span className="rounded-full bg-accent-blue/20 px-2 py-0.5 text-[10px] font-semibold text-accent-blue">HOY</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-500">{formatWeekRange(week)}</p>
                  <p className="mt-3 text-3xl font-bold tabular-nums text-slate-900">{fmtPct(card.avgPreparation)}</p>
                  <p className="text-[11px] text-slate-500">
                    preparación prom.
                    {delta !== null && Math.abs(delta) >= 0.1 && (
                      <span className={delta >= 0 ? 'text-emerald-600 dark:text-emerald-300' : 'text-rose-600 dark:text-rose-300'}>
                        {' '}
                        {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}
                      </span>
                    )}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
                    <span>Listas: <strong className="tabular-nums text-slate-800">{card.listas}</strong></span>
                    <span>Pend.: <strong className="tabular-nums text-slate-800">{card.pendientes}</strong></span>
                    <span>Cierre: <strong className="tabular-nums text-slate-800">{fmtPct(card.avgClosing)}</strong></span>
                    <span>SLA: <strong className={`tabular-nums ${card.fueraDeSla ? 'text-rose-600 dark:text-rose-300' : 'text-slate-800'}`}>{card.fueraDeSla}</strong></span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Rango personalizado (opción avanzada, §3). */}
          <details className="mt-3 text-sm text-slate-700 dark:text-slate-300">
            <summary className="cursor-pointer select-none text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
              Rango personalizado (avanzado)
            </summary>
            <div className="mt-2 flex flex-wrap items-end gap-3">
              <label className="text-[11px] text-slate-500">
                Desde
                <input
                  type="date"
                  value={customDesde}
                  onChange={(e) => setCustomDesde(e.target.value)}
                  className="focus-ring mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 [color-scheme:light] dark:border-white/15 dark:bg-white/5 dark:text-slate-100 dark:[color-scheme:dark]"
                />
              </label>
              <label className="text-[11px] text-slate-500">
                Hasta
                <input
                  type="date"
                  value={customHasta}
                  onChange={(e) => setCustomHasta(e.target.value)}
                  className="focus-ring mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 [color-scheme:light] dark:border-white/15 dark:bg-white/5 dark:text-slate-100 dark:[color-scheme:dark]"
                />
              </label>
              {(customDesde || customHasta) && (
                <button
                  type="button"
                  onClick={() => {
                    setCustomDesde('');
                    setCustomHasta('');
                  }}
                  className="focus-ring rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-700 hover:bg-slate-100 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/10"
                >
                  Limpiar
                </button>
              )}
              {rangeInvalid && <p className="self-center text-xs text-rose-300">Rango inválido: «Desde» &gt; «Hasta».</p>}
              {useCustom && <p className="self-center text-xs text-accent-blue">Mostrando rango personalizado.</p>}
            </div>
          </details>

          {/* KPIs de la semana seleccionada. */}
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            <KpiCard label="Preparación prom." value={fmtPct(kpis.avgPreparation)} icon={Activity} accent={accentForPct(kpis.avgPreparation)} />
            <KpiCard label="Listas p/ activación" value={kpis.listasParaActivacion} icon={Rocket} accent="blue" />
            <KpiCard label="Preparación pend." value={kpis.preparacionPendiente} icon={Clock} accent="orange" />
            <KpiCard label="Checks compl./oblig." value={`${kpis.checksCompletados}/${kpis.checksObligatorios}`} icon={ListChecks} accent="teal" />
            <KpiCard label="Cierre operativo prom." value={fmtPct(kpis.avgClosing)} icon={ClipboardCheck} accent="violet" />
            <KpiCard label="Cerradas" value={kpis.cerradas} icon={CheckCircle2} accent="green" />
            <KpiCard label="Preparación a tiempo" value={fmtPct(kpis.preparacionATiempoPct)} icon={Timer} accent={accentForPct(kpis.preparacionATiempoPct)} />
            <KpiCard label="Cierre a tiempo" value={fmtPct(kpis.cierreATiempoPct)} icon={Timer} accent={accentForPct(kpis.cierreATiempoPct)} />
            <KpiCard label="Fuera de SLA" value={kpis.fueraDeSla} icon={AlertTriangle} accent="red" />
            <KpiCard label="Clientes" value={kpis.clientes} icon={Users} accent="blue" />
            <KpiCard label="Creatividades" value={kpis.totalCreatives} icon={Image} accent="teal" />
          </div>

          {/* Avance por check + distribución por estado. */}
          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <ChartCard title="Avance por check" subtitle="Completados vs pendientes (clic en pendientes para ver líneas)" isEmpty={checkProgress.length === 0}>
              <CheckProgressChart data={checkProgress} onSelectCheck={(check: CheckKey) => drill({ pendingCheck: check })} />
            </ChartCard>
            <ChartCard title="Distribución por estado" subtitle="Creatividades por estado operativo (clic para ver líneas)" isEmpty={kpis.totalCreatives === 0}>
              <StatusDistributionChart counts={kpis.statusCounts} onSelectStatus={(status: OperationalStatus) => drill({ status })} />
            </ChartCard>
          </div>

          {/* Preparación por cliente + evolución histórica. */}
          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <ChartCard title="Preparación por cliente" subtitle="Promedio de preparación (mayor pendiente primero)" isEmpty={prepByClient.length === 0}>
              <PreparationByClientChart data={prepByClient} onSelectClient={(cliente) => drill({ cliente })} />
            </ChartCard>
            <ChartCard
              title="Evolución histórica"
              subtitle="Avance diario desde el lunes previo a la activación"
              isEmpty={evolution.points.length === 0}
            >
              {evolution.insufficient && (
                <p className="mb-2 text-[11px] text-amber-300/80">
                  Historial limitado: se reconstruye con los timestamps disponibles de los checks.
                </p>
              )}
              <HistoricalEvolutionChart current={evolution.points} previous={previousEvolution.points} />
            </ChartCard>
          </div>

          {/* Matriz cliente × check. */}
          <section className="card mt-6 overflow-hidden p-0" aria-label="Matriz cliente por check">
            <div className="border-b border-slate-200 p-5">
              <h2 className="text-sm font-semibold text-slate-900">Matriz cliente × check</h2>
              <p className="text-xs text-slate-500">% completado de cada check por cliente</p>
            </div>
            {clientCheckMatrix.rows.length === 0 ? (
              <p className="p-8 text-center text-sm text-slate-500">No hay creatividades en la semana seleccionada.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-2 font-medium">Cliente</th>
                      {CHECK_ORDER.map((check) => (
                        <th key={check} className="px-2 py-2 text-center font-medium">{CHECK_LABELS[check]}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {clientCheckMatrix.rows.slice(0, 20).map((row) => (
                      <tr key={String(row.cliente)} className="border-t border-slate-200">
                        <td className="max-w-52 truncate px-4 py-2 font-medium text-slate-900" title={String(row.cliente)}>
                          {String(row.cliente)}
                        </td>
                        {CHECK_ORDER.map((check) => {
                          const pct = Number(row[check] ?? 0);
                          return (
                            <td key={check} className="px-2 py-1.5 text-center">
                              <span className={`inline-block min-w-[42px] rounded-md px-2 py-0.5 text-[11px] font-semibold tabular-nums ${heatTone(pct)}`}>
                                {Number.isInteger(pct) ? pct : pct.toFixed(0)}%
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {creatives.length === 0 && (
            <div className="card mt-6 p-8 text-center">
              <p className="text-sm font-medium text-slate-800">No hay creatividades Ecommerce activas</p>
              <p className="mt-1 text-xs text-slate-500">Cuando se procese una importación Ecommerce, el avance aparecerá aquí.</p>
            </div>
          )}
        </div>
      )}
    </AppLayout>
  );
}

function ChartCard({
  title,
  subtitle,
  isEmpty,
  children,
}: {
  title: string;
  subtitle?: string;
  isEmpty: boolean;
  children: ReactNode;
}) {
  return (
    <section className="card p-5" aria-label={title}>
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      {subtitle && <p className="mb-3 text-xs text-slate-500">{subtitle}</p>}
      {isEmpty ? <p className="py-12 text-center text-sm text-slate-500">Sin datos en la semana</p> : children}
    </section>
  );
}
