/**
 * Evolución histórica de avance (§9).
 *
 * Construye la serie diaria de avance (preparación y total) de una creatividad
 * desde el LUNES anterior a su activación hasta el lunes límite de testigos,
 * a partir de eventos de `change_history` (cambios de check) y las fechas MX de
 * los checks. No inventa datos anteriores a los eventos disponibles: si no hay
 * historial suficiente, `insufficient` queda en `true`.
 */

import type { IsoDate } from '@/lib/dates';
import type { CheckKey } from '@/domain/progress';
import { addDaysIso, dayOfWeekIso } from './time';
import { deadlinesFor } from './status';
import type { DashboardCreative } from './types';

/** Evento mínimo de historial: un check cambió de valor en una fecha (MX). */
export interface CheckHistoryEvent {
  check: CheckKey;
  value: boolean;
  /** Fecha de calendario MX del evento (`YYYY-MM-DD`). */
  date: IsoDate;
}

export interface SeriesPoint {
  date: IsoDate;
  preparationPct: number;
  totalPct: number;
}

export interface CreativeSeries {
  points: SeriesPoint[];
  /** No hay eventos de historial suficientes para reconstruir la evolución. */
  insufficient: boolean;
}

/** Lunes anterior o igual a `iso`. */
function mondayOnOrBefore(iso: IsoDate): IsoDate {
  const dow = dayOfWeekIso(iso); // 0=domingo … 6=sábado
  const delta = (dow + 6) % 7; // días desde el lunes anterior
  return addDaysIso(iso, -delta);
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/**
 * Serie diaria de avance de una creatividad. Recorre los días desde el lunes
 * previo a la activación hasta el lunes límite de testigos, acumulando los
 * checks completados según sus eventos de historial (ordenados por fecha).
 */
export function buildCreativeSeries(
  creative: DashboardCreative,
  events: readonly CheckHistoryEvent[],
): CreativeSeries {
  const deadlines = deadlinesFor(creative);
  const from = mondayOnOrBefore(creative.activationStart);
  const to = deadlines.closing || creative.activationEnd || creative.activationStart;
  if (!from || !to || from > to) {
    return { points: [], insufficient: events.length === 0 };
  }

  const prepSet = new Set<CheckKey>(creative.applicablePrep);
  const allSet = new Set<CheckKey>(creative.applicableAll);
  const prepTotal = creative.applicablePrep.length;
  const allTotal = creative.applicableAll.length;

  const sorted = [...events].filter((e) => allSet.has(e.check)).sort((a, b) => a.date.localeCompare(b.date));

  const points: SeriesPoint[] = [];
  const done = new Set<CheckKey>();
  let idx = 0;
  let cur = from;
  for (let i = 0; i < 400 && cur <= to; i += 1) {
    while (idx < sorted.length && sorted[idx]!.date <= cur) {
      const ev = sorted[idx]!;
      if (ev.value) done.add(ev.check);
      else done.delete(ev.check);
      idx += 1;
    }
    let prepDone = 0;
    let allDone = 0;
    for (const k of done) {
      if (prepSet.has(k)) prepDone += 1;
      if (allSet.has(k)) allDone += 1;
    }
    points.push({
      date: cur,
      preparationPct: prepTotal === 0 ? 100 : round1((prepDone / prepTotal) * 100),
      totalPct: allTotal === 0 ? 100 : round1((allDone / allTotal) * 100),
    });
    cur = addDaysIso(cur, 1);
  }

  return { points, insufficient: sorted.length === 0 };
}

/**
 * Eventos de historial reconstruidos desde las fechas (MX) de los checks
 * completados de la creatividad. Usa los timestamps reales de los checks
 * (`checks.<key>.updated_at`), sin inventar datos.
 */
export function eventsFromCreative(creative: DashboardCreative): CheckHistoryEvent[] {
  return Object.entries(creative.checkDates)
    .filter(([, date]) => !!date)
    .map(([check, date]) => ({ check: check as CheckKey, value: true, date: date as IsoDate }));
}

export interface AggregateSeriesPoint {
  date: IsoDate;
  preparationPct: number;
  totalPct: number;
  creatives: number;
}

export interface AggregateSeries {
  points: AggregateSeriesPoint[];
  insufficient: boolean;
}

/**
 * Evolución diaria AGREGADA (promedio de avance) de un conjunto de
 * creatividades, entre el lunes previo a la primera activación y el mayor lunes
 * límite. Si ninguna creatividad tiene checks con fecha, marca `insufficient`.
 */
export function buildAggregateSeries(creatives: readonly DashboardCreative[]): AggregateSeries {
  if (creatives.length === 0) return { points: [], insufficient: true };

  const series = creatives.map((c) => ({
    creative: c,
    series: buildCreativeSeries(c, eventsFromCreative(c)),
  }));

  const dateSet = new Set<IsoDate>();
  for (const s of series) for (const p of s.series.points) dateSet.add(p.date);
  const dates = [...dateSet].sort();

  // Índice rápido fecha→punto por creatividad (mantiene el último valor conocido).
  const points: AggregateSeriesPoint[] = dates.map((date) => {
    let prepSum = 0;
    let totalSum = 0;
    let n = 0;
    for (const s of series) {
      // Último punto con fecha ≤ date (avance acumulado hasta ese día).
      let last: SeriesPoint | undefined;
      for (const p of s.series.points) {
        if (p.date <= date) last = p;
        else break;
      }
      if (last) {
        prepSum += last.preparationPct;
        totalSum += last.totalPct;
        n += 1;
      }
    }
    return {
      date,
      preparationPct: n === 0 ? 0 : Math.round((prepSum / n) * 10) / 10,
      totalPct: n === 0 ? 0 : Math.round((totalSum / n) * 10) / 10,
      creatives: n,
    };
  });

  const insufficient = series.every((s) => s.series.insufficient);
  return { points, insufficient };
}
