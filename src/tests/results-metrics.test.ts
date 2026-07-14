import { describe, expect, it } from 'vitest';
import {
  buildResultsLines,
  computeByDevice,
  computePeriodTrend,
  computeResultsKpis,
  parseFlight,
  rankBy,
} from '@/domain/results/results-metrics';
import { generateEcommercePeriods } from '@/domain/results/periods';
import type { WeeklyResult } from '@/domain/results/consolidation';

const PERIODS = generateEcommercePeriods({ anchorFriday: '2026-01-02', anchorWeekNumber: 1, count: 5 });
// S01 p-2026-01-02, S02 p-2026-01-09, ...

function w(o: Partial<WeeklyResult> = {}): WeeklyResult {
  return {
    weekly_result_key_hash: Math.random().toString(36).slice(2),
    weekly_result_key_raw: 'x',
    period_id: 'p-2026-01-02',
    campaign_id: 'C1',
    flight_id: 'F1',
    creative_id: 'CR1',
    ad_type_id: 'AT1',
    site_id: 'S1',
    zone_id: '0',
    ad_id: 'AD1',
    advertiser_id: 'A1',
    advertiser: 'MONDELEZ',
    campaign: '23865 - MONDELEZ',
    flight: 'CATEGORY BANNER <N1 JUGUETES>',
    creative: 'APP',
    ad_type: 'Cintillo',
    site: 'App',
    zone: '',
    device: 'app',
    impressions: 1000,
    clicks: 12,
    unique_clicks: 10,
    unfiltered_impressions: 1000,
    unfiltered_clicks: 14,
    invalid_ua_impressions: 0,
    invalid_ua_clicks: 0,
    test_clicks: 0,
    duplicate_impression_clicks: 0,
    duplicate_ip_clicks: 0,
    suspicious_clicks: 0,
    ctr: 0.012,
    unique_ctr: 0.01,
    filtered_clicks: 4,
    impressions_estimated: 0,
    impressions_effective: 1000,
    ctr_effective: 0.012,
    revenue: 0,
    gmv: 0,
    delivery_days: 5,
    first_delivery_date: '2026-01-02',
    last_delivery_date: '2026-01-06',
    source_result_count: 5,
    source_import_ids: ['imp1'],
    ...o,
  };
}

describe('results-metrics', () => {
  it('parseFlight separa artículo y categoría', () => {
    expect(parseFlight('CATEGORY BANNER <N1 JUGUETES>')).toEqual({ articulo: 'CATEGORY BANNER', categoria: 'N1 JUGUETES' });
    expect(parseFlight('SEARCH BANNER')).toEqual({ articulo: 'SEARCH BANNER', categoria: '(sin categoría)' });
  });

  it('buildResultsLines une con el catálogo (código, mes) y usa Unique Clicks como clics', () => {
    const lines = buildResultsLines([w()], PERIODS);
    expect(lines[0]).toMatchObject({
      period_code: 'S1',
      month: 1,
      cliente: 'MONDELEZ',
      articulo: 'CATEGORY BANNER',
      categoria: 'N1 JUGUETES',
      clicks: 10, // unique clicks
      raw_clicks: 12,
    });
  });

  it('KPIs: CTR recalculado (no promediado) sobre unique clicks', () => {
    const lines = buildResultsLines(
      [w({ impressions: 1000, unique_clicks: 10 }), w({ impressions: 3000, unique_clicks: 20, ad_id: 'AD2' })],
      PERIODS,
    );
    const k = computeResultsKpis(lines, 'real');
    expect(k.impressions).toBe(4000);
    expect(k.clicks).toBe(30);
    expect(k.ctr).toBeCloseTo(30 / 4000, 10);
  });

  it('vista efectiva usa impresiones reales + estimadas', () => {
    const lines = buildResultsLines(
      [w({ impressions: 0, impressions_estimated: 500, impressions_effective: 500, unique_clicks: 4 })],
      PERIODS,
    );
    expect(computeResultsKpis(lines, 'real').impressions).toBe(0);
    expect(computeResultsKpis(lines, 'effective').impressions).toBe(500);
  });

  it('evolución por periodo marca el pico de clics', () => {
    const lines = buildResultsLines(
      [
        w({ period_id: 'p-2026-01-02', unique_clicks: 10 }),
        w({ period_id: 'p-2026-01-09', unique_clicks: 50, ad_id: 'AD2' }),
        w({ period_id: 'p-2026-01-16', unique_clicks: 20, ad_id: 'AD3' }),
      ],
      PERIODS,
    );
    const trend = computePeriodTrend(lines, 'real');
    expect(trend.map((p) => p.code)).toEqual(['S1', 'S2', 'S3']);
    const peak = trend.find((p) => p.isPeakClicks);
    expect(peak?.code).toBe('S2');
  });

  it('rankBy categoría ordena por clics (categorías más visitadas)', () => {
    const lines = buildResultsLines(
      [
        w({ flight: 'CATEGORY BANNER <JUGUETES>', unique_clicks: 5 }),
        w({ flight: 'CATEGORY BANNER <DULCES>', unique_clicks: 40, ad_id: 'AD2' }),
        w({ flight: 'CATEGORY BANNER <DULCES>', unique_clicks: 10, ad_id: 'AD3' }),
      ],
      PERIODS,
    );
    const rank = rankBy(lines, (l) => l.categoria, 'real');
    expect(rank[0]).toMatchObject({ key: 'DULCES', clicks: 50 });
    expect(rank[1]).toMatchObject({ key: 'JUGUETES', clicks: 5 });
  });

  it('distribución por dispositivo', () => {
    const lines = buildResultsLines(
      [w({ device: 'app', unique_clicks: 10 }), w({ device: 'desktop', unique_clicks: 4, ad_id: 'AD2' })],
      PERIODS,
    );
    const dev = computeByDevice(lines, 'real');
    expect(dev.find((d) => d.device === 'app')?.clicks).toBe(10);
    expect(dev.find((d) => d.device === 'desktop')?.clicks).toBe(4);
  });
});
