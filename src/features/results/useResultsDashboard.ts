import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchResultsWeekly } from '@/repositories/results/results-weekly.repository';
import { fetchActivePeriods } from '@/repositories/results/periods.repository';
import { buildResultsLines, type ResultsLine } from '@/domain/results/results-metrics';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; lines: ResultsLine[] };

/**
 * Carga el consolidado semanal (`results_weekly`) unido al catálogo de periodos.
 * El filtrado y las métricas se calculan en cliente sobre estas líneas, para
 * permitir filtros dinámicos sin re-consultar (§15).
 */
export function useResultsDashboard() {
  const [state, setState] = useState<State>({ status: 'loading' });

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const [weekly, periods] = await Promise.all([fetchResultsWeekly(), fetchActivePeriods()]);
      setState({ status: 'ready', lines: buildResultsLines(weekly, periods) });
    } catch (err) {
      setState({ status: 'error', message: err instanceof Error ? err.message : 'Error desconocido.' });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const lines = useMemo(() => (state.status === 'ready' ? state.lines : []), [state]);

  return { state, lines, reload: load };
}
