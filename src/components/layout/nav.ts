import {
  LayoutDashboard,
  ClipboardList,
  Upload,
  GitCompareArrows,
  History,
  Mail,
  Package,
  Settings,
  Users,
  BarChart3,
  FileClock,
  ShieldCheck,
  CalendarRange,
  type LucideIcon,
} from 'lucide-react';
import type { Permission } from '@/types/user';

/** Contadores dinámicos que una entrada de navegación puede mostrar como badge. */
export type NavBadge = 'pendingChanges';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  permission: Permission;
  /** Badge con dato real (nunca simulado). */
  badge?: NavBadge;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

/**
 * Navegación lateral agrupada por área (§34). El acceso real está protegido por
 * rutas y reglas; aquí solo se ordena y agrupa para el escaneo del usuario.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Operación',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, permission: 'dashboard' },
      { to: '/operacion', label: 'Seguimiento operativo', icon: ClipboardList, permission: 'operations' },
    ],
  },
  {
    label: 'Cargas',
    items: [
      { to: '/nueva-carga', label: 'Nueva carga', icon: Upload, permission: 'imports' },
      { to: '/cambios', label: 'Cambios detectados', icon: GitCompareArrows, permission: 'changes', badge: 'pendingChanges' },
      { to: '/historial', label: 'Historial de cargas', icon: History, permission: 'history' },
    ],
  },
  {
    label: 'Herramientas',
    items: [
      { to: '/campanas', label: 'Correo Ecommerce', icon: Mail, permission: 'campaigns' },
      { to: '/catalogo', label: 'Catálogo de artículos', icon: Package, permission: 'catalog' },
    ],
  },
  {
    label: 'Resultados',
    items: [
      { to: '/resultados/dashboard', label: 'Dashboard', icon: BarChart3, permission: 'results.read' },
      { to: '/resultados/nueva-carga', label: 'Nueva carga Kevel', icon: Upload, permission: 'results.import' },
      { to: '/resultados/historial', label: 'Historial de cargas', icon: FileClock, permission: 'results.read' },
      { to: '/resultados/validaciones', label: 'Validaciones', icon: ShieldCheck, permission: 'results.read' },
      { to: '/resultados/periodos', label: 'Periodos ecommerce', icon: CalendarRange, permission: 'results.read' },
    ],
  },
  {
    label: 'Administración',
    items: [
      { to: '/configuracion', label: 'Configuración', icon: Settings, permission: 'settings' },
      { to: '/usuarios', label: 'Administración de usuarios', icon: Users, permission: 'users' },
    ],
  },
];
