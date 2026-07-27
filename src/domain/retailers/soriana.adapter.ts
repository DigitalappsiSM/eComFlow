/**
 * Adaptador Soriana: conserva el comportamiento actual (periodos semanales/
 * catorcenales, identidad por periodo, catálogo de medidas ecommerce con App 1/
 * App 2, correo Soriana.com). No cambia IDs existentes.
 */

import { makeDefaultAdapter, normalizeChain } from './default.adapter';
import { ECOMMERCE_ARTICLES, findArticleConfig } from './measures';
import type { RetailerAdapter } from './types';

export const sorianaAdapter: RetailerAdapter = makeDefaultAdapter({
  retailerId: 'soriana',
  retailerName: 'Soriana',
  aliases: ['SORIANA', 'SORIANA.COM'],
  matchesChain: (chain) => normalizeChain(chain).includes('soriana'),
  articleConfig: (article) => findArticleConfig(ECOMMERCE_ARTICLES, article),
  identityStrategy: 'period_range',
  emailConfig: { siteName: 'Soriana.com', periodLabel: 'Periodo', materialLeadDays: 2 },
});
