/**
 * Contrato de adaptadores por retailer (multi-retailer).
 *
 * Cada cadena/retailer (Soriana, La Comer, …) encapsula aquí sus reglas
 * particulares: resolución de placement, parseo/formateo de periodo, catálogo
 * de medidas por artículo, estrategia de identidad y configuración de correo.
 * Las condiciones específicas NO deben dispersarse por componentes/repos.
 */

export type PeriodGranularity = 'day' | 'week' | 'fortnight' | 'month' | 'custom';

export interface OperationalPeriod {
  /** Texto original del campo Periodo (auditoría). */
  original: string;
  /** Código corto ("S29", "C16") o null si no aplica. */
  code: string | null;
  granularity: PeriodGranularity;
  /** Inicio ISO (YYYY-MM-DD) del periodo. */
  start: string;
  /** Fin ISO (YYYY-MM-DD) del periodo. */
  end: string;
}

export interface ArtMeasures {
  desktop: string;
  mobile: string;
  app1?: string;
  app2?: string;
}

export interface RetailerArticleConfig {
  /** Nombre canónico del artículo (p. ej. "CARRUSEL HOME"). */
  article: string;
  /** Alias/variantes reconocidas (normalizadas). */
  aliases: readonly string[];
  /** 'creative' = requiere piezas gráficas; 'data' = requiere datos (SKUs). */
  requirementType: 'creative' | 'data';
  /** Medidas de arte, o null cuando no requiere arte (p. ej. Sponsored Product). */
  measures: ArtMeasures | null;
  /** Entregable no gráfico (p. ej. listado de SKUs). */
  deliverable?: string;
  /** ¿El check "Artes" es obligatorio para este artículo? */
  requiresArtCheck: boolean;
}

export type IdentityStrategy = 'period_range' | 'campaign_range';

export type FormatContext = 'table' | 'filter' | 'dashboard' | 'email';

export interface RetailerAdapter {
  retailerId: string;
  retailerName: string;
  aliases: readonly string[];

  /** ¿Esta cadena corresponde a este retailer? (recibe la cadena normalizada). */
  matchesChain(chain: string): boolean;

  resolvePlacement(input: { chain: string; article: string }): {
    placementId: string;
    placementName: string;
  };

  parsePeriod(input: {
    rawPeriod: string;
    periodId: string;
    fixationDate: string;
    removalDate: string;
  }): OperationalPeriod;

  /** Config del artículo (medidas, tipo de requisito, check de artes). null si no está catalogado. */
  articleConfig(article: string): RetailerArticleConfig | null;

  /**
   * period_range: la identidad separa por periodo (Soriana).
   * campaign_range: una sola línea por campaña/artículo/creatividad usando el
   * rango GENERAL de fijación/retirada, consolidando las filas diarias (La Comer).
   */
  identityStrategy: IdentityStrategy;

  formatPeriod(period: OperationalPeriod, context: FormatContext): string;

  emailConfig: {
    siteName: string;
    periodLabel: string;
    materialLeadDays: number;
  };
}
