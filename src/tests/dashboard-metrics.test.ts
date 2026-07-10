import { describe, expect, it } from 'vitest';
import {
  computeDashboardMetrics,
  computeWorkedCampaigns,
  filterActiveInPeriod,
  type MetricLine,
  type WorkedChange,
} from '@/domain/dashboard-metrics';
import { getWeekRange, periodOverlaps } from '@/lib/dates';

function line(overrides: Partial<MetricLine>): MetricLine {
  return {
    campaignGroupId: 'g1',
    campaignSpaceId: 's1',
    campaignLineId: 'l1',
    clienteKey: 'soriana',
    creatividadIdKey: '10025',
    placementId: 'home_slider',
    fechaFijacion: '2026-07-17',
    fechaRetirada: '2026-07-30',
    isCurrent: true,
    active: true,
    requiredPieces: 3,
    ...overrides,
  };
}

const period = { start: '2026-07-17', end: '2026-07-23' };

describe('dashboard-metrics (§36, §37, §38, §52)', () => {
  it('semana viernes→jueves (§37)', () => {
    // 2026-07-17 es viernes → semana 17–23 jul.
    expect(getWeekRange('2026-07-20')).toEqual({ start: '2026-07-17', end: '2026-07-23' });
    expect(getWeekRange('2026-07-17')).toEqual({ start: '2026-07-17', end: '2026-07-23' });
  });

  it('regla de cruce de periodo (§37)', () => {
    expect(periodOverlaps('2026-07-17', '2026-07-30', period)).toBe(true);
    expect(periodOverlaps('2026-07-24', '2026-07-30', period)).toBe(false); // empieza después
    expect(periodOverlaps('2026-06-01', '2026-07-16', period)).toBe(false); // termina antes
  });

  it('Caso 8: misma creatividad en dos espacios → 1 creatividad, 2 espacios, 2 líneas', () => {
    const lines = [
      line({ campaignSpaceId: 's-panaderia', campaignLineId: 'l1', creatividadIdKey: '10025' }),
      line({ campaignSpaceId: 's-refrescos', campaignLineId: 'l2', creatividadIdKey: '10025' }),
    ];
    const m = computeDashboardMetrics(lines, period);
    expect(m.creatividadesUnicas).toBe(1);
    expect(m.espaciosActivos).toBe(2);
    expect(m.lineasActivas).toBe(2);
  });

  it('conteos distintos de clientes y campañas', () => {
    const lines = [
      line({ clienteKey: 'soriana', campaignGroupId: 'g1' }),
      line({ clienteKey: 'walmart', campaignGroupId: 'g2', campaignLineId: 'l2', campaignSpaceId: 's2' }),
      line({ clienteKey: 'walmart', campaignGroupId: 'g2', campaignLineId: 'l3', campaignSpaceId: 's3' }),
    ];
    const m = computeDashboardMetrics(lines, period);
    expect(m.clientesActivos).toBe(2);
    expect(m.campanasActivas).toBe(2);
    expect(m.lineasActivas).toBe(3);
  });

  it('suma de piezas requeridas (§36): 10 líneas Home Slider × 3 = 30', () => {
    const lines = Array.from({ length: 10 }, (_, i) =>
      line({ campaignLineId: `l${i}`, campaignSpaceId: `s${i}`, requiredPieces: 3 }),
    );
    expect(computeDashboardMetrics(lines, period).piezasRequeridas).toBe(30);
  });

  it('excluye líneas inactivas o no vigentes en el periodo', () => {
    const lines = [
      line({ campaignLineId: 'l1' }),
      line({ campaignLineId: 'l2', active: false }),
      line({ campaignLineId: 'l3', isCurrent: false }),
      line({ campaignLineId: 'l4', fechaFijacion: '2026-08-01', fechaRetirada: '2026-08-10' }),
    ];
    expect(filterActiveInPeriod(lines, period)).toHaveLength(1);
  });

  it('periodo vacío → métricas en cero', () => {
    const m = computeDashboardMetrics([], period);
    expect(m).toEqual({
      clientesActivos: 0,
      campanasActivas: 0,
      espaciosActivos: 0,
      lineasActivas: 0,
      creatividadesUnicas: 0,
      piezasRequeridas: 0,
    });
  });

  it('trabajadas (§38): distintas campañas con actividad en change_history', () => {
    const changes: WorkedChange[] = [
      { campaignGroupId: 'g1', createdAtIso: '2026-07-18' },
      { campaignGroupId: 'g1', createdAtIso: '2026-07-19' },
      { campaignGroupId: 'g2', createdAtIso: '2026-07-20' },
      { campaignGroupId: 'g3', createdAtIso: '2026-08-01' }, // fuera del periodo
    ];
    expect(computeWorkedCampaigns(changes, period)).toBe(2);
  });
});
