/** Cancelación manual, reversible y efectiva por fecha para líneas Ecommerce. */

import type { CampaignLine, CancellationReason } from '@/types/campaign';
import type { IsoDate } from '@/lib/dates';

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_OPERATION_DAYS = 800;

export const CANCELLATION_REASON_LABELS: Record<CancellationReason, string> = {
  commercial_cancellation: 'Cancelación comercial',
  ekon_error: 'Error de EKON',
  duplicate_line: 'Línea duplicada',
  replaced_campaign: 'Campaña sustituida',
  client_request: 'Cambio solicitado por el cliente',
  other: 'Otro',
};

export const CANCELLATION_REASONS = Object.keys(
  CANCELLATION_REASON_LABELS,
) as CancellationReason[];

export interface DateCancellationState {
  cancelled: boolean;
  cancelledDates: IsoDate[];
  cancelledFrom: IsoDate | null;
  reactivatedDates: IsoDate[];
}

type ScheduleLine = Pick<
  CampaignLine,
  | 'activation_dates'
  | 'activation_start'
  | 'activation_end'
  | 'periodo_inicio'
  | 'periodo_fin'
  | 'fecha_fijacion'
  | 'fecha_retirada'
>;

type CancellationLine = Pick<
  CampaignLine,
  'cancelled' | 'cancelled_dates' | 'cancelled_from' | 'reactivated_dates'
>;

function addDaysIso(iso: IsoDate, days: number): IsoDate {
  if (!ISO_RE.test(iso)) return '';
  const base = new Date(`${iso}T00:00:00Z`).getTime();
  return new Date(base + days * DAY_MS).toISOString().slice(0, 10);
}

export function sortUniqueIsoDates(values: readonly string[]): IsoDate[] {
  return [...new Set(values.filter((value) => ISO_RE.test(value)))].sort();
}

export function expandDateRange(start: IsoDate, end: IsoDate): IsoDate[] {
  if (!ISO_RE.test(start) || !ISO_RE.test(end) || start > end) return [];
  const dates: IsoDate[] = [];
  let current = start;
  for (let i = 0; i < MAX_OPERATION_DAYS && current <= end; i += 1) {
    dates.push(current);
    current = addDaysIso(current, 1);
  }
  return dates;
}

/** Fechas reales de activación o, en su ausencia, días del periodo operativo. */
export function operationalDatesForLine(line: ScheduleLine): IsoDate[] {
  const explicit = sortUniqueIsoDates(line.activation_dates ?? []);
  if (explicit.length > 0) return explicit;

  const start = line.activation_start ?? line.periodo_inicio ?? line.fecha_fijacion;
  const end = line.activation_end ?? line.periodo_fin ?? line.fecha_retirada;
  return expandDateRange(start, end);
}

export function cancellationStateOfLine(line: CancellationLine): DateCancellationState {
  return {
    cancelled: line.cancelled ?? false,
    cancelledDates: sortUniqueIsoDates(line.cancelled_dates ?? []),
    cancelledFrom: line.cancelled_from ?? null,
    reactivatedDates: sortUniqueIsoDates(line.reactivated_dates ?? []),
  };
}

export function hasCancellationMetadata(state: DateCancellationState): boolean {
  return (
    state.cancelledDates.length > 0 ||
    state.cancelledFrom !== null ||
    state.reactivatedDates.length > 0
  );
}

/** Compatibilidad: `cancelled:true` sin metadatos cancela toda la línea histórica. */
export function isDateCancelled(state: DateCancellationState, date: IsoDate): boolean {
  if (state.reactivatedDates.includes(date)) return false;
  if (state.cancelledFrom && date >= state.cancelledFrom) return true;
  if (state.cancelledDates.includes(date)) return true;
  return state.cancelled && !hasCancellationMetadata(state);
}

export function cancelledOperationalDates(line: ScheduleLine & CancellationLine): IsoDate[] {
  const state = cancellationStateOfLine(line);
  return operationalDatesForLine(line).filter((date) => isDateCancelled(state, date));
}

export function activeOperationalDates(line: ScheduleLine & CancellationLine): IsoDate[] {
  const state = cancellationStateOfLine(line);
  return operationalDatesForLine(line).filter((date) => !isDateCancelled(state, date));
}

