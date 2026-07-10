import { useCallback, useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { EmptyState, ErrorState, LoadingState } from '@/components/feedback/States';
import { fetchUsers, setUserActive, setUserRole } from '@/repositories/users.repository';
import { useAuth } from '@/hooks/useAuth';
import type { AppUser, Role } from '@/types/user';

const ROLES: Role[] = ['admin', 'manager', 'operator', 'viewer'];

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; users: AppUser[] };

export function UsersPage() {
  const { firebaseUser, appUser } = useAuth();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setState({ status: 'loading' });
    fetchUsers()
      .then((users) => setState({ status: 'ready', users }))
      .catch((err: unknown) =>
        setState({ status: 'error', message: err instanceof Error ? err.message : 'Error.' }),
      );
  }, []);

  useEffect(() => load(), [load]);

  const actor = firebaseUser && appUser ? { uid: firebaseUser.uid, email: appUser.email } : null;

  async function changeRole(u: AppUser, role: Role) {
    if (!actor) return;
    setError(null);
    try {
      await setUserRole(u.user_id, role, u.role, actor);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cambiar rol.');
    }
  }

  async function toggleActive(u: AppUser) {
    if (!actor) return;
    setError(null);
    try {
      await setUserActive(u.user_id, !u.active, u.active, actor);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cambiar estado.');
    }
  }

  return (
    <AppLayout title="Administración de usuarios" description="Roles y estado (§27)">
      <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
        Los usuarios se crean en la Consola de Firebase (Authentication + documento{' '}
        <code>users/&#123;uid&#125;</code>). Aquí solo se gestionan rol y estado. Un usuario no puede
        cambiar su propio rol.
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      {state.status === 'loading' && <LoadingState />}
      {state.status === 'error' && <ErrorState description={state.message} onRetry={load} />}
      {state.status === 'ready' &&
        (state.users.length === 0 ? (
          <EmptyState title="Sin usuarios" />
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                  <th className="px-4 py-3 font-medium">Nombre</th>
                  <th className="px-4 py-3 font-medium">Correo</th>
                  <th className="px-4 py-3 font-medium">Rol</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {state.users.map((u) => {
                  const isSelf = u.user_id === firebaseUser?.uid;
                  return (
                    <tr key={u.user_id} className="border-b border-slate-100">
                      <td className="px-4 py-3 text-slate-700">
                        {u.name} {isSelf && <span className="text-xs text-slate-400">(usted)</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-500">{u.email}</td>
                      <td className="px-4 py-3">
                        <select
                          value={u.role}
                          disabled={isSelf}
                          onChange={(e) => void changeRole(u, e.target.value as Role)}
                          className="focus-ring rounded-lg border border-slate-300 px-2 py-1 text-sm disabled:opacity-60"
                          aria-label={`Rol de ${u.name}`}
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => void toggleActive(u)}
                          className={`focus-ring rounded-full px-2.5 py-1 text-xs font-medium ${
                            u.active
                              ? 'bg-green-50 text-accent-green'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {u.active ? 'Activo' : 'Inactivo'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
    </AppLayout>
  );
}
