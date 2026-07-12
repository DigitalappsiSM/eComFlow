import { useCallback, useEffect, useState } from 'react';
import type { MetricLine } from '@/domain/dashboard-metrics';
import { fetchOperationalLinesForDashboard } from '@/repositories/campaign-lines.repository';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; lines: MetricLine[] };

/**
 * Carga las líneas activas del dashboard EXCLUSIVAMENTE desde Firestore (§36,
 * §54). El cálculo de métricas y el filtrado se hacen en el componente sobre
 * estas líneas, para permitir filtros dinámicos sin re-consultar.
 */
export function useDashboardData() {
  const [state, setState] = useState<State>({ status: 'loading' });

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const lines = await fetchOperationalLinesForDashboard();
      setState({ status: 'ready', lines });
    } catch (err) {
      setState({
        status: 'error',
        message: err instanceof Error ? err.message : 'Error desconocido.',
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { state, reload: load };
}
