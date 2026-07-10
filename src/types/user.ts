/** Usuarios y permisos (§27). */

export type Role = 'admin' | 'manager' | 'operator' | 'viewer';

export interface AppUser {
  user_id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  permissions?: string[];
  created_at?: unknown;
  updated_at?: unknown;
}

/** Áreas / capacidades que la UI usa para mostrar u ocultar (§34). */
export type Permission =
  | 'dashboard'
  | 'operations'
  | 'operations.write'
  | 'imports'
  | 'imports.write'
  | 'changes'
  | 'campaigns'
  | 'catalog'
  | 'catalog.write'
  | 'reports'
  | 'history'
  | 'settings'
  | 'users';

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  admin: [
    'dashboard',
    'operations',
    'operations.write',
    'imports',
    'imports.write',
    'changes',
    'campaigns',
    'catalog',
    'catalog.write',
    'reports',
    'history',
    'settings',
    'users',
  ],
  manager: [
    'dashboard',
    'operations',
    'operations.write',
    'imports',
    'imports.write',
    'changes',
    'campaigns',
    'catalog',
    'catalog.write',
    'reports',
    'history',
  ],
  operator: [
    'dashboard',
    'operations',
    'operations.write',
    'campaigns',
    'changes',
    'history',
  ],
  viewer: ['dashboard', 'operations', 'campaigns', 'history'],
};

export function roleHasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
