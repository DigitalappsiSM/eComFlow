import { createBrowserRouter, Navigate } from 'react-router-dom';
import { ProtectedRoute } from '@/features/auth/ProtectedRoute';
import { LoginPage } from '@/pages/auth/LoginPage';
import { DashboardPage } from '@/pages/dashboard/DashboardPage';
import { PlacementsPage } from '@/pages/placements/PlacementsPage';
import { NewImportPage } from '@/pages/imports/NewImportPage';
import { ImportHistoryPage } from '@/pages/imports/ImportHistoryPage';
import { OperationsPage } from '@/pages/operations/OperationsPage';
import { CampaignsListPage } from '@/pages/campaigns/CampaignsListPage';
import { CampaignDetailPage } from '@/pages/campaigns/CampaignDetailPage';
import { DetectedChangesPage } from '@/pages/changes/DetectedChangesPage';
import { PlaceholderPage } from '@/pages/PlaceholderPage';

function protectedElement(node: JSX.Element, permission?: Parameters<typeof ProtectedRoute>[0]['permission']) {
  return <ProtectedRoute permission={permission}>{node}</ProtectedRoute>;
}

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/', element: protectedElement(<DashboardPage />, 'dashboard') },
  { path: '/operacion', element: protectedElement(<OperationsPage />, 'operations') },
  { path: '/nueva-carga', element: protectedElement(<NewImportPage />, 'imports') },
  { path: '/cambios', element: protectedElement(<DetectedChangesPage />, 'changes') },
  { path: '/historial', element: protectedElement(<ImportHistoryPage />, 'history') },
  { path: '/campanas', element: protectedElement(<CampaignsListPage />, 'campaigns') },
  { path: '/campanas/:id', element: protectedElement(<CampaignDetailPage />, 'campaigns') },
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
