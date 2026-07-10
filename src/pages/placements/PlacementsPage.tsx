import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { EmptyState, ErrorState, LoadingState } from '@/components/feedback/States';
import { fetchPlacements } from '@/repositories/placements.repository';
import type { Placement } from '@/types/placement';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; placements: Placement[] };

/** Catálogo básico de placements (§14, §46). Lectura desde Firestore. */
export function PlacementsPage() {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    fetchPlacements()
      .then((placements) => active && setState({ status: 'ready', placements }))
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
    <AppLayout title="Catálogo de artículos" description="Placements autorizados y su estado">
      {state.status === 'loading' && <LoadingState />}
      {state.status === 'error' && <ErrorState description={state.message} />}
      {state.status === 'ready' &&
        (state.placements.length === 0 ? (
          <EmptyState
            title="Sin placements en el catálogo"
            description="Cree placements desde la Consola de Firebase o en una fase posterior desde esta vista."
          />
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                  <th className="px-4 py-3 font-medium">ID</th>
                  <th className="px-4 py-3 font-medium">Nombre</th>
                  <th className="px-4 py-3 font-medium">Descripción</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {state.placements.map((p) => (
                  <tr key={p.placement_id} className="border-b border-slate-100">
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{p.placement_id}</td>
                    <td className="px-4 py-3 text-slate-800">{p.nombre}</td>
                    <td className="px-4 py-3 text-slate-500">{p.descripcion}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          p.active
                            ? 'bg-green-50 text-accent-green'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {p.active ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </AppLayout>
  );
}
