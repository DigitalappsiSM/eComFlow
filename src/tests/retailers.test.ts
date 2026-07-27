import { describe, expect, it } from 'vitest';
import { resolveRetailerAdapter, adapterForLine } from '@/domain/retailers/registry';
import { laComerAdapter } from '@/domain/retailers/la-comer.adapter';
import { sorianaAdapter } from '@/domain/retailers/soriana.adapter';
import { defaultRetailerAdapter } from '@/domain/retailers/default.adapter';
import {
  areConsecutive,
  compressDateRange,
  formatActivationDates,
  formatDateRange,
  sortUniqueDates,
  activationCount,
} from '@/domain/retailers/period-formatting';
import { requiredChecksForLine } from '@/domain/operation-rules';
import { operationalWindow, type MetricLine } from '@/domain/dashboard-metrics';

describe('registro de retailers', () => {
  it('LA COMER resuelve el adaptador La Comer (variantes/espacios/mayúsculas)', () => {
    expect(resolveRetailerAdapter('LA COMER').retailerId).toBe('la_comer');
    expect(resolveRetailerAdapter('  la   comer ').retailerId).toBe('la_comer');
    expect(resolveRetailerAdapter('La Comer').retailerId).toBe('la_comer');
  });

  it('SORIANA resuelve el adaptador Soriana; cadena desconocida usa el default', () => {
    expect(resolveRetailerAdapter('SORIANA').retailerId).toBe('soriana');
    expect(resolveRetailerAdapter('Soriana.com').retailerId).toBe('soriana');
    expect(resolveRetailerAdapter('CHEDRAUI').retailerId).toBe('default');
    expect(resolveRetailerAdapter('').retailerId).toBe('default');
  });

  it('adapterForLine usa retailer_id si existe; si no, la cadena (histórico)', () => {
    expect(adapterForLine({ retailer_id: 'la_comer', cadena: 'X' }).retailerId).toBe('la_comer');
    expect(adapterForLine({ retailer_id: null, cadena: 'SORIANA' }).retailerId).toBe('soriana');
  });
});

describe('parseo de periodo por adaptador', () => {
  it('Soriana: S29 semanal y C16 catorcenal siguen funcionando', () => {
    const s = sorianaAdapter.parsePeriod({ rawPeriod: 'S29 - 17/07/2026 a 23/07/2026', periodId: '10', fixationDate: '2026-07-17', removalDate: '2026-07-23' });
    expect(s).toMatchObject({ code: 'S29', granularity: 'week', start: '2026-07-17', end: '2026-07-23' });
    const c = sorianaAdapter.parsePeriod({ rawPeriod: 'C16 - 28/07/2026 a 10/08/2026', periodId: '11', fixationDate: '2026-07-28', removalDate: '2026-08-10' });
    expect(c).toMatchObject({ code: 'C16', granularity: 'fortnight' });
  });

  it('La Comer: "15/08/2026 a 15/08/2026" es day y el code es el Periodo Id', () => {
    const p = laComerAdapter.parsePeriod({ rawPeriod: '15/08/2026 a 15/08/2026', periodId: '227', fixationDate: '2026-08-15', removalDate: '2026-09-14' });
    expect(p.granularity).toBe('day');
    expect(p.start).toBe('2026-08-15');
    expect(p.end).toBe('2026-08-15');
  });
});

describe('config de artículos por retailer', () => {
  it('La Comer: CARRUSEL HOME requiere arte; SPONSORED PRODUCT no', () => {
    const carrusel = laComerAdapter.articleConfig('CARRUSEL HOME');
    expect(carrusel?.requiresArtCheck).toBe(true);
    expect(carrusel?.measures).toEqual({ desktop: '1920 x 375', mobile: '800 x 400' });
    const sp = laComerAdapter.articleConfig('SPONSORED PRODUCT');
    expect(sp?.requirementType).toBe('data');
    expect(sp?.requiresArtCheck).toBe(false);
    expect(sp?.measures).toEqual({ desktop: 'No requiere arte', mobile: 'No requiere arte' });
    expect(sp?.deliverable).toContain('SKUs');
  });

  it('La Comer: ISM NO está catalogado (flujo desconocido)', () => {
    expect(laComerAdapter.articleConfig('ISM')).toBeNull();
  });

  it('Soriana/default: HOME BANNER conserva sus medidas actuales (App 1/App 2)', () => {
    const hb = sorianaAdapter.articleConfig('HOME BANNER');
    expect(hb?.measures).toEqual({ desktop: '1920x344', mobile: '640x242', app1: '289 x 93', app2: '—' });
    expect(defaultRetailerAdapter.articleConfig('CATEGORY BANNER')?.measures?.app2).toBe('320 x 93');
  });
});

