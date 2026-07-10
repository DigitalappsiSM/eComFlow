import { describe, expect, it } from 'vitest';
import {
  findDuplicateLineKeys,
  validateHeaders,
  validateImportRow,
  REQUIRED_COLUMNS,
  type RawImportRow,
} from '@/schemas/import.schema';

const validRow: RawImportRow = {
  Cliente: 'Soriana',
  'Número de campaña': '45872',
  Artículo: 'Home Slider',
  Anunciante: 'Soriana',
  'Fecha de fijación': '17/07/2026',
  'Fecha de retirada': '30/07/2026',
  'Creatividad título': 'Panadería',
  'Creatividad descripción': 'Banner categoría panadería',
  'Creatividad ID': '10025',
};

describe('import validation (§17, §18, §19)', () => {
  it('acepta una fila válida y la normaliza a ISO', () => {
    const r = validateImportRow(validRow);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.normalized.fechaFijacionIso).toBe('2026-07-17');
      expect(r.normalized.fechaRetiradaIso).toBe('2026-07-30');
    }
  });

  it('rechaza fecha con formato no autorizado', () => {
    const r = validateImportRow({ ...validRow, 'Fecha de fijación': '2026/07/17' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.error_code === 'INVALID_DATE')).toBe(true);
    }
  });

  it('rechaza retirada anterior a fijación', () => {
    const r = validateImportRow({ ...validRow, 'Fecha de retirada': '10/07/2026' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.error_code === 'RETIRADA_BEFORE_FIJACION')).toBe(true);
    }
  });

  it('rechaza campos obligatorios vacíos y acumula errores', () => {
    const r = validateImportRow({ ...validRow, Cliente: '  ', 'Creatividad ID': '' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.filter((e) => e.error_code === 'EMPTY_REQUIRED')).toHaveLength(2);
    }
  });

  it('valida encabezados: detecta faltantes y duplicados (§17)', () => {
    expect(validateHeaders(REQUIRED_COLUMNS).ok).toBe(true);
    const missing = validateHeaders(['Cliente']);
    expect(missing.ok).toBe(false);
    expect(missing.missing.length).toBeGreaterThan(0);
    const dup = validateHeaders([...REQUIRED_COLUMNS, 'Cliente']);
    expect(dup.duplicated).toContain('Cliente');
  });

  it('detecta duplicados de campaign_line_key en el archivo (§19)', () => {
    const dups = findDuplicateLineKeys([
      { rowNumber: 18, campaignLineKey: 'k1' },
      { rowNumber: 42, campaignLineKey: 'k1' },
      { rowNumber: 5, campaignLineKey: 'k2' },
    ]);
    expect(dups.get('k1')).toEqual([18, 42]);
    expect(dups.has('k2')).toBe(false);
  });
});
