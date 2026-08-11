/**
 * Gráficas del Dashboard de Avance Operativo Ecommerce (Recharts, tema oscuro).
 *
 * Componentes de presentación puros: reciben datos ya calculados por la capa de
 * dominio (`src/domain/ecommerce-dashboard`). Exponen callbacks de drill-down
 * (§11) para abrir Seguimiento operativo con filtros precargados.
 */
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CHECK_LABELS } from '@/domain/ecommerce-dashboard';
import type {
  CheckProgressBar,
  ClientPreparationRow,
  AggregateSeriesPoint,
} from '@/domain/ecommerce-dashboard';
import type { OperationalStatus } from '@/domain/ecommerce-dashboard';
import { STATUS_LABELS } from '@/domain/ecommerce-dashboard';
import type { CheckKey } from '@/domain/progress';

const AXIS = '#94a3b8';
const GRID = 'rgba(255,255,255,0.09)';
const tooltipStyle = {
  fontSize: 12,
  borderRadius: 8,
  border: '1px solid #1e293b',
  background: '#0b1220',
  color: '#e2e8f0',
} as const;

const COMPLETED = '#34d399';
const PENDING = '#f97316';

function truncate(value: string, max = 20): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/** Avance por check: completados vs pendientes (barras apiladas). Drill-down por check pendiente. */
export function CheckProgressChart({
  data,
  onSelectCheck,
}: {
  data: CheckProgressBar[];
  onSelectCheck?: (check: CheckKey) => void;
}) {
  const rows = data.map((d) => ({ ...d, label: CHECK_LABELS[d.check] }));
  return (
    <ResponsiveContainer width="100%" height={Math.max(200, rows.length * 40)}>
      <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} stroke={GRID} />
        <XAxis type="number" tick={{ fontSize: 11, fill: AXIS }} allowDecimals={false} />
        <YAxis type="category" dataKey="label" width={92} tick={{ fontSize: 11, fill: AXIS }} interval={0} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="completed" name="Completados" stackId="c" fill={COMPLETED} maxBarSize={24} radius={[4, 0, 0, 4]} />
        <Bar
          dataKey="pending"
          name="Pendientes"
          stackId="c"
          fill={PENDING}
          maxBarSize={24}
          radius={[0, 4, 4, 0]}
          cursor={onSelectCheck ? 'pointer' : undefined}
          onClick={(entry: unknown) => {
            const check = (entry as { check?: CheckKey })?.check;
            if (check && onSelectCheck) onSelectCheck(check);
          }}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

function prepColor(pct: number): string {
  if (pct >= 90) return '#16a34a';
  if (pct >= 60) return '#f59e0b';
  return '#dc2626';
}

/** Preparación promedio por cliente (%). Drill-down por cliente. */
export function PreparationByClientChart({
  data,
  onSelectClient,
}: {
  data: ClientPreparationRow[];
  onSelectClient?: (cliente: string) => void;
}) {
  const rows = data.slice(0, 12).map((d) => ({ ...d, label: truncate(d.cliente) }));
  return (
    <ResponsiveContainer width="100%" height={Math.max(200, rows.length * 34)}>
      <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 40, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} stroke={GRID} />
        <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: AXIS }} unit="%" />
        <YAxis type="category" dataKey="label" width={140} tick={{ fontSize: 11, fill: AXIS }} interval={0} />
        <Tooltip
          contentStyle={tooltipStyle}
          cursor={{ fill: 'rgba(255,255,255,0.04)' }}
          formatter={(v: number, _n, item) => {
            const p = item?.payload as ClientPreparationRow | undefined;
            return [`${v}%  ·  ${p?.pendingChecks ?? 0} checks pend.  ·  ${p?.creatives ?? 0} creativ.`, 'Preparación'];
          }}
        />
        <Bar
          dataKey="avgPreparation"
          name="Preparación"
          radius={[0, 4, 4, 0]}
          maxBarSize={24}
          cursor={onSelectClient ? 'pointer' : undefined}
          onClick={(entry: unknown) => {
            const cliente = (entry as { cliente?: string })?.cliente;
            if (cliente && onSelectClient) onSelectClient(cliente);
          }}
        >
          {rows.map((r, i) => (
            <Cell key={i} fill={prepColor(r.avgPreparation)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

const STATUS_COLORS: Record<OperationalStatus, string> = {
  sin_iniciar: '#64748b',
  en_preparacion: '#2563eb',
  lista_para_activacion: '#0ea5e9',
  lista_con_retraso: '#f59e0b',
  en_ventana_testigos: '#a78bfa',
  testigos_vencidos: '#dc2626',
  cerrada_a_tiempo: '#16a34a',
  cerrada_con_retraso: '#ea580c',
};

/** Distribución por estado (barras). Drill-down por estado. */
export function StatusDistributionChart({
  counts,
  onSelectStatus,
}: {
  counts: Record<OperationalStatus, number>;
  onSelectStatus?: (status: OperationalStatus) => void;
}) {
  const rows = (Object.keys(counts) as OperationalStatus[])
    .map((status) => ({ status, label: STATUS_LABELS[status], value: counts[status] }))
    .filter((r) => r.value > 0);
  if (rows.length === 0) return <p className="py-12 text-center text-sm text-slate-500">Sin creatividades</p>;
  return (
    <ResponsiveContainer width="100%" height={Math.max(200, rows.length * 34)}>
      <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} stroke={GRID} />
        <XAxis type="number" tick={{ fontSize: 11, fill: AXIS }} allowDecimals={false} />
        <YAxis type="category" dataKey="label" width={150} tick={{ fontSize: 11, fill: AXIS }} interval={0} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.04)' }} formatter={(v: number) => [`${v} creativ.`, 'Creatividades']} />
        <Bar
          dataKey="value"
          name="Creatividades"
          radius={[0, 4, 4, 0]}
          maxBarSize={22}
          cursor={onSelectStatus ? 'pointer' : undefined}
          onClick={(entry: unknown) => {
            const status = (entry as { status?: OperationalStatus })?.status;
            if (status && onSelectStatus) onSelectStatus(status);
          }}
        >
          {rows.map((r) => (
            <Cell key={r.status} fill={STATUS_COLORS[r.status]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Evolución histórica de avance: total (área) + preparación, con comparación semana anterior. */
export function HistoricalEvolutionChart({
  current,
  previous,
}: {
  current: AggregateSeriesPoint[];
  previous?: AggregateSeriesPoint[];
}) {
  const prevByDate = new Map((previous ?? []).map((p, i) => [i, p.totalPct]));
  const rows = current.map((p, i) => ({
    date: p.date.slice(5), // MM-DD
    totalPct: p.totalPct,
    preparationPct: p.preparationPct,
    prevTotalPct: prevByDate.get(i) ?? null,
  }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      {previous && previous.length > 0 ? (
        <LineChart data={rows} margin={{ left: 4, right: 12, top: 8, bottom: 4 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: AXIS }} interval="preserveStartEnd" />
          <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: AXIS }} unit="%" width={40} />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line type="monotone" dataKey="totalPct" name="Avance total" stroke="#34d6e6" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="preparationPct" name="Preparación" stroke="#5b8def" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="prevTotalPct" name="Semana anterior" stroke="#64748b" strokeWidth={2} strokeDasharray="4 4" dot={false} />
        </LineChart>
      ) : (
        <AreaChart data={rows} margin={{ left: 4, right: 12, top: 8, bottom: 4 }}>
          <defs>
            <linearGradient id="evoFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#34d6e6" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#34d6e6" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: AXIS }} interval="preserveStartEnd" />
          <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: AXIS }} unit="%" width={40} />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Area type="monotone" dataKey="totalPct" name="Avance total" stroke="#34d6e6" strokeWidth={2} fill="url(#evoFill)" />
          <Line type="monotone" dataKey="preparationPct" name="Preparación" stroke="#5b8def" strokeWidth={2} dot={false} />
        </AreaChart>
      )}
    </ResponsiveContainer>
  );
}
