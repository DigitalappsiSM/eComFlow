import { describe, expect, it } from 'vitest';
import {
  computeDashboardMetrics,
  filterActiveInPeriod,
  type MetricLine,
} from '@/domain/dashboard-metrics';
import type { DateRange } from '@/lib/dates';

/**
 * §12 y §16 (casos 17-19): una línea `not_in_source` queda `active:false`, por lo
 * que las selecciones de datos (que filtran `active===true`) dejan de recuperarla.
 * La exclusión ocurre en la SELECCIÓN, no manipulando los cálculos de avance.
 */
function metricLine(overrides: Partial<MetricLine> = {}): MetricLine {
  return {
    campaignGroupId: 'g1',
    campaignSpaceId: 's1',
    campaignLineId: 'l1',
    clienteKey: 'cliente',
    creatividadIdKey: 'c1',
    placementId: 'soriana_category_banner',
    fechaFijacion: '2026-08-14',
    fechaRetirada: '2026-08-20',
    isCurrent: true,
    active: true,
    requiredPieces: 2,
    tipoOperacion: 'ECOMMERCE',
    cadena: 'SORIANA',
    progress: 40,
    ...overrides,
  };
}

const period: DateRange = { start: '2026-08-01', end: '2026-08-31' };

describe('exclusión de líneas not_in_source en dashboard/KPIs', () => {
  it('17) una línea con active:false no es recuperada por la selección activa', () => {
    const present = metricLine({ campaignLineId: 'present' });
    const missing = metricLine({ campaignLineId: 'missing', active: false });
    const active = filterActiveInPeriod([present, missing], period);
    expect(active.map((l) => l.campaignLineId)).toEqual(['present']);
  });

  it('18) una línea ausente no participa en conteos ni piezas requeridas', () => {
    const present = metricLine({ campaignLineId: 'present', requiredPieces: 2 });
    const missing = metricLine({ campaignLineId: 'missing', active: false, requiredPieces: 5 });
    const metrics = computeDashboardMetrics([present, missing], period);
    expect(metrics.lineasActivas).toBe(1);
    expect(metrics.piezasRequeridas).toBe(2); // no suma las 5 piezas de la ausente
  });

  it('19) una línea restaurada (active:true) vuelve a participar', () => {
    const restored = metricLine({ campaignLineId: 'restored', active: true, requiredPieces: 3 });
    const metrics = computeDashboardMetrics([restored], period);
    expect(metrics.lineasActivas).toBe(1);
    expect(metrics.piezasRequeridas).toBe(3);
  });
});
