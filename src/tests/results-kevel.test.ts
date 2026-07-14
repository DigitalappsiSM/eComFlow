import { describe, expect, it } from 'vitest';
import { parseCsv, validateKevelStructure, KEVEL_COLUMNS, mapKevelRow, parseKevelDate } from '@/domain/results/kevel-schema';
import { buildKevelPlan } from '@/domain/results/kevel-pipeline';
import { consolidateWeekly } from '@/domain/results/consolidation';
import { generateEcommercePeriods, findPeriodForDate } from '@/domain/results/periods';
import { dailyKey, weeklyKey } from '@/domain/results/identity';
import type { EcommercePeriod } from '@/types/results';

// Catálogo: dos semanas viernes→jueves. S29 = 2026-07-17..23, S30 = 24..30.
const PERIODS: EcommercePeriod[] = generateEcommercePeriods({
  anchorFriday: '2026-07-17',
  anchorWeekNumber: 29,
  count: 2,
});

const HEADER = KEVEL_COLUMNS.join(',');

// Fila de datos base con 42 columnas. Overrides por índice de columna.
function dataRow(overrides: Record<number, string> = {}): string {
  const cells = new Array(42).fill('');
  // valores por defecto coherentes
  cells[0] = '2026-07-17'; // Date
  cells[1] = 'CORONA'; // Advertiser
  cells[2] = '23707 - HERDEZ'; // Campaign
  cells[3] = 'FLIGHT A'; // Flight
  cells[4] = 'AD-1'; // Ad
  cells[5] = 'CPM'; // Rate Type
  cells[6] = '10'; // Price
  cells[7] = 'CREA-1'; // Creative
  cells[8] = 'Desktop Banner'; // AdType
  cells[9] = 'Soriana.com'; // Site
  cells[10] = 'Z1'; // Zone
  cells[11] = '1000'; // Impressions
  cells[12] = '1200'; // Unfiltered Impressions
  cells[13] = '0'; // Invalid UA Impressions
  cells[14] = '10'; // Clicks
  cells[15] = '0';
  cells[16] = '0';
  cells[17] = '0';
  cells[18] = '0';
  cells[19] = '0'; // Suspicious
  cells[20] = '8'; // Unique Clicks
  cells[21] = '12'; // Unfiltered Clicks
  cells[22] = '0.01'; // CTR = 10/1000
  cells[23] = '0.008'; // Unique CTR = 8/1000
  cells[32] = '23707'; // CampaignId
  cells[33] = 'FL1'; // FlightId
  cells[34] = '2026-07-01'; // Flight Start
  cells[35] = '2026-08-31'; // Flight End
  cells[36] = 'ADV1'; // AdvertiserId
  cells[37] = 'CR1'; // CreativeId
  cells[38] = 'AT1'; // AdTypeId
  cells[39] = 'ST1'; // SiteId
  cells[40] = 'ZN1'; // ZoneId
  cells[41] = 'AD1'; // AdId
  for (const [k, v] of Object.entries(overrides)) cells[Number(k)] = v;
  return cells.join(',');
}

function file(dataRows: string[], start = '2026-07-17', end = '2026-07-17'): string {
  return [`Start Date:,${start},End Date,${end}`, '', '', HEADER, ...dataRows].join('\n');
}

