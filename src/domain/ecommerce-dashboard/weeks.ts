/**
 * Ventanas semanales Ecommerce (§3).
 *
 * La operación Ecommerce general usa semanas de VIERNES a JUEVES. El dashboard
 * muestra siempre cuatro tarjetas: semana anterior, actual, próxima y la
 * segunda posterior; la actual queda seleccionada por defecto.
 */

import { getWeekRange, type DateRange, type IsoDate } from '@/lib/dates';
import { addDaysIso } from './time';

/** Día de inicio de la semana operativa Ecommerce: viernes. */
export const ECOMMERCE_WEEK_START_DAY = 5;

export type WeekSlot = 'previous' | 'current' | 'next' | 'secondNext';

export interface DashboardWeek {
  slot: WeekSlot;
  label: string;
  /** Viernes de inicio (ISO). */
  start: IsoDate;
  /** Jueves de fin (ISO). */
  end: IsoDate;
}

const SLOT_LABEL: Record<WeekSlot, string> = {
  previous: 'Semana anterior',
  current: 'Semana actual',
  next: 'Próxima semana',
  secondNext: 'Segunda semana',
};

const SLOT_OFFSET: Record<WeekSlot, number> = {
  previous: -7,
  current: 0,
  next: 7,
  secondNext: 14,
};

/** Rango de la semana Ecommerce (viernes→jueves) que contiene `iso`. */
export function ecommerceWeekRange(iso: IsoDate): DateRange {
  return getWeekRange(iso, ECOMMERCE_WEEK_START_DAY);
}

/**
 * Las cuatro ventanas alrededor de `today`: anterior, actual, próxima y
 * segunda posterior. Todas de siete días (viernes→jueves).
 */
export function computeFourWeeks(today: IsoDate): DashboardWeek[] {
  const current = ecommerceWeekRange(today);
  return (Object.keys(SLOT_OFFSET) as WeekSlot[]).map((slot) => {
    const start = addDaysIso(current.start, SLOT_OFFSET[slot]);
    return { slot, label: SLOT_LABEL[slot], start, end: addDaysIso(start, 6) };
  });
}

/** ¿La fecha ISO cae dentro de la semana [start, end] (inclusive)? */
export function isWithinWeek(iso: IsoDate, week: { start: IsoDate; end: IsoDate }): boolean {
  return !!iso && iso >= week.start && iso <= week.end;
}

/** ¿La ventana [start,end] cruza la semana [week.start, week.end]? */
export function windowOverlapsWeek(
  window: { start: IsoDate; end: IsoDate },
  week: { start: IsoDate; end: IsoDate },
): boolean {
  if (!window.start || !window.end) return false;
  return window.start <= week.end && window.end >= week.start;
}
