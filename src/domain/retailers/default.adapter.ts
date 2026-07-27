/**
 * Adaptador por defecto (cadenas no reconocidas). Reproduce el comportamiento
 * genérico actual: placement por Cadena+Artículo, identidad por periodo, y el
 * catálogo ecommerce genérico de medidas.
 */

import { normalizeKey, normalizeSlugKey } from '../normalization';
import { parsePeriodo } from '@/schemas/ekon.schema';
import { ECOMMERCE_ARTICLES, findArticleConfig } from './measures';
import { formatDateRange, formatDay } from './period-formatting';
import type {
  FormatContext,
  OperationalPeriod,
  PeriodGranularity,
  RetailerAdapter,
  RetailerArticleConfig,
} from './types';

export function slugPlacementId(chain: string, article: string): string {
  return normalizeSlugKey(`${chain} ${article}`);
}
export function placementDisplayName(chain: string, article: string): string {
  return `${chain.trim()} / ${article.trim()}`;
}

/** Deriva la granularidad de un periodo Ekon a partir del código y las fechas. */
export function derivePeriodGranularity(code: string, start: string, end: string): PeriodGranularity {
  if (start && end && start === end) return 'day';
  const c = code.toUpperCase();
  if (c.startsWith('S')) return 'week';
  if (c.startsWith('C')) return 'fortnight';
  return start && end ? 'custom' : 'custom';
}

/** Convierte el campo Periodo Ekon (+ Periodo Id + fechas generales) a OperationalPeriod. */
export function toOperationalPeriod(input: {
  rawPeriod: string;
  periodId: string;
  fixationDate: string;
  removalDate: string;
}): OperationalPeriod {
  const parsed = parsePeriodo(input.rawPeriod);
  const start = parsed.inicioIso || input.fixationDate || '';
  const end = parsed.finIso || input.removalDate || '';
  const granularity = derivePeriodGranularity(parsed.codigo, start, end);
  return {
    original: parsed.original || input.rawPeriod || '',
    code: parsed.codigo || null,
    granularity,
    start,
    end,
  };
}

export function formatOperationalPeriod(period: OperationalPeriod, context: FormatContext): string {
  if (period.granularity === 'day') return formatDay(period.start);
  const range = formatDateRange(period.start, period.end);
  if ((context === 'table' || context === 'dashboard') && period.code) {
    return `${period.code} · ${range}`;
  }
  return range;
}

export function makeDefaultAdapter(overrides: Partial<RetailerAdapter> = {}): RetailerAdapter {
  return {
    retailerId: 'default',
    retailerName: 'Genérico',
    aliases: [],
    matchesChain: () => false,
    resolvePlacement: ({ chain, article }) => ({
      placementId: slugPlacementId(chain, article),
      placementName: placementDisplayName(chain, article),
    }),
    parsePeriod: toOperationalPeriod,
    articleConfig: (article): RetailerArticleConfig | null => findArticleConfig(ECOMMERCE_ARTICLES, article),
    identityStrategy: 'period_range',
    formatPeriod: formatOperationalPeriod,
    emailConfig: { siteName: 'Retail Media', periodLabel: 'Periodo', materialLeadDays: 2 },
    ...overrides,
  };
}

export const defaultRetailerAdapter: RetailerAdapter = makeDefaultAdapter();

/** Normaliza una cadena para comparaciones de retailer (sin acentos/espacios/mayúsculas). */
export function normalizeChain(chain: string | null | undefined): string {
  return normalizeKey(chain ?? '');
}
