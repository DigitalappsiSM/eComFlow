import { describe, expect, it } from 'vitest';
import {
  buildImportPlan,
  type ImportStoreLookup,
} from '@/domain/import-pipeline';
import { buildIdentity } from '@/domain/identity';
import { buildPlacementIndex } from '@/domain/placement-index';
import type { ExistingLineRef } from '@/domain/import-classification';
import { REQUIRED_COLUMNS, type RawImportRow } from '@/schemas/import.schema';

const placements = buildPlacementIndex([
  { placement_id: 'home_slider', nombre: 'Home Slider', active: true },
  { placement_id: 'category_banner', nombre: 'Category Banner', aliases: ['Banner de categoría'], active: true },
]);

const headers = [...REQUIRED_COLUMNS];

function row(overrides: Partial<RawImportRow> = {}): Record<string, string> {
  return {
    Cliente: 'Soriana',
    'Número de campaña': '45872',
    Artículo: 'Home Slider',
    Anunciante: 'Soriana',
    'Fecha de fijación': '17/07/2026',
    'Fecha de retirada': '30/07/2026',
    'Creatividad título': 'Panadería',
    'Creatividad descripción': 'Banner categoría panadería',
    'Creatividad ID': '10025',
    ...overrides,
  };
}

class FakeStore implements ImportStoreLookup {
  groups = new Map<string, string>();
  spaces = new Map<string, string>();
  lines = new Map<string, ExistingLineRef & { id: string }>();
  spaceLinesById = new Map<string, ExistingLineRef[]>();

  async getGroupId(k: string) {
    return this.groups.get(k) ?? null;
  }
  async getSpaceId(k: string) {
    return this.spaces.get(k) ?? null;
  }
  async getLine(k: string) {
    return this.lines.get(k) ?? null;
  }
  async getSpaceLines(spaceId: string) {
    return this.spaceLinesById.get(spaceId) ?? [];
  }
}