describe('results · CSV y contrato Kevel', () => {
  it('tokeniza CSV con comillas y comas internas', () => {
    const rows = parseCsv('a,"b,c",d\n1,2,3');
    expect(rows[0]).toEqual(['a', 'b,c', 'd']);
    expect(rows[1]).toEqual(['1', '2', '3']);
  });

  it('parsea fechas ISO, DD/MM y MM/DD (desambigua), rechaza inválidas', () => {
    expect(parseKevelDate('2026-07-17')).toBe('2026-07-17');
    expect(parseKevelDate('17/07/2026')).toBe('2026-07-17'); // DD/MM (día 17 > 12)
    expect(parseKevelDate('7/17/2026')).toBe('2026-07-17'); // MM/DD (día 17 > 12)
    expect(parseKevelDate('07-08-2026')).toBe('2026-08-07'); // ambiguo → DD/MM (MX)
    expect(parseKevelDate('31/31/2026')).toBeNull();
  });

  it('valida estructura correcta (metadatos, filas vacías, cabecera 42)', () => {
    const s = validateKevelStructure(parseCsv(file([dataRow()])));
    expect(s.ok).toBe(true);
    expect(s.meta).toEqual({ declaredStart: '2026-07-17', declaredEnd: '2026-07-17' });
    expect(s.dataCells).toHaveLength(1);
  });

  it('rechaza cabecera con columna cambiada de orden', () => {
    const badHeader = [...KEVEL_COLUMNS];
    [badHeader[1], badHeader[2]] = [badHeader[2]!, badHeader[1]!];
    const text = ['Start Date:,2026-07-17,End Date,2026-07-17', '', '', badHeader.join(','), dataRow()].join('\n');
    const s = validateKevelStructure(parseCsv(text));
    expect(s.ok).toBe(false);
    expect(s.issues.some((i) => i.code === 'HEADER_MISMATCH')).toBe(true);
  });

  it('rechaza fila 2 no vacía', () => {
    const text = ['Start Date:,2026-07-17,End Date,2026-07-17', 'basura', '', HEADER, dataRow()].join('\n');
    const s = validateKevelStructure(parseCsv(text));
    expect(s.issues.some((i) => i.code === 'ROW2_NOT_EMPTY')).toBe(true);
  });

  it('rechaza fila con número de columnas incorrecto', () => {
    const text = file([dataRow(), 'solo,tres,valores']);
    const s = validateKevelStructure(parseCsv(text));
    expect(s.issues.some((i) => i.code === 'ROW_COLUMN_COUNT')).toBe(true);
  });
});

