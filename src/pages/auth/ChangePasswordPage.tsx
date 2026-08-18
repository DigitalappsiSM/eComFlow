import { useState, type FormEvent } from 'react';
import { KeyRound } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/hooks/useAuth';

/** Longitud mínima de contraseña exigida por Firebase Auth. */
const MIN_PASSWORD_LENGTH = 6;

/** Traduce los códigos de error de Firebase Auth a mensajes en español (§27). */
function messageForError(err: unknown): string {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code: unknown }).code)
      : '';
  switch (code) {
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'La contraseña actual no es correcta.';
    case 'auth/weak-password':
      return 'La nueva contraseña es demasiado débil.';
    case 'auth/too-many-requests':
      return 'Demasiados intentos. Espere unos minutos e inténtelo de nuevo.';
    case 'auth/requires-recent-login':
      return 'Por seguridad, vuelva a iniciar sesión antes de cambiar la contraseña.';
    default:
      return err instanceof Error ? err.message : 'No se pudo cambiar la contraseña.';
  }
}

/** Cambio de contraseña autoservicio del usuario autenticado (§27). */
export function ChangePasswordPage() {
  const { changePassword, appUser, firebaseUser } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const email = appUser?.email ?? firebaseUser?.email ?? '';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`La nueva contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('La confirmación no coincide con la nueva contraseña.');
      return;
    }
    if (newPassword === currentPassword) {
      setError('La nueva contraseña debe ser diferente de la actual.');
      return;
    }

    setSubmitting(true);
    try {
      await changePassword(currentPassword, newPassword);
      setSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(messageForError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppLayout title="Cambiar contraseña" description="Seguridad de la cuenta (§27)">
      <form onSubmit={handleSubmit} className="card max-w-md space-y-5 p-6" noValidate>
        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-blue/10 text-accent-blue">
            <KeyRound className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-medium text-slate-700">Actualice su contraseña</p>
            {email && <p className="text-xs text-slate-500">{email}</p>}
          </div>
        </div>

        <Field label="Contraseña actual" htmlFor="current-password">
          <input
            id="current-password"
            type="password"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="focus-ring w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </Field>

        <Field label="Nueva contraseña" htmlFor="new-password">
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="focus-ring w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </Field>

        <Field label="Confirmar nueva contraseña" htmlFor="confirm-password">
          <input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="focus-ring w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </Field>

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        {success && (
          <p role="status" className="text-sm text-accent-green">
            Contraseña actualizada correctamente.
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="focus-ring w-full rounded-lg bg-accent-blue px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {submitting ? 'Actualizando…' : 'Cambiar contraseña'}
        </button>
      </form>
    </AppLayout>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
    </div>
  );
}
