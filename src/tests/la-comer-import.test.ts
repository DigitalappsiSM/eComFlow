import { describe, expect, it } from 'vitest';
import { buildEkonImportPlan, consolidateActivations } from '@/domain/ekon-pipeline';
import { EKON_COLUMNS } from '@/schemas/ekon.schema';
import { buildTipoClassifier } from '@/domain/articulo-tipos';
import type { ImportStoreLookup } from '@/domain/import-pipeline';
import type { ExistingLineRef } from '@/domain/import-classification';

class EmptyStore implements ImportStoreLookup {
  async getGroupId() {
    return null;
  }
  async getSpaceId() {
    return null;
  }
  async getLine() {
    return null;
  }
  async getSpaceLines(): Promise<ExistingLineRef[]> {
    return [];
  }
}

const headers = Object.values(EKON_COLUMNS);

function isoAt(base: string, offsetDays: number): string {
  const t = new Date(`${base}T00:00:00Z`).getTime() + offsetDays * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

/** Fila diaria de La Comer para CARRUSEL HOME (día i de la campaña 26139). */
function laComerDaily(article: string, i: number, numSoportes = '1'): Record<string, string> {
  const date = isoAt('2026-08-15', i);
  return {
    [EKON_COLUMNS.cliente]: 'CLIENTE LC',
    [EKON_COLUMNS.anunciante]: 'MARCA LC',
    [EKON_COLUMNS.cadena]: 'LA COMER',
    [EKON_COLUMNS.articulo]: article,
    [EKON_COLUMNS.campana]: '26139',
    [EKON_COLUMNS.lineaCampana]: String((i + 1) * 10), // 10, 20, ... 200
    [EKON_COLUMNS.fechaFijacion]: '2026-08-15', // rango GENERAL de campaña
    [EKON_COLUMNS.fechaRetirada]: '2026-09-14',
    [EKON_COLUMNS.creatividadId]: '65643',
    [EKON_COLUMNS.creatividadTitulo]: '',
    [EKON_COLUMNS.creatividadDesc]: '',
    [EKON_COLUMNS.numSoportes]: numSoportes,
    [EKON_COLUMNS.periodo]: `${date.split('-').reverse().join('/')} a ${date.split('-').reverse().join('/')}`,
    [EKON_COLUMNS.periodoId]: String(227 + i), // 227..246
  };
}

describe('La Comer: consolidación de filas diarias', () => {
  it('20 filas diarias de CARRUSEL HOME generan UNA sola línea consolidada', async () => {
    // En orden inverso para probar dedup/orden ascendente.
    const rows = Array.from({ length: 20 }, (_, i) => laComerDaily('CARRUSEL HOME', 19 - i));
    const plan = await buildEkonImportPlan(headers, rows, new EmptyStore(), buildTipoClassifier());

    const imported = plan.rows.filter((r) => r.result !== 'rejected' && r.result !== 'excluded_by_type');
    expect(imported).toHaveLength(1);
    const line = imported[0]!;
    expect(plan.mergedRows).toBe(19); // 20 filas → 1 línea

    expect(line.extra?.identityStrategy).toBe('campaign_range');
    expect(line.extra?.retailerId).toBe('la_comer');
    expect(line.extra?.periodGranularity).toBe('day');

    // Fechas deduplicadas y ordenadas ascendentemente.
    expect(line.extra?.activationDates).toEqual(
      Array.from({ length: 20 }, (_, i) => isoAt('2026-08-15', i)),
    );
    expect(line.extra?.activationStart).toBe('2026-08-15');
    expect(line.extra?.activationEnd).toBe('2026-09-03');
    expect(line.extra?.activationCount).toBe(20);

    // period_ids y external_line_ids conservados y ordenados por fecha.
    expect(line.extra?.periodIds).toEqual(Array.from({ length: 20 }, (_, i) => String(227 + i)));
    expect(line.extra?.externalLineIds).toEqual(Array.from({ length: 20 }, (_, i) => String((i + 1) * 10)));

    // Nº Soportes NO se suma como 20 artes distintos: se usa el máximo.
    expect(line.extra?.requiredPieces).toBe(1);
  });

  it('usa el MÁXIMO Nº Soportes, no la suma', async () => {
    const rows = [
      laComerDaily('CARRUSEL HOME', 0, '1'),
      laComerDaily('CARRUSEL HOME', 1, '3'),
      laComerDaily('CARRUSEL HOME', 2, '2'),
    ];
    const plan = await buildEkonImportPlan(headers, rows, new EmptyStore(), buildTipoClassifier());
    const line = plan.rows.find((r) => r.result !== 'rejected')!;
    expect(line.extra?.requiredPieces).toBe(3);
  });

  it('CARRUSEL HOME y SPONSORED PRODUCT no se fusionan aunque compartan creatividad', async () => {
    const rows = [
      laComerDaily('CARRUSEL HOME', 0),
      laComerDaily('CARRUSEL HOME', 1),
      laComerDaily('SPONSORED PRODUCT', 0),
      laComerDaily('SPONSORED PRODUCT', 1),
    ];
    const plan = await buildEkonImportPlan(headers, rows, new EmptyStore(), buildTipoClassifier());
    const imported = plan.rows.filter((r) => r.result !== 'rejected' && r.result !== 'excluded_by_type');
    expect(imported).toHaveLength(2); // dos líneas distintas por artículo
    const placements = new Set(imported.map((r) => r.placementId));
    expect(placements.size).toBe(2);
  });

  it('Soriana (period_range) conserva su comportamiento: no consolida por día', async () => {
    // Dos "periodos" semanales Soriana → líneas separadas (no una consolidada).
    const soriana = (periodo: string, ini: string, fin: string): Record<string, string> => ({
      [EKON_COLUMNS.cliente]: 'CLI',
      [EKON_COLUMNS.anunciante]: 'AN',
      [EKON_COLUMNS.cadena]: 'SORIANA',
      [EKON_COLUMNS.articulo]: 'HOME BANNER',
      [EKON_COLUMNS.campana]: '24490',
      [EKON_COLUMNS.lineaCampana]: '1',
      [EKON_COLUMNS.fechaFijacion]: ini,
      [EKON_COLUMNS.fechaRetirada]: fin,
      [EKON_COLUMNS.creatividadId]: '10025',
      [EKON_COLUMNS.creatividadTitulo]: 'N1',
      [EKON_COLUMNS.creatividadDesc]: '',
      [EKON_COLUMNS.numSoportes]: '1',
      [EKON_COLUMNS.periodo]: periodo,
    });
    const plan = await buildEkonImportPlan(
      headers,
      [
        soriana('S29 - 17/07/2026 a 23/07/2026', '2026-07-17', '2026-07-23'),
        soriana('S30 - 24/07/2026 a 30/07/2026', '2026-07-24', '2026-07-30'),
      ],
      new EmptyStore(),
      buildTipoClassifier(),
    );
    const imported = plan.rows.filter((r) => r.result !== 'rejected');
    expect(imported).toHaveLength(2); // period_range: una línea por periodo
    expect(imported[0]!.extra?.identityStrategy).toBe('period_range');
    expect(imported[0]!.extra?.activationDates).toBeUndefined();
  });
});

describe('consolidateActivations (helper puro)', () => {
  it('dedup por fecha, orden asc, máximo Nº Soportes', () => {
    const c = consolidateActivations([
      { date: '2026-08-17', periodId: '229', lineId: '30', numSoportes: 2 },
      { date: '2026-08-15', periodId: '227', lineId: '10', numSoportes: 1 },
      { date: '2026-08-15', periodId: '227', lineId: '10', numSoportes: 1 }, // dup
      { date: '2026-08-16', periodId: '228', lineId: '20', numSoportes: 5 },
    ]);
    expect(c.activationDates).toEqual(['2026-08-15', '2026-08-16', '2026-08-17']);
    expect(c.periodIds).toEqual(['227', '228', '229']);
    expect(c.externalLineIds).toEqual(['10', '20', '30']);
    expect(c.activationStart).toBe('2026-08-15');
    expect(c.activationEnd).toBe('2026-08-17');
    expect(c.activationCount).toBe(3);
    expect(c.maxNumSoportes).toBe(5);
  });
});
