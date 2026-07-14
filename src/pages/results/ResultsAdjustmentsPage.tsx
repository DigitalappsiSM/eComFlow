import { useEffect, useMemo, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { EmptyState, ErrorState, LoadingState } from '@/components/feedback/States';
import { FilterBar } from '@/components/filters/FilterBar';
import { distinctOptions, type FilterValues } from '@/components/filters/filter-utils';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuth } from '@/hooks/useAuth';
import { useResultsDashboard } from '@/features/results/useResultsDashboard';
import { allocateProportional, type AdjustmentMetric, type AdjustmentOperation } from '@/domain/results/adjustments';
import type { ResultsLine } from '@/domain/results/results-metrics';
import {
  approveAdjustmentSet,
  createAdjustmentSet,
  createWeeklyAdjustment,
  fetchAdjustmentSets,
  fetchAdjustmentsOfSet,
  setAdjustmentSetStatus,
  type AdjustmentSetDoc,
} from '@/repositories/results/results-adjustments.repository';

const nf = new Intl.NumberFormat('es-MX');
const METRIC_LABEL: Record<AdjustmentMetric, string> = { impressions: 'Impresiones', clicks: 'Clics', unique_clicks: 'Clics únicos' };

function realValueOf(l: ResultsLine, metric: AdjustmentMetric): number {
  if (metric === 'impressions') return l.impressions;
  if (metric === 'clicks') return l.raw_clicks;
  return l.clicks; // unique_clicks
}

const STATUS_TONE: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  pending_approval: 'bg-amber-50 text-amber-700',
  approved: 'bg-green-50 text-accent-green',
  rejected: 'bg-red-50 text-red-600',
  archived: 'bg-slate-100 text-slate-400',
};

