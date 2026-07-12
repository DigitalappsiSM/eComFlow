import { describe, expect, it } from 'vitest';
import {
  computeActiveClients,
  computeAttentionByClient,
  computeChainLoad,
  computeClientTypeMatrix,
  computeDashboardMetrics,
  computeMonthlyOperationTrend,
  computeOperationalStatusBreakdown,
  computePeriodLoad,
  computeTipoOperationDistribution,
  computeTopClients,
  computeWorkedCampaigns,
  filterActiveInPeriod,
  lineMonthKey,
  operationalStatusOf,
  type MetricLine,
  type WorkedChange,
} from '@/domain/dashboard-metrics';
import { getWeekRange, periodOverlaps, type DateRange } from '@/lib/dates';

const WIDE: DateRange = { start: '0001-01-01', end: '9999-12-31' };

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

describe('dashboard-metrics · Operativo 360', () => {
  const today = '2026-07-20';

  it('operationalStatusOf usa el periodo operativo (fin/inicio) contra hoy', () => {
    expect(
      operationalStatusOf(line({ periodoInicio: '2026-07-17', periodoFin: '2026-07-23' }), today),
    ).toBe('en_curso');
    expect(
      operationalStatusOf(line({ periodoInicio: '2026-07-03', periodoFin: '2026-07-09' }), today),
    ).toBe('vencido');
    expect(
      operationalStatusOf(line({ periodoInicio: '2026-07-24', periodoFin: '2026-07-30' }), today),
    ).toBe('futuro');
  });

  it('operationalStatusOf cae a fecha_fijacion/retirada sin periodo', () => {
    expect(
      operationalStatusOf(
        line({ fechaFijacion: '2026-06-01', fechaRetirada: '2026-06-30', periodoInicio: null, periodoFin: null }),
        today,
      ),
    ).toBe('vencido');
  });

  it('lineMonthKey agrupa por mes del inicio operativo', () => {
    expect(lineMonthKey(line({ periodoInicio: '2026-07-17' }))).toBe('2026-07');
    expect(lineMonthKey(line({ periodoInicio: null, fechaFijacion: '2026-09-05' }))).toBe('2026-09');
  });

  it('computeActiveClients cuenta clientes distintos activos', () => {
    const lines = [
      line({ clienteKey: 'mabe', campaignLineId: 'l1' }),
      line({ clienteKey: 'mabe', campaignLineId: 'l2', campaignSpaceId: 's2' }),
      line({ clienteKey: 'corona', campaignLineId: 'l3', campaignSpaceId: 's3' }),
    ];
    expect(computeActiveClients(lines, WIDE)).toBe(2);
  });

  it('computeTopClients ordena por líneas y suma piezas', () => {
    const lines = [
      line({ clienteOriginal: 'CORONA', clienteKey: 'corona', campaignLineId: 'l1', requiredPieces: 2 }),
      line({ clienteOriginal: 'MABE', clienteKey: 'mabe', campaignLineId: 'l2', campaignSpaceId: 's2', requiredPieces: 4 }),
      line({ clienteOriginal: 'MABE', clienteKey: 'mabe', campaignLineId: 'l3', campaignSpaceId: 's3', requiredPieces: 1 }),
    ];
    const top = computeTopClients(lines, WIDE);
    expect(top[0]).toMatchObject({ cliente: 'MABE', lines: 2, requiredPieces: 5 });
    expect(top[1]).toMatchObject({ cliente: 'CORONA', lines: 1, requiredPieces: 2 });
  });

  it('computeTipoOperationDistribution reparte por tipo con porcentaje', () => {
    const lines = [
      line({ tipoOperacion: 'ECOMMERCE', campaignLineId: 'l1' }),
      line({ tipoOperacion: 'ECOMMERCE', campaignLineId: 'l2', campaignSpaceId: 's2' }),
      line({ tipoOperacion: 'DIGITAL SIGNAGE', campaignLineId: 'l3', campaignSpaceId: 's3' }),
      line({ tipoOperacion: null, campaignLineId: 'l4', campaignSpaceId: 's4' }),
    ];
    const dist = computeTipoOperationDistribution(lines, WIDE);
    expect(dist[0]).toMatchObject({ tipo: 'ECOMMERCE', lines: 2, percentage: 50 });
    expect(dist.find((d) => d.tipo === '(sin tipo)')?.lines).toBe(1);
  });

  it('computeMonthlyOperationTrend ordena cronológicamente', () => {
    const lines = [
      line({ periodoInicio: '2026-08-01', campaignLineId: 'l1' }),
      line({ periodoInicio: '2026-07-17', campaignLineId: 'l2', campaignSpaceId: 's2' }),
      line({ periodoInicio: '2026-07-24', campaignLineId: 'l3', campaignSpaceId: 's3' }),
    ];
    const trend = computeMonthlyOperationTrend(lines);
    expect(trend.map((t) => t.month)).toEqual(['2026-07', '2026-08']);
    expect(trend[0]!.lines).toBe(2);
  });

  it('computePeriodLoad agrupa por periodo y ordena por inicio', () => {
    const lines = [
      line({ periodoOriginal: 'S29', periodoInicio: '2026-07-17', campaignLineId: 'l1' }),
      line({ periodoOriginal: 'S28', periodoInicio: '2026-07-10', campaignLineId: 'l2', campaignSpaceId: 's2' }),
      line({ periodoOriginal: 'S29', periodoInicio: '2026-07-17', campaignLineId: 'l3', campaignSpaceId: 's3' }),
    ];
    const load = computePeriodLoad(lines);
    expect(load.map((l) => l.periodo)).toEqual(['S28', 'S29']);
    expect(load[1]!.lines).toBe(2);
  });

  it('computeChainLoad ordena cadenas por líneas activas', () => {
    const lines = [
      line({ cadena: 'CHEDRAUI', campaignLineId: 'l1' }),
      line({ cadena: 'CHEDRAUI', campaignLineId: 'l2', campaignSpaceId: 's2' }),
      line({ cadena: 'SORIANA', campaignLineId: 'l3', campaignSpaceId: 's3' }),
    ];
    const load = computeChainLoad(lines, WIDE);
    expect(load[0]).toMatchObject({ cadena: 'CHEDRAUI', lines: 2 });
  });

  it('computeOperationalStatusBreakdown clasifica y excluye canceladas', () => {
    const lines = [
      line({ periodoInicio: '2026-07-03', periodoFin: '2026-07-09', campaignLineId: 'l1' }), // vencido
      line({ periodoInicio: '2026-07-17', periodoFin: '2026-07-23', campaignLineId: 'l2', campaignSpaceId: 's2' }), // en curso
      line({ periodoInicio: '2026-07-24', periodoFin: '2026-07-30', campaignLineId: 'l3', campaignSpaceId: 's3' }), // futuro
      line({ periodoInicio: '2026-07-03', periodoFin: '2026-07-09', campaignLineId: 'l4', campaignSpaceId: 's4', cancelled: true }), // excluida
    ];
    const b = computeOperationalStatusBreakdown(lines, today);
    expect(b).toEqual({ vencido: 1, enCurso: 1, futuro: 1, total: 3 });
  });

  it('computeClientTypeMatrix arma filas por cliente con conteo por tipo', () => {
    const lines = [
      line({ clienteOriginal: 'MABE', tipoOperacion: 'ECOMMERCE', campaignLineId: 'l1' }),
      line({ clienteOriginal: 'MABE', tipoOperacion: 'DIGITAL SIGNAGE', campaignLineId: 'l2', campaignSpaceId: 's2' }),
      line({ clienteOriginal: 'CORONA', tipoOperacion: 'ECOMMERCE', campaignLineId: 'l3', campaignSpaceId: 's3' }),
    ];
    const m = computeClientTypeMatrix(lines, WIDE);
    expect(m.tipos).toEqual(['DIGITAL SIGNAGE', 'ECOMMERCE']);
    expect(m.rows[0]).toMatchObject({ cliente: 'MABE', total: 2, ECOMMERCE: 1, 'DIGITAL SIGNAGE': 1 });
  });

  it('computeAttentionByClient agrupa solo vencidas por cliente/periodo/tipo', () => {
    const lines = [
      line({
        clienteOriginal: 'MABE',
        periodoOriginal: 'S28',
        tipoOperacion: 'ECOMMERCE',
        periodoInicio: '2026-07-03',
        periodoFin: '2026-07-09',
        requiredPieces: 3,
        campaignLineId: 'l1',
      }),
      line({
        clienteOriginal: 'MABE',
        periodoOriginal: 'S28',
        tipoOperacion: 'ECOMMERCE',
        periodoInicio: '2026-07-03',
        periodoFin: '2026-07-09',
        requiredPieces: 2,
        campaignLineId: 'l2',
        campaignSpaceId: 's2',
      }),
      line({
        clienteOriginal: 'MABE',
        periodoOriginal: 'S29',
        tipoOperacion: 'ECOMMERCE',
        periodoInicio: '2026-07-17',
        periodoFin: '2026-07-23',
        campaignLineId: 'l3',
        campaignSpaceId: 's3',
      }), // en curso → no entra
    ];
    const rows = computeAttentionByClient(lines, today);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      cliente: 'MABE',
      periodo: 'S28',
      tipo: 'ECOMMERCE',
      expiredLines: 2,
      requiredPieces: 5,
    });
  });
});
