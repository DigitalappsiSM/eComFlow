import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, ShieldAlert, Trash2 } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { LoadingState } from '@/components/feedback/States';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { fetchDevResetEnabled, setDevResetEnabled } from '@/repositories/settings.repository';
import { wipeOperationalData, RESETTABLE_COLLECTIONS } from '@/repositories/maintenance.repository';

const CONFIRM_TEXT = 'BORRAR TODO';

type Phase = 'idle' | 'wiping' | 'done';

/**
 * Página OCULTA (no aparece en el menú) para reiniciar los datos operativos
 * durante las pruebas iniciales. Solo admin, y el borrado solo funciona con el
 * interruptor encendido (protegido también por las reglas de Firestore).
 */
export function ResetDataPage() {
  const { firebaseUser } = useAuth();
  const { can } = usePermissions();
  const isAdmin = can('users'); // permiso solo-admin

  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState<{ collection: string; total: number } | null>(null);
  const [result, setResult] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDevResetEnabled()
      .then(setEnabled)
      .catch(() => setEnabled(false))
      .finally(() => setLoading(false));
  }, []);

  async function toggle(next: boolean) {
    if (!firebaseUser) return;
    setError(null);
    try {
      await setDevResetEnabled(next, { uid: firebaseUser.uid });
      setEnabled(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cambiar el interruptor.');
    }
  }

  async function wipe() {
    if (confirm !== CONFIRM_TEXT) return;
    setPhase('wiping');
    setError(null);
    setResult(null);
    try {
      const total = await wipeOperationalData((p) =>
        setProgress({ collection: p.collection, total: p.totalDeleted }),
      );
      setResult(total);
      setPhase('done');
      setConfirm('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al borrar los datos.');
      setPhase('idle');
    }
  }

  if (!isAdmin) {
    return (
      <AppLayout title="Reiniciar datos" description="Zona de pruebas">
        <div className="card p-8 text-center text-slate-500">Solo disponible para administradores.</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Reiniciar datos (pruebas)" description="Herramienta oculta solo para la fase de pruebas">
      {loading ? (
        <LoadingState />
      ) : (
        <div className="max-w-2xl space-y-4">
          <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <ShieldAlert className="mt-0.5 h-5 w-5 flex-shrink-0" aria-hidden="true" />
            <p>
              Esta acción borra <strong>físicamente</strong> los datos operativos. Es solo para
              pruebas. En producción, deja el interruptor <strong>apagado</strong>. No toca usuarios,
              configuración ni el catálogo de placements.
            </p>
          </div>

          {/* Paso 1: interruptor */}
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-slate-800">Paso 1 · Interruptor de borrado</h2>
            <p className="mt-1 text-xs text-slate-500">
              Con el interruptor apagado, las reglas de Firestore bloquean cualquier borrado.
            </p>
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => void toggle(e.target.checked)}
                className="h-4 w-4"
              />
              <span className={enabled ? 'font-medium text-red-600' : 'text-slate-600'}>
                Habilitar borrado de datos {enabled ? '(ENCENDIDO)' : '(apagado)'}
              </span>
            </label>
          </div>

          {/* Paso 2: borrar */}
          <div className={`card p-5 ${enabled ? '' : 'opacity-50'}`}>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-red-600">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" /> Paso 2 · Borrar todo
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Se vaciarán: {RESETTABLE_COLLECTIONS.join(', ')}.
            </p>
            <p className="mt-2 text-xs text-slate-600">
              Escribe <code className="rounded bg-slate-100 px-1">{CONFIRM_TEXT}</code> para confirmar:
            </p>
            <input
              value={confirm}
              disabled={!enabled || phase === 'wiping'}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder={CONFIRM_TEXT}
              className="focus-ring mt-1 w-56 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
            <div className="mt-3">
              <button
                type="button"
                disabled={!enabled || confirm !== CONFIRM_TEXT || phase === 'wiping'}
                onClick={() => void wipe()}
                className="focus-ring inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-40"
              >
                {phase === 'wiping' ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                )}
                Borrar todos los datos operativos
              </button>
            </div>

            {phase === 'wiping' && progress && (
              <p className="mt-3 text-xs text-slate-500">
                Borrando {progress.collection}… {progress.total} documentos eliminados.
              </p>
            )}
            {phase === 'done' && result !== null && (
              <p className="mt-3 text-sm text-accent-green">
                Listo. Se borraron {result} documentos. Recuerda <strong>apagar el interruptor</strong>{' '}
                (Paso 1) al terminar.
              </p>
            )}
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          </div>
        </div>
      )}
    </AppLayout>
  );
}
