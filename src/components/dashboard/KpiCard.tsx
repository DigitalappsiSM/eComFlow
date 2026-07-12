import type { LucideIcon } from 'lucide-react';

interface KpiCardProps {
  label: string;
  value: number | string;
  icon: LucideIcon;
  accent: 'blue' | 'green' | 'violet' | 'orange' | 'teal' | 'red';
}

const ACCENT: Record<KpiCardProps['accent'], string> = {
  blue: 'bg-blue-50 text-accent-blue',
  green: 'bg-green-50 text-accent-green',
  violet: 'bg-violet-50 text-accent-violet',
  orange: 'bg-orange-50 text-accent-orange',
  teal: 'bg-teal-50 text-accent-teal',
  red: 'bg-red-50 text-red-600',
};

/** Tarjeta KPI del dashboard (§39). */
export function KpiCard({ label, value, icon: Icon, accent }: KpiCardProps) {
  return (
    <div className="card flex items-center gap-4 p-4">
      <div className={`flex h-11 w-11 items-center justify-center rounded-lg ${ACCENT[accent]}`}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm text-slate-500">{label}</p>
        <p className="text-2xl font-bold text-slate-900">{value}</p>
      </div>
    </div>
  );
}