describe('import-pipeline (§17–§21)', () => {
  it('rechazo completo del archivo si faltan columnas (§17)', async () => {
    const plan = await buildImportPlan(['Cliente'], [row()], placements, new FakeStore());
    expect(plan.generalRejection).toContain('Faltan columnas');
    expect(plan.rows).toHaveLength(0);
  });

  it('base vacía: fila válida → new_campaign', async () => {
    const plan = await buildImportPlan(headers, [row()], placements, new FakeStore());
    expect(plan.summary.new_campaigns).toBe(1);
    expect(plan.rows[0]!.result).toBe('new_campaign');
  });

  it('artículo inexistente → fila rechazada (sin fuzzy)', async () => {
    const plan = await buildImportPlan(
      headers,
      [row({ Artículo: 'Home Slidr' })],
      placements,
      new FakeStore(),
    );
    expect(plan.rows[0]!.result).toBe('rejected');
    expect(plan.rows[0]!.errors[0]!.error_code).toBe('ARTICLE_NOT_FOUND');
  });

  it('alias autorizado resuelve el placement (§14)', async () => {
    const plan = await buildImportPlan(
      headers,
      [row({ Artículo: 'Banner de categoría' })],
      placements,
      new FakeStore(),
    );
    expect(plan.rows[0]!.result).toBe('new_campaign');
    expect(plan.rows[0]!.placementId).toBe('category_banner');
  });

  it('fecha inválida → fila rechazada', async () => {
    const plan = await buildImportPlan(
      headers,
      [row({ 'Fecha de fijación': '2026/07/17' })],
      placements,
      new FakeStore(),
    );
    expect(plan.rows[0]!.result).toBe('rejected');
    expect(plan.summary.rejected).toBe(1);
  });

  it('duplicado dentro del archivo → ambas filas rechazadas (§19)', async () => {
    const plan = await buildImportPlan(headers, [row(), row()], placements, new FakeStore());
    expect(plan.summary.rejected).toBe(2);
    expect(plan.rows.every((r) => r.result === 'rejected')).toBe(true);
    expect(plan.rows[0]!.errors[0]!.error_code).toBe('DUPLICATE_IN_FILE');
    expect(plan.rows[0]!.errors[0]!.error_reason).toContain('3');
  });

  it('misma clave + mismo contenido → unchanged', async () => {
    const store = new FakeStore();
    const id = buildIdentity({
      cliente: 'Soriana',
      numeroCampana: '45872',
      placementId: 'home_slider',
      fechaFijacionIso: '2026-07-17',
      fechaRetiradaIso: '2026-07-30',
      creatividadTitulo: 'Panadería',
      creatividadDescripcion: 'Banner categoría panadería',
      creatividadId: '10025',
      anunciante: 'Soriana',
    });
    store.groups.set(id.campaignGroupKey, 'g1');
    store.spaces.set(id.campaignSpaceKey, 's1');
    store.lines.set(id.campaignLineKey, {
      id: 'l1',
      campaignLineKey: id.campaignLineKey,
      creatividadIdKey: id.creatividadIdKey,
      contentHash: id.contentHash,
      isCurrent: true,
      active: true,
    });

    const plan = await buildImportPlan(headers, [row()], placements, store);
    expect(plan.rows[0]!.result).toBe('unchanged');
    expect(plan.summary.unchanged).toBe(1);
  });

  it('solo cambia retirada → updated_line', async () => {
    const store = new FakeStore();
    const id = buildIdentity({
      cliente: 'Soriana',
      numeroCampana: '45872',
      placementId: 'home_slider',
      fechaFijacionIso: '2026-07-17',
      fechaRetiradaIso: '2026-07-30',
      creatividadTitulo: 'Panadería',
      creatividadDescripcion: 'Banner categoría panadería',
      creatividadId: '10025',
      anunciante: 'Soriana',
    });
    store.groups.set(id.campaignGroupKey, 'g1');
    store.spaces.set(id.campaignSpaceKey, 's1');
    store.lines.set(id.campaignLineKey, {
      id: 'l1',
      campaignLineKey: id.campaignLineKey,
      creatividadIdKey: id.creatividadIdKey,
      contentHash: 'HASH-ANTERIOR-DISTINTO',
      isCurrent: true,
      active: true,
    });

    const plan = await buildImportPlan(
      headers,
      [row({ 'Fecha de retirada': '15/08/2026' })],
      placements,
      store,
    );
    expect(plan.rows[0]!.result).toBe('updated_line');
    expect(plan.summary.updated).toBe(1);
  });

  it('nueva Creatividad ID en espacio existente → creativity_change + posible sustitución', async () => {
    const store = new FakeStore();
    const prior = buildIdentity({
      cliente: 'Soriana',
      numeroCampana: '45872',
      placementId: 'home_slider',
      fechaFijacionIso: '2026-07-17',
      fechaRetiradaIso: '2026-07-30',
      creatividadTitulo: 'Panadería',
      creatividadDescripcion: 'Banner categoría panadería',
      creatividadId: '10025',
      anunciante: 'Soriana',
    });
    store.groups.set(prior.campaignGroupKey, 'g1');
    store.spaces.set(prior.campaignSpaceKey, 's1');
    store.spaceLinesById.set('s1', [
      {
        campaignLineKey: prior.campaignLineKey,
        creatividadIdKey: '10025',
        contentHash: prior.contentHash,
        isCurrent: true,
        active: true,
      },
    ]);

    const plan = await buildImportPlan(
      headers,
      [row({ 'Creatividad ID': '10118' })],
      placements,
      store,
    );
    expect(plan.rows[0]!.result).toBe('creativity_change');
    expect(plan.rows[0]!.possibleReplacement).toBe(true);
    expect(plan.summary.creativity_changes).toBe(1);
    expect(plan.summary.possible_replacements).toBe(1);
  });
});