describe('results · validación del plan', () => {
  it('archivo válido no bloquea y asigna periodo', () => {
    const plan = buildKevelPlan(file([dataRow()]), PERIODS);
    expect(plan.blocks).toBe(false);
    expect(plan.errorCount).toBe(0);
    expect(plan.enriched[0]!.period_id).toBe('p-2026-07-17');
    expect(plan.periodIds).toEqual(['p-2026-07-17']);
  });

  it('avisa (no bloquea) si el rango declarado no coincide con las fechas reales', () => {
    const plan = buildKevelPlan(file([dataRow()], '2026-07-18', '2026-07-18'), PERIODS);
    expect(plan.blocks).toBe(false);
    expect(plan.issues.some((i) => i.code === 'RANGE_START_MISMATCH' && i.severity === 'warning')).toBe(true);
  });

  it('fecha sin periodo → AVISO fuera de catálogo (no bloquea, no consolida)', () => {
    const plan = buildKevelPlan(file([dataRow({ 0: '2026-06-01' })], '2026-06-01', '2026-06-01'), PERIODS);
    expect(plan.issues.some((i) => i.code === 'DATE_WITHOUT_PERIOD' && i.severity === 'warning')).toBe(true);
    expect(plan.blocks).toBe(false);
    expect(plan.enriched[0]!.period_id).toBe(''); // fuera de catálogo
    const { weekly } = consolidateWeekly(plan.enriched, 'imp1');
    expect(weekly).toHaveLength(0); // no se consolida
  });

  it('agrupa (no bloquea) claves diarias repetidas sumando métricas', () => {
    const plan = buildKevelPlan(file([dataRow(), dataRow()]), PERIODS);
    expect(plan.blocks).toBe(false);
    expect(plan.mergedRows).toBe(1);
    expect(plan.enriched).toHaveLength(1);
    expect(plan.enriched[0]!.row.impressions).toBe(2000); // 1000 + 1000
    expect(plan.enriched[0]!.row.clicks).toBe(20);
    expect(plan.enriched[0]!.ctr).toBeCloseTo(20 / 2000, 10); // recalculado tras agrupar
    expect(plan.issues.some((i) => i.code === 'DUPLICATE_DAILY_KEY_MERGED' && i.severity === 'warning')).toBe(true);
  });

  it('fecha de metadatos ilegible es AVISO (usa el rango real de los datos)', () => {
    // "31/31/2026" es imposible → aviso, no bloqueo; el rango sale de los datos.
    const plan = buildKevelPlan(file([dataRow()], '31/31/2026', '31/31/2026'), PERIODS);
    expect(plan.issues.some((i) => i.code === 'INVALID_META_DATE' && i.severity === 'warning')).toBe(true);
    expect(plan.errorCount).toBe(0);
    expect(plan.actualStartDate).toBe('2026-07-17');
  });

  it('acepta fechas con componente de hora', () => {
    expect(parseKevelDate('2026-07-17 12:00:00 AM')).toBe('2026-07-17');
    expect(parseKevelDate('7/17/2026 00:00')).toBe('2026-07-17');
  });

  it('Zone vacío o ZoneId cero NO genera incidencia', () => {
    const plan = buildKevelPlan(file([dataRow({ 10: '', 40: '0' })]), PERIODS);
    expect(plan.issues.some((i) => i.code === 'ZONE_EMPTY')).toBe(false);
    expect(plan.errorCount).toBe(0);
  });

  it('bloquea CTR que no coincide con clicks/impressions', () => {
    const plan = buildKevelPlan(file([dataRow({ 22: '0.5' })]), PERIODS);
    expect(plan.issues.some((i) => i.code === 'CTR_MISMATCH')).toBe(true);
    expect(plan.blocks).toBe(true);
  });

  it('bloquea Unfiltered Impressions < Impressions y faltante de ID', () => {
    const plan = buildKevelPlan(file([dataRow({ 12: '500', 32: '' })], '2026-07-17', '2026-07-17'), PERIODS);
    expect(plan.issues.some((i) => i.code === 'UNFILTERED_LT_IMPRESSIONS')).toBe(true);
    expect(plan.issues.some((i) => i.code === 'MISSING_REQUIRED_ID')).toBe(true);
    expect(plan.blocks).toBe(true);
  });

  it('advertencia: clics con cero impresiones (no bloquea)', () => {
    const plan = buildKevelPlan(file([dataRow({ 11: '0', 12: '0', 14: '5', 20: '0', 21: '5', 22: '0', 23: '0' })]), PERIODS);
    expect(plan.issues.some((i) => i.code === 'CLICKS_ZERO_IMPRESSIONS' && i.severity === 'warning')).toBe(true);
    expect(plan.errorCount).toBe(0);
  });

  it('advertencia: Date fuera del rango del Flight', () => {
    // Date S30 (24 jul) con Flight que termina el 20 jul.
    const plan = buildKevelPlan(
      file([dataRow({ 0: '2026-07-24', 34: '2026-07-01', 35: '2026-07-20' })], '2026-07-24', '2026-07-24'),
      PERIODS,
    );
    expect(plan.issues.some((i) => i.code === 'DATE_AFTER_FLIGHT' && i.severity === 'warning')).toBe(true);
  });
});

