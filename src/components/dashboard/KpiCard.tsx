import type { LucideIcon } from 'lucide-react';

interface KpiCardProps {
  label: string;
  value: number | string;
  icon: LucideIcon;
  accent: 'blue' | 'green' | 'violet' | 'orange' | 'teal' | 'red';
  /** 'dark' usa vidrio oscuro con texto claro (dashboard tech ejecutivo). */
  tone?: 'light' | 'dark';
}

const ACCENT_LIGHT: Record<KpiCardProps['accent'], string> = {
  blue: 'bg-blue-50 text-accent-blue',
  green: 'bg-green-50 text-accent-green',
  violet: 'bg-violet-50 text-accent-violet',
  orange: 'bg-orange-50 text-accent-orange',
  teal: 'bg-teal-50 text-accent-teal',
  red: 'bg-red-50 text-red-600',
};
const ACCENT_DARK: Record<KpiCardProps['accent'], string> = {
  blue: 'bg-accent-blue/15 text-accent-blue',
  green: 'bg-accent-green/15 text-emerald-300',
  violet: 'bg-accent-violet/15 text-violet-300',
  orange: 'bg-accent-orange/15 text-orange-300',
  teal: 'bg-accent-teal/15 text-teal-300',
  red: 'bg-red-500/15 text-rose-300',
};

/** Tarjeta KPI del dashboard (§39). */
export function KpiCard({ label, value, icon: Icon, accent, tone = 'light' }: KpiCardProps) {
  const dark = tone === 'dark';
  return (
    <div className={`${dark ? 'glass' : 'card'} flex items-center gap-4 p-4`}>
      <div className={`flex h-11 w-11 items-center justify-center rounded-lg ${(dark ? ACCENT_DARK : ACCENT_LIGHT)[accent]}`}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className={`truncate text-sm ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{label}</p>
        <p className={`text-2xl font-bold tabular-nums ${dark ? 'text-white' : 'text-slate-900'}`}>{value}</p>
      </div>
    </div>
  );
}
