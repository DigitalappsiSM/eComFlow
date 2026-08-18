import { describe, expect, it } from 'vitest';
import {
  activeOperationalDates,
  applyCancellationCommand,
  cancelledOperationalDates,
  isDateCancelled,
  isLineFullyCancelled,
  operationalDatesForLine,
} from '@/domain/line-cancellation';

function line(overrides: Record<string, unknown> = {}) {
  return {
    activation_dates: undefined,
    activation_start: null,
    activation_end: null,
    periodo_inicio: '2026-08-14',
    periodo_fin: '2026-08-20',
    fecha_fijacion: '2026-08-01',
    fecha_retirada: '2026-08-31',
    cancelled: false,
    cancelled_dates: [],
    cancelled_from: null,
    reactivated_dates: [],
    cancellation_reason: null,
    cancellation_comment: null,
    ...overrides,
  };
}

describe('cancelación operativa por fechas', () => {
  it('usa las activaciones reales cuando existen', () => {
    expect(
      operationalDatesForLine(
        line({ activation_dates: ['2026-08-14', '2026-08-16'], periodo_inicio: '2026-08-01' }),
      ),
    ).toEqual(['2026-08-14', '2026-08-16']);
  });

  it('cancelar desde una fecha conserva los días históricos anteriores', () => {
    const current = line();
    const patch = applyCancellationCommand(
      current,
      {
        action: 'cancel_from',
        effectiveFrom: '2026-08-17',
        reason: 'commercial_cancellation',
        comment: '',
      },
      '2026-08-17',
    );
    const next = { ...current, ...patch };

    expect(patch.cancelled_from).toBe('2026-08-17');
    expect(activeOperationalDates(next)).toEqual(['2026-08-14', '2026-08-15', '2026-08-16']);
    expect(cancelledOperationalDates(next)).toEqual([
      '2026-08-17',
      '2026-08-18',
      '2026-08-19',
      '2026-08-20',
    ]);
    expect(patch.cancelled).toBe(true);
  });

  it('una cancelación parcial mantiene activa la línea', () => {
    const current = line();
    const patch = applyCancellationCommand(
      current,
      {
        action: 'cancel_dates',
        dates: ['2026-08-15', '2026-08-17'],
        reason: 'ekon_error',
        comment: 'Fechas incorrectas',
      },
      '2026-08-14',
    );
    const next = { ...current, ...patch };

    expect(cancelledOperationalDates(next)).toEqual(['2026-08-15', '2026-08-17']);
    expect(patch.cancelled).toBe(false);
    expect(isLineFullyCancelled(next, '2026-08-14')).toBe(false);
  });

  it('reactiva un día como excepción de una cancelación total', () => {
    const current = line({
      cancelled: true,
      cancelled_from: '2026-08-14',
      cancellation_reason: 'client_request',
    });
    const patch = applyCancellationCommand(
      current,
      { action: 'reactivate_dates', dates: ['2026-08-18'] },
      '2026-08-14',
    );
    const next = { ...current, ...patch };

    expect(patch.reactivated_dates).toContain('2026-08-18');
    expect(isDateCancelled({
      cancelled: patch.cancelled,
      cancelledDates: patch.cancelled_dates,
      cancelledFrom: patch.cancelled_from,
      reactivatedDates: patch.reactivated_dates,
    }, '2026-08-18')).toBe(false);
    expect(activeOperationalDates(next)).toEqual(['2026-08-18']);
    expect(patch.cancelled).toBe(false);
  });

  it('interpreta cancelled legacy sin metadatos como cancelación completa', () => {
    const legacy = line({ cancelled: true });
    expect(cancelledOperationalDates(legacy)).toEqual(operationalDatesForLine(legacy));
  });

  it('reactivar todo limpia el estado actual y conserva el calendario', () => {
    const current = line({ cancelled: true, cancelled_from: '2026-08-14' });
    const patch = applyCancellationCommand(current, { action: 'reactivate_all' }, '2026-08-14');
    const next = { ...current, ...patch };

    expect(patch).toMatchObject({
      cancelled: false,
      cancelled_dates: [],
      cancelled_from: null,
      reactivated_dates: [],
      cancellation_reason: null,
      cancellation_comment: null,
    });
    expect(activeOperationalDates(next)).toEqual(operationalDatesForLine(next));
  });
});
