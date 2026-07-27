/**
 * Medidas de artes para el correo Ecommerce.
 *
 * El catálogo vive ahora en la capa de retailer (`domain/retailers/measures`);
 * este módulo solo lo adapta a la forma usada por el correo (App 1/App 2 con
 * relleno "—") para conservar el comportamiento y la API previos.
 */

import {
  ECOMMERCE_ARTICLES,
  findArticleConfig,
  normalizeArticle,
} from '@/domain/retailers/measures';

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

/** Normaliza un nombre de artículo (compat: delega en la capa de retailer). */
export function normalizeArticulo(raw: string | null | undefined): string {
  return normalizeArticle(raw);
}

/**
 * Busca las medidas del artículo en el catálogo ecommerce (Soriana/genérico).
 * Rellena App 1/App 2 con "—" cuando el artículo no las define.
 */
export function lookupMeasures(articulo: string | null | undefined): ArtMeasures {
  const cfg = findArticleConfig(ECOMMERCE_ARTICLES, articulo);
  if (!cfg || !cfg.measures) return EMPTY_MEASURES;
  const m = cfg.measures;
  return {
    desktop: m.desktop,
    mobile: m.mobile,
    app1: m.app1 ?? EM_DASH,
    app2: m.app2 ?? EM_DASH,
  };
}
