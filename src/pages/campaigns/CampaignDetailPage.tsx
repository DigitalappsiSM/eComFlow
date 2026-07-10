import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { EmptyState, ErrorState, LoadingState } from '@/components/feedback/States';
import { fetchCampaignDetail, type CampaignDetail } from '@/repositories/campaigns.repository';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'not_found' }
  | { status: 'ready'; detail: CampaignDetail };

export function CampaignDetailPage() {
  const { id = '' } = useParams();
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    fetchCampaignDetail(id)
      .then((detail) => {
        if (!active) return;
        setState(detail ? { status: 'ready', detail } : { status: 'not_found' });
      })
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
  }, [id]);

  return (
    <AppLayout title="Detalle de campaña" description="Jerarquía de espacios y líneas creativas">
      <Link
        to="/campanas"
        className="focus-ring mb-4 inline-flex items-center gap-1 text-sm text-accent-blue hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Volver
      </Link>

      {state.status === 'loading' && <LoadingState />}
      {state.status === 'error' && <ErrorState description={state.message} />}
      {state.status === 'not_found' && <EmptyState title="Campaña no encontrada" />}

      {state.status === 'ready' && (
        <div className="space-y-4">
          <div className="card p-5">
            <h2 className="text-base font-bold text-slate-900">
              {state.detail.group.cliente_original} · Campaña {state.detail.group.numero_campaña_original}
            </h2>
            <p className="text-sm text-slate-500">Anunciante: {state.detail.group.anunciante}</p>
            <p className="mt-1 text-xs text-slate-400">
              {state.detail.spaces.length} espacio(s) ·{' '}
              {Array.from(state.detail.linesBySpace.values()).reduce((a, l) => a + l.length, 0)} línea(s)
            </p>
          </div>

          {state.detail.spaces.length === 0 ? (
            <EmptyState title="Sin espacios" />
          ) : (
            state.detail.spaces.map((space) => (
              <div key={space.campaign_space_id} className="card p-4">
                <div className="mb-2">
                  <p className="text-sm font-semibold text-slate-800">
                    {space.placement_name_snapshot} · {space.creatividad_titulo_original}
                  </p>
                  <p className="text-xs text-slate-500">
                    {space.fecha_fijacion} → {space.fecha_retirada} · {space.creatividad_descripcion_original}
                  </p>
                </div>
                <ul className="space-y-1">
                  {(state.detail.linesBySpace.get(space.campaign_space_id) ?? []).map((line) => (
                    <li
                      key={line.campaign_line_id}
                      className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5 text-sm"
                    >
                      <span className="font-mono text-xs text-slate-600">
                        Creatividad {line.creatividad_id_original}
                      </span>
                      <span className="text-xs text-slate-400">
                        {line.required_pieces} pieza(s) · {line.replacement_status}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      )}
    </AppLayout>
  );
}
