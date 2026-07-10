import { describe, expect, it } from 'vitest';
import {
  collapseWhitespace,
  normalizeIdKey,
  normalizeKey,
  normalizeSlugKey,
} from '@/domain/normalization';

describe('normalization (§5)', () => {
  it('recorta y colapsa espacios', () => {
    expect(collapseWhitespace('  Soriana  ')).toBe('Soriana');
    expect(collapseWhitespace('a\t  b   c')).toBe('a b c');
  });

  it('normalizeKey: minúsculas, sin diacríticos, ejemplo permitido', () => {
    expect(normalizeKey('  Soriana  ')).toBe('soriana');
    expect(normalizeKey('Panadería')).toBe('panaderia');
  });

  it('normalizeKey NO corrige ortografía (ejemplo no permitido)', () => {
    // "Sorina" NO debe convertirse en "soriana".
    expect(normalizeKey('Sorina')).not.toBe('soriana');
    expect(normalizeKey('Sorina')).toBe('sorina');
  });

  it('normalizeSlugKey produce los slugs de los ejemplos (§7)', () => {
    expect(normalizeSlugKey('Category Banner')).toBe('category_banner');
    expect(normalizeSlugKey('Panadería')).toBe('panaderia');
    expect(normalizeSlugKey('Banner categoría panadería')).toBe(
      'banner_categoria_panaderia',
    );
  });

  it('normalizeIdKey conserva ceros a la izquierda (§6, §8)', () => {
    expect(normalizeIdKey('000125')).toBe('000125');
    expect(normalizeIdKey('001025')).toBe('001025');
    expect(normalizeIdKey(' 45872 ')).toBe('45872');
  });
});
