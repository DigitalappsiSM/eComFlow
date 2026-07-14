import { useEffect, useMemo, useState } from 'react';
import { CalendarRange, CheckCircle2 } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { EmptyState, ErrorState, LoadingState } from '@/components/feedback/States';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuth } from '@/hooks/useAuth';
import { generateEcommercePeriods } from '@/domain/results/periods';
import { fetchActivePeriods, seedEcommercePeriods } from '@/repositories/results/periods.repository';
import type { EcommercePeriod } from '@/types/results';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; periods: EcommercePeriod[] };

/** Viernes → getUTCDay() === 5. */
function isFriday(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  return new Date(`${iso}T00:00:00Z`).getUTCDay() === 5;
}

export function ResultsPeriodsPage() {
  const { can } = usePermissions();
  const { firebaseUser, appUser } = useAuth();
  const canManage = can('results.manage_mappings');

  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [anchor, setAnchor] = useState('');
  const [weekNumber, setWeekNumber] = useState(1);
  const [count, setCount] = useState(52);
  const [seedStatus, setSeedStatus] = useState<'idle' | 'saving' | 'done'>('idle');

  const load = () => {
    setState({ status: 'loading' });
    fetchActivePeriods()
      .then((periods) => setState({ status: 'ready', periods }))
      .catch((err: unknown) =>
        setState({ status: 'error', message: err instanceof Error ? err.message : 'Error.' }),
      );
  };
  useEffect(load, []);

  const preview = useMemo(() => {
    if (!isFriday(anchor) || count < 1 || count > 200) return [];
    return generateEcommercePeriods({ anchorFriday: anchor, anchorWeekNumber: weekNumber, count });
  }, [anchor, weekNumber, count]);

  async function handleSeed() {
    if (!firebaseUser || !appUser || preview.length === 0) return;
    setSeedStatus('saving');
    try {
      await seedEcommercePeriods(preview, { uid: firebaseUser.uid, email: appUser.email });
      setSeedStatus('done');
      load();
    } catch {
      setSeedStatus('idle');
      setState({ status: 'error', message: 'No se pudo sembrar el catálogo.' });
    }
  }

  return (
    <AppLayout title="Resultados · Periodos ecommerce" description="Catálogo de semanas viernes→jueves (S##)">
      <div className="space-y-4">
        {canManage && (
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-slate-800">Sembrar catálogo</h2>
            <p className="mb-3 text-xs text-slate-400">
              Genera semanas consecutivas viernes→jueves. Indica el <strong>viernes ancla</strong>, el número de
              semana de esa fecha (p. ej. 29 para S29) y cuántas semanas crear. Es idempotente: re-sembrar no
              duplica.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  Viernes ancla
                </label>
                <input
                  type="date"
                  value={anchor}
                  onChange={(e) => setAnchor(e.target.value)}
                  className="focus-ring rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  Nº de semana del ancla
                </label>
                <input
                  type="number"
                  min={1}
                  max={53}
                  value={weekNumber}
                  onChange={(e) => setWeekNumber(Number(e.target.value))}
                  className="focus-ring w-28 rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  Semanas a generar
                </label>
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                  className="focus-ring w-28 rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
                />
              </div>
              <button
                type="button"
                disabled={preview.length === 0 || seedStatus === 'saving'}
                onClick={() => void handleSeed()}
                className="focus-ring inline-flex items-center gap-2 rounded-lg bg-accent-blue px-4 py-2 text-sm font-medium text-white hover:bg-accent-blue/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CalendarRange className="h-4 w-4" aria-hidden="true" />
                {seedStatus === 'saving' ? 'Sembrando…' : `Sembrar ${preview.length || ''} periodos`}
              </button>
              {seedStatus === 'done' && (
                <span className="inline-flex items-center gap-1 text-sm font-medium text-accent-green">
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Catálogo sembrado
                </span>
              )}
            </div>
            {anchor !== '' && !isFriday(anchor) && (
              <p className="mt-2 text-xs font-medium text-red-600">La fecha ancla debe ser un viernes.</p>
            )}
            {preview.length > 0 && (
              <p className="mt-2 text-xs text-slate-500">
                Vista previa: {preview[0]!.code} ({preview[0]!.start_date} → {preview[0]!.end_date}) …{' '}
                {preview[preview.length - 1]!.code} ({preview[preview.length - 1]!.start_date} →{' '}
                {preview[preview.length - 1]!.end_date})
              </p>
            )}
          </div>
        )}

        {state.status === 'loading' && <LoadingState label="Cargando periodos…" />}
        {state.status === 'error' && <ErrorState description={state.message} onRetry={load} />}
        {state.status === 'ready' &&
          (state.periods.length === 0 ? (
            <EmptyState
              title="Sin periodos ecommerce"
              description="Siembra el catálogo antes de importar resultados: toda fecha del reporte debe tener periodo."
            />
          ) : (
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-2 font-medium">Código</th>
                    <th className="px-4 py-2 font-medium">Inicio (viernes)</th>
                    <th className="px-4 py-2 font-medium">Fin (jueves)</th>
                    <th className="px-4 py-2 text-right font-medium">Mes</th>
                    <th className="px-4 py-2 text-right font-medium">Trimestre</th>
                    <th className="px-4 py-2 text-right font-medium">Año</th>
                  </tr>
                </thead>
                <tbody>
                  {state.periods.map((p) => (
                    <tr key={p.period_id} className="border-t border-slate-100">
                      <td className="px-4 py-2 font-semibold text-slate-700">{p.code}</td>
                      <td className="px-4 py-2 text-slate-600">{p.start_date}</td>
                      <td className="px-4 py-2 text-slate-600">{p.end_date}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-500">{p.month}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-500">Q{p.quarter}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-500">{p.year}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
      </div>
    </AppLayout>
  );
}
