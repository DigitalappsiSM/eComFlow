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
  | 'users'
  // --- Módulo Resultados Ecommerce (dominio independiente, §3). ---
  | 'results.read'
  | 'results.import'
  | 'results.export'
  | 'results.manage_mappings'
  | 'results.adjustments.view'
  | 'results.adjustments.create'
  | 'results.adjustments.review'
  | 'results.adjustments.approve'
  | 'results.adjustments.archive';

/** Permisos de Resultados por rol (KAM = operator, §3/§17). Independientes de operación. */
const RESULTS_ADMIN: readonly Permission[] = [
  'results.read',
  'results.import',
  'results.export',
  'results.manage_mappings',
  'results.adjustments.view',
  'results.adjustments.create',
  'results.adjustments.review',
  'results.adjustments.approve',
  'results.adjustments.archive',
];
const RESULTS_MANAGER: readonly Permission[] = RESULTS_ADMIN;
// El "KAM" (operator) crea y envía ajustes, pero NO aprueba los propios (§17).
const RESULTS_OPERATOR: readonly Permission[] = [
  'results.read',
  'results.import',
  'results.export',
  'results.adjustments.view',
  'results.adjustments.create',
];
const RESULTS_VIEWER: readonly Permission[] = ['results.read', 'results.adjustments.view'];

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
    ...RESULTS_ADMIN,
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
    ...RESULTS_MANAGER,
  ],
  operator: [
    'dashboard',
    'operations',
    'operations.write',
    'campaigns',
    'changes',
    'history',
    ...RESULTS_OPERATOR,
  ],
  viewer: ['dashboard', 'operations', 'campaigns', 'history', ...RESULTS_VIEWER],
};

export function roleHasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
