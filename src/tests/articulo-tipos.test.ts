import { describe, expect, it } from 'vitest';
import {
  buildTipoClassifier,
  unclassifiedArticulos,
  availableTipos,
  articuloKey,
} from '@/domain/articulo-tipos';

describe('articulo-tipos', () => {
  it('clasifica artículos del catálogo base (con acentos y variaciones)', () => {
    const c = buildTipoClassifier();
    expect(c.resolve('STOPPER-MEDIA')).toBe('GRAFICA');
    expect(c.resolve('CATEGORY BANNER')).toBe('ECOMMERCE');
    expect(c.resolve('VIDEOWALL')).toBe('DIGITAL SIGNAGE');
    expect(c.resolve('FEE C DIGITAL')).toBe('TOMATURNOS');
    // tolerante a mayúsculas/acentos/espacios (normalización técnica)
    expect(c.resolve('  volumétrico con carga ')).toBe('GRAFICA');
    expect(c.resolve('electrostatico')).toBe('GRAFICA');
  });

  it('devuelve null para artículos no catalogados', () => {
    const c = buildTipoClassifier();
    expect(c.resolve('PANTALLA NUEVA XYZ')).toBeNull();
  });

  it('el mapa personalizado tiene prioridad y agrega nuevos', () => {
    const custom = { [articuloKey('PANTALLA NUEVA XYZ')]: 'DIGITAL SIGNAGE' };
    const c = buildTipoClassifier(custom);
    expect(c.resolve('Pantalla Nueva XYZ')).toBe('DIGITAL SIGNAGE');
  });

  it('detecta artículos sin clasificar (distintos)', () => {
    const c = buildTipoClassifier();
    const unknown = unclassifiedArticulos(
      ['STOPPER-MEDIA', 'NUEVO A', 'NUEVO A', 'NUEVO B'],
      c,
    );
    expect(unknown).toEqual(['NUEVO A', 'NUEVO B']);
  });

  it('availableTipos incluye base + personalizados', () => {
    const tipos = availableTipos({ x: 'RETAIL AUDIO' });
    expect(tipos).toContain('GRAFICA');
    expect(tipos).toContain('RETAIL AUDIO');
  });
});
