import { createBrowserRouter, Navigate } from 'react-router-dom';
import { ProtectedRoute } from '@/features/auth/ProtectedRoute';
import { LoginPage } from '@/pages/auth/LoginPage';
import { DashboardPage } from '@/pages/dashboard/DashboardPage';
import { PlacementsPage } from '@/pages/placements/PlacementsPage';
import { NewImportPage } from '@/pages/imports/NewImportPage';
import { ImportHistoryPage } from '@/pages/imports/ImportHistoryPage';
import { PlaceholderPage } from '@/pages/PlaceholderPage';

function protectedElement(node: JSX.Element, permission?: Parameters<typeof ProtectedRoute>[0]['permission']) {
  return <ProtectedRoute permission={permission}>{node}</ProtectedRoute>;
}

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/', element: protectedElement(<DashboardPage />, 'dashboard') },
  {
    path: '/operacion',
    element: protectedElement(
      <PlaceholderPage title="Seguimiento operativo" description="Checks, responsables y comentarios por línea" phase="Fase 5" />,
      'operations',
    ),
  },
  { path: '/nueva-carga', element: protectedElement(<NewImportPage />, 'imports') },
  {
    path: '/cambios',
    element: protectedElement(
      <PlaceholderPage title="Cambios detectados" description="Revisión de creatividades y sustituciones" phase="Fase 7" />,
      'changes',
    ),
  },
  { path: '/historial', element: protectedElement(<ImportHistoryPage />, 'history') },
  {
    path: '/campanas',
    element: protectedElement(
      <PlaceholderPage title="Detalle de campaña" description="Jerarquía campaña / espacios / líneas" phase="Fase 5" />,
      'campaigns',
    ),
  },
  { path: '/catalogo', element: protectedElement(<PlacementsPage />, 'catalog') },
  {
    path: '/configuracion',
    element: protectedElement(
      <PlaceholderPage title="Configuración" description="Parámetros de la aplicación" phase="Fase 8" />,
      'settings',
    ),
  },
  {
    path: '/usuarios',
    element: protectedElement(
      <PlaceholderPage title="Administración de usuarios" description="Roles y permisos" phase="Fase 8" />,
      'users',
    ),
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
