/**
 * Ventana operativa universal para filtrar por rango de fechas (§12).
 *
 * Regla única (activación → periodo → fijación/retirada) y cruce de rangos:
 * una línea "toca" [from, to] si empieza en/antes de `to` y termina en/después
 * de `from`. No exige que la línea esté totalmente contenida en el rango.
 */

import type { CampaignLine } from '@/types/campaign';

export interface DateWindow {
  start: string;
  end: string;
}

type WindowFields = Pick<
  CampaignLine,
  'activation_start' | 'activation_end' | 'periodo_inicio' | 'periodo_fin' | 'fecha_fijacion' | 'fecha_retirada'
>;

/** Ventana operativa de una CampaignLine: activación → periodo → fijación/retirada. */
export function campaignLineWindow(line: WindowFields): DateWindow {
  return {
    start: line.activation_start ?? line.periodo_inicio ?? line.fecha_fijacion ?? '',
    end: line.activation_end ?? line.periodo_fin ?? line.fecha_retirada ?? '',
  };
}

/**
 * ¿La ventana cruza el rango [from, to]? Rangos vacíos no filtran:
 *  - ambos vacíos → true;
 *  - solo `from` → termina en/después de `from`;
 *  - solo `to` → empieza en/antes de `to`.
 */
export function windowIntersects(win: DateWindow, from: string, to: string): boolean {
  if (from && win.end && win.end < from) return false;
  if (to && win.start && win.start > to) return false;
  return true;
}

/** ¿El rango es inválido (Desde > Hasta)? */
export function isInvalidRange(from: string, to: string): boolean {
  return !!from && !!to && from > to;
}
