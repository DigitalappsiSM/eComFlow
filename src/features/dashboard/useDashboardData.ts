import { useCallback, useEffect, useState } from 'react';
import { getWeekRange, todayIso, type DateRange } from '@/lib/dates';
import {
  computeDashboardMetrics,
  computeLineBreakdown,
  computePlacementDistribution,
  type BreakdownItem,
  type DashboardMetrics,
  type MetricLine,
  type PlacementDistributionItem,
} from '@/domain/dashboard-metrics';
import { fetchActiveLinesForDashboard } from '@/repositories/campaign-lines.repository';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ready';
      metrics: DashboardMetrics;
      distribution: PlacementDistributionItem[];
      byTipo: BreakdownItem[];
      byCadena: BreakdownItem[];
      lineCount: number;
      fromCache: boolean;
    };

/**
 * Carga datos del dashboard EXCLUSIVAMENTE desde Firestore y calcula las
 * métricas en cliente (§36, §54). Maneja estados de carga / error / vacío.
 */
export function useDashboardData(period: DateRange = getWeekRange(todayIso())) {
  const [state, setState] = useState<State>({ status: 'loading' });

  // Depende de los valores primitivos del periodo, no de la identidad del
  // objeto, para no re-disparar la consulta en cada render (evita el bucle).
  const { start, end } = period;

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    const range = { start, end };
    try {
      const lines: MetricLine[] = await fetchActiveLinesForDashboard();
      setState({
        status: 'ready',
        metrics: computeDashboardMetrics(lines, range),
        distribution: computePlacementDistribution(lines, range),
        byTipo: computeLineBreakdown(lines, range, (l) => l.tipoOperacion ?? '(sin clasificar)'),
        byCadena: computeLineBreakdown(lines, range, (l) => l.cadena ?? '(sin cadena)'),
        lineCount: lines.length,
        fromCache: false,
      });
    } catch (err) {
      setState({
        status: 'error',
        message: err instanceof Error ? err.message : 'Error desconocido.',
      });
    }
  }, [start, end]);

  useEffect(() => {
    void load();
  }, [load]);

  return { state, reload: load };
}
