import { describe, expect, it } from 'vitest';
import {
  completedOnTime,
  complianceStatusOf,
  computeActiveClients,
  computeAttentionByClient,
  computeChainLoad,
  computeCheckBottlenecks,
  computeClientTypeMatrix,
  computeComplianceByClient,
  computeComplianceByPeriod,
  computeComplianceDetail,
  computeComplianceSummary,
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

describe('dashboard-metrics · Cumplimiento (SLA)', () => {
  const today = '2026-07-20';

  // Línea COMPLETA a tiempo (dentro de su periodo).
  const done = (o: Partial<MetricLine> = {}): MetricLine =>
    line({
      complete: true,
      progress: 100,
      pendingChecks: [],
      completedAtIso: '2026-07-15',
      periodoInicio: '2026-07-10',
      periodoFin: '2026-07-16',
      ...o,
    });

  // Línea INCOMPLETA (checks pendientes).
  const pend = (o: Partial<MetricLine> = {}): MetricLine =>
    line({
      complete: false,
      progress: 40,
      pendingChecks: ['link', 'kevel'],
      ...o,
    });

  it('complianceStatusOf clasifica según completitud y periodo', () => {
    expect(complianceStatusOf(done(), today)).toBe('cumplida');
    expect(
      complianceStatusOf(pend({ periodoInicio: '2026-07-03', periodoFin: '2026-07-09' }), today),
    ).toBe('en_riesgo');
    expect(
      complianceStatusOf(pend({ periodoInicio: '2026-07-17', periodoFin: '2026-07-23' }), today),
    ).toBe('en_proceso');
    expect(
      complianceStatusOf(pend({ periodoInicio: '2026-07-24', periodoFin: '2026-07-30' }), today),
    ).toBe('pendiente_futuro');
  });

  it('completedOnTime compara la fecha de completado con el fin del periodo', () => {
    expect(completedOnTime(done({ completedAtIso: '2026-07-16' }))).toBe(true);
    expect(completedOnTime(done({ completedAtIso: '2026-07-20' }))).toBe(false); // tras el fin
    expect(completedOnTime(done({ completedAtIso: null }))).toBe(true); // sin fecha → a tiempo
    expect(completedOnTime(pend())).toBe(false); // incompleta nunca está a tiempo
  });

  it('computeComplianceSummary agrega cumplidas, a tiempo, en riesgo y avance', () => {
    const lines = [
      done({ campaignLineId: 'l1', completedAtIso: '2026-07-15' }), // cumplida + a tiempo
      done({ campaignLineId: 'l2', campaignSpaceId: 's2', completedAtIso: '2026-07-20' }), // cumplida tarde
      pend({ campaignLineId: 'l3', campaignSpaceId: 's3', periodoInicio: '2026-07-03', periodoFin: '2026-07-09' }), // en riesgo
      pend({ campaignLineId: 'l4', campaignSpaceId: 's4', periodoInicio: '2026-07-17', periodoFin: '2026-07-23', progress: 60 }), // en proceso
      line({ campaignLineId: 'l5', campaignSpaceId: 's5', cancelled: true }), // excluida
    ];
    const s = computeComplianceSummary(lines, today);
    expect(s.total).toBe(4);
    expect(s.cumplidas).toBe(2);
    expect(s.enRiesgo).toBe(1);
    expect(s.enProceso).toBe(1);
    expect(s.vencidas).toBe(3); // l1, l2 (periodo 10-16 < hoy) y l3
    expect(s.aTiempo).toBe(1); // solo l1
    expect(s.cumplimientoPct).toBe(50); // 2/4
    expect(s.avgProgress).toBe(75); // (100+100+40+60)/4
  });

  it('computeComplianceByClient ordena peor primero (más riesgo)', () => {
    const lines = [
      done({ clienteOriginal: 'BUENO', clienteKey: 'bueno', campaignLineId: 'l1' }),
      pend({
        clienteOriginal: 'MALO',
        clienteKey: 'malo',
        campaignLineId: 'l2',
        campaignSpaceId: 's2',
        periodoInicio: '2026-07-03',
        periodoFin: '2026-07-09',
      }),
    ];
    const stats = computeComplianceByClient(lines, today);
    expect(stats[0]!.key).toBe('MALO');
    expect(stats[0]!.enRiesgo).toBe(1);
    expect(stats[0]!.cumplimientoPct).toBe(0);
    expect(stats[1]).toMatchObject({ key: 'BUENO', cumplidas: 1, cumplimientoPct: 100 });
  });

  it('computeComplianceByPeriod ordena cronológicamente', () => {
    const lines = [
      done({ periodoOriginal: 'S29', periodoInicio: '2026-07-17', periodoFin: '2026-07-23', campaignLineId: 'l1' }),
      done({ periodoOriginal: 'S28', periodoInicio: '2026-07-10', periodoFin: '2026-07-16', campaignLineId: 'l2', campaignSpaceId: 's2' }),
    ];
    const stats = computeComplianceByPeriod(lines, today);
    expect(stats.map((s) => s.key)).toEqual(['S28', 'S29']);
  });

  it('computeCheckBottlenecks cuenta checks pendientes por tipo', () => {
    const lines = [
      pend({ campaignLineId: 'l1', pendingChecks: ['link', 'kevel'] }),
      pend({ campaignLineId: 'l2', campaignSpaceId: 's2', pendingChecks: ['link'] }),
      line({ campaignLineId: 'l3', campaignSpaceId: 's3', cancelled: true, pendingChecks: ['link'] }), // excluida
    ];
    const b = computeCheckBottlenecks(lines);
    expect(b[0]).toEqual({ check: 'link', pending: 2 });
    expect(b.find((x) => x.check === 'kevel')?.pending).toBe(1);
  });

  it('computeComplianceDetail agrupa por cliente/periodo/tipo con % y riesgo', () => {
    const lines = [
      done({
        clienteOriginal: 'MABE',
        periodoOriginal: 'S28',
        tipoOperacion: 'ECOMMERCE',
        campaignLineId: 'l1',
      }),
      pend({
        clienteOriginal: 'MABE',
        periodoOriginal: 'S28',
        tipoOperacion: 'ECOMMERCE',
        periodoInicio: '2026-07-03',
        periodoFin: '2026-07-09',
        campaignLineId: 'l2',
        campaignSpaceId: 's2',
      }),
    ];
    const rows = computeComplianceDetail(lines, today);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      cliente: 'MABE',
      periodo: 'S28',
      tipo: 'ECOMMERCE',
      total: 2,
      cumplidas: 1,
      enRiesgo: 1,
      cumplimientoPct: 50,
    });
  });
});
