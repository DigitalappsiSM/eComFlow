/**
 * Estados calculados de una línea operativa (§31).
 *
 * Los estados NO se capturan a mano: se calculan con fecha de fijación, fecha
 * de retirada, checks obligatorios, la ventana de riesgo configurada y la
 * fecha actual. La cancelación es la ÚNICA que proviene de una acción
 * explícita (nunca se infiere porque una línea deje de aparecer en un
 * archivo).
 */

import type { IsoDate } from '@/lib/dates';
import {
  DEFAULT_REQUIRED_CHECKS,
  hasPendingRequiredChecks,
  type CheckKey,
  type CheckValues,
} from './progress';

export type CampaignStatus =
  | 'upcoming'
  | 'pending'
  | 'incomplete'
  | 'at_risk'
  | 'live'
  | 'completed'
  | 'cancelled';

export interface StatusInput {
  fechaFijacion: IsoDate;
  fechaRetirada: IsoDate;
  checks: CheckValues;
  /** Cancelación explícita autorizada (§31). */
  cancelled?: boolean;
  today: IsoDate;
  /** Ventana de riesgo en días (config `risk_days`). */
  riskDays?: number;
  requiredChecks?: readonly CheckKey[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Días enteros entre dos fechas ISO (b - a). */
function daysBetween(a: IsoDate, b: IsoDate): number {
  const ta = new Date(`${a}T00:00:00Z`).getTime();
  const tb = new Date(`${b}T00:00:00Z`).getTime();
  return Math.round((tb - ta) / DAY_MS);
}

export function computeStatus(input: StatusInput): CampaignStatus {
  const {
    fechaFijacion,
    fechaRetirada,
    checks,
    cancelled = false,
    today,
    riskDays = 3,
    requiredChecks = DEFAULT_REQUIRED_CHECKS,
  } = input;

  if (cancelled) return 'cancelled';

  const pending = hasPendingRequiredChecks(checks, requiredChecks);

  // Finalizada: la retirada ya pasó.
  if (fechaRetirada < today) return 'completed';

  // Dentro de vigencia (fijación <= hoy <= retirada).
  if (fechaFijacion <= today) {
    if (checks.kevel) return 'live'; // Pautándose
    return pending ? 'incomplete' : 'live';
  }

  // Futuro (fijación > hoy).
  const daysToStart = daysBetween(today, fechaFijacion);
  if (daysToStart <= riskDays && pending) return 'at_risk';
  if (pending) return 'pending';
  return 'upcoming';
}

export const STATUS_LABELS: Record<CampaignStatus, string> = {
  upcoming: 'Próxima a iniciar',
  pending: 'Pendiente',
  incomplete: 'Incompleta',
  at_risk: 'En riesgo',
  live: 'Pautándose',
  completed: 'Finalizada',
  cancelled: 'Cancelada',
};
