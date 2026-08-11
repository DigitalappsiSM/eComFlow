/**
 * Avance por etapa de una creatividad (§4).
 *
 *   preparationProgress = checks de preparación completados / aplicables
 *   closingProgress     = checks de testigos completados / aplicables
 *   totalProgress       = todos los checks completados / todos los aplicables
 *
 * Nunca se penalizan checks que no aplican: el denominador se ajusta a los
 * checks aplicables de la creatividad. Todos los checks aplicables pesan igual.
 */

import type { CheckKey, CheckValues } from '@/domain/progress';

export interface StageProgress {
  done: number;
  applicable: number;
  /** 0..1. Con 0 aplicables se considera etapa completa (ratio 1). */
  ratio: number;
  /** 0..100 con un decimal. */
  pct: number;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function stageProgress(
  checks: CheckValues,
  applicable: readonly CheckKey[],
): StageProgress {
  const total = applicable.length;
  const done = applicable.reduce((acc, key) => acc + (checks[key] ? 1 : 0), 0);
  const ratio = total === 0 ? 1 : done / total;
  return { done, applicable: total, ratio, pct: round1(ratio * 100) };
}

export interface CreativeProgress {
  preparation: StageProgress;
  closing: StageProgress;
  total: StageProgress;
}

export function computeCreativeProgress(
  checks: CheckValues,
  applicablePrep: readonly CheckKey[],
  applicableClosing: readonly CheckKey[],
): CreativeProgress {
  return {
    preparation: stageProgress(checks, applicablePrep),
    closing: stageProgress(checks, applicableClosing),
    total: stageProgress(checks, [...applicablePrep, ...applicableClosing]),
  };
}

/** ¿La etapa está completa (todos sus checks aplicables hechos)? */
export function isStageComplete(stage: StageProgress): boolean {
  return stage.done >= stage.applicable;
}
