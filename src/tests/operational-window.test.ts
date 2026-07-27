import { describe, expect, it } from 'vitest';
import { campaignLineWindow, isInvalidRange, windowIntersects } from '@/domain/operational-window';
import { buildEmailRows, emailRowCells, emailSiteName, buildEmailText } from '@/pages/campaigns/ecommerceEmail';

describe('ventana operativa y cruce de rango (§12)', () => {
  const win = { start: '2026-08-15', end: '2026-09-03' };

  it('cruce total, parcial y fuera del rango', () => {
    expect(windowIntersects(win, '2026-08-01', '2026-09-30')).toBe(true); // contiene
    expect(windowIntersects(win, '2026-09-01', '2026-09-10')).toBe(true); // parcial al final
    expect(windowIntersects(win, '2026-08-10', '2026-08-16')).toBe(true); // parcial al inicio
    expect(windowIntersects(win, '2026-10-01', '2026-10-31')).toBe(false); // después
    expect(windowIntersects(win, '2026-07-01', '2026-08-14')).toBe(false); // antes
  });

  it('solo Desde / solo Hasta / vacío', () => {
    expect(windowIntersects(win, '2026-09-01', '')).toBe(true); // termina en/después de Desde
    expect(windowIntersects(win, '2026-09-10', '')).toBe(false);
    expect(windowIntersects(win, '', '2026-08-20')).toBe(true); // empieza en/antes de Hasta
    expect(windowIntersects(win, '', '2026-08-10')).toBe(false);
    expect(windowIntersects(win, '', '')).toBe(true);
  });

  it('rango inválido se detecta', () => {
    expect(isInvalidRange('2026-09-01', '2026-08-01')).toBe(true);
    expect(isInvalidRange('2026-08-01', '2026-09-01')).toBe(false);
    expect(isInvalidRange('', '2026-08-01')).toBe(false);
  });

  it('campaignLineWindow: activación → periodo → fijación/retirada', () => {
    expect(campaignLineWindow({ activation_start: '2026-08-15', activation_end: '2026-09-03', periodo_inicio: null, periodo_fin: null, fecha_fijacion: '2026-08-15', fecha_retirada: '2026-09-14' }))
      .toEqual({ start: '2026-08-15', end: '2026-09-03' });
    expect(campaignLineWindow({ activation_start: null, activation_end: null, periodo_inicio: '2026-07-17', periodo_fin: '2026-07-23', fecha_fijacion: '2026-07-10', fecha_retirada: '2026-08-01' }))
      .toEqual({ start: '2026-07-17', end: '2026-07-23' });
    expect(campaignLineWindow({ activation_start: null, activation_end: null, periodo_inicio: null, periodo_fin: null, fecha_fijacion: '2026-01-01', fecha_retirada: '2026-01-31' }))
      .toEqual({ start: '2026-01-01', end: '2026-01-31' });
  });
});

describe('correo Ecommerce multi-retailer (§16)', () => {
  it('La Comer: CARRUSEL HOME con sus medidas y App 1/App 2 en "—"', () => {
    const [row] = buildEmailRows([
      {
        cadena: 'LA COMER',
        retailer_id: 'la_comer',
        cliente_original: 'CLI',
        placement_name_snapshot: 'LA COMER / CARRUSEL HOME',
        creatividad_id_original: '65643',
        activation_start: '2026-08-15',
        activation_end: '2026-09-03',
      },
    ]);
    expect(row!.measures).toEqual({ desktop: '1920 x 375', mobile: '800 x 400', app1: '—', app2: '—' });
    expect(row!.noArt).toBe(false);
    expect(row!.fijacionIso).toBe('2026-08-15');
    expect(row!.retiradaIso).toBe('2026-09-03');
  });

  it('Sponsored Product: "No requiere arte" y nota de SKUs en el correo', () => {
    const rows = buildEmailRows([
      {
        cadena: 'LA COMER',
        retailer_id: 'la_comer',
        cliente_original: 'CLI',
        placement_name_snapshot: 'LA COMER / SPONSORED PRODUCT',
        creatividad_id_original: '65643',
      },
    ]);
    expect(rows[0]!.noArt).toBe(true);
    expect(rows[0]!.measures.desktop).toBe('No requiere arte');
    expect(rows[0]!.measures.mobile).toBe('No requiere arte');
    const text = buildEmailText('Ana', '26139', rows);
    expect(text).toContain('SPONSORED PRODUCT no requiere piezas gráficas');
    expect(text).toContain('listado de productos/SKUs');
    expect(emailSiteName(rows)).toBe('La Comer');
  });

  it('Soriana conserva sus medidas y site name', () => {
    const rows = buildEmailRows([
      {
        cadena: 'Soriana.com',
        cliente_original: 'CLI',
        placement_name_snapshot: 'Soriana.com / CATEGORY BANNER',
        creatividad_id_original: '1',
      },
    ]);
    const cells = emailRowCells(rows[0]!);
    // Columnas ...Desktop, Mobile, App1, App2 al final.
    expect(cells.slice(-4)).toEqual(['1920 x 259', '640 x 242', '375 x 213', '320 x 93']);
    expect(emailSiteName(rows)).toBe('Soriana.com');
    expect(rows[0]!.noArt).toBe(false);
  });
});
