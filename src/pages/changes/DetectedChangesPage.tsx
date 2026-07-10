import { useCallback, useEffect, useState } from 'react';
import { GitCompareArrows } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { EmptyState, ErrorState, LoadingState } from '@/components/feedback/States';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuth } from '@/hooks/useAuth';
import {
  confirmReplacement,
  fetchDetectedChanges,
  fetchReplacementCandidates,
  markAdditional,
  rejectChange,
} from '@/repositories/detected-changes.repository';
import type { DetectedChange, DetectedChangeStatus } from '@/types/audit';
import type { CampaignLine } from '@/types/campaign';

const STATUS_TABS: { value: DetectedChangeStatus; label: string }[] = [
  { value: 'pending', label: 'Pendientes' },
  { value: 'resolved', label: 'Resueltos' },
  { value: 'rejected', label: 'Rechazados' },
];

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; changes: DetectedChange[] };

export function DetectedChangesPage() {
  const { can } = usePermissions();
  const canWrite = can('operations.write');
  const [tab, setTab] = useState<DetectedChangeStatus>('pending');
  const [state, setState] = useState<State>({ status: 'loading' });

  const load = useCallback((status: DetectedChangeStatus) => {
    setState({ status: 'loading' });
    fetchDetectedChanges(status)
      .then((changes) => setState({ status: 'ready', changes }))
      .catch((err: unknown) =>
        setState({
          status: 'error',
          message: err instanceof Error ? err.message : 'Error desconocido.',
        }),
      );
  }, []);

  useEffect(() => load(tab), [tab, load]);

  return (
    <AppLayout title="Cambios detectados" description="Revisión de creatividades y posibles sustituciones">
      <div className="mb-4 flex gap-1">
        {STATUS_TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`focus-ring rounded-lg px-3 py-1.5 text-sm font-medium ${
              tab === t.value ? 'bg-accent-blue text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {state.status === 'loading' && <LoadingState />}
      {state.status === 'error' && <ErrorState description={state.message} onRetry={() => load(tab)} />}
      {state.status === 'ready' &&
        (state.changes.length === 0 ? (
          <EmptyState
            title="Sin cambios en este estado"
            icon={<GitCompareArrows className="h-8 w-8" />}
            description="Las nuevas creatividades detectadas durante la importación aparecerán aquí para su revisión."
          />
        ) : (
          <div className="space-y-3">
            {state.changes.map((change) => (
              <ChangeCard
                key={change.detected_change_id}
                change={change}
                canWrite={canWrite}
                onResolved={() => load(tab)}
              />
            ))}
          </div>
        ))}
    </AppLayout>
  );
}

function ChangeCard({
  change,
  canWrite,
  onResolved,
}: {
  change: DetectedChange;
  canWrite: boolean;
  onResolved: () => void;
}) {
  const { firebaseUser, appUser } = useAuth();
  const [candidates, setCandidates] = useState<CampaignLine[] | null>(null);
  const [picking, setPicking] = useState(false);
  const [selectedLine, setSelectedLine] = useState<string>('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const actor = firebaseUser && appUser ? { uid: firebaseUser.uid, email: appUser.email } : null;
  const isPending = change.status === 'pending';

  async function openPicker() {
    setPicking(true);
    if (candidates === null && change.campaign_space_id && change.campaign_line_id) {
      const list = await fetchReplacementCandidates(change.campaign_space_id, change.campaign_line_id);
      setCandidates(list);
      if (list[0]) setSelectedLine(list[0].campaign_line_id);
    }
  }

  async function run(action: () => Promise<void>) {
    if (!actor) return;
    setBusy(true);
    setError(null);
    try {
      await action();
      onResolved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-accent-violet">
            {change.type}
          </span>
          <p className="mt-1.5 text-sm text-slate-700">{change.detail}</p>
        </div>
        <span className="text-xs capitalize text-slate-400">{change.status}</span>
      </div>

      {isPending && canWrite && actor && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          {!picking ? (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => void openPicker()}
                disabled={busy}
                className="focus-ring rounded-lg bg-accent-blue px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Es sustitución
              </button>
              <button
                onClick={() => void run(() => markAdditional(change, actor, comment || null))}
                disabled={busy}
                className="focus-ring rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Es adicional
              </button>
              <button
                onClick={() => void run(() => rejectChange(change, actor, comment || null))}
                disabled={busy}
                className="focus-ring rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                Rechazar
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-600">
                ¿Qué línea anterior sustituye esta creatividad?
              </p>
              {candidates === null ? (
                <LoadingState label="Buscando líneas anteriores…" />
              ) : candidates.length === 0 ? (
                <p className="text-xs text-amber-600">
                  No hay líneas anteriores vigentes en el espacio. Considere marcarla como adicional.
                </p>
              ) : (
                <div className="space-y-1">
                  {candidates.map((l) => (
                    <label key={l.campaign_line_id} className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name={`repl-${change.detected_change_id}`}
                        checked={selectedLine === l.campaign_line_id}
                        onChange={() => setSelectedLine(l.campaign_line_id)}
                      />
                      <span className="font-mono text-xs text-slate-600">
                        Creatividad {l.creatividad_id_original}
                      </span>
                    </label>
                  ))}
                </div>
              )}
              <input
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Comentario de revisión (opcional)"
                className="focus-ring w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
              />
              <div className="flex gap-2">
                <button
                  onClick={() =>
                    void run(() => confirmReplacement(change, selectedLine, actor, comment || null))
                  }
                  disabled={busy || selectedLine === ''}
                  className="focus-ring rounded-lg bg-accent-blue px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  Confirmar sustitución
                </button>
                <button
                  onClick={() => setPicking(false)}
                  className="focus-ring rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