export function ResultsAdjustmentsPage() {
  const { can } = usePermissions();
  const { firebaseUser, appUser } = useAuth();
  const actor = firebaseUser && appUser ? { uid: firebaseUser.uid, email: appUser.email } : null;
  const canCreate = can('results.adjustments.create');
  const canApprove = can('results.adjustments.approve');

  const { state, lines } = useResultsDashboard();

  const [sets, setSets] = useState<AdjustmentSetDoc[]>([]);
  const [name, setName] = useState('');
  const [filters, setFilters] = useState<FilterValues>({});
  const [metric, setMetric] = useState<AdjustmentMetric>('unique_clicks');
  const [operation, setOperation] = useState<AdjustmentOperation>('override');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const reloadSets = () => fetchAdjustmentSets().then(setSets).catch(() => setSets([]));
  useEffect(() => {
    void reloadSets();
  }, []);

  const scoped = useMemo(
    () =>
      lines.filter(
        (l) =>
          (!filters.periodo || l.period_code === filters.periodo) &&
          (!filters.cliente || l.cliente === filters.cliente) &&
          (!filters.campana || l.campaign === filters.campana) &&
          (!filters.articulo || l.articulo === filters.articulo),
      ),
    [lines, filters],
  );

  const scopeWeekly = useMemo(
    () => scoped.map((l) => ({ weekly_result_id: l.weekly_result_id, real_value: realValueOf(l, metric) })),
    [scoped, metric],
  );

  const preview = useMemo(() => {
    const num = Number(value);
    if (!Number.isFinite(num) || scopeWeekly.length === 0) return null;
    return allocateProportional({
      metric,
      operation,
      requestedAdjustedTotal: operation === 'override' ? num : undefined,
      requestedDelta: operation === 'delta' ? num : undefined,
      scope: scopeWeekly,
    });
  }, [value, metric, operation, scopeWeekly]);

  const fields = [
    { key: 'periodo', label: 'Periodo', options: distinctOptions(lines, (l) => l.period_code) },
    { key: 'cliente', label: 'Cliente', options: distinctOptions(lines, (l) => l.cliente) },
    { key: 'campana', label: 'Campaña', options: distinctOptions(lines, (l) => l.campaign) },
    { key: 'articulo', label: 'Artículo', options: distinctOptions(lines, (l) => l.articulo) },
  ];

  async function handleCreate() {
    if (!actor || !preview?.ok || name.trim() === '' || reason.trim() === '') return;
    setBusy(true);
    setMsg(null);
    try {
      const periodIds = [...new Set(scoped.map((l) => l.period_id))];
      const starts = scoped.map((l) => l.period_start).filter(Boolean).sort();
      const setId = await createAdjustmentSet(
        { name: name.trim(), description: reason.trim(), period_ids: periodIds, scope_start_date: starts[0] ?? '', scope_end_date: starts[starts.length - 1] ?? '' },
        actor,
      );
      await createWeeklyAdjustment(
        {
          adjustment_set_id: setId,
          scope: 'custom_weekly_scope',
          metric,
          operation,
          period_ids: periodIds,
          scopeWeekly,
          requestedAdjustedTotal: operation === 'override' ? Number(value) : undefined,
          requestedDelta: operation === 'delta' ? Number(value) : undefined,
          reason: reason.trim(),
          commercial_comment: reason.trim(),
          reference: '',
        },
        actor,
      );
      await setAdjustmentSetStatus(setId, 'pending_approval', actor);
      setMsg({ kind: 'ok', text: 'Escenario creado y enviado a aprobación.' });
      setName('');
      setValue('');
      setReason('');
      await reloadSets();
    } catch (err) {
      setMsg({ kind: 'err', text: err instanceof Error ? err.message : 'Error al crear el ajuste.' });
    } finally {
      setBusy(false);
    }
  }

  async function handleApprove(set: AdjustmentSetDoc) {
    if (!actor) return;
    setBusy(true);
    setMsg(null);
    try {
      const adjustments = await fetchAdjustmentsOfSet(set.adjustment_set_id);
      // Alcance real ACTUAL por ajuste (recalculado desde las líneas cargadas).
      const byId = new Map(lines.map((l) => [l.weekly_result_id, l]));
      const currentScope = new Map(
        adjustments.map((adj) => [
          adj.adjustment_id,
          adj.weekly_result_ids.map((id) => {
            const l = byId.get(id);
            return { weekly_result_id: id, real_value: l ? realValueOf(l, adj.metric) : 0 };
          }),
        ]),
      );
      await approveAdjustmentSet(set.adjustment_set_id, adjustments, currentScope, actor);
      setMsg({ kind: 'ok', text: `Escenario "${set.name}" aprobado. Ya se refleja en la vista Ajustada.` });
      await reloadSets();
    } catch (err) {
      setMsg({ kind: 'err', text: err instanceof Error ? err.message : 'No se pudo aprobar.' });
    } finally {
      setBusy(false);
    }
  }

  async function handleStatus(set: AdjustmentSetDoc, status: 'rejected' | 'archived') {
    if (!actor) return;
    setBusy(true);
    try {
      await setAdjustmentSetStatus(set.adjustment_set_id, status, actor);
      await reloadSets();
    } finally {
      setBusy(false);
    }
  }

  if (!can('results.adjustments.view')) {
    return (
      <AppLayout title="Resultados · Ajustes comerciales" description="Escenarios ajustados sobre resultados reales">
        <EmptyState title="Sin permiso" description="No tienes permiso para ver ajustes." />
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Resultados · Ajustes comerciales" description="Los resultados reales no se modifican; los ajustes viven aparte">
      {state.status === 'loading' && <LoadingState />}
      {state.status === 'error' && <ErrorState description={state.message} />}
      {state.status === 'ready' && (
        <div className="space-y-4">
          {msg && (
            <div className={`rounded-lg px-4 py-2 text-sm ${msg.kind === 'ok' ? 'bg-green-50 text-accent-green' : 'bg-red-50 text-red-600'}`}>
              {msg.text}
            </div>
          )}

          {canCreate && (
            <div className="card p-5">
              <h2 className="text-sm font-semibold text-slate-800">Crear ajuste</h2>
              <p className="mb-3 text-xs text-slate-400">
                Elige el alcance con los filtros, la métrica y el total (override) o el delta. Se distribuye
                proporcionalmente entre las semanas del alcance (mayores residuos). El total real base debe ser &gt; 0.
              </p>

              <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre del escenario" className="focus-ring rounded-lg border border-slate-300 px-3 py-2 text-sm lg:col-span-2" />
                <select value={metric} onChange={(e) => setMetric(e.target.value as AdjustmentMetric)} className="focus-ring rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm">
                  {(['unique_clicks', 'clicks', 'impressions'] as AdjustmentMetric[]).map((m) => (
                    <option key={m} value={m}>{METRIC_LABEL[m]}</option>
                  ))}
                </select>
                <select value={operation} onChange={(e) => setOperation(e.target.value as AdjustmentOperation)} className="focus-ring rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm">
                  <option value="override">Override (total deseado)</option>
                  <option value="delta">Delta (sumar/restar)</option>
                </select>
                <input value={value} onChange={(e) => setValue(e.target.value)} type="number" placeholder={operation === 'override' ? 'Total ajustado' : 'Delta (+/-)'} className="focus-ring rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums" />
                <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo (obligatorio)" className="focus-ring rounded-lg border border-slate-300 px-3 py-2 text-sm lg:col-span-3" />
              </div>

              <FilterBar
                fields={fields}
                values={filters}
                onChange={(key, val) => setFilters((f) => ({ ...f, [key]: val }))}
                onClear={() => setFilters({})}
                meta={`${scoped.length} semana(s) en el alcance`}
              />

              <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-slate-500">
                  {preview ? (
                    preview.ok ? (
                      <>
                        Base real ({METRIC_LABEL[metric]}): <strong>{nf.format(preview.scopeRealTotal)}</strong> → total
                        ajustado: <strong>{nf.format(preview.targetTotal)}</strong> en {scopeWeekly.length} semana(s).
                      </>
                    ) : (
                      <span className="font-medium text-red-600">{preview.errorMessage}</span>
                    )
                  ) : (
                    'Define alcance, métrica y valor para previsualizar la distribución.'
                  )}
                </div>
                <button
                  type="button"
                  disabled={busy || !preview?.ok || name.trim() === '' || reason.trim() === ''}
                  onClick={() => void handleCreate()}
                  className="focus-ring rounded-lg bg-accent-blue px-4 py-2 text-sm font-medium text-white hover:bg-accent-blue/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? 'Guardando…' : 'Crear y enviar a aprobación'}
                </button>
              </div>
            </div>
          )}

          <div className="card overflow-hidden p-0">
            <div className="border-b border-slate-100 p-5">
              <h2 className="text-sm font-semibold text-slate-800">Escenarios de ajuste</h2>
              <p className="text-xs text-slate-400">Un ajuste aprobado es inmutable; para corregir se crea uno nuevo.</p>
            </div>
            {sets.length === 0 ? (
              <EmptyState title="Sin escenarios" description="Crea un ajuste para empezar." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-2 font-medium">Escenario</th>
                      <th className="px-4 py-2 font-medium">Periodos</th>
                      <th className="px-4 py-2 font-medium">Estado</th>
                      <th className="px-4 py-2 font-medium">Oficial</th>
                      <th className="px-4 py-2 text-right font-medium">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sets.map((s) => (
                      <tr key={s.adjustment_set_id} className="border-t border-slate-100">
                        <td className="px-4 py-2 font-medium text-slate-700">{s.name}</td>
                        <td className="px-4 py-2 tabular-nums text-slate-500">{s.period_ids.length}</td>
                        <td className="px-4 py-2">
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_TONE[s.status] ?? ''}`}>{s.status}</span>
                        </td>
                        <td className="px-4 py-2 text-slate-500">{s.is_official ? 'Sí' : '—'}</td>
                        <td className="px-4 py-2">
                          <div className="flex justify-end gap-2">
                            {s.status === 'pending_approval' && canApprove && (
                              <>
                                <button disabled={busy} onClick={() => void handleApprove(s)} className="focus-ring rounded-md bg-accent-green px-2 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50">Aprobar</button>
                                <button disabled={busy} onClick={() => void handleStatus(s, 'rejected')} className="focus-ring rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">Rechazar</button>
                              </>
                            )}
                            {(s.status === 'draft' || s.status === 'rejected') && (
                              <button disabled={busy} onClick={() => void handleStatus(s, 'archived')} className="focus-ring rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-50 disabled:opacity-50">Archivar</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </AppLayout>
  );
}
