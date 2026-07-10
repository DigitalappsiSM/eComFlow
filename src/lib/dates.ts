/**
 * Fechas (§10, §17, §37).
 *
 * - Formato autorizado de ENTRADA: `DD/MM/YYYY` (contexto MX del mockup) o
 *   ISO `YYYY-MM-DD`. Cualquier otro formato se RECHAZA — no se interpreta ni
 *   se adivina (§17).
 * - Formato canónico de ALMACENAMIENTO: ISO `YYYY-MM-DD` (fecha sin hora).
 * - Regla de cruce de periodo (§37): activa si
 *   `fecha_fijacion <= fin_periodo` y `fecha_retirada >= inicio_periodo`.
 * - Semana configurable; por defecto viernes→jueves (§37).
 */

/** Fecha ISO sin hora, e.g. "2026-07-17". */
export type IsoDate = string;

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DMY_RE = /^(\d{2})\/(\d{2})\/(\d{4})$/;

export interface ParseDateOk {
  ok: true;
  value: IsoDate;
}
export interface ParseDateError {
  ok: false;
  reason: string;
}
export type ParseDateResult = ParseDateOk | ParseDateError;

function isRealCalendarDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

/**
 * Interpreta una fecha en formato autorizado y la devuelve como ISO.
 * No corrige, no completa, no adivina: si el formato no coincide o la fecha
 * no existe en el calendario, devuelve `{ ok: false, reason }`.
 */
export function parseStrictDate(raw: string): ParseDateResult {
  const value = raw.trim();
  if (value === '') return { ok: false, reason: 'Fecha vacía.' };

  let y: number;
  let m: number;
  let d: number;

  const iso = ISO_RE.exec(value);
  const dmy = DMY_RE.exec(value);

  if (iso) {
    y = Number(iso[1]);
    m = Number(iso[2]);
    d = Number(iso[3]);
  } else if (dmy) {
    d = Number(dmy[1]);
    m = Number(dmy[2]);
    y = Number(dmy[3]);
  } else {
    return {
      ok: false,
      reason: 'Formato de fecha no autorizado. Use DD/MM/YYYY o YYYY-MM-DD.',
    };
  }

  if (!isRealCalendarDate(y, m, d)) {
    return { ok: false, reason: 'La fecha no existe en el calendario.' };
  }

  return {
    ok: true,
    value: `${y.toString().padStart(4, '0')}-${m
      .toString()
      .padStart(2, '0')}-${d.toString().padStart(2, '0')}`,
  };
}

/** Convierte un `Date` a ISO `YYYY-MM-DD` en UTC. */
export function toIsoDate(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

/** ISO de hoy (útil para estados calculados; inyectable en pruebas). */
export function todayIso(now: Date = new Date()): IsoDate {
  return toIsoDate(now);
}

/** Rango de fechas inclusivo (ambos ISO). */
export interface DateRange {
  start: IsoDate;
  end: IsoDate;
}

/**
 * Regla de cruce de periodo (§37). Compara cadenas ISO lexicográficamente,
 * lo cual es equivalente a comparar fechas.
 */
export function periodOverlaps(
  fechaFijacion: IsoDate,
  fechaRetirada: IsoDate,
  period: DateRange,
): boolean {
  return fechaFijacion <= period.end && fechaRetirada >= period.start;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function addDays(iso: IsoDate, days: number): IsoDate {
  const base = new Date(`${iso}T00:00:00Z`).getTime();
  return toIsoDate(new Date(base + days * DAY_MS));
}

/**
 * Rango de la semana que contiene `iso`, con día de inicio configurable.
 * Por defecto la semana va de viernes (5) a jueves (§37).
 * `weekStartDay`: 0=domingo … 6=sábado.
 */
export function getWeekRange(iso: IsoDate, weekStartDay = 5): DateRange {
  const dow = new Date(`${iso}T00:00:00Z`).getUTCDay();
  const diff = (dow - weekStartDay + 7) % 7;
  const start = addDays(iso, -diff);
  return { start, end: addDays(start, 6) };
}

/** Rango del mes que contiene `iso`. */
export function getMonthRange(iso: IsoDate): DateRange {
  const [y, m] = iso.split('-').map(Number);
  const start = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  return { start, end: `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}` };
}

/** Rango del trimestre natural que contiene `iso`. */
export function getQuarterRange(iso: IsoDate): DateRange {
  const [y, m] = iso.split('-').map(Number);
  const q = Math.floor((m! - 1) / 3);
  const startMonth = q * 3 + 1;
  const endMonth = startMonth + 2;
  const lastDay = new Date(Date.UTC(y!, endMonth, 0)).getUTCDate();
  return {
    start: `${y}-${String(startMonth).padStart(2, '0')}-01`,
    end: `${y}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
  };
}
