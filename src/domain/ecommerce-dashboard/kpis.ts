/**
 * KPIs y series para gráficas del Dashboard de Avance Operativo (§8, §9).
 *
 * Todas las funciones son puras y operan sobre creatividades ya consolidadas
 * (`DashboardCreative`), filtradas a la semana seleccionada. Los KPIs reaccionan
 * a CADA check, no sólo al completar los siete. Cuando aún no venció ninguna
 * fecha límite, los porcentajes de SLA devuelven `null` para mostrarse como
 * «No aplica» en lugar de `0%`.
 */

import type { IsoDate } from '@/lib/dates';
import type { CheckKey } from '@/domain/progress';
import { CHECK_ORDER } from './checks';
import { computeCreativeProgress, isStageComplete } from './progress';
import { deadlinesFor, operationalStatusOf, preparationOnTime, closingOnTime, ALL_STATUSES, type OperationalStatus } from './status';
import { isDeadlinePassed } from './deadlines';
import { isWithinWeek, windowOverlapsWeek } from './weeks';
import type { DashboardCreative } from './types';

export interface DashboardWeekRange {
  start: IsoDate;
  end: IsoDate;
}

/** ¿La creatividad participa en la semana? (contada como máximo una vez, §6). */
export function creativeInWeek(creative: DashboardCreative, week: DashboardWeekRange): boolean {
  if (creative.isLaComer) {
    return creative.activationDates.some((d) => isWithinWeek(d, week));
  }
  return windowOverlapsWeek({ start: creative.activationStart, end: creative.activationEnd }, week);
}

/** Creatividades (no canceladas) que participan en la semana. */
export function creativesForWeek(
  creatives: readonly DashboardCreative[],
  week: DashboardWeekRange,
): DashboardCreative[] {
  return creatives.filter((c) => !c.cancelled && creativeInWeek(c, week));
}

