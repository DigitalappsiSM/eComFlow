import { useMemo, useState } from 'react';
import {
  Users,
  CalendarRange,
  AlertTriangle,
  Activity,
  CheckCircle2,
  Clock,
  Gauge,
  Timer,
} from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { EmptyState, ErrorState, LoadingState } from '@/components/feedback/States';
import { FilterBar } from '@/components/filters/FilterBar';
import { distinctOptions, sortedOptions, type FilterValues } from '@/components/filters/filter-utils';
import { useDashboardData } from '@/features/dashboard/useDashboardData';
import {
  CheckBottleneckBar,
  ComplianceByClientBar,
  ComplianceByPeriodBar,
  ComplianceDonut,
} from '@/components/dashboard/DashboardCharts';
import {
  complianceStatusOf,
  computeCheckBottlenecks,
  computeComplianceByClient,
  computeComplianceByPeriod,
  computeComplianceDetail,
  computeComplianceSummary,
  lineMonthKey,
  operationalStatusOf,
  type ComplianceStatus,
  type MetricLine,
  type OperationalStatus,
} from '@/domain/dashboard-metrics';
import { todayIso } from '@/lib/dates';
import type { ReactNode } from 'react';

const OP_STATUS_LABEL: Record<OperationalStatus, string> = {
  vencido: 'Vencido',
  en_curso: 'En curso',
  futuro: 'Futuro',
};
const CONTINUITY_LABEL: Record<'fijacion' | 'continua', string> = {
  fijacion: 'Fijación',
  continua: 'Continua',
};
const COMPLIANCE_LABEL: Record<ComplianceStatus, string> = {
  cumplida: 'Cumplida',
  en_riesgo: 'En riesgo',
  en_proceso: 'En proceso',
  pendiente_futuro: 'Futura',
};

const DEFINITIONS: { term: string; detail: string }[] = [
  { term: 'Cumplida', detail: 'Todos los checks obligatorios de la línea están completos.' },
  { term: 'A tiempo', detail: 'Se completó a más tardar al fin de su periodo operativo.' },
  { term: 'En riesgo', detail: 'El periodo ya venció y la línea sigue incompleta (SLA incumplido).' },
  { term: 'En proceso', detail: 'El periodo está en curso y la línea aún no se completa.' },
  { term: '% Cumplimiento', detail: 'Líneas cumplidas ÷ total de líneas del grupo.' },
  { term: '% A tiempo', detail: 'Líneas completadas a tiempo ÷ líneas cuyo periodo ya venció.' },
  { term: 'Checks obligatorios', detail: 'DIGITAL SIGNAGE solo exige Artes; el resto, los 7 checks.' },
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
      (!f.cumplimiento || COMPLIANCE_LABEL[complianceStatusOf(l, today)] === f.cumplimiento) &&
      (!f.continuidad || (l.tipoCampanaPeriodo ? CONTINUITY_LABEL[l.tipoCampanaPeriodo] : '') === f.continuidad),
  );
}

function accentForPct(pct: number): 'green' | 'orange' | 'red' {
  if (pct >= 90) return 'green';
  if (pct >= 60) return 'orange';
  return 'red';
}

