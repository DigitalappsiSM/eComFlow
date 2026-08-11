import { describe, expect, it } from 'vitest';
import type { CheckKey } from '@/domain/progress';
import {
  buildDrilldownParams,
  parseDrilldownParams,
  buildDrilldownHref,
  computeDeadlines,
  computeFourWeeks,
  ecommerceWeekRange,
  firstMondayAfter,
  consolidateCreatives,
  consolidateChecks,
  computeCreativeProgress,
  stageProgress,
  computeWeekKpis,
  creativesForWeek,
  isContinuationInWeek,
  computeCheckProgress,
  computePreparationByClient,
  deadlinesFor,
  preparationOnTime,
  closingOnTime,
  fetchAllPages,
  mexicoCityDate,
  type RawDashboardLine,
  type DashboardCreative,
} from '@/domain/ecommerce-dashboard';

const TODAY = '2026-08-11'; // martes

/** Epoch ms de las 12:00 de Ciudad de México (UTC-6) de una fecha ISO. */
function mxTs(iso: string): number {
  return new Date(`${iso}T12:00:00-06:00`).getTime();
}

function check(value: boolean, iso?: string) {
  return { value, updatedAtMs: iso ? mxTs(iso) : null };
}

function rawLine(overrides: Partial<RawDashboardLine> = {}): RawDashboardLine {
  return {
    campaignLineId: 'L1',
    campaignSpaceId: 'S1',
    campaignGroupId: 'G1',
    clienteKey: 'mabe',
    clienteOriginal: 'MABE',
    numeroCampana: '26139',
    placementId: 'la_comer_carrusel_home',
    placementNameSnapshot: 'LA COMER / CARRUSEL HOME',
    creatividadIdKey: '65643',
    creatividadIdOriginal: '65643',
    cadena: 'LA COMER',
    tipoOperacion: 'ECOMMERCE',
    retailerId: 'la_comer',
    activationDates: null,
    activationStart: null,
    activationEnd: null,
    periodoOriginal: null,
    periodoInicio: null,
    periodoFin: null,
    fechaFijacion: '2026-08-07',
    fechaRetirada: '2026-08-13',
    cancelled: false,
    checks: {},
    operationUpdatedAtMs: null,
    ...overrides,
  };
}

/** Línea Ecommerce general (Soriana): identidad por periodo, no consolida. */
function generalLine(overrides: Partial<RawDashboardLine> = {}): RawDashboardLine {
  return rawLine({
    campaignGroupId: 'GS',
    clienteKey: 'cli',
    clienteOriginal: 'CLI',
    placementId: 'soriana_category_banner',
    placementNameSnapshot: 'Soriana.com / CATEGORY BANNER',
    cadena: 'Soriana.com',
    retailerId: 'soriana',
    periodoInicio: '2026-08-07',
    periodoFin: '2026-08-13',
    fechaFijacion: '2026-08-07',
    fechaRetirada: '2026-08-13',
    ...overrides,
  });
}

function creativeOf(lines: RawDashboardLine[]): DashboardCreative {
  const [c] = consolidateCreatives(lines);
  expect(c).toBeDefined();
  return c!;
}

const ALL_PREP: CheckKey[] = ['correo_enviado', 'artes', 'validacion', 'link', 'kevel'];

// ---------------------------------------------------------------------------
// 1. Semana viernes–jueves.
// ---------------------------------------------------------------------------
describe('§3 semanas viernes→jueves', () => {
  it('la semana de un martes es viernes previo → jueves', () => {
    expect(ecommerceWeekRange('2026-08-11')).toEqual({ start: '2026-08-07', end: '2026-08-13' });
  });
  it('un viernes es el inicio de su propia semana', () => {
    expect(ecommerceWeekRange('2026-08-07')).toEqual({ start: '2026-08-07', end: '2026-08-13' });
  });

  // 2. Las cuatro ventanas alrededor del 11 de agosto de 2026.
  it('cuatro ventanas alrededor del 11 ago 2026', () => {
    const weeks = computeFourWeeks(TODAY);
    expect(weeks.map((w) => [w.slot, w.start, w.end])).toEqual([
      ['previous', '2026-07-31', '2026-08-06'],
      ['current', '2026-08-07', '2026-08-13'],
      ['next', '2026-08-14', '2026-08-20'],
      ['secondNext', '2026-08-21', '2026-08-27'],
    ]);
  });
});