describe('presentación de fechas/activaciones', () => {
  it('detecta consecutividad y comprime a rango solo si son consecutivas', () => {
    expect(areConsecutive(['2026-08-15', '2026-08-16', '2026-08-17'])).toBe(true);
    expect(areConsecutive(['2026-08-15', '2026-08-17'])).toBe(false);
    expect(compressDateRange(['2026-08-15', '2026-08-16', '2026-08-17'])).toEqual({ start: '2026-08-15', end: '2026-08-17' });
    expect(compressDateRange(['2026-08-15', '2026-08-20'])).toBeNull();
  });

  it('ordena y deduplica; cuenta activaciones', () => {
    expect(sortUniqueDates(['2026-08-16', '2026-08-15', '2026-08-16'])).toEqual(['2026-08-15', '2026-08-16']);
    expect(activationCount(['2026-08-16', '2026-08-15', '2026-08-16'])).toBe(2);
  });

  it('formatea rangos consecutivos y no engaña con no consecutivas', () => {
    const consecutive = Array.from({ length: 20 }, (_, i) =>
      new Date(Date.UTC(2026, 7, 15) + i * 86400000).toISOString().slice(0, 10),
    );
    expect(formatActivationDates(consecutive)).toBe('15 ago–3 sep 2026');
    expect(formatDateRange('2026-07-24', '2026-07-30')).toBe('24–30 jul 2026');
    expect(formatActivationDates(['2026-08-15', '2026-08-17', '2026-08-20'])).toBe('15, 17 y 20 ago 2026');
    expect(formatActivationDates(['2026-08-15', '2026-08-15'])).toBe('15 ago 2026');
  });
});

describe('checks por retailer/artículo', () => {
  const line = (o: Partial<Parameters<typeof requiredChecksForLine>[0]>) => ({
    tipo_operacion: 'ECOMMERCE',
    retailer_id: null,
    cadena: null,
    placement_name_snapshot: '',
    ...o,
  });

  it('La Comer creativo requiere los 7 checks', () => {
    const req = requiredChecksForLine(line({ retailer_id: 'la_comer', placement_name_snapshot: 'LA COMER / CARRUSEL HOME' }));
    expect(req).toHaveLength(7);
    expect(req).toContain('artes');
    expect(req).toContain('kevel'); // "Ad server" (key interna kevel)
  });

  it('Sponsored Product NO requiere Artes pero SÍ Ad server (key kevel)', () => {
    const req = requiredChecksForLine(line({ retailer_id: 'la_comer', placement_name_snapshot: 'LA COMER / SPONSORED PRODUCT' }));
    expect(req).not.toContain('artes');
    expect(req).toContain('kevel');
    expect(req).toHaveLength(6);
  });

  it('Soriana ecommerce conserva 7; Digital Signage solo Artes', () => {
    expect(requiredChecksForLine(line({ retailer_id: 'soriana', placement_name_snapshot: 'SORIANA / HOME BANNER' }))).toHaveLength(7);
    expect(requiredChecksForLine(line({ tipo_operacion: 'DIGITAL SIGNAGE' }))).toEqual(['artes']);
  });
});

describe('ventana operativa universal (§12)', () => {
  const base: MetricLine = {
    campaignGroupId: 'g', campaignSpaceId: 's', campaignLineId: 'l', clienteKey: 'c',
    creatividadIdKey: 'x', placementId: 'p', fechaFijacion: '2026-01-01', fechaRetirada: '2026-01-31',
    isCurrent: true, active: true, requiredPieces: 1,
  };

  it('prioriza activación → periodo → fijación/retirada', () => {
    expect(operationalWindow({ ...base, activationStart: '2026-08-15', activationEnd: '2026-09-03' }))
      .toEqual({ start: '2026-08-15', end: '2026-09-03' });
    expect(operationalWindow({ ...base, periodoInicio: '2026-07-17', periodoFin: '2026-07-23' }))
      .toEqual({ start: '2026-07-17', end: '2026-07-23' });
    expect(operationalWindow(base)).toEqual({ start: '2026-01-01', end: '2026-01-31' });
  });
});
