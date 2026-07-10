import { useAuth } from './useAuth';
import { roleHasPermission, type Permission } from '@/types/user';

/**
 * Permisos derivados del rol del usuario activo (§27, §34). Ocultar en UI es
 * solo conveniencia: la autorización real vive en las reglas de Firestore.
 */
export function usePermissions() {
  const { appUser } = useAuth();
  const role = appUser?.active ? appUser.role : null;

  function can(permission: Permission): boolean {
    if (!role) return false;
    return roleHasPermission(role, permission);
  }

  return { role, can };
}
