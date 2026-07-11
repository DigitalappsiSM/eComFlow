import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

/** Inicio de sesión con correo y contraseña (§27, Fase 1). */
export function LoginPage() {
  const { signIn, configError, firebaseUser, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Sesión ya iniciada: redirigir al dashboard en lugar de quedarse en login.
  if (!loading && firebaseUser) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signIn(email, password);
    } catch (err) {
      setError(
        err instanceof Error
          ? 'No se pudo iniciar sesión. Verifique sus credenciales.'
          : 'Error desconocido.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-navy-900 p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-accent-blue/20 ring-1 ring-accent-blue/40">
            <span className="h-4 w-4 rounded-full border-2 border-accent-blue" />
          </div>
          <h1 className="text-xl font-bold text-white">eComFlow Next</h1>
          <p className="text-sm text-slate-400">Gestión de operación de campañas</p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-4 p-6" noValidate>
          {configError && (
            <p role="alert" className="rounded-lg bg-orange-50 p-3 text-xs text-accent-orange">
              {configError}
            </p>
          )}

          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700">
              Correo electrónico
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="focus-ring w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="focus-ring w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          {error && (
            <p role="alert" className="text-xs text-accent-orange">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || !!configError}
            className="focus-ring w-full rounded-lg bg-accent-blue px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {submitting ? 'Ingresando…' : 'Iniciar sesión'}
          </button>
        </form>

        <p className="mt-4 text-center text-[11px] text-slate-500">
          Los usuarios se crean desde la Consola de Firebase (§27).
        </p>
      </div>
    </div>
  );
}
