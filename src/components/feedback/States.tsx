/** Estados de interfaz reutilizables (§48). */

import { AlertTriangle, Inbox, Loader2, WifiOff } from 'lucide-react';
import type { ReactNode } from 'react';

export function LoadingState({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500"
    >
      <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function EmptyState({
  title = 'Sin datos',
  description,
  icon,
}: {
  title?: string;
  description?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-slate-500">
      <div className="text-slate-400" aria-hidden="true">
        {icon ?? <Inbox className="h-8 w-8" />}
      </div>
      <p className="text-sm font-medium text-slate-600">{title}</p>
      {description && <p className="max-w-sm text-xs text-slate-400">{description}</p>}
    </div>
  );
}

export function ErrorState({
  title = 'Error de consulta',
  description,
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-3 py-16 text-center"
    >
      <AlertTriangle className="h-8 w-8 text-accent-orange" aria-hidden="true" />
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {description && <p className="max-w-md text-xs text-slate-500">{description}</p>}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="focus-ring mt-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Reintentar
        </button>
      )}
    </div>
  );
}

export function OfflineNotice() {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
      <WifiOff className="h-4 w-4" aria-hidden="true" />
      <span>Sin conexión. Mostrando datos desde caché; las escrituras están deshabilitadas.</span>
    </div>
  );
}
