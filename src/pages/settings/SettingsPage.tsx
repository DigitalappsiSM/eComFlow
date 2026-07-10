import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { ErrorState, LoadingState } from '@/components/feedback/States';
import { fetchSettings, saveSettings } from '@/repositories/settings.repository';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { CHECK_KEYS, type CheckKey } from '@/domain/progress';
import type { AppSettings } from '@/types/operations';

const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; settings: AppSettings; original: AppSettings };

export function SettingsPage() {
  const { firebaseUser, appUser } = useAuth();
  const { can } = usePermissions();
  const canWrite = can('settings');
  const [state, setState] = useState<State>({ status: 'loading' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchSettings()
      .then((settings) => setState({ status: 'ready', settings, original: settings }))
      .catch((err: unknown) =>
        setState({ status: 'error', message: err instanceof Error ? err.message : 'Error.' }),
      );
  }, []);

  function patch(p: Partial<AppSettings>) {
    setState((s) => (s.status === 'ready' ? { ...s, settings: { ...s.settings, ...p } } : s));
    setSaved(false);
  }

  async function onSave() {
    if (state.status !== 'ready' || !firebaseUser || !appUser) return;
    setSaving(true);
    try {
      await saveSettings(state.settings, state.original, {
        uid: firebaseUser.uid,
        email: appUser.email,
      });
      setState({ status: 'ready', settings: state.settings, original: state.settings });
      setSaved(true);
    } catch (err) {
      setState({ status: 'error', message: err instanceof Error ? err.message : 'Error al guardar.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppLayout title="Configuración" description="Parámetros de la aplicación (§47)">
      {state.status === 'loading' && <LoadingState />}
      {state.status === 'error' && <ErrorState description={state.message} />}
      {state.status === 'ready' && (
        <div className="card max-w-2xl space-y-5 p-6">
          <Field label="Días de ventana de riesgo (risk_days)">
            <input
              type="number"
              min={0}
              value={state.settings.risk_days}
              disabled={!canWrite}
              onChange={(e) => patch({ risk_days: Number(e.target.value) })}
              className="focus-ring w-28 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Inicio de semana">
              <select
                value={state.settings.week_start_day}
                disabled={!canWrite}
                onChange={(e) => patch({ week_start_day: Number(e.target.value) })}
                className="focus-ring w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
              >
                {DAYS.map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Fin de semana">
              <select
                value={state.settings.week_end_day}
                disabled={!canWrite}
                onChange={(e) => patch({ week_end_day: Number(e.target.value) })}
                className="focus-ring w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
              >
                {DAYS.map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Checks obligatorios (avance y riesgo)">
            <div className="flex flex-wrap gap-3">
              {CHECK_KEYS.map((k) => (
                <label key={k} className="flex items-center gap-1.5 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={state.settings.required_checks.includes(k)}
                    disabled={!canWrite}
                    onChange={(e) => {
                      const set = new Set<CheckKey>(state.settings.required_checks);
                      if (e.target.checked) set.add(k);
                      else set.delete(k);
                      patch({ required_checks: CHECK_KEYS.filter((c) => set.has(c)) });
                    }}
                  />
                  {k}
                </label>
              ))}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Versión de plantilla">
              <input
                value={state.settings.import_template_version}
                disabled={!canWrite}
                onChange={(e) => patch({ import_template_version: e.target.value })}
                className="focus-ring w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
              />
            </Field>
            <Field label="Tamaño de página">
              <input
                type="number"
                min={10}
                value={state.settings.pagination_size}
                disabled={!canWrite}
                onChange={(e) => patch({ pagination_size: Number(e.target.value) })}
                className="focus-ring w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
              />
            </Field>
          </div>

          <Field label="Extensiones permitidas (separadas por coma)">
            <input
              value={state.settings.allowed_file_extensions.join(', ')}
              disabled={!canWrite}
              onChange={(e) =>
                patch({
                  allowed_file_extensions: e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              className="focus-ring w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
          </Field>

          {canWrite && (
            <div className="flex items-center gap-3 border-t border-slate-100 pt-4">
              <button
                onClick={() => void onSave()}
                disabled={saving}
                className="focus-ring flex items-center gap-1.5 rounded-lg bg-accent-blue px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                <Save className="h-4 w-4" aria-hidden="true" />
                {saving ? 'Guardando…' : 'Guardar cambios'}
              </button>
              {saved && <span className="text-sm text-accent-green">Configuración guardada.</span>}
            </div>
          )}
        </div>
      )}
    </AppLayout>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      {children}
    </div>
  );
}
