import { describe, expect, it } from 'vitest';
import {
  EMPTY_MEASURES,
  lookupMeasures,
  normalizeArticulo,
} from '@/pages/campaigns/ecommerceMeasures';
import {
  addDaysIso,
  articuloOf,
  buildEmailRows,
  buildEmailText,
  computeEmailContext,
  descripcionOf,
  formatDateLong,
  formatDateShort,
  periodoLabelOf,
  type EmailSourceLine,
} from '@/pages/campaigns/ecommerceEmail';

function srcLine(o: Partial<EmailSourceLine> = {}): EmailSourceLine {
  return {
    cadena: 'SORIANA',
    cliente_original: 'PROXIMO NATAL',
    anunciante: 'CUERVO MULTIMARCA',
    placement_name_snapshot: 'SORIANA / CATEGORY BANNER',
    creatividad_id_original: '64743',
    creatividad_titulo_original: 'N2 DESTILADOS Y LICORES',
    creatividad_descripcion_original: 'Banner categoría destilados',
    fecha_fijacion: '2026-07-17',
    fecha_retirada: '2026-07-23',
    periodo_codigo: 'S29',
    ...o,
  };
}

describe('ecommerceMeasures', () => {
  it('normaliza artículos (mayúsculas, sin acentos, sin signos, sin espacios extra)', () => {
    expect(normalizeArticulo('  Categoría  Banner (N2) ')).toBe('CATEGORIA BANNER N2');
    expect(normalizeArticulo('Bundle Boost, N3')).toBe('BUNDLE BOOST N3');
  });

  it('CATEGORY BANNER (y niveles) resuelve a las medidas fijas del catálogo', () => {
    const expected = { desktop: '1920 x 259', mobile: '640 x 242', app1: '375 x 213', app2: '320 x 93' };
    expect(lookupMeasures('CATEGORY BANNER')).toEqual(expected);
    expect(lookupMeasures('CATEGORY BANNER N1')).toEqual(expected);
    expect(lookupMeasures('category banner n3')).toEqual(expected);
  });

  it('BUNDLE BOOST y BUNDLE SEARCH resuelven a la misma medida fija', () => {
    const expected = { desktop: '240 x 410', mobile: '430 x 281', app1: '254x380', app2: '—' };
    expect(lookupMeasures('BUNDLE BOOST')).toEqual(expected);
    expect(lookupMeasures('BUNDLE BOOST N3')).toEqual(expected);
    expect(lookupMeasures('BUNDLE SEARCH')).toEqual(expected);
  });

  it('reconoce variantes de PACK PROMOS (folletos / ofertas)', () => {
    const m = lookupMeasures('PACK PROMOS (Folletos y Ofertas)');
    expect(m.desktop).toBe('1920x259');
    expect(lookupMeasures('FOLLETOS')).toEqual(m);
    expect(lookupMeasures('OFERTAS')).toEqual(m);
  });

  it('distingue CATEGORY LANDING y CATEGORY MEDIA WEB de CATEGORY BANNER', () => {
    expect(lookupMeasures('CATEGORY LANDING N1').mobile).toBe('640x612');
    expect(lookupMeasures('CATEGORY MEDIA WEB').app1).toBe('578x186');
  });

  it('artículo desconocido → todas las columnas en "—"', () => {
    expect(lookupMeasures('ALGO RARO')).toEqual(EMPTY_MEASURES);
    expect(lookupMeasures('')).toEqual(EMPTY_MEASURES);
  });
});

