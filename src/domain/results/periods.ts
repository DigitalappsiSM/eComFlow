/**
 * Periodos ecommerce (§10, §12). Semanas viernes→jueves. Asignación de una
 * fecha a su periodo y generación del catálogo para sembrado (§2-A).
 *
 * Funciones puras: la persistencia vive en el repositorio.
 */

import { toIsoDate, type IsoDate } from '@/lib/dates';
import type { EcommercePeriod } from '@/types/results';

const DAY_MS = 24 * 60 * 60 * 1000;

function addDays(iso: IsoDate, days: number): IsoDate {
  return toIsoDate(new Date(new Date(`${iso}T00:00:00Z`).getTime() + days * DAY_MS));
}

/** Encuentra el periodo cuyo rango cubre `date` (start <= date <= end). null si ninguno. */
export function findPeriodForDate(
  date: IsoDate,
  periods: readonly EcommercePeriod[],
): EcommercePeriod | null {
  for (const p of periods) {
    if (p.active && p.start_date <= date && date <= p.end_date) return p;
  }
  return null;
}

/**
 * Mes (1..12) y trimestre (1..4) de una fecha del periodo. El reporte digerido
 * real etiqueta cada semana por el mes de su **inicio (viernes)** — no del
 * jueves —, así que se calcula sobre `start_date`.
 */
export function periodMonthQuarter(iso: IsoDate): { year: number; month: number; quarter: number } {
  const [y, m] = iso.split('-').map(Number) as [number, number, number];
  return { year: y, month: m, quarter: Math.floor((m - 1) / 3) + 1 };
}

export interface GeneratePeriodsInput {
  /** Viernes de inicio de la primera semana a generar. */
  anchorFriday: IsoDate;
  /** Número de semana del ancla (p. ej. 29 para "S29"). */
  anchorWeekNumber: number;
  /** Cuántas semanas consecutivas generar. */
  count: number;
}

/**
 * Genera un catálogo de periodos viernes→jueves con código `S##`, incrementando
 * el número de semana. El año/mes/trimestre se toman del jueves (fin) de cada
 * periodo (§12). Determinista.
 */
export function generateEcommercePeriods(input: GeneratePeriodsInput): EcommercePeriod[] {
  const { anchorFriday, anchorWeekNumber, count } = input;
  const periods: EcommercePeriod[] = [];
  for (let i = 0; i < count; i++) {
    const start = addDays(anchorFriday, i * 7);
    const end = addDays(start, 6);
    const weekNumber = anchorWeekNumber + i;
    // Mes/trimestre por el INICIO (viernes), como el reporte digerido real.
    const { year, month, quarter } = periodMonthQuarter(start);
    const code = `S${weekNumber}`;
    periods.push({
      period_id: `p-${start}`,
      code,
      year,
      start_date: start,
      end_date: end,
      month,
      quarter,
      active: true,
    });
  }
  return periods;
}

/** Periodos únicos (por period_id) que cubren un conjunto de fechas, ordenados. */
export function periodsForDates(
  dates: readonly IsoDate[],
  periods: readonly EcommercePeriod[],
): EcommercePeriod[] {
  const byId = new Map<string, EcommercePeriod>();
  for (const d of dates) {
    const p = findPeriodForDate(d, periods);
    if (p) byId.set(p.period_id, p);
  }
  return [...byId.values()].sort((a, b) => a.start_date.localeCompare(b.start_date));
}
