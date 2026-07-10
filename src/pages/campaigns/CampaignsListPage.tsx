import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { EmptyState, ErrorState, LoadingState } from '@/components/feedback/States';
import { fetchCampaignGroups } from '@/repositories/campaigns.repository';
import type { CampaignGroup } from '@/types/campaign';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; groups: CampaignGroup[] };

export function CampaignsListPage() {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    fetchCampaignGroups()
      .then((groups) => active && setState({ status: 'ready', groups }))
      .catch(
        (err: unknown) =>
          active &&
          setState({
            status: 'error',
            message: err instanceof Error ? err.message : 'Error desconocido.',
          }),
      );
    return () => {
      active = false;
    };
  }, []);

  return (
    <AppLayout title="Detalle de campaña" description="Seleccione una campaña para ver su jerarquía">
      {state.status === 'loading' && <LoadingState />}
      {state.status === 'error' && <ErrorState description={state.message} />}
      {state.status === 'ready' &&
        (state.groups.length === 0 ? (
          <EmptyState title="Sin campañas" description="Aún no hay campañas en Firestore." />
        ) : (
          <div className="card divide-y divide-slate-100">
            {state.groups.map((g) => (
              <Link
                key={g.campaign_group_id}
                to={`/campanas/${g.campaign_group_id}`}
                className="focus-ring flex items-center justify-between px-4 py-3 hover:bg-slate-50"
              >
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    {g.cliente_original} · {g.numero_campaña_original}
                  </p>
                  <p className="text-xs text-slate-500">{g.anunciante}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-400" aria-hidden="true" />
              </Link>
            ))}
          </div>
        ))}
    </AppLayout>
  );
}
