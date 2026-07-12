/**
 * Gráficos del Dashboard Operativo 360 (Recharts).
 *
 * Componentes de presentación puros: reciben datos ya calculados por
 * `src/domain/dashboard-metrics.ts` y solo los pintan. No consultan Firestore
 * ni calculan métricas.
 */
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  ChainLoadItem,
  CheckBottleneck,
  ClientLoadItem,
  ClientTypeMatrix,
  ComplianceStat,
  ComplianceSummary,
  MonthlyTrendItem,
  OperationalStatusBreakdown,
  PeriodLoadItem,
  TipoDistributionItem,
} from '@/domain/dashboard-metrics';
import type { CheckKey } from '@/domain/progress';

/** Paleta categórica (acentos del tema). */
const PALETTE = ['#2563eb', '#7c3aed', '#0d9488', '#ea580c', '#16a34a', '#db2777', '#0891b2', '#ca8a04'];
const AXIS = '#64748b';
const GRID = '#e2e8f0';

/** Colores del estado operativo. */
export const STATUS_COLORS = {
  vencido: '#dc2626',
  enCurso: '#16a34a',
  futuro: '#64748b',
} as const;

/** Colores del cumplimiento. */
export const COMPLIANCE_COLORS = {
  cumplida: '#16a34a',
  enRiesgo: '#dc2626',
  enProceso: '#2563eb',
  futuro: '#94a3b8',
} as const;

/** Etiquetas cortas de los checks. */
const CHECK_LABELS: Record<CheckKey, string> = {
  correo_enviado: 'Correo',
  artes: 'Artes',
  validacion: 'Validación',
  link: 'Link',
  kevel: 'Kevel',
  testigos_app: 'T. App',
  testigos_web: 'T. Web',
};

/** Color por nivel de cumplimiento (%). */
function complianceColor(pct: number): string {
  if (pct >= 90) return '#16a34a';
  if (pct >= 60) return '#f59e0b';
  return '#dc2626';
}

const tooltipStyle = {
  fontSize: 12,
  borderRadius: 8,
  border: '1px solid #e2e8f0',
  boxShadow: '0 1px 3px rgba(16,24,40,0.1)',
};

function truncate(value: string, max = 22): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/** Barras horizontales: principales clientes por líneas. */
export function TopClientsBar({ data }: { data: ClientLoadItem[] }) {
  const rows = data.slice(0, 8).map((d) => ({ ...d, label: truncate(d.cliente) }));
  return (
    <ResponsiveContainer width="100%" height={Math.max(200, rows.length * 38)}>
      <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} stroke={GRID} />
        <XAxis type="number" tick={{ fontSize: 11, fill: AXIS }} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="label"
          width={140}
          tick={{ fontSize: 11, fill: AXIS }}
          interval={0}
        />
        <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v} líneas`, 'Líneas']} />
        <Bar dataKey="lines" name="Líneas" radius={[0, 4, 4, 0]} maxBarSize={26}>
          {rows.map((_, i) => (
            <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Dona: distribución por tipo de operación. */
export function TipoDonut({ data }: { data: TipoDistributionItem[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={data}
          dataKey="lines"
          nameKey="tipo"
          innerRadius={55}
          outerRadius={90}
          paddingAngle={2}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v: number, n: string) => [`${v} líneas`, n]}
        />
        <Legend
          wrapperStyle={{ fontSize: 11 }}
          formatter={(value: string) => truncate(value, 18)}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

/** Área: evolución mensual de líneas. */
export function MonthlyArea({ data }: { data: MonthlyTrendItem[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ left: 4, right: 16, top: 8, bottom: 4 }}>
        <defs>
          <linearGradient id="monthlyFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2563eb" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#2563eb" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: AXIS }} />
        <YAxis tick={{ fontSize: 11, fill: AXIS }} allowDecimals={false} width={32} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v} líneas`, 'Líneas']} />
        <Area
          type="monotone"
          dataKey="lines"
          name="Líneas"
          stroke="#2563eb"
          strokeWidth={2}
          fill="url(#monthlyFill)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Barras: carga por periodo (semana/catorcena). */
export function PeriodBar({ data }: { data: PeriodLoadItem[] }) {
  const rows = data.map((d) => ({ ...d, label: truncate(d.periodo, 16) }));
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={rows} margin={{ left: 4, right: 16, top: 8, bottom: 4 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: AXIS }} interval={0} angle={-20} textAnchor="end" height={54} />
        <YAxis tick={{ fontSize: 11, fill: AXIS }} allowDecimals={false} width={32} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v} líneas`, 'Líneas']} />
        <Bar dataKey="lines" name="Líneas" fill="#0d9488" radius={[4, 4, 0, 0]} maxBarSize={40} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Barras: carga por cadena. */
export function ChainBar({ data }: { data: ChainLoadItem[] }) {
  const rows = data.slice(0, 10).map((d) => ({ ...d, label: truncate(d.cadena, 18) }));
  return (
    <ResponsiveContainer width="100%" height={Math.max(200, rows.length * 34)}>
      <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} stroke={GRID} />
        <XAxis type="number" tick={{ fontSize: 11, fill: AXIS }} allowDecimals={false} />
        <YAxis type="category" dataKey="label" width={130} tick={{ fontSize: 11, fill: AXIS }} interval={0} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v} líneas`, 'Líneas']} />
        <Bar dataKey="lines" name="Líneas" fill="#ea580c" radius={[0, 4, 4, 0]} maxBarSize={24} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Barras apiladas: clientes por tipo de operación. */
