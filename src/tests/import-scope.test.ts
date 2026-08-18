import { describe, expect, it } from 'vitest';
import { buildEkonImportPlan } from '@/domain/ekon-pipeline';
import { deriveEkonScope } from '@/domain/import-scope';
import { buildTipoClassifier } from '@/domain/articulo-tipos';
import { EKON_COLUMNS } from '@/schemas/ekon.schema';
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

/** Fila digital (CATEGORY BANNER → ECOMMERCE) en SORIANA (period_range). */
function digitalRow(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    [EKON_COLUMNS.cliente]: 'CERVEZAS CUAUHTEMOC MOCTEZUMA SA DE CV',
    [EKON_COLUMNS.anunciante]: 'TECATE',
    [EKON_COLUMNS.cadena]: 'SORIANA',
    [EKON_COLUMNS.articulo]: 'CATEGORY BANNER',
    [EKON_COLUMNS.campana]: '24802',
    [EKON_COLUMNS.lineaCampana]: '5001',
    [EKON_COLUMNS.fechaFijacion]: '2026-08-14',
    [EKON_COLUMNS.fechaRetirada]: '2026-08-20',
    [EKON_COLUMNS.creatividadId]: '70001',
    [EKON_COLUMNS.creatividadTitulo]: 'SEARCH BANNER',
    [EKON_COLUMNS.creatividadDesc]: '',
    [EKON_COLUMNS.numSoportes]: '1',
    [EKON_COLUMNS.periodo]: 'S33 - 14/08/2026 a 20/08/2026',
    [EKON_COLUMNS.periodoId]: 'P33',
    ...overrides,
  };
}

async function scopeFromRows(rows: Record<string, string>[]) {
  const plan = await buildEkonImportPlan(headers, rows, new EmptyStore(), buildTipoClassifier());
  return { plan, derived: deriveEkonScope(plan.rows) };
}

describe('derivación de alcance EKON (§4.3, §16)', () => {
  it('1) detecta S33 con código e intervalo correctos', async () => {
    const { derived } = await scopeFromRows([digitalRow()]);
    expect(derived.scope.covered_periods).toEqual([
      { code: 'S33', type: 'semana', start: '2026-08-14', end: '2026-08-20' },
    ]);
    expect(derived.scope.scope_chains).toEqual(['SORIANA']);
    expect(derived.scope.scope_operation_types).toEqual(['ECOMMERCE']);
    expect(derived.blockedReasons).toEqual([]);
  });

  it('2) S33 y S35 producen dos periodos exactos; S34 no queda incluido', async () => {
    const { derived } = await scopeFromRows([
      digitalRow({
        [EKON_COLUMNS.periodo]: 'S33 - 14/08/2026 a 20/08/2026',
        [EKON_COLUMNS.fechaFijacion]: '2026-08-14',
        [EKON_COLUMNS.fechaRetirada]: '2026-08-20',
        [EKON_COLUMNS.creatividadId]: '70001',
      }),
      digitalRow({
        [EKON_COLUMNS.periodo]: 'S35 - 28/08/2026 a 03/09/2026',
        [EKON_COLUMNS.fechaFijacion]: '2026-08-28',
        [EKON_COLUMNS.fechaRetirada]: '2026-09-03',
        [EKON_COLUMNS.creatividadId]: '70002',
      }),
    ]);
    const codes = (derived.scope.covered_periods ?? []).map((p) => p.code);
    expect(codes).toEqual(['S33', 'S35']);
    expect(codes).not.toContain('S34');
  });

  it('3) periodos duplicados se deduplican', async () => {
    const { derived } = await scopeFromRows([
      digitalRow({ [EKON_COLUMNS.creatividadId]: '70001' }),
      digitalRow({ [EKON_COLUMNS.creatividadId]: '70002' }), // misma semana, otra línea
    ]);
    expect(derived.scope.covered_periods).toHaveLength(1);
    expect(derived.scope.covered_periods?.[0]?.code).toBe('S33');
  });

  it('4) una fila rechazada NO bloquea la conciliación (decisión de negocio)', async () => {
    const { plan, derived } = await scopeFromRows([
      digitalRow(),
      digitalRow({ [EKON_COLUMNS.creatividadId]: '' }), // rechazada (Creatividad Id vacía)
    ]);
    expect(plan.summary.rejected).toBe(1);
    // La rechazada no se importa, pero no aporta ningún motivo de bloqueo.
    expect(derived.blockedReasons.some((r) => /rechazad/i.test(r))).toBe(false);
    // El alcance sigue detectándose desde la fila válida.
    expect(derived.scope.covered_periods).toHaveLength(1);
  });

  it('5) sin periodos parseables bloquea authoritative', async () => {
    const { derived } = await scopeFromRows([
      digitalRow({ [EKON_COLUMNS.periodo]: '', [EKON_COLUMNS.periodoId]: '' }),
    ]);
    expect(derived.hasParseablePeriods).toBe(false);
    expect(derived.blockedReasons.some((r) => /periodos con fechas/i.test(r))).toBe(true);
  });

  it('6) filas excluidas por tipo no participan en el universo entrante', async () => {
    // ALARM-MEDIA → GRÁFICA (excluida) en CHEDRAUI; sólo la digital SORIANA cuenta.
    const { plan, derived } = await scopeFromRows([
      digitalRow(),
      digitalRow({
        [EKON_COLUMNS.cadena]: 'CHEDRAUI',
        [EKON_COLUMNS.articulo]: 'ALARM-MEDIA',
        [EKON_COLUMNS.creatividadId]: '99999',
      }),
    ]);
    expect(plan.summary.excluded).toBe(1);
    expect(derived.scope.scope_chains).toEqual(['SORIANA']);
    expect(derived.scope.scope_operation_types).toEqual(['ECOMMERCE']);
  });
});
