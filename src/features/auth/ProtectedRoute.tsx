import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { LoadingState } from '@/components/feedback/States';
import type { Permission } from '@/types/user';

function FullScreen({ children }: { children: ReactNode }) {
  return <div className="flex h-full items-center justify-center bg-canvas">{children}</div>;
}

/**
 * Protege una ruta: exige sesión, documento users/{uid} y usuario activo
 * (§27, §59). La autorización real está respaldada por reglas de Firestore.
 */
export function ProtectedRoute({
  children,
  permission,
}: {
  children: ReactNode;
  permission?: Permission;
}) {
  const { loading, firebaseUser, appUser } = useAuth();
  const { can } = usePermissions();

  if (loading) {
    return (
      <FullScreen>
        <LoadingState label="Verificando sesión…" />
      </FullScreen>
    );
  }

  if (!firebaseUser) {
    return <Navigate to="/login" replace />;
  }

  // Sesión válida pero sin documento de usuario o inactivo: sin acceso a datos.
  if (!appUser || !appUser.active) {
    return (
      <FullScreen>
        <div className="card max-w-md p-8 text-center">
          <ShieldAlert className="mx-auto mb-3 h-10 w-10 text-accent-orange" aria-hidden="true" />
          <h2 className="text-base font-semibold text-slate-800">Acceso no autorizado</h2>
          <p className="mt-2 text-sm text-slate-500">
            Su cuenta no tiene un perfil activo en el sistema. Solicite a un administrador que
            cree o active su documento <code>users/&#123;uid&#125;</code> en Firestore.
          </p>
        </div>
      </FullScreen>
    );
  }

  if (permission && !can(permission)) {
    return (
      <FullScreen>
        <div className="card max-w-md p-8 text-center">
          <ShieldAlert className="mx-auto mb-3 h-10 w-10 text-slate-400" aria-hidden="true" />
          <h2 className="text-base font-semibold text-slate-800">Permiso insuficiente</h2>
          <p className="mt-2 text-sm text-slate-500">
            Su rol no tiene acceso a esta sección.
          </p>
        </div>
      </FullScreen>
    );
  }

  return <>{children}</>;
}
