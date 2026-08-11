import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  consolidateCreatives,
  type DashboardCreative,
} from '@/domain/ecommerce-dashboard';
import {
  fetchEcommerceDashboardLines,
  type EcommerceDashboardData,
} from '@/repositories/ecommerce-dashboard.repository';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: EcommerceDashboardData };

/**
 * Carga y consolida las creatividades Ecommerce para el dashboard (§10, §12).
 *
 * Recarga: al montar (entrar al dashboard o volver desde Seguimiento operativo,
 * pues la página se re-monta) y con el botón «Actualizar» (`reload`). No usa
 * listeners de tiempo real. Expone la fecha/hora de la última actualización.
 */
export function useEcommerceDashboard() {
  const [state, setState] = useState<State>({ status: 'loading' });

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const data = await fetchEcommerceDashboardLines();
      setState({ status: 'ready', data });
    } catch (err) {
      setState({ status: 'error', message: err instanceof Error ? err.message : 'Error desconocido.' });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const creatives = useMemo<DashboardCreative[]>(
    () => (state.status === 'ready' ? consolidateCreatives(state.data.lines) : []),
    [state],
  );

  const loadedAt = state.status === 'ready' ? state.data.loadedAt : null;
  const fetched = state.status === 'ready' ? state.data.fetched : 0;

  return { state, creatives, loadedAt, fetched, reload: load };
}