export function DashboardPage() {
  const today = todayIso();
  const { state, reload } = useDashboardData();
  const [filters, setFilters] = useState<FilterValues>({});

  const lines = useMemo<MetricLine[]>(
    () => (state.status === 'ready' ? state.lines : []),
    [state],
  );

  const filtered = useMemo(() => applyFilters(lines, filters, today), [lines, filters, today]);

  const summary = useMemo(() => computeComplianceSummary(filtered, today), [filtered, today]);
  const byClient = useMemo(() => computeComplianceByClient(filtered, today), [filtered, today]);
  const byPeriod = useMemo(() => computeComplianceByPeriod(filtered, today), [filtered, today]);
  const bottlenecks = useMemo(() => computeCheckBottlenecks(filtered), [filtered]);
  const detail = useMemo(() => computeComplianceDetail(filtered, today), [filtered, today]);

  const clientes = useMemo(() => {
    const set = new Set<string>();
    for (const l of filtered) if (!l.cancelled) set.add(l.clienteKey);
    return set.size;
  }, [filtered]);
  const periodos = useMemo(() => {
    const set = new Set<string>();
    for (const l of filtered) if (!l.cancelled && l.periodoOriginal) set.add(l.periodoOriginal);
    return set.size;
  }, [filtered]);

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
      key: 'cumplimiento',
      label: 'Cumplimiento',
      options: distinctOptions(lines, (l) => COMPLIANCE_LABEL[complianceStatusOf(l, today)]),
    },
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
    <AppLayout title="Cumplimiento operativo" description="Estatus real de operación por cliente y periodo">
      {state.status === 'loading' && <LoadingState label="Cargando cumplimiento (líneas y checks)…" />}
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
            <KpiCard label="% Cumplimiento" value={`${summary.cumplimientoPct}%`} icon={Gauge} accent={accentForPct(summary.cumplimientoPct)} />
            <KpiCard label="% A tiempo" value={`${summary.aTiempoPct}%`} icon={Timer} accent={accentForPct(summary.aTiempoPct)} />
            <KpiCard label="En riesgo" value={summary.enRiesgo} icon={AlertTriangle} accent="red" />
            <KpiCard label="Avance prom." value={`${summary.avgProgress}%`} icon={Activity} accent="blue" />
            <KpiCard label="Cumplidas" value={summary.cumplidas} icon={CheckCircle2} accent="green" />
            <KpiCard label="En proceso" value={summary.enProceso} icon={Clock} accent="violet" />
            <KpiCard label="Clientes" value={clientes} icon={Users} accent="teal" />
            <KpiCard label="Periodos" value={periodos} icon={CalendarRange} accent="blue" />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
            <ChartCard
              title="Cumplimiento por cliente"
              subtitle="% de líneas cumplidas (peor primero, top 10)"
              isEmpty={byClient.length === 0}
              className="lg:col-span-2"
            >
              <ComplianceByClientBar data={byClient} />
            </ChartCard>
            <ChartCard
              title="Semáforo de cumplimiento"
              subtitle="Cumplidas / En riesgo / En proceso / Futuras"
              isEmpty={summary.total === 0}
            >
              <ComplianceDonut summary={summary} />
            </ChartCard>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
            <ChartCard
              title="Cumplimiento por periodo"
              subtitle="% de líneas cumplidas por semana / catorcena"
              isEmpty={byPeriod.length === 0}
              className="lg:col-span-2"
            >
              <ComplianceByPeriodBar data={byPeriod} />
            </ChartCard>
            <ChartCard
              title="Cuellos de botella"
              subtitle="Checks obligatorios pendientes (nº de líneas)"
              isEmpty={bottlenecks.length === 0}
              emptyLabel="Sin checks pendientes"
            >
              <CheckBottleneckBar data={bottlenecks} />
            </ChartCard>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
            <section className="card overflow-hidden p-0 lg:col-span-2" aria-labelledby="detail-heading">
              <div className="border-b border-slate-100 p-5">
                <h2 id="detail-heading" className="text-sm font-semibold text-slate-800">
                  Detalle de cumplimiento
                </h2>
                <p className="text-xs text-slate-400">
                  Por cliente · periodo · tipo (mayor riesgo primero)
                </p>
              </div>
              {detail.length === 0 ? (
                <EmptyState title="Sin líneas" description="No hay líneas para el filtro actual." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[680px] text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-4 py-2 font-medium">Cliente</th>
                        <th className="px-4 py-2 font-medium">Periodo</th>
                        <th className="px-4 py-2 font-medium">Tipo</th>
                        <th className="px-4 py-2 text-right font-medium">Total</th>
                        <th className="px-4 py-2 text-right font-medium">Cumplidas</th>
                        <th className="px-4 py-2 text-right font-medium">% Cumpl.</th>
                        <th className="px-4 py-2 text-right font-medium">En riesgo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.slice(0, 14).map((r) => (
                        <tr key={`${r.cliente}|${r.periodo}|${r.tipo}`} className="border-t border-slate-100">
                          <td className="max-w-52 truncate px-4 py-2 font-medium text-slate-700" title={r.cliente}>
                            {r.cliente}
                          </td>
                          <td className="px-4 py-2 text-slate-600">{r.periodo}</td>
                          <td className="px-4 py-2 text-slate-600">{r.tipo}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-slate-500">{r.total}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-slate-500">{r.cumplidas}</td>
                          <td className="px-4 py-2 text-right">
                            <CompliancePct pct={r.cumplimientoPct} />
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums font-semibold text-red-600">
                            {r.enRiesgo || <span className="text-slate-300">—</span>}
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
                description="Cuando se procese una importación, el cumplimiento aparecerá aquí."
              />
            </div>
          )}
        </>
      )}
    </AppLayout>
  );
}

function CompliancePct({ pct }: { pct: number }) {
  const tone =
    pct >= 90 ? 'bg-green-50 text-accent-green' : pct >= 60 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-600';
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${tone}`}>{pct}%</span>;
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