export function ClientTypeStacked({ matrix }: { matrix: ClientTypeMatrix }) {
  const rows = matrix.rows.slice(0, 8).map((r) => ({ ...r, label: truncate(String(r.cliente), 18) }));
  return (
    <ResponsiveContainer width="100%" height={Math.max(220, rows.length * 40)}>
      <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} stroke={GRID} />
        <XAxis type="number" tick={{ fontSize: 11, fill: AXIS }} allowDecimals={false} />
        <YAxis type="category" dataKey="label" width={130} tick={{ fontSize: 11, fill: AXIS }} interval={0} />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 11 }} formatter={(value: string) => truncate(value, 16)} />
        {matrix.tipos.map((tipo, i) => (
          <Bar
            key={tipo}
            dataKey={tipo}
            name={tipo}
            stackId="tipos"
            fill={PALETTE[i % PALETTE.length]}
            maxBarSize={26}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Barras horizontales: % de cumplimiento por cliente (peor primero). */
export function ComplianceByClientBar({ data }: { data: ComplianceStat[] }) {
  const rows = data.slice(0, 10).map((d) => ({ ...d, label: truncate(d.key, 20) }));
  return (
    <ResponsiveContainer width="100%" height={Math.max(200, rows.length * 34)}>
      <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 40, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} stroke={GRID} />
        <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: AXIS }} unit="%" />
        <YAxis type="category" dataKey="label" width={140} tick={{ fontSize: 11, fill: AXIS }} interval={0} />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v: number, _n, item) => {
            const p = item?.payload as ComplianceStat | undefined;
            return [`${v}%  ·  ${p?.cumplidas ?? 0}/${p?.total ?? 0}  ·  ${p?.enRiesgo ?? 0} en riesgo`, 'Cumplimiento'];
          }}
        />
        <Bar dataKey="cumplimientoPct" name="Cumplimiento" radius={[0, 4, 4, 0]} maxBarSize={24}>
          {rows.map((r, i) => (
            <Cell key={i} fill={complianceColor(r.cumplimientoPct)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Barras: % de cumplimiento por periodo (orden cronológico). */
export function ComplianceByPeriodBar({ data }: { data: ComplianceStat[] }) {
  const rows = data.map((d) => ({ ...d, label: truncate(d.key, 16) }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={rows} margin={{ left: 4, right: 16, top: 8, bottom: 4 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: AXIS }} interval={0} angle={-20} textAnchor="end" height={54} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: AXIS }} unit="%" width={40} />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v: number, _n, item) => {
            const p = item?.payload as ComplianceStat | undefined;
            return [`${v}%  ·  ${p?.cumplidas ?? 0}/${p?.total ?? 0}  ·  ${p?.enRiesgo ?? 0} en riesgo`, 'Cumplimiento'];
          }}
        />
        <Bar dataKey="cumplimientoPct" name="Cumplimiento" radius={[4, 4, 0, 0]} maxBarSize={44}>
          {rows.map((r, i) => (
            <Cell key={i} fill={complianceColor(r.cumplimientoPct)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Dona: semáforo de cumplimiento (cumplidas / en riesgo / en proceso / futuras). */
export function ComplianceDonut({ summary }: { summary: ComplianceSummary }) {
  const data = [
    { name: 'Cumplidas', value: summary.cumplidas, color: COMPLIANCE_COLORS.cumplida },
    { name: 'En riesgo', value: summary.enRiesgo, color: COMPLIANCE_COLORS.enRiesgo },
    { name: 'En proceso', value: summary.enProceso, color: COMPLIANCE_COLORS.enProceso },
    { name: 'Futuras', value: summary.futuras, color: COMPLIANCE_COLORS.futuro },
  ];
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
          {data.map((d) => (
            <Cell key={d.name} fill={d.color} />
          ))}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} formatter={(v: number, n: string) => [`${v} líneas`, n]} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

/** Barras horizontales: cuello de botella por check pendiente. */
export function CheckBottleneckBar({ data }: { data: CheckBottleneck[] }) {
  const rows = data.map((d) => ({ ...d, label: CHECK_LABELS[d.check] ?? d.check }));
  return (
    <ResponsiveContainer width="100%" height={Math.max(180, rows.length * 34)}>
      <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} stroke={GRID} />
        <XAxis type="number" tick={{ fontSize: 11, fill: AXIS }} allowDecimals={false} />
        <YAxis type="category" dataKey="label" width={80} tick={{ fontSize: 11, fill: AXIS }} interval={0} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v} líneas`, 'Pendientes']} />
        <Bar dataKey="pending" name="Pendientes" fill="#ea580c" radius={[0, 4, 4, 0]} maxBarSize={24} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Dona: vencido / en curso / futuro. */
export function StatusPie({ breakdown }: { breakdown: OperationalStatusBreakdown }) {
  const data = [
    { name: 'Vencido', value: breakdown.vencido, color: STATUS_COLORS.vencido },
    { name: 'En curso', value: breakdown.enCurso, color: STATUS_COLORS.enCurso },
    { name: 'Futuro', value: breakdown.futuro, color: STATUS_COLORS.futuro },
  ];
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
          {data.map((d) => (
            <Cell key={d.name} fill={d.color} />
          ))}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} formatter={(v: number, n: string) => [`${v} líneas`, n]} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
