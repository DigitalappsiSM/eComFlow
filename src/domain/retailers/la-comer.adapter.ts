/**
 * Adaptador La Comer (§4–§6). Filas Ekon por artículo y día que se CONSOLIDAN
 * en una sola línea por campaña/artículo/creatividad usando el rango GENERAL de
 * fijación/retirada (identityStrategy = campaign_range). Artículos exclusivos y
 * medidas propias; Sponsored Product no requiere arte.
 */

import { makeDefaultAdapter, normalizeChain } from './default.adapter';
import { findArticleConfig, LA_COMER_ARTICLES } from './measures';
import type { RetailerAdapter } from './types';

export const laComerAdapter: RetailerAdapter = makeDefaultAdapter({
  retailerId: 'la_comer',
  retailerName: 'La Comer',
  aliases: ['LA COMER'],
  matchesChain: (chain) => normalizeChain(chain) === 'la comer',
  articleConfig: (article) => findArticleConfig(LA_COMER_ARTICLES, article),
  // Una línea por campaña/artículo/creatividad usando el rango general.
  identityStrategy: 'campaign_range',
  emailConfig: { siteName: 'La Comer', periodLabel: 'Fechas', materialLeadDays: 2 },
});
