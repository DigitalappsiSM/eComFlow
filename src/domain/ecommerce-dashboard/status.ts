/**
 * Estados operativos por creatividad (§7).
 *
 *  - sin_iniciar
 *  - en_preparacion
 *  - lista_para_activacion   (preparación completa, aún sin activar/testigos)
 *  - lista_con_retraso       (lista pero la preparación se cerró tarde)
 *  - en_ventana_testigos     (activada, dentro del plazo de testigos)
 *  - testigos_vencidos       (venció el plazo de testigos sin completarlos)
 *  - cerrada_a_tiempo
 *  - cerrada_con_retraso
 *
 * Una creatividad futura con preparación completa se muestra como
 * "Lista para activación", no simplemente como "Futura".
 */

import type { IsoDate } from '@/lib/dates';
import type { CheckKey } from '@/domain/progress';
import { computeCreativeProgress, isStageComplete } from './progress';
import { computeDeadlines, isDeadlinePassed, type CreativeDeadlines } from './deadlines';
import type { DashboardCreative } from './types';

export type OperationalStatus =
  | 'sin_iniciar'
  | 'en_preparacion'
  | 'lista_para_activacion'
  | 'lista_con_retraso'
  | 'en_ventana_testigos'
  | 'testigos_vencidos'
  | 'cerrada_a_tiempo'
  | 'cerrada_con_retraso';

export const STATUS_LABELS: Record<OperationalStatus, string> = {
  sin_iniciar: 'Sin iniciar',
  en_preparacion: 'En preparación',
  lista_para_activacion: 'Lista para activación',
  lista_con_retraso: 'Lista con retraso',
  en_ventana_testigos: 'En ventana de testigos',
  testigos_vencidos: 'Testigos vencidos',
  cerrada_a_tiempo: 'Cerrada a tiempo',
  cerrada_con_retraso: 'Cerrada con retraso',
};

export const ALL_STATUSES: readonly OperationalStatus[] = [
  'sin_iniciar',
  'en_preparacion',
  'lista_para_activacion',
  'lista_con_retraso',
  'en_ventana_testigos',
  'testigos_vencidos',
  'cerrada_a_tiempo',
  'cerrada_con_retraso',
];

/** Máxima fecha (MX) entre los checks aplicables de una etapa que están hechos. */
function latestStageDate(
  creative: DashboardCreative,
  applicable: readonly CheckKey[],
): IsoDate | null {
  let max: IsoDate | null = null;
  let anyMissingDate = false;
  for (const key of applicable) {
    if (!creative.checks[key]) return null; // etapa incompleta
    const d = creative.checkDates[key];
    if (!d) anyMissingDate = true;
    else if (max === null || d > max) max = d;
  }
  // Etapa completa: si algún check completo no trae fecha, no podemos probar
  // tardanza; devolvemos la máxima conocida (o null si ninguna).
  return anyMissingDate && max === null ? null : max;
}

/** ¿La preparación se completó a tiempo (todas sus marcas ≤ fecha límite)? */
export function preparationOnTime(
  creative: DashboardCreative,
  deadlines: CreativeDeadlines,
): boolean {
  const date = latestStageDate(creative, creative.applicablePrep);
  if (date === null) {
    // Completa sin fecha demostrable → se asume a tiempo (§8 «asumir a tiempo»).
    const progress = computeCreativeProgress(creative.checks, creative.applicablePrep, creative.applicableClosing);
    return isStageComplete(progress.preparation);
  }
  return date <= deadlines.preparation;
}

/** ¿El cierre (testigos) se completó a tiempo? */
export function closingOnTime(
  creative: DashboardCreative,
  deadlines: CreativeDeadlines,
): boolean {
  const date = latestStageDate(creative, creative.applicableClosing);
  if (date === null) {
    const progress = computeCreativeProgress(creative.checks, creative.applicablePrep, creative.applicableClosing);
    return isStageComplete(progress.closing);
  }
  return date <= deadlines.closing;
}

export function deadlinesFor(creative: DashboardCreative): CreativeDeadlines {
  return computeDeadlines({ isLaComer: creative.isLaComer, activationStart: creative.activationStart });
}

/** Estado operativo de una creatividad respecto a `today` (fecha MX). */
export function operationalStatusOf(
  creative: DashboardCreative,
  today: IsoDate,
  deadlines: CreativeDeadlines = deadlinesFor(creative),
): OperationalStatus {
  const progress = computeCreativeProgress(
    creative.checks,
    creative.applicablePrep,
    creative.applicableClosing,
  );
  const prepComplete = isStageComplete(progress.preparation);
  const closingComplete = isStageComplete(progress.closing);
  const anyDone = progress.total.done > 0;
  const hasClosing = creative.applicableClosing.length > 0;

  // Cerrada: testigos completos (o sin testigos aplicables e íntegra).
  if (hasClosing && closingComplete) {
    return closingOnTime(creative, deadlines) ? 'cerrada_a_tiempo' : 'cerrada_con_retraso';
  }

  if (prepComplete) {
    // Preparación lista. ¿Ya estamos en / pasó la ventana de testigos?
    if (hasClosing && isDeadlinePassed(deadlines.closing, today)) return 'testigos_vencidos';
    if (hasClosing && creative.activationStart && creative.activationStart <= today) {
      return 'en_ventana_testigos';
    }
    // Aún sin activar (o sin testigos aplicables): lista para activación.
    return preparationOnTime(creative, deadlines) ? 'lista_para_activacion' : 'lista_con_retraso';
  }

  // Preparación incompleta.
  if (!anyDone) return 'sin_iniciar';
  return 'en_preparacion';
}