describe('ecommerceEmail · helpers', () => {
  it('formatea fechas corto y largo en español', () => {
    expect(formatDateShort('2026-07-17')).toBe('17/07/2026');
    expect(formatDateLong('2026-07-15')).toBe('15 de julio de 2026');
    expect(formatDateShort('no-date')).toBe('—');
  });

  it('addDaysIso resta días (fecha límite = 2 días antes)', () => {
    expect(addDaysIso('2026-07-17', -2)).toBe('2026-07-15');
    expect(addDaysIso('', -2)).toBe('');
  });

  it('deriva artículo del placement "Cadena / Artículo"', () => {
    expect(articuloOf(srcLine())).toBe('CATEGORY BANNER');
    expect(articuloOf(srcLine({ placement_name_snapshot: 'SORIANA / BUNDLE BOOST N3' }))).toBe('BUNDLE BOOST N3');
  });

  it('descripcionOf usa la mejor fuente y cae al título, luego a "—"', () => {
    expect(descripcionOf(srcLine())).toBe('Banner categoría destilados');
    expect(
      descripcionOf(srcLine({ creatividad_descripcion_original: '', creatividad_titulo_original: 'NIVEL X' })),
    ).toBe('NIVEL X');
    expect(
      descripcionOf(srcLine({ creatividad_descripcion_original: '', creatividad_titulo_original: '' })),
    ).toBe('—');
    expect(
      descripcionOf(srcLine({ creatividad_descripcion_original: '', description: 'Desde description' })),
    ).toBe('Desde description');
  });

  it('periodoLabelOf usa el código y cae al original', () => {
    expect(periodoLabelOf(srcLine())).toBe('S29');
    expect(periodoLabelOf(srcLine({ periodo_codigo: '', periodo_original: 'S30 - ...' }))).toBe('S30 - ...');
  });
});

describe('ecommerceEmail · agrupación y correo', () => {
  it('agrupa por creatividad y une periodos (S29, S30) con min fijación y max retirada', () => {
    const lines = [
      srcLine({ periodo_codigo: 'S29', fecha_fijacion: '2026-07-17', fecha_retirada: '2026-07-23' }),
      srcLine({ periodo_codigo: 'S30', fecha_fijacion: '2026-07-24', fecha_retirada: '2026-07-31' }),
    ];
    const rows = buildEmailRows(lines);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.periodos).toEqual(['S29', 'S30']);
    expect(rows[0]!.fijacionIso).toBe('2026-07-17');
    expect(rows[0]!.retiradaIso).toBe('2026-07-31');
    expect(rows[0]!.measures.desktop).toBe('1920 x 259');
  });

  it('mantiene creatividades distintas como filas separadas', () => {
    const lines = [
      srcLine({ placement_name_snapshot: 'SORIANA / CATEGORY BANNER', creatividad_id_original: '1' }),
      srcLine({ placement_name_snapshot: 'SORIANA / BUNDLE BOOST', creatividad_id_original: '2' }),
    ];
    expect(buildEmailRows(lines)).toHaveLength(2);
  });

  it('computeEmailContext calcula fecha límite 2 días antes de la primera fijación', () => {
    const rows = buildEmailRows([
      srcLine({ periodo_codigo: 'S29', fecha_fijacion: '2026-07-17', fecha_retirada: '2026-07-23' }),
      srcLine({ periodo_codigo: 'S30', fecha_fijacion: '2026-07-24', fecha_retirada: '2026-07-31' }),
    ]);
    const ctx = computeEmailContext(rows);
    expect(ctx.inicioIso).toBe('2026-07-17');
    expect(ctx.finIso).toBe('2026-07-31');
    expect(ctx.deadlineIso).toBe('2026-07-15');
    expect(ctx.periodos).toEqual(['S29', 'S30']);
  });

  it('buildEmailText arma saludo, narrativa, tabla tabulada y cierre', () => {
    const rows = buildEmailRows([srcLine()]);
    const text = buildEmailText('Ana', '23353', rows);
    expect(text).toContain('Hola Ana,');
    expect(text).toContain('campaña #23353 para Soriana.com');
    expect(text).toContain('activa del 17 de julio de 2026 al 23 de julio de 2026');
    expect(text).toContain('📅 Fecha límite de entrega de materiales: 15 de julio de 2026');
    expect(text).toContain('Saludos,');
    // Encabezado de tabla con tabulaciones e incluye "Creatividad descripción".
    expect(text).toContain(
      'Cadena\tCliente\tAnunciante / Marca\tPeriodo(s)\tArtículo\tCreatividad descripción\tNivel\tFijación\tRetirada\tDesktop\tMobile\tApp 1\tApp 2',
    );
    // Fila con medidas fijas de CATEGORY BANNER.
    expect(text).toContain('1920 x 259\t640 x 242\t375 x 213\t320 x 93');
  });

  it('saludo sin nombre usa "Hola,"', () => {
    expect(buildEmailText('', '1', buildEmailRows([srcLine()]))).toContain('Hola,\n');
  });
});
