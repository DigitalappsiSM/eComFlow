import { describe, expect, it } from 'vitest';
import { buildIdentity, type IdentityInput } from '@/domain/identity';

/**
 * Pruebas obligatorias de identidad (§51).
 * La misma Creatividad ID en dos espacios NO se mezcla; dos creatividades en
 * un espacio NO se mezclan; cambiar fecha de retirada NO cambia la identidad.
 */

const base: IdentityInput = {
  cliente: 'Soriana',
  numeroCampana: '45872',
  placementId: 'category_banner',
  fechaFijacionIso: '2026-07-17',
  fechaRetiradaIso: '2026-07-30',
  creatividadTitulo: 'Panadería',
  creatividadDescripcion: 'Banner categoría panadería',
  creatividadId: '10025',
  anunciante: 'Soriana',
};

function build(overrides: Partial<IdentityInput>) {
  return buildIdentity({ ...base, ...overrides });
}

describe('identity — claves canónicas', () => {
  it('construye las formas raw esperadas por la especificación (§7, §8)', () => {
    const id = build({});
    expect(id.campaignGroupKeyRaw).toBe('soriana|45872');
    expect(id.campaignSpaceKeyRaw).toBe(
      'soriana|45872|category_banner|2026-07-17|panaderia|banner_categoria_panaderia',
    );
    expect(id.campaignLineKeyRaw).toBe(
      'soriana|45872|category_banner|2026-07-17|panaderia|banner_categoria_panaderia|10025',
    );
  });

  // Caso 1 — mismos datos completos → sin cambios (misma identidad y hash).
  it('Caso 1: mismos datos → misma línea y mismo content_hash', () => {
    const a = build({});
    const b = build({});
    expect(a.campaignGroupKey).toBe(b.campaignGroupKey);
    expect(a.campaignSpaceKey).toBe(b.campaignSpaceKey);
    expect(a.campaignLineKey).toBe(b.campaignLineKey);
    expect(a.contentHash).toBe(b.contentHash);
  });

  // Caso 2 — misma campaña/espacio, diferente Creatividad ID → nueva línea.
  it('Caso 2: distinta Creatividad ID → mismo espacio, nueva línea', () => {
    const a = build({});
    const b = build({ creatividadId: '10118' });
    expect(a.campaignGroupKey).toBe(b.campaignGroupKey);
    expect(a.campaignSpaceKey).toBe(b.campaignSpaceKey);
    expect(a.campaignLineKey).not.toBe(b.campaignLineKey);
  });

  // Caso 3 — misma Creatividad ID, Panadería vs Refrescos → espacios/líneas distintos.
  it('Caso 3: mismo ID, título distinto → espacios y líneas diferentes', () => {
    const panaderia = build({});
    const refrescos = build({
      creatividadTitulo: 'Refrescos',
      creatividadDescripcion: 'Banner categoría refrescos',
    });
    expect(panaderia.campaignGroupKey).toBe(refrescos.campaignGroupKey);
    expect(panaderia.campaignSpaceKey).not.toBe(refrescos.campaignSpaceKey);
    expect(panaderia.campaignLineKey).not.toBe(refrescos.campaignLineKey);
  });

  // Caso 4 — solo cambia fecha de retirada → misma identidad, content_hash distinto.
  it('Caso 4: solo cambia fecha de retirada → misma línea, actualización', () => {
    const a = build({});
    const b = build({ fechaRetiradaIso: '2026-08-15' });
    expect(a.campaignGroupKey).toBe(b.campaignGroupKey);
    expect(a.campaignSpaceKey).toBe(b.campaignSpaceKey);
    expect(a.campaignLineKey).toBe(b.campaignLineKey);
    expect(a.contentHash).not.toBe(b.contentHash); // detecta actualización
  });

  // Caso 5 — mayúsculas / espacios exteriores → misma identidad técnica.
  it('Caso 5: mayúsculas y espacios exteriores → misma identidad técnica', () => {
    const a = build({});
    const b = build({ cliente: '  SORIANA  ', anunciante: 'soriana' });
    expect(a.campaignGroupKey).toBe(b.campaignGroupKey);
    expect(a.campaignSpaceKey).toBe(b.campaignSpaceKey);
    expect(a.campaignLineKey).toBe(b.campaignLineKey);
    expect(a.contentHash).toBe(b.contentHash);
  });

  // Caso 6 — cambio ortográfico real → NO se corrige, identidad diferente.
  it('Caso 6: cambio ortográfico real → identidad diferente (no se corrige)', () => {
    const a = build({ cliente: 'Soriana' });
    const b = build({ cliente: 'Sorina' });
    expect(a.campaignGroupKey).not.toBe(b.campaignGroupKey);
  });

  // Caso 7 — mismo cliente y campaña, diferente placement → espacios distintos.
  it('Caso 7: distinto placement → misma campaña, espacios diferentes', () => {
    const a = build({ placementId: 'category_banner' });
    const b = build({ placementId: 'in_grid' });
    expect(a.campaignGroupKey).toBe(b.campaignGroupKey);
    expect(a.campaignSpaceKey).not.toBe(b.campaignSpaceKey);
  });

  // Caso 8 — misma Creatividad ID en Panadería y Refrescos → 2 espacios, 2 líneas, 1 creatividad.
  it('Caso 8: mismo ID en dos espacios → 1 creatividad única, 2 espacios, 2 líneas', () => {
    const panaderia = build({});
    const refrescos = build({
      creatividadTitulo: 'Refrescos',
      creatividadDescripcion: 'Banner categoría refrescos',
    });
    expect(panaderia.creatividadIdKey).toBe(refrescos.creatividadIdKey); // 1 creatividad única
    const espacios = new Set([panaderia.campaignSpaceKey, refrescos.campaignSpaceKey]);
    const lineas = new Set([panaderia.campaignLineKey, refrescos.campaignLineKey]);
    expect(espacios.size).toBe(2);
    expect(lineas.size).toBe(2);
  });

  it('conserva ceros a la izquierda en Creatividad ID y número de campaña', () => {
    const a = build({ creatividadId: '001025', numeroCampana: '000125' });
    expect(a.creatividadIdKey).toBe('001025');
    expect(a.numeroCampanaKey).toBe('000125');
    expect(a.campaignGroupKeyRaw).toBe('soriana|000125');
  });
});
