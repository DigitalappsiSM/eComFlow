/**
 * Gráficos del Dashboard de Resultados (Recharts). Componentes de presentación:
 * reciben datos ya calculados por `domain/results/results-metrics.ts`.
 */
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { DeviceSlice, PeriodPoint, RankItem } from '@/domain/results/results-metrics';
import type { ResultDevice } from '@/types/results';

const PALETTE = ['#2563eb', '#7c3aed', '#0d9488', '#ea580c', '#16a34a', '#db2777', '#0891b2', '#ca8a04'];
const AXIS = '#64748b';
const GRID = '#e2e8f0';
const tooltipStyle = { fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' };

const DEVICE_LABEL: Record<ResultDevice, string> = {
  app: 'App',
  mobile: 'Mobile',
  desktop: 'Desktop',
  unknown: 'Sin dispositivo',
};
const DEVICE_COLOR: Record<ResultDevice, string> = {
  app: '#2563eb',
  mobile: '#7c3aed',
  desktop: '#0d9488',
  unknown: '#94a3b8',
};

const nf = new Intl.NumberFormat('es-MX');
function truncate(v: string, max = 22): string {
  return v.length > max ? `${v.slice(0, max - 1)}…` : v;
}

/** Punto resaltado en el pico de clics. */
function PeakDot(props: { cx?: number; cy?: number; payload?: PeriodPoint }) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null || !payload?.isPeakClicks) return <g />;
  return <circle cx={cx} cy={cy} r={5} fill="#dc2626" stroke="#fff" strokeWidth={2} />;
}

/** Evolución por periodo: impresiones (área) + clics (línea) con pico marcado. */
export function ResultsTrendChart({ data }: { data: PeriodPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={{ left: 6, right: 12, top: 8, bottom: 4 }}>
        <defs>
          <linearGradient id="imprFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2563eb" stopOpacity={0.18} />
            <stop offset="100%" stopColor="#2563eb" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="code" tick={{ fontSize: 10, fill: AXIS }} interval="preserveStartEnd" />
        <YAxis yAxisId="imp" tick={{ fontSize: 10, fill: AXIS }} width={48} tickFormatter={(v: number) => nf.format(v)} />
        <YAxis yAxisId="clk" orientation="right" tick={{ fontSize: 10, fill: AXIS }} width={40} tickFormatter={(v: number) => nf.format(v)} />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v: number, name: string) => [nf.format(v), name === 'impressions' ? 'Impresiones' : 'Clics']}
          labelFormatter={(l) => `Periodo ${l}`}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v: string) => (v === 'impressions' ? 'Impresiones' : 'Clics')} />
        <Area yAxisId="imp" type="monotone" dataKey="impressions" stroke="#2563eb" strokeWidth={1.5} fill="url(#imprFill)" />
        <Line yAxisId="clk" type="monotone" dataKey="clicks" stroke="#ea580c" strokeWidth={2} dot={<PeakDot />} activeDot={{ r: 4 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Ranking horizontal por clics (categorías/clientes/artículos más visitados). */
export function ClicksRankBar({ data, color = '#2563eb' }: { data: RankItem[]; color?: string }) {
  const rows = data.slice(0, 10).map((d) => ({ ...d, label: truncate(d.key, 24) }));
  return (
    <ResponsiveContainer width="100%" height={Math.max(200, rows.length * 34)}>
      <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} stroke={GRID} />
        <XAxis type="number" tick={{ fontSize: 10, fill: AXIS }} tickFormatter={(v: number) => nf.format(v)} />
        <YAxis type="category" dataKey="label" width={150} tick={{ fontSize: 11, fill: AXIS }} interval={0} />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v: number, _n, item) => {
            const p = item?.payload as RankItem | undefined;
            return [`${nf.format(v)} clics · ${nf.format(p?.impressions ?? 0)} impr · ${((p?.ctr ?? 0) * 100).toFixed(2)}%`, 'Clics'];
          }}
        />
        <Bar dataKey="clicks" name="Clics" radius={[0, 4, 4, 0]} maxBarSize={24}>
          {rows.map((_, i) => (
            <Cell key={i} fill={color === 'palette' ? PALETTE[i % PALETTE.length] : color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Dona por dispositivo (por clics). */
export function DeviceDonut({ data }: { data: DeviceSlice[] }) {
  const rows = data.map((d) => ({ name: DEVICE_LABEL[d.device], value: d.clicks, color: DEVICE_COLOR[d.device] }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie data={rows} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
          {rows.map((r) => (
            <Cell key={r.name} fill={r.color} />
          ))}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} formatter={(v: number, n: string) => [`${nf.format(v)} clics`, n]} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
