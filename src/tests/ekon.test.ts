import { describe, expect, it } from 'vitest';
import { buildEkonImportPlan, ekonPlacementId } from '@/domain/ekon-pipeline';
import { mapEkonRow, EKON_COLUMNS } from '@/schemas/ekon.schema';
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

function ekonRow(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    [EKON_COLUMNS.cliente]: 'CERVECERIA MODELO DE MEXICO',
    [EKON_COLUMNS.anunciante]: 'CORONA',
    [EKON_COLUMNS.cadena]: 'CHEDRAUI',
    [EKON_COLUMNS.articulo]: 'ALARM-MEDIA',
    [EKON_COLUMNS.campana]: '23353',
    [EKON_COLUMNS.lineaCampana]: '4720',
    [EKON_COLUMNS.fechaFijacion]: '2026-07-28',
    [EKON_COLUMNS.fechaRetirada]: '2026-09-08',
    [EKON_COLUMNS.creatividadId]: '65227',
    [EKON_COLUMNS.creatividadTitulo]: 'ALARM-MEDIA',
    [EKON_COLUMNS.creatividadDesc]: '',
    [EKON_COLUMNS.numSoportes]: '28',
    ...overrides,
  };
}

const headers = Object.values(EKON_COLUMNS);

describe('Ekon template (archivo operativo real)', () => {
  it('deriva placement de Cadena + Artículo', () => {
    expect(ekonPlacementId('CHEDRAUI', 'ALARM-MEDIA')).toBe('chedraui_alarm_media');
    expect(ekonPlacementId('LA COMER', 'STOPPER XL')).toBe('la_comer_stopper_xl');
  });

  it('acepta descripción vacía y fechas ISO', () => {
    const r = mapEkonRow(ekonRow());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.normalized.fechaFijacionIso).toBe('2026-07-28');
      expect(r.normalized.creatividadDescripcion).toBe('');
      expect(r.normalized.numSoportes).toBe(28);
    }
  });

  it('agrupa filas de material de la misma Creatividad Id en una sola línea', async () => {
    const plan = await buildEkonImportPlan(
      headers,
      [
        ekonRow(), // material 1
        ekonRow(), // material 2 (misma creatividad → se agrupa)
        ekonRow({ [EKON_COLUMNS.creatividadId]: '65226' }), // otra creatividad
      ],
      new EmptyStore(),
    );
    expect(plan.generalRejection).toBeNull();
    expect(plan.mergedRows).toBe(1);
    expect(plan.rows.filter((r) => r.result !== 'rejected')).toHaveLength(2);
    expect(plan.summary.new_campaigns).toBe(2); // base vacía: cada línea nueva
  });

  it('separa la misma creatividad en cadenas distintas (espacios distintos)', async () => {
    const plan = await buildEkonImportPlan(
      headers,
      [ekonRow({ [EKON_COLUMNS.cadena]: 'CHEDRAUI' }), ekonRow({ [EKON_COLUMNS.cadena]: 'SORIANA' })],
      new EmptyStore(),
    );
    expect(plan.mergedRows).toBe(0); // no se agrupan: distinta cadena
    const spaceKeys = new Set(plan.rows.map((r) => r.identity?.campaignSpaceKey));
    expect(spaceKeys.size).toBe(2);
  });

  it('rechaza fila con Creatividad Id vacía', async () => {
    const plan = await buildEkonImportPlan(
      headers,
      [ekonRow({ [EKON_COLUMNS.creatividadId]: '' })],
      new EmptyStore(),
    );
    expect(plan.summary.rejected).toBe(1);
    expect(plan.rows[0]!.errors[0]!.error_code).toBe('EMPTY_REQUIRED');
  });

  it('excluye por tipo no digital (GRÁFICA) al clasificar', async () => {
    const classifier = buildTipoClassifier(); // ALARM-MEDIA → GRAFICA (catálogo base)
    const plan = await buildEkonImportPlan(headers, [ekonRow()], new EmptyStore(), classifier);
    // Por defecto sólo se importan tipos digitales → GRÁFICA queda excluida.
    expect(plan.rows[0]!.result).toBe('excluded_by_type');
    expect(plan.summary.excluded).toBe(1);
    expect(plan.summary.valid).toBe(0);
  });

  it('importa un tipo digital (ECOMMERCE) normalmente', async () => {
    const classifier = buildTipoClassifier(); // CATEGORY BANNER → ECOMMERCE
    const plan = await buildEkonImportPlan(
      headers,
      [ekonRow({ [EKON_COLUMNS.articulo]: 'CATEGORY BANNER' })],
      new EmptyStore(),
      classifier,
    );
    expect(plan.rows[0]!.result).toBe('new_campaign');
    expect(plan.summary.excluded).toBe(0);
  });

  it('rechazo estructural si faltan columnas obligatorias', async () => {
    const plan = await buildEkonImportPlan(['Cliente'], [ekonRow()], new EmptyStore());
    expect(plan.generalRejection).toContain('Faltan columnas');
  });
});
