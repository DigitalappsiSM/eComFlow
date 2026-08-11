/**
 * Modelo del Dashboard de Avance Operativo Ecommerce.
 *
 * La unidad de medición es cada CREATIVIDAD (no la campaña ni el periodo
 * diario). Para La Comer, las líneas diarias se consolidan en memoria en una
 * sola creatividad (ver `consolidation.ts`); para el resto, cada línea es una
 * creatividad.
 */

import type { CheckKey, CheckValues } from '@/domain/progress';

/** Valor de un check con el instante (epoch ms) de su última actualización. */
export interface RawCheck {
  value: boolean;
  /** epoch ms del `updated_at` específico del check, o null si no existe. */
  updatedAtMs: number | null;
}

/**
 * Línea operativa cruda para el dashboard (proyección desde `campaign_lines`
 * unida con su `campaign_operations`). Desacoplada de Firestore: los timestamps
 * llegan ya como epoch ms para que la consolidación sea pura y testable.
 */
export interface RawDashboardLine {
  campaignLineId: string;
  campaignSpaceId: string;
  campaignGroupId: string;
  clienteKey: string;
  clienteOriginal: string;
  numeroCampana: string;
  placementId: string;
  placementNameSnapshot: string | null;
  creatividadIdKey: string;
  creatividadIdOriginal: string;
  cadena: string | null;
  tipoOperacion: string | null;
  retailerId: string | null;
  // Ventana / activaciones (multi-retailer).
  activationDates: string[] | null;
  activationStart: string | null;
  activationEnd: string | null;
  periodoOriginal: string | null;
  periodoInicio: string | null;
  periodoFin: string | null;
  fechaFijacion: string;
  fechaRetirada: string;
  cancelled: boolean;
  // Operación (checks).
  checks: Partial<Record<CheckKey, RawCheck>>;
  operationUpdatedAtMs: number | null;
}

/** Creatividad normalizada: unidad de medición del dashboard. */
export interface DashboardCreative {
  /** Identidad estable de la creatividad (clave de consolidación). */
  id: string;
  /** Línea representativa (para abrir el drill-down puntual). */
  campaignLineId: string;
  /** Todas las líneas fuente (La Comer histórico: historial y drill-down). */
  legacyLineIds: string[];
  clienteKey: string;
  clienteOriginal: string;
  campaignGroupId: string;
  numeroCampana: string;
  placementId: string;
  article: string;
  creatividadIdKey: string;
  creatividadIdOriginal: string;
  cadena: string | null;
  tipoOperacion: string | null;
  retailerId: string | null;
  isLaComer: boolean;
  cancelled: boolean;
  /** Fechas de activación consolidadas (ISO, únicas, ordenadas). */
  activationDates: string[];
  /** Primera fecha de activación / inicio operativo. */
  activationStart: string;
  /** Última fecha de activación / fin operativo. */
  activationEnd: string;
  /** Checks consolidados (valor de la actualización más reciente por check). */
  checks: CheckValues;
  /** Fecha (MX) en que quedó completo cada check completado. */
  checkDates: Partial<Record<CheckKey, string>>;
  applicablePrep: CheckKey[];
  applicableClosing: CheckKey[];
  applicableAll: CheckKey[];
}
