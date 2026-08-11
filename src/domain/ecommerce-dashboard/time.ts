/**
 * Zona horaria operativa Ecommerce (§5, §12).
 *
 * Toda comparación de fechas límite (fijación, testigos) se hace en
 * `America/Mexico_City`. Las fechas de negocio (fijación, retirada, periodo)
 * ya viven como ISO `YYYY-MM-DD` (fecha de calendario, sin hora), así que se
 * comparan directamente. Los timestamps de los checks (`updated_at`) sí llevan
 * hora: se convierten a la fecha de calendario de Ciudad de México antes de
 * comparar contra la fecha límite.
 */

import type { IsoDate } from '@/lib/dates';

export const MEXICO_CITY_TIME_ZONE = 'America/Mexico_City';

const MX_DATE_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: MEXICO_CITY_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Fecha de calendario (`YYYY-MM-DD`) de un instante en `America/Mexico_City`.
 * Acepta epoch en ms o un `Date`. Usa la base horaria histórica real (Intl),
 * no un offset fijo, para no equivocarse con fechas anteriores a 2023.
 */
export function mexicoCityDate(instant: Date | number): IsoDate {
  const date = typeof instant === 'number' ? new Date(instant) : instant;
  // en-CA rinde el formato ISO `YYYY-MM-DD`.
  return MX_DATE_FORMAT.format(date);
}

const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Suma (o resta) días de calendario a una fecha ISO. Devuelve "" si no es ISO. */
export function addDaysIso(iso: IsoDate, days: number): IsoDate {
  if (!ISO_RE.test(iso)) return '';
  const base = new Date(`${iso}T00:00:00Z`).getTime();
  return new Date(base + days * DAY_MS).toISOString().slice(0, 10);
}

/** Día de la semana de una fecha ISO. 0=domingo … 6=sábado. */
export function dayOfWeekIso(iso: IsoDate): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}
