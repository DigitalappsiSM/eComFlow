/**
 * Fechas límite (SLA) por creatividad (§5).
 *
 * Ecommerce general (semana viernes→jueves):
 *  - Preparación a tiempo si TODOS los checks de preparación se completaron
 *    hasta el VIERNES de activación, inclusive.
 *  - Testigos a tiempo si AMBOS se completaron hasta el LUNES inmediato
 *    posterior a ese viernes, inclusive.
 *
 * La Comer (puede iniciar cualquier día):
 *  - Preparación hasta la PRIMERA fecha real de activación de la creatividad,
 *    inclusive.
 *  - Testigos hasta el PRIMER lunes posterior a esa primera activación,
 *    inclusive.
 *
 * Todas las fechas son ISO de calendario; los timestamps de los checks se
 * convierten a fecha de Ciudad de México antes de compararse (ver `time.ts`).
 */

import type { IsoDate } from '@/lib/dates';
import { addDaysIso, dayOfWeekIso } from './time';
import { ecommerceWeekRange } from './weeks';

export interface CreativeDeadlines {
  /** Fecha límite (inclusive) para completar la preparación. */
  preparation: IsoDate;
  /** Fecha límite (inclusive) para completar los testigos (cierre). */
  closing: IsoDate;
}

/**
 * Primer lunes ESTRICTAMENTE posterior a `iso`. Si `iso` ya es lunes, devuelve
 * el lunes de la semana siguiente (posterior, no el mismo día).
 */
export function firstMondayAfter(iso: IsoDate): IsoDate {
  const dow = dayOfWeekIso(iso); // 0=domingo … 6=sábado; lunes = 1
  const delta = ((1 - dow + 7) % 7) || 7;
  return addDaysIso(iso, delta);
}

/**
 * Fechas límite de una creatividad.
 *  - La Comer: contra su primera fecha real de activación.
 *  - Ecommerce general: contra el viernes de la semana de activación.
 */
export function computeDeadlines(input: {
  isLaComer: boolean;
  /** Primera fecha de activación (La Comer) o inicio operativo (general). */
  activationStart: IsoDate;
}): CreativeDeadlines {
  if (input.isLaComer) {
    const preparation = input.activationStart;
    return { preparation, closing: firstMondayAfter(preparation) };
  }
  // Ecommerce general: el viernes de activación es el inicio de la semana
  // (viernes→jueves) que contiene la fecha de activación.
  const friday = ecommerceWeekRange(input.activationStart).start;
  // El lunes inmediato posterior al viernes es viernes + 3 días.
  return { preparation: friday, closing: addDaysIso(friday, 3) };
}

/** ¿Ya venció la fecha límite respecto a `today` (fecha MX)? */
export function isDeadlinePassed(deadline: IsoDate, today: IsoDate): boolean {
  return !!deadline && !!today && deadline < today;
}
