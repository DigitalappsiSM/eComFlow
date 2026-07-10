import {
  LayoutDashboard,
  ClipboardList,
  Upload,
  GitCompareArrows,
  History,
  FileText,
  Package,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { Permission } from '@/types/user';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  permission: Permission;
}

/** Navegación lateral (§34). El acceso real está protegido por rutas y reglas. */
export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, permission: 'dashboard' },
  { to: '/operacion', label: 'Seguimiento operativo', icon: ClipboardList, permission: 'operations' },
  { to: '/nueva-carga', label: 'Nueva carga', icon: Upload, permission: 'imports' },
  { to: '/cambios', label: 'Cambios detectados', icon: GitCompareArrows, permission: 'changes' },
  { to: '/historial', label: 'Historial de cargas', icon: History, permission: 'history' },
  { to: '/campanas', label: 'Detalle de campaña', icon: FileText, permission: 'campaigns' },
  { to: '/catalogo', label: 'Catálogo de artículos', icon: Package, permission: 'catalog' },
  { to: '/configuracion', label: 'Configuración', icon: Settings, permission: 'settings' },
  { to: '/usuarios', label: 'Administración de usuarios', icon: Users, permission: 'users' },
];
