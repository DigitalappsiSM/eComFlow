/**
 * Catálogos de medidas por retailer (movidos fuera de la UI, §3/§16).
 *
 * - `ECOMMERCE_ARTICLES`: catálogo Soriana/genérico actual (mismas medidas que
 *   antes vivían en `ecommerceMeasures.ts`), reexpresado como
 *   `RetailerArticleConfig` para el adaptador.
 * - `LA_COMER_ARTICLES`: catálogo exclusivo de La Comer.
 *
 * La búsqueda es tolerante (mayúsculas, acentos, signos) y por subcadena de
 * palabra clave, igual que la lógica previa, para no cambiar resultados.
 */

import type { RetailerArticleConfig } from './types';

const EM_DASH = '—';

/** Normaliza un nombre de artículo para búsqueda tolerante (mayúsculas, sin acentos/signos). */
export function normalizeArticle(raw: string | null | undefined): string {
  return (raw ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function creative(article: string, aliases: string[], measures: RetailerArticleConfig['measures']): RetailerArticleConfig {
  return { article, aliases, requirementType: 'creative', measures, requiresArtCheck: true };
}

/**
 * Catálogo Soriana / genérico ecommerce (orden: más específico primero).
 * Los valores replican EXACTAMENTE el catálogo previo para conservar resultados.
 */
export const ECOMMERCE_ARTICLES: readonly RetailerArticleConfig[] = [
  creative('CATEGORY MEDIA WEB', ['CATEGORY MEDIA WEB', 'CATEGORY MEDIA'], { desktop: '1920 x 260', mobile: '640 x 243', app1: '578x186', app2: EM_DASH }),
  creative('CATEGORY LANDING', ['CATEGORY LANDING'], { desktop: '1920x640', mobile: '640x612', app1: '375 X 213', app2: EM_DASH }),
  creative('CATEGORY BANNER', ['CATEGORY BANNER'], { desktop: '1920 x 259', mobile: '640 x 242', app1: '375 x 213', app2: '320 x 93' }),
  creative('HOME SLIDER', ['HOME SLIDER'], { desktop: '1920x640', mobile: '640x520', app1: '640x520', app2: EM_DASH }),
  creative('HOME CENTRAL', ['HOME CENTRAL'], { desktop: '1920 x 260', mobile: '640 x 243', app1: '578x187', app2: EM_DASH }),
  // "Home secundario" del negocio llega como artículo "HOME BANNER".
  creative('HOME SECUNDARIO', ['HOME SECUNDARIO', 'HOME BANNER'], { desktop: '1920x344', mobile: '640x242', app1: '289 x 93', app2: EM_DASH }),
  creative('PACK PROMOS', ['PACK PROMOS', 'FOLLETOS', 'OFERTAS'], { desktop: '1920x259', mobile: '640x242', app1: '578x186', app2: EM_DASH }),
  creative('SEARCH BANNER', ['SEARCH BANNER'], { desktop: '1920 x 259', mobile: '640 x 242', app1: '320 x 93', app2: EM_DASH }),
  creative('MIS LISTAS', ['MIS LISTAS'], { desktop: '1920x259', mobile: '640x242', app1: '578x186', app2: EM_DASH }),
  creative('BUNDLE BOOST', ['BUNDLE BOOST', 'BUNDLE SEARCH'], { desktop: '240 x 410', mobile: '430 x 281', app1: '254x380', app2: EM_DASH }),
];

const SPONSORED_PRODUCT_DELIVERABLE = 'Listado de productos/SKUs requerido para la configuración.';

/** Catálogo exclusivo de La Comer (§4). Sin medidas App: se muestra "—". */
export const LA_COMER_ARTICLES: readonly RetailerArticleConfig[] = [
  creative('CARRUSEL HOME', ['CARRUSEL HOME'], { desktop: '1920 x 375', mobile: '800 x 400' }),
  creative('DEPARTAMENTO', ['DEPARTAMENTO'], { desktop: '1920 x 200', mobile: '800 x 400' }),
  creative('DESTACADOS HOME', ['DESTACADOS HOME'], { desktop: '570 x 375', mobile: '800 x 500' }),
  {
    article: 'SPONSORED PRODUCT',
    aliases: ['SPONSORED PRODUCT'],
    requirementType: 'data',
    measures: { desktop: 'No requiere arte', mobile: 'No requiere arte' },
    deliverable: SPONSORED_PRODUCT_DELIVERABLE,
    requiresArtCheck: false,
  },
];

/** Busca la config de un artículo en un catálogo (coincidencia por subcadena de alias). */
export function findArticleConfig(
  catalog: readonly RetailerArticleConfig[],
  article: string | null | undefined,
): RetailerArticleConfig | null {
  const norm = normalizeArticle(article);
  if (norm === '') return null;
  for (const entry of catalog) {
    if (entry.aliases.some((kw) => norm.includes(normalizeArticle(kw)))) return entry;
  }
  return null;
}