/** ¿La creatividad es CONTINUA en esta semana (empezó antes)? (§6). */
export function isContinuationInWeek(creative: DashboardCreative, week: DashboardWeekRange): boolean {
  return !!creative.activationStart && creative.activationStart < week.start;
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/** ¿La creatividad está fuera de SLA (venció un plazo sin completar, o cerró tarde)? */
export function isOutOfSla(creative: DashboardCreative, today: IsoDate): boolean {
  const deadlines = deadlinesFor(creative);
  const progress = computeCreativeProgress(creative.checks, creative.applicablePrep, creative.applicableClosing);
  const prepComplete = isStageComplete(progress.preparation);
  const closingComplete = isStageComplete(progress.closing);
  const prepOverdue = isDeadlinePassed(deadlines.preparation, today) && !prepComplete;
  const closingOverdue =
    creative.applicableClosing.length > 0 && isDeadlinePassed(deadlines.closing, today) && !closingComplete;
  const lateButDone =
    (prepComplete && !preparationOnTime(creative, deadlines)) ||
    (closingComplete && creative.applicableClosing.length > 0 && !closingOnTime(creative, deadlines));
  return prepOverdue || closingOverdue || lateButDone;
}

export interface WeekKpis {
  totalCreatives: number;
  clientes: number;
  avgPreparation: number;
  avgClosing: number;
  listasParaActivacion: number;
  preparacionPendiente: number;
  cerradas: number;
  checksCompletados: number;
  checksObligatorios: number;
  /** null → «No aplica» (aún no vence ningún plazo de preparación). */
  preparacionATiempoPct: number | null;
  /** null → «No aplica» (aún no vence ningún plazo de testigos). */
  cierreATiempoPct: number | null;
  fueraDeSla: number;
  statusCounts: Record<OperationalStatus, number>;
}

export function computeWeekKpis(
  creatives: readonly DashboardCreative[],
  today: IsoDate,
): WeekKpis {
  const statusCounts = Object.fromEntries(ALL_STATUSES.map((s) => [s, 0])) as Record<OperationalStatus, number>;
  const clientes = new Set<string>();
  let prepSum = 0;
  let closingSum = 0;
  let listas = 0;
  let pendientes = 0;
  let cerradas = 0;
  let checksDone = 0;
  let checksReq = 0;
  let fueraDeSla = 0;

  // SLA a tiempo: numerador / denominador de plazos ya vencidos.
  let prepDeadlinePassed = 0;
  let prepOnTime = 0;
  let closingDeadlinePassed = 0;
  let closingOnTimeCount = 0;

  for (const c of creatives) {
    const deadlines = deadlinesFor(c);
    const progress = computeCreativeProgress(c.checks, c.applicablePrep, c.applicableClosing);
    const prepComplete = isStageComplete(progress.preparation);
    const closingComplete = isStageComplete(progress.closing);
    const status = operationalStatusOf(c, today, deadlines);

    statusCounts[status] += 1;
    clientes.add(c.clienteKey);
    prepSum += progress.preparation.pct;
    closingSum += progress.closing.pct;
    checksDone += progress.total.done;
    checksReq += progress.total.applicable;

    if (status === 'lista_para_activacion' || status === 'lista_con_retraso') listas += 1;
    if (!prepComplete) pendientes += 1;
    if (closingComplete && c.applicableClosing.length > 0) cerradas += 1;
    if (isOutOfSla(c, today)) fueraDeSla += 1;

    if (isDeadlinePassed(deadlines.preparation, today)) {
      prepDeadlinePassed += 1;
      if (prepComplete && preparationOnTime(c, deadlines)) prepOnTime += 1;
    }
    if (c.applicableClosing.length > 0 && isDeadlinePassed(deadlines.closing, today)) {
      closingDeadlinePassed += 1;
      if (closingComplete && closingOnTime(c, deadlines)) closingOnTimeCount += 1;
    }
  }

  const n = creatives.length;
  return {
    totalCreatives: n,
    clientes: clientes.size,
    avgPreparation: n === 0 ? 0 : round1(prepSum / n),
    avgClosing: n === 0 ? 0 : round1(closingSum / n),
    listasParaActivacion: listas,
    preparacionPendiente: pendientes,
    cerradas,
    checksCompletados: checksDone,
    checksObligatorios: checksReq,
    preparacionATiempoPct: prepDeadlinePassed === 0 ? null : round1((prepOnTime / prepDeadlinePassed) * 100),
    cierreATiempoPct: closingDeadlinePassed === 0 ? null : round1((closingOnTimeCount / closingDeadlinePassed) * 100),
    fueraDeSla,
    statusCounts,
  };
}

// --- Gráficas ---------------------------------------------------------------

export interface CheckProgressBar {
  check: CheckKey;
  completed: number;
  pending: number;
  applicable: number;
}

/** Completados vs pendientes por check (solo donde el check aplica). */
export function computeCheckProgress(creatives: readonly DashboardCreative[]): CheckProgressBar[] {
  return CHECK_ORDER.map((check) => {
    let completed = 0;
    let applicable = 0;
    for (const c of creatives) {
      if (!c.applicableAll.includes(check)) continue;
      applicable += 1;
      if (c.checks[check]) completed += 1;
    }
    return { check, completed, pending: applicable - completed, applicable };
  }).filter((b) => b.applicable > 0);
}

export interface ClientPreparationRow {
  cliente: string;
  avgPreparation: number;
  pendingChecks: number;
  creatives: number;
}

/** Preparación promedio por cliente, mayor pendiente primero (§9). */
export function computePreparationByClient(
  creatives: readonly DashboardCreative[],
): ClientPreparationRow[] {
  const byClient = new Map<string, { cliente: string; sum: number; pending: number; n: number }>();
  for (const c of creatives) {
    const cliente = (c.clienteOriginal ?? '').trim() || '(sin cliente)';
    const progress = computeCreativeProgress(c.checks, c.applicablePrep, c.applicableClosing);
    const cur = byClient.get(cliente) ?? { cliente, sum: 0, pending: 0, n: 0 };
    cur.sum += progress.preparation.pct;
    cur.pending += progress.preparation.applicable - progress.preparation.done;
    cur.n += 1;
    byClient.set(cliente, cur);
  }
  return [...byClient.values()]
    .map((v) => ({
      cliente: v.cliente,
      avgPreparation: v.n === 0 ? 0 : round1(v.sum / v.n),
      pendingChecks: v.pending,
      creatives: v.n,
    }))
    .sort((a, b) => b.pendingChecks - a.pendingChecks || a.avgPreparation - b.avgPreparation || a.cliente.localeCompare(b.cliente, 'es'));
}

export interface ClientCheckMatrix {
  checks: CheckKey[];
  rows: Array<{ cliente: string } & Record<string, number | string>>;
}

/** Matriz cliente × check: % completado de cada check por cliente (§9). */
export function computeClientCheckMatrix(creatives: readonly DashboardCreative[]): ClientCheckMatrix {
  const byClient = new Map<string, Map<CheckKey, { done: number; applicable: number }>>();
  for (const c of creatives) {
    const cliente = (c.clienteOriginal ?? '').trim() || '(sin cliente)';
    if (!byClient.has(cliente)) byClient.set(cliente, new Map());
    const m = byClient.get(cliente)!;
    for (const check of c.applicableAll) {
      const cur = m.get(check) ?? { done: 0, applicable: 0 };
      cur.applicable += 1;
      if (c.checks[check]) cur.done += 1;
      m.set(check, cur);
    }
  }
  const rows = [...byClient.entries()]
    .map(([cliente, m]) => {
      const row: { cliente: string } & Record<string, number | string> = { cliente };
      for (const check of CHECK_ORDER) {
        const cur = m.get(check);
        row[check] = cur && cur.applicable > 0 ? round1((cur.done / cur.applicable) * 100) : 0;
      }
      return row;
    })
    .sort((a, b) => String(a.cliente).localeCompare(String(b.cliente), 'es'));
  return { checks: [...CHECK_ORDER], rows };
}

export interface WeekCardSummary {
  totalCreatives: number;
  avgPreparation: number;
  listas: number;
  pendientes: number;
  avgClosing: number;
  fueraDeSla: number;
}

/** Resumen compacto de una semana para el comparativo de cuatro tarjetas (§9). */
export function computeWeekCard(
  allCreatives: readonly DashboardCreative[],
  week: DashboardWeekRange,
  today: IsoDate,
): WeekCardSummary {
  const inWeek = creativesForWeek(allCreatives, week);
  const kpis = computeWeekKpis(inWeek, today);
  return {
    totalCreatives: kpis.totalCreatives,
    avgPreparation: kpis.avgPreparation,
    listas: kpis.listasParaActivacion,
    pendientes: kpis.preparacionPendiente,
    avgClosing: kpis.avgClosing,
    fueraDeSla: kpis.fueraDeSla,
  };
}