// ---------------------------------------------------------------------------
// 3–6. Fechas límite y a tiempo / con retraso (Ecommerce general).
// ---------------------------------------------------------------------------
describe('§5 fechas límite Ecommerce general', () => {
  const prepDone = (iso: string) =>
    Object.fromEntries(ALL_PREP.map((k) => [k, check(true, iso)])) as Record<CheckKey, ReturnType<typeof check>>;

  it('preparación completada el viernes: a tiempo', () => {
    const c = creativeOf([generalLine({ checks: prepDone('2026-08-07') })]);
    const d = deadlinesFor(c);
    expect(d.preparation).toBe('2026-08-07');
    expect(preparationOnTime(c, d)).toBe(true);
  });

  it('preparación completada el sábado: con retraso', () => {
    const checks = { ...prepDone('2026-08-07'), kevel: check(true, '2026-08-08') };
    const c = creativeOf([generalLine({ checks })]);
    expect(preparationOnTime(c, deadlinesFor(c))).toBe(false);
  });

  it('testigos completados el lunes: a tiempo', () => {
    const checks = {
      ...prepDone('2026-08-07'),
      testigos_app: check(true, '2026-08-10'),
      testigos_web: check(true, '2026-08-10'),
    };
    const c = creativeOf([generalLine({ checks })]);
    const d = deadlinesFor(c);
    expect(d.closing).toBe('2026-08-10'); // lunes posterior al viernes
    expect(closingOnTime(c, d)).toBe(true);
  });

  it('testigos completados el martes: con retraso', () => {
    const checks = {
      ...prepDone('2026-08-07'),
      testigos_app: check(true, '2026-08-10'),
      testigos_web: check(true, '2026-08-11'),
    };
    const c = creativeOf([generalLine({ checks })]);
    expect(closingOnTime(c, deadlinesFor(c))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 7. Periodo futuro sin vencimientos → «No aplica», no 0%.
// ---------------------------------------------------------------------------
describe('§8 periodo futuro: No aplica en vez de 0%', () => {
  it('sin plazos vencidos, los % de SLA son null', () => {
    const c = creativeOf([
      generalLine({ periodoInicio: '2026-08-14', periodoFin: '2026-08-20', fechaFijacion: '2026-08-14', fechaRetirada: '2026-08-20' }),
    ]);
    const kpis = computeWeekKpis([c], TODAY);
    expect(kpis.preparacionATiempoPct).toBeNull();
    expect(kpis.cierreATiempoPct).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 8. Cada check modifica el avance visible.
// ---------------------------------------------------------------------------
describe('§8 cada check mueve el avance', () => {
  it('el % total sube con cada check completado', () => {
    const applicable: CheckKey[] = [...ALL_PREP, 'testigos_app', 'testigos_web'];
    let prev = -1;
    for (let n = 0; n <= applicable.length; n += 1) {
      const checks = Object.fromEntries(applicable.map((k, i) => [k, i < n])) as Record<CheckKey, boolean>;
      const p = stageProgress(checks, applicable);
      expect(p.pct).toBeGreaterThan(prev);
      prev = p.pct;
    }
  });

  it('progreso por etapa reacciona sin necesitar los siete', () => {
    const checks = { correo_enviado: true } as Record<CheckKey, boolean>;
    const c = creativeOf([generalLine({ checks: { correo_enviado: check(true, '2026-08-07') } })]);
    const progress = computeCreativeProgress(c.checks, c.applicablePrep, c.applicableClosing);
    expect(progress.preparation.done).toBe(1);
    expect(progress.preparation.pct).toBeCloseTo(20, 1);
    expect(checks.correo_enviado).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 9. Sponsored Product no requiere Artes.
// ---------------------------------------------------------------------------
describe('§4 Sponsored Product no requiere Artes', () => {
  it('el denominador se ajusta (sin artes)', () => {
    const c = creativeOf([
      rawLine({ placementId: 'la_comer_sponsored', placementNameSnapshot: 'LA COMER / SPONSORED PRODUCT' }),
    ]);
    expect(c.applicableAll).not.toContain('artes');
    expect(c.applicablePrep).not.toContain('artes');
    expect(c.applicableAll).toHaveLength(6);
  });
});

// ---------------------------------------------------------------------------
// 10–14. Consolidación La Comer.
// ---------------------------------------------------------------------------
describe('§6 consolidación La Comer', () => {
  it('20 periodos diarios, mismo artículo e ID → una creatividad', () => {
    const lines = Array.from({ length: 20 }, (_, i) => {
      const day = `2026-08-${String(1 + i).padStart(2, '0')}`;
      return rawLine({
        campaignLineId: `L${i}`,
        campaignSpaceId: `S${i}`,
        fechaFijacion: day,
        fechaRetirada: day,
        activationDates: [day],
      });
    });
    const creatives = consolidateCreatives(lines);
    expect(creatives).toHaveLength(1);
    expect(creatives[0]!.legacyLineIds).toHaveLength(20);
    expect(creatives[0]!.activationDates).toHaveLength(20);
  });

  it('Carrusel y Sponsored Product → dos espacios', () => {
    const creatives = consolidateCreatives([
      rawLine({ campaignLineId: 'A', placementId: 'la_comer_carrusel_home', placementNameSnapshot: 'LA COMER / CARRUSEL HOME' }),
      rawLine({ campaignLineId: 'B', placementId: 'la_comer_sponsored', placementNameSnapshot: 'LA COMER / SPONSORED PRODUCT' }),
    ]);
    expect(creatives).toHaveLength(2);
  });

  it('nueva Creatividad ID → nueva línea', () => {
    const creatives = consolidateCreatives([
      rawLine({ campaignLineId: 'A', creatividadIdKey: '111', creatividadIdOriginal: '111' }),
      rawLine({ campaignLineId: 'B', creatividadIdKey: '222', creatividadIdOriginal: '222' }),
    ]);
    expect(creatives).toHaveLength(2);
  });

  it('activaciones con hueco: no inventa días intermedios', () => {
    const c = creativeOf([
      rawLine({ activationDates: ['2026-08-07', '2026-08-08', '2026-08-12'] }),
    ]);
    expect(c.activationDates).toEqual(['2026-08-07', '2026-08-08', '2026-08-12']);
    expect(c.activationDates).not.toContain('2026-08-09');
  });

  it('datos históricos sin activation_dates: deriva de periodo_original', () => {
    const c = creativeOf([
      rawLine({ campaignLineId: 'A', activationDates: null, periodoOriginal: '07/08/2026 a 07/08/2026', fechaFijacion: '2026-08-07' }),
      rawLine({ campaignLineId: 'B', activationDates: null, periodoOriginal: '08/08/2026 a 08/08/2026', fechaFijacion: '2026-08-08' }),
    ]);
    expect(c.activationDates).toEqual(['2026-08-07', '2026-08-08']);
    expect(c.legacyLineIds).toEqual(['A', 'B']);
  });

  it('datos históricos: deriva de periodo_inicio/periodo_fin', () => {
    const c = creativeOf([
      rawLine({ activationDates: null, periodoInicio: '2026-08-07', periodoFin: '2026-08-09' }),
    ]);
    expect(c.activationDates).toEqual(['2026-08-07', '2026-08-08', '2026-08-09']);
  });
});

// ---------------------------------------------------------------------------
// 15. Consolidación del check con el timestamp más reciente.
// ---------------------------------------------------------------------------
describe('§6 consolidación de checks por timestamp más reciente', () => {
  it('gana el valor de la actualización más reciente', () => {
    const older = rawLine({ campaignLineId: 'A', checks: { artes: check(true, '2026-08-05') } });
    const newer = rawLine({ campaignLineId: 'B', checks: { artes: check(false, '2026-08-07') } });
    const { checks } = consolidateChecks([older, newer]);
    expect(checks.artes).toBe(false); // el más reciente (false) prevalece
  });

  it('completa con la fecha del check más reciente y respeta el orden inverso', () => {
    const a = rawLine({ campaignLineId: 'A', checks: { link: check(true, '2026-08-09') } });
    const b = rawLine({ campaignLineId: 'B', checks: { link: check(false, '2026-08-05') } });
    const { checks, checkDates } = consolidateChecks([a, b]);
    expect(checks.link).toBe(true);
    expect(checkDates.link).toBe('2026-08-09');
  });

  it('sin timestamp específico usa el updated_at de la operación', () => {
    const a = rawLine({ campaignLineId: 'A', checks: { correo_enviado: { value: true, updatedAtMs: null } }, operationUpdatedAtMs: mxTs('2026-08-06') });
    const { checks, checkDates } = consolidateChecks([a]);
    expect(checks.correo_enviado).toBe(true);
    expect(checkDates.correo_enviado).toBe('2026-08-06');
  });
});

// ---------------------------------------------------------------------------
// 16. Creatividad continua en varias semanas no reinicia checks.
// ---------------------------------------------------------------------------
describe('§6 continuidad multi-semana sin reiniciar checks', () => {
  it('la misma creatividad aparece en cada semana con los mismos checks', () => {
    const dates = Array.from({ length: 14 }, (_, i) => `2026-08-${String(7 + i).padStart(2, '0')}`);
    const c = creativeOf([rawLine({ activationDates: dates, checks: { correo_enviado: check(true, '2026-08-07') } })]);
    const week1 = { start: '2026-08-07', end: '2026-08-13' };
    const week2 = { start: '2026-08-14', end: '2026-08-20' };
    const inW1 = creativesForWeek([c], week1);
    const inW2 = creativesForWeek([c], week2);
    expect(inW1).toHaveLength(1);
    expect(inW2).toHaveLength(1);
    expect(inW1[0]!.checks).toEqual(inW2[0]!.checks); // no se reinician
    expect(isContinuationInWeek(c, week1)).toBe(false);
    expect(isContinuationInWeek(c, week2)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 17. Inicio de La Comer en un día diferente al viernes.
// ---------------------------------------------------------------------------
describe('§5 La Comer inicia cualquier día', () => {
  it('fecha límite contra la primera activación, no contra un viernes', () => {
    // Miércoles 12 ago 2026.
    const d = computeDeadlines({ isLaComer: true, activationStart: '2026-08-12' });
    expect(d.preparation).toBe('2026-08-12');
    expect(d.closing).toBe(firstMondayAfter('2026-08-12'));
    expect(d.closing).toBe('2026-08-17'); // primer lunes posterior
  });

  it('Ecommerce general sí ancla al viernes de la semana', () => {
    const d = computeDeadlines({ isLaComer: false, activationStart: '2026-08-12' });
    expect(d.preparation).toBe('2026-08-07');
  });
});

// ---------------------------------------------------------------------------
// 18. Drill-down y lectura de parámetros URL.
// ---------------------------------------------------------------------------
describe('§11 drill-down por parámetros de URL', () => {
  it('construye y vuelve a leer los filtros', () => {
    const qs = buildDrilldownParams({
      tipo: 'ECOMMERCE',
      weekStart: '2026-08-14',
      weekEnd: '2026-08-20',
      cliente: 'MABE',
      pendingCheck: 'artes',
      status: 'en_preparacion',
    });
    const parsed = parseDrilldownParams(new URLSearchParams(qs));
    expect(parsed).toEqual({
      tipo: 'ECOMMERCE',
      weekStart: '2026-08-14',
      weekEnd: '2026-08-20',
      cliente: 'MABE',
      pendingCheck: 'artes',
      status: 'en_preparacion',
    });
  });

  it('ignora status y check inválidos y arma el href', () => {
    const parsed = parseDrilldownParams(new URLSearchParams('status=inexistente&pendingCheck=zzz&cliente=MABE'));
    expect(parsed.status).toBeUndefined();
    expect(parsed.pendingCheck).toBeUndefined();
    expect(parsed.cliente).toBe('MABE');
    expect(buildDrilldownHref({ tipo: 'ECOMMERCE' })).toBe('/operacion?tipo=ECOMMERCE');
  });
});

// ---------------------------------------------------------------------------
// 19. Paginación sin truncamiento silencioso.
// ---------------------------------------------------------------------------
describe('§10 paginación sin truncamiento', () => {
  it('recupera TODAS las páginas (más de 1,500) sin cortar', () => {
    const total = 3500;
    const pageSize = 500;
    let served = 0;
    const fetchPage = async (cursor: number | null) => {
      const start = cursor ?? 0;
      const items = Array.from({ length: Math.min(pageSize, total - start) }, (_, i) => start + i);
      served += items.length;
      const next = start + items.length;
      return { items, cursor: next >= total ? null : next };
    };
    return fetchAllPages<number, number>(fetchPage).then((all) => {
      expect(all).toHaveLength(total);
      expect(served).toBe(total);
      expect(all[0]).toBe(0);
      expect(all.at(-1)).toBe(total - 1);
    });
  });
});

// ---------------------------------------------------------------------------
// 20. Métricas sin líneas y estados vacíos.
// ---------------------------------------------------------------------------
describe('§8 métricas sin líneas', () => {
  it('KPIs vacíos son ceros/nulls, sin errores', () => {
    const kpis = computeWeekKpis([], TODAY);
    expect(kpis.totalCreatives).toBe(0);
    expect(kpis.clientes).toBe(0);
    expect(kpis.avgPreparation).toBe(0);
    expect(kpis.preparacionATiempoPct).toBeNull();
    expect(kpis.cierreATiempoPct).toBeNull();
    expect(Object.values(kpis.statusCounts).every((v) => v === 0)).toBe(true);
    expect(computeCheckProgress([])).toEqual([]);
    expect(computePreparationByClient([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Zona horaria de referencia.
// ---------------------------------------------------------------------------
describe('§5 zona horaria America/Mexico_City', () => {
  it('un instante nocturno UTC cae en el día MX correcto', () => {
    // 2026-08-08 02:00Z = 2026-08-07 20:00 en MX (UTC-6).
    expect(mexicoCityDate(Date.parse('2026-08-08T02:00:00Z'))).toBe('2026-08-07');
  });
});
