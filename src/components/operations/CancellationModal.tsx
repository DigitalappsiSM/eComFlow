import { useMemo, useState } from 'react';
import { Ban, RotateCcw, X } from 'lucide-react';
import {
  CANCELLATION_REASONS,
  CANCELLATION_REASON_LABELS,
  cancelledOperationalDates,
  isLineFullyCancelled,
  operationalDatesForLine,
  type CancellationCommand,
} from '@/domain/line-cancellation';
import { todayIso } from '@/lib/dates';
import type { CancellationReason } from '@/types/campaign';
import type { OperationRow } from '@/repositories/operations.repository';

type Action = 'cancel' | 'reactivate';
type CancelScope = 'from' | 'dates';
type ReactivateScope = 'all' | 'dates';

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: 'UTC',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${iso}T00:00:00Z`));
}

function DateSelector({
  dates,
  selected,
  onToggle,
}: {
  dates: string[];
  selected: Set<string>;
  onToggle: (date: string) => void;
}) {
  return (
    <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-200 p-2">
      <div className="grid gap-1.5 sm:grid-cols-2">
        {dates.map((date) => (
          <label
            key={date}
            className={`flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm ${
              selected.has(date) ? 'bg-blue-50 text-accent-blue' : 'hover:bg-slate-50'
            }`}
          >
            <input
              type="checkbox"
              checked={selected.has(date)}
              onChange={() => onToggle(date)}
              className="h-4 w-4 rounded border-slate-300 text-accent-blue"
            />
            <span className="capitalize">{formatDate(date)}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

export function CancellationModal({
  row,
  busy,
  onClose,
  onSubmit,
}: {
  row: OperationRow;
  busy: boolean;
  onClose: () => void;
  onSubmit: (command: CancellationCommand) => Promise<void>;
}) {
  const schedule = useMemo(() => operationalDatesForLine(row.line), [row.line]);
  const cancelledDates = useMemo(() => cancelledOperationalDates(row.line), [row.line]);
  const cancelledSet = useMemo(() => new Set(cancelledDates), [cancelledDates]);
  const activeDates = useMemo(
    () => schedule.filter((date) => !cancelledSet.has(date)),
    [schedule, cancelledSet],
  );
  const [action, setAction] = useState<Action>(
    isLineFullyCancelled(row.line, todayIso()) && cancelledDates.length > 0
      ? 'reactivate'
      : 'cancel',
  );
  const [cancelScope, setCancelScope] = useState<CancelScope>('from');
  const [reactivateScope, setReactivateScope] = useState<ReactivateScope>('all');
  const defaultEffectiveDate =
    activeDates.find((date) => date >= todayIso()) ?? activeDates.at(-1) ?? schedule[0] ?? '';
  const [effectiveFrom, setEffectiveFrom] = useState(defaultEffectiveDate);
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState<CancellationReason>('commercial_cancellation');
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);

  const candidates = action === 'cancel' ? activeDates : cancelledDates;
  const needsSelection =
    (action === 'cancel' && cancelScope === 'dates') ||
    (action === 'reactivate' && reactivateScope === 'dates');
  const invalid =
    schedule.length === 0 ||
    (needsSelection && selectedDates.size === 0) ||
    (action === 'cancel' && cancelScope === 'from' && effectiveFrom === '') ||
    (action === 'cancel' && reason === 'other' && comment.trim() === '');

  function toggleDate(date: string) {
    setSelectedDates((current) => {
      const next = new Set(current);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }

  async function submit() {
    if (invalid) return;
    let command: CancellationCommand;
    if (action === 'cancel' && cancelScope === 'from') {
      command = { action: 'cancel_from', effectiveFrom, reason, comment };
    } else if (action === 'cancel') {
      command = { action: 'cancel_dates', dates: [...selectedDates], reason, comment };
    } else if (reactivateScope === 'all') {
      command = { action: 'reactivate_all' };
    } else {
      command = { action: 'reactivate_dates', dates: [...selectedDates] };
    }

    setError(null);
    try {
      await onSubmit(command);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar la cancelación.');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <header className="flex items-start justify-between border-b border-slate-200 p-5">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Gestionar cancelación</h2>
            <p className="mt-1 text-sm text-slate-500">
              {row.line.cliente_original} · {row.line.numero_campaña_original}
            </p>
            <p className="text-xs text-slate-400">
              {row.line.placement_name_snapshot} · Creatividad {row.line.creatividad_id_original}
            </p>
          </div>
          <button onClick={onClose} disabled={busy} className="focus-ring rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
            <X className="h-5 w-5" aria-hidden="true" />
            <span className="sr-only">Cerrar</span>
          </button>
        </header>

        <div className="space-y-5 p-5">
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              disabled={activeDates.length === 0}
              onClick={() => {
                setAction('cancel');
                setSelectedDates(new Set());
              }}
              className={`focus-ring rounded-lg px-3 py-2 text-sm font-medium ${
                action === 'cancel' ? 'bg-white text-red-600 shadow-sm' : 'text-slate-500'
              } disabled:cursor-not-allowed disabled:opacity-40`}
            >
              <Ban className="mr-1.5 inline h-4 w-4" aria-hidden="true" />
              Cancelar fechas
            </button>
            <button
              type="button"
              disabled={cancelledDates.length === 0}
              onClick={() => {
                setAction('reactivate');
                setSelectedDates(new Set());
              }}
              className={`focus-ring rounded-lg px-3 py-2 text-sm font-medium ${
                action === 'reactivate' ? 'bg-white text-accent-green shadow-sm' : 'text-slate-500'
              } disabled:cursor-not-allowed disabled:opacity-40`}
            >
              <RotateCcw className="mr-1.5 inline h-4 w-4" aria-hidden="true" />
              Reactivar fechas
            </button>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
            <strong>{schedule.length}</strong> día(s) en el periodo ·{' '}
            <strong className="text-red-600">{cancelledDates.length} cancelado(s)</strong> ·{' '}
            <strong className="text-accent-green">{activeDates.length} activo(s)</strong>
          </div>

          {action === 'cancel' ? (
            <>
              <fieldset>
                <legend className="mb-2 text-sm font-semibold text-slate-700">Alcance</legend>
                <div className="flex flex-wrap gap-4 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="radio" checked={cancelScope === 'from'} onChange={() => setCancelScope('from')} />
                    Toda la línea desde una fecha
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="radio" checked={cancelScope === 'dates'} onChange={() => setCancelScope('dates')} />
                    Días específicos
                  </label>
                </div>
              </fieldset>

              {cancelScope === 'from' ? (
                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-700">Fecha efectiva</label>
                  <input
                    type="date"
                    value={effectiveFrom}
                    min={schedule[0]}
                    max={schedule.at(-1)}
                    onChange={(event) => setEffectiveFrom(event.target.value)}
                    className="focus-ring rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <p className="mt-1 text-xs text-slate-400">
                    Las fechas anteriores conservarán su participación histórica en el dashboard.
                  </p>
                </div>
              ) : (
                <DateSelector dates={candidates} selected={selectedDates} onToggle={toggleDate} />
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-700">Motivo</label>
                  <select
                    value={reason}
                    onChange={(event) => setReason(event.target.value as CancellationReason)}
                    className="focus-ring w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    {CANCELLATION_REASONS.map((value) => (
                      <option key={value} value={value}>{CANCELLATION_REASON_LABELS[value]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-700">
                    Comentario {reason === 'other' ? '(obligatorio)' : '(opcional)'}
                  </label>
                  <textarea
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                    rows={2}
                    className="focus-ring w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    placeholder="Contexto de la cancelación…"
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              <fieldset>
                <legend className="mb-2 text-sm font-semibold text-slate-700">Alcance</legend>
                <div className="flex flex-wrap gap-4 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="radio" checked={reactivateScope === 'all'} onChange={() => setReactivateScope('all')} />
                    Reactivar toda la línea
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="radio" checked={reactivateScope === 'dates'} onChange={() => setReactivateScope('dates')} />
                    Reactivar días específicos
                  </label>
                </div>
              </fieldset>
              {reactivateScope === 'dates' && (
                <DateSelector dates={candidates} selected={selectedDates} onToggle={toggleDate} />
              )}
              <p className="text-xs text-slate-400">
                Los checks, comentarios y avance existentes se conservarán sin cambios.
              </p>
            </>
          )}

          {schedule.length === 0 && (
            <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
              La línea no tiene un periodo operativo válido para seleccionar fechas.
            </p>
          )}
          {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        </div>

        <footer className="flex justify-end gap-2 border-t border-slate-200 p-4">
          <button type="button" onClick={onClose} disabled={busy} className="focus-ring rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600">
            Cerrar
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy || invalid}
            className={`focus-ring rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 ${
              action === 'cancel' ? 'bg-red-600 hover:bg-red-700' : 'bg-accent-green hover:opacity-90'
            }`}
          >
            {busy ? 'Guardando…' : action === 'cancel' ? 'Confirmar cancelación' : 'Confirmar reactivación'}
          </button>
        </footer>
      </div>
    </div>
  );
}
