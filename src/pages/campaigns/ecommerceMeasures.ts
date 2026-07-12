/**
 * Catálogo FIJO de medidas de artes para operativa Ecommerce.
 *
 * Las medidas NO provienen de `campaign_line_requirements` ni de datos
 * dinámicos: son un catálogo local por artículo. La búsqueda es tolerante a
 * variaciones (mayúsculas, acentos, espacios, signos, niveles N1/N2/N3, etc.).
 *
 * Los valores se guardan TAL CUAL el catálogo de negocio (algunos con espacios
 * alrededor de la "x" y otros sin ellos), para que coincidan con lo esperado.
 */

const EM_DASH = '—';

export interface ArtMeasures {
  desktop: string;
  mobile: string;
  app1: string;
  app2: string;
}

export const EMPTY_MEASURES: ArtMeasures = {
  desktop: EM_DASH,
  mobile: EM_DASH,
  app1: EM_DASH,
  app2: EM_DASH,
};

interface MeasureEntry {
  /** Palabras clave (ya normalizadas) que identifican el artículo. */
  keywords: string[];
  measures: ArtMeasures;
}

/**
 * Normaliza un nombre de artículo para la búsqueda tolerante:
 * mayúsculas, sin acentos, sin signos, sin espacios duplicados.
 */
export function normalizeArticulo(raw: string | null | undefined): string {
  return (raw ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Orden: entradas más específicas primero para evitar coincidencias erróneas.
const CATALOG: MeasureEntry[] = [
  {
    keywords: ['CATEGORY MEDIA WEB', 'CATEGORY MEDIA'],
    measures: { desktop: '1920 x 260', mobile: '640 x 243', app1: '578x186', app2: EM_DASH },
  },
  {
    keywords: ['CATEGORY LANDING'],
    measures: { desktop: '1920x640', mobile: '640x612', app1: '375 X 213', app2: EM_DASH },
  },
  {
    keywords: ['CATEGORY BANNER'],
    measures: { desktop: '1920 x 259', mobile: '640 x 242', app1: '375 x 213', app2: '320 x 93' },
  },
  {
    keywords: ['HOME SLIDER'],
    measures: { desktop: '1920x640', mobile: '640x520', app1: '640x520', app2: EM_DASH },
  },
  {
    keywords: ['HOME CENTRAL'],
    measures: { desktop: '1920 x 260', mobile: '640 x 243', app1: '578x187', app2: EM_DASH },
  },
  {
    keywords: ['HOME SECUNDARIO'],
    measures: { desktop: '1920x344', mobile: '640x242', app1: '289 x 93', app2: EM_DASH },
  },
  {
    keywords: ['PACK PROMOS', 'FOLLETOS', 'OFERTAS'],
    measures: { desktop: '1920x259', mobile: '640x242', app1: '578x186', app2: EM_DASH },
  },
  {
    keywords: ['SEARCH BANNER'],
    measures: { desktop: '1920 x 259', mobile: '640 x 242', app1: '320 x 93', app2: EM_DASH },
  },
  {
    keywords: ['MIS LISTAS'],
    measures: { desktop: '1920x259', mobile: '640x242', app1: '578x186', app2: EM_DASH },
  },
  {
    keywords: ['BUNDLE BOOST', 'BUNDLE SEARCH'],
    measures: { desktop: '240 x 410', mobile: '430 x 281', app1: '254x380', app2: EM_DASH },
  },
];

/**
 * Busca las medidas del artículo en el catálogo fijo. Si no encuentra
 * coincidencia, devuelve `EMPTY_MEASURES` (todas las columnas en "—").
 */
export function lookupMeasures(articulo: string | null | undefined): ArtMeasures {
  const norm = normalizeArticulo(articulo);
  if (norm === '') return EMPTY_MEASURES;
  for (const entry of CATALOG) {
    if (entry.keywords.some((kw) => norm.includes(kw))) return entry.measures;
  }
  return EMPTY_MEASURES;
}