describe('results · consolidación semanal', () => {
  it('suma métricas absolutas, recalcula CTR y reconcilia daily↔weekly', () => {
    // Dos días de la MISMA semana y misma línea → 1 fila semanal.
    const plan = buildKevelPlan(
      file(
        [dataRow({ 0: '2026-07-17', 11: '1000', 14: '10', 20: '8', 12: '1000', 21: '10' }), dataRow({ 0: '2026-07-18', 11: '3000', 14: '20', 20: '12', 12: '3000', 21: '20', 22: '0.006667', 23: '0.004' })],
        '2026-07-17',
        '2026-07-18',
      ),
      PERIODS,
    );
    expect(plan.blocks).toBe(false);
    const { weekly, reconciliation } = consolidateWeekly(plan.enriched, 'imp1');
    expect(weekly).toHaveLength(1);
    const w = weekly[0]!;
    expect(w.impressions).toBe(4000);
    expect(w.clicks).toBe(30);
    expect(w.ctr).toBeCloseTo(30 / 4000, 10); // recalculado, NO promediado
    expect(w.delivery_days).toBe(2);
    expect(w.first_delivery_date).toBe('2026-07-17');
    expect(w.last_delivery_date).toBe('2026-07-18');
    expect(w.source_result_count).toBe(2);
    expect(reconciliation.ok).toBe(true);
  });

  it('separa por periodo: S29 y S30 quedan en filas semanales distintas', () => {
    const plan = buildKevelPlan(
      file(
        [dataRow({ 0: '2026-07-17' }), dataRow({ 0: '2026-07-24' })],
        '2026-07-17',
        '2026-07-24',
      ),
      PERIODS,
    );
    expect(plan.blocks).toBe(false);
    const { weekly } = consolidateWeekly(plan.enriched, 'imp1');
    expect(weekly).toHaveLength(2);
    expect(new Set(weekly.map((w) => w.period_id))).toEqual(new Set(['p-2026-07-17', 'p-2026-07-24']));
  });
});

describe('results · proyección de impresiones (§14)', () => {
  it('estima impresiones con el CTR de CATEGORY BANNER, conservando el real en 0', () => {
    const plan = buildKevelPlan(
      file(
        [
          // CATEGORY BANNER con impresiones reales → unique-CTR ref = 8/1000 = 0.008.
          dataRow({ 8: 'CATEGORY BANNER', 41: 'AD1' }),
          // Fila con unique clicks y CERO impresiones → estimado = round(5 / 0.008) = 625.
          dataRow({ 8: 'CATEGORY BANNER', 11: '0', 12: '0', 14: '5', 20: '5', 21: '5', 22: '0', 23: '0', 41: 'AD2' }),
        ],
        '2026-07-17',
        '2026-07-17',
      ),
      PERIODS,
    );
    expect(plan.blocks).toBe(false);
    const estimated = plan.enriched.find((e) => e.row.ad_id === 'AD2')!;
    expect(estimated.row.impressions).toBe(0); // real intacto
    expect(estimated.impressions_is_estimated).toBe(true);
    expect(estimated.impressions_estimated).toBe(625);
    expect(plan.issues.some((i) => i.code === 'IMPRESSIONS_ESTIMATED')).toBe(true);

    const { weekly } = consolidateWeekly(plan.enriched, 'imp1');
    const wEst = weekly.find((w) => w.ad_id === 'AD2')!;
    expect(wEst.impressions).toBe(0);
    expect(wEst.impressions_estimated).toBe(625);
    expect(wEst.impressions_effective).toBe(625);
  });
});

describe('results · periodos e identidad', () => {
  it('genera semanas viernes→jueves con mes/trimestre del jueves', () => {
    expect(PERIODS[0]).toMatchObject({ code: 'S29', start_date: '2026-07-17', end_date: '2026-07-23', month: 7, quarter: 3 });
    expect(findPeriodForDate('2026-07-20', PERIODS)?.code).toBe('S29');
    expect(findPeriodForDate('2026-07-24', PERIODS)?.code).toBe('S30');
    expect(findPeriodForDate('2026-01-01', PERIODS)).toBeNull();
  });

  it('claves diaria y semanal son deterministas y distintas por dimensión', () => {
    const rowA = mapKevelRow(parseCsv(dataRow())[0]!, 5);
    const rowB = mapKevelRow(parseCsv(dataRow({ 40: 'ZN2' }))[0]!, 5);
    expect(dailyKey(rowA).result_key_hash).toBe(dailyKey(rowA).result_key_hash);
    expect(dailyKey(rowA).result_key_hash).not.toBe(dailyKey(rowB).result_key_hash);
    expect(weeklyKey('p-2026-07-17', rowA).weekly_result_key_hash).not.toBe(
      weeklyKey('p-2026-07-24', rowA).weekly_result_key_hash,
    );
  });
});