/** Sin fechas operativas activas desde hoy: se bloquean checks y se oculta por defecto. */
export function isLineFullyCancelled(
  line: ScheduleLine & CancellationLine,
  today: IsoDate,
): boolean {
  const dates = operationalDatesForLine(line);
  if (dates.length === 0) return line.cancelled ?? false;
  const relevant = dates.filter((date) => date >= today);
  const state = cancellationStateOfLine(line);
  if (relevant.length > 0) return relevant.every((date) => isDateCancelled(state, date));
  return dates.every((date) => isDateCancelled(state, date));
}

export type CancellationCommand =
  | { action: 'cancel_from'; effectiveFrom: IsoDate; reason: CancellationReason; comment: string }
  | { action: 'cancel_dates'; dates: IsoDate[]; reason: CancellationReason; comment: string }
  | { action: 'reactivate_all' }
  | { action: 'reactivate_dates'; dates: IsoDate[] };

export interface CancellationPatch {
  cancelled: boolean;
  cancelled_dates: IsoDate[];
  cancelled_from: IsoDate | null;
  reactivated_dates: IsoDate[];
  cancellation_reason: CancellationReason | null;
  cancellation_comment: string | null;
}

/** Calcula el nuevo estado sin escribir: la transacción aplica este parche. */
export function applyCancellationCommand(
  line: ScheduleLine & CancellationLine & {
    cancellation_reason?: CancellationReason | null;
    cancellation_comment?: string | null;
  },
  command: CancellationCommand,
  today: IsoDate,
): CancellationPatch {
  const schedule = operationalDatesForLine(line);
  const currentState = cancellationStateOfLine(line);
  let cancelledDates = cancelledOperationalDates(line);
  let cancelledFrom = currentState.cancelledFrom;
  let reactivatedDates = [...currentState.reactivatedDates];
  let reason = line.cancellation_reason ?? null;
  let comment = line.cancellation_comment ?? null;

  if (command.action === 'cancel_from') {
    cancelledFrom = cancelledFrom && cancelledFrom < command.effectiveFrom
      ? cancelledFrom
      : command.effectiveFrom;
    reactivatedDates = reactivatedDates.filter((date) => date < command.effectiveFrom);
    reason = command.reason;
    comment = command.comment.trim() || null;
  } else if (command.action === 'cancel_dates') {
    const selected = new Set(command.dates.filter((date) => schedule.includes(date)));
    cancelledDates = sortUniqueIsoDates([...cancelledDates, ...selected]);
    reactivatedDates = reactivatedDates.filter((date) => !selected.has(date));
    reason = command.reason;
    comment = command.comment.trim() || null;
  } else if (command.action === 'reactivate_all') {
    cancelledDates = [];
    cancelledFrom = null;
    reactivatedDates = [];
    reason = null;
    comment = null;
  } else {
    const selected = new Set(command.dates.filter((date) => schedule.includes(date)));
    // Legacy `cancelled:true` sin detalle se convierte en cancelación explícita
    // de las fechas que el usuario NO reactivó.
    cancelledDates = cancelledDates.filter((date) => !selected.has(date));
    for (const date of selected) {
      if (cancelledFrom && date >= cancelledFrom) reactivatedDates.push(date);
    }
    reactivatedDates = sortUniqueIsoDates(reactivatedDates);
  }

  const nextState: DateCancellationState = {
    cancelled: false,
    cancelledDates: sortUniqueIsoDates(cancelledDates),
    cancelledFrom,
    reactivatedDates: sortUniqueIsoDates(reactivatedDates),
  };
  const nextLikeLine = {
    ...line,
    cancelled: false,
    cancelled_dates: nextState.cancelledDates,
    cancelled_from: nextState.cancelledFrom,
    reactivated_dates: nextState.reactivatedDates,
  };
  const cancelled = isLineFullyCancelled(nextLikeLine, today);

  return {
    cancelled,
    cancelled_dates: nextState.cancelledDates,
    cancelled_from: nextState.cancelledFrom,
    reactivated_dates: nextState.reactivatedDates,
    cancellation_reason: reason,
    cancellation_comment: comment,
  };
}
