import { Cloud, CloudOff, RefreshCw, TriangleAlert } from 'lucide-react';
import { CONNECTION_LABELS } from '@/lib/connectivity';
import { useConnectivity } from '@/hooks/useConnectivity';

/** Indicador global de conexión (§29, §35, §48). */
export function ConnectionIndicator() {
  const status = useConnectivity();

  const config = {
    online: { icon: Cloud, cls: 'text-accent-green bg-green-50 border-green-200' },
    offline: { icon: CloudOff, cls: 'text-slate-500 bg-slate-50 border-slate-200' },
    syncing: { icon: RefreshCw, cls: 'text-accent-blue bg-blue-50 border-blue-200' },
    sync_error: {
      icon: TriangleAlert,
      cls: 'text-accent-orange bg-orange-50 border-orange-200',
    },
  }[status];

  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${config.cls}`}
      role="status"
      aria-live="polite"
      title={CONNECTION_LABELS[status]}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {CONNECTION_LABELS[status]}
    </span>
  );
}
