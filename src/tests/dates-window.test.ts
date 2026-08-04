import { describe, expect, it } from 'vitest';
import { getMonthWindow } from '@/lib/dates';

describe('getMonthWindow (ventana de meses para Seguimiento operativo)', () => {
  it('por defecto abarca mes anterior, actual y siguiente', () => {
    expect(getMonthWindow('2026-08-03')).toEqual({ start: '2026-07-01', end: '2026-09-30' });
  });

  it('cruza el fin de año hacia atrás', () => {
    expect(getMonthWindow('2026-01-15')).toEqual({ start: '2025-12-01', end: '2026-02-28' });
  });

  it('cruza el fin de año hacia adelante', () => {
    expect(getMonthWindow('2026-12-10')).toEqual({ start: '2026-11-01', end: '2027-01-31' });
  });

  it('respeta ventanas asimétricas', () => {
    expect(getMonthWindow('2026-08-03', 0, 0)).toEqual({ start: '2026-08-01', end: '2026-08-31' });
    expect(getMonthWindow('2026-08-03', 2, 0)).toEqual({ start: '2026-06-01', end: '2026-08-31' });
  });
});
