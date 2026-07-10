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
import { SettingsPage } from '@/pages/settings/SettingsPage';
import { UsersPage } from '@/pages/users/UsersPage';

function protectedElement(node: JSX.Element, permission?: Parameters<typeof ProtectedRoute>[0]['permission']) {
  return <ProtectedRoute permission={permission}>{node}</ProtectedRoute>;
}

export const router = createBrowserRouter(
  [
  { path: '/login', element: <LoginPage /> },
  { path: '/', element: protectedElement(<DashboardPage />, 'dashboard') },
  { path: '/operacion', element: protectedElement(<OperationsPage />, 'operations') },
  { path: '/nueva-carga', element: protectedElement(<NewImportPage />, 'imports') },
  { path: '/cambios', element: protectedElement(<DetectedChangesPage />, 'changes') },
  { path: '/historial', element: protectedElement(<ImportHistoryPage />, 'history') },
  { path: '/campanas', element: protectedElement(<CampaignsListPage />, 'campaigns') },
  { path: '/campanas/:id', element: protectedElement(<CampaignDetailPage />, 'campaigns') },
  { path: '/catalogo', element: protectedElement(<PlacementsPage />, 'catalog') },
  { path: '/configuracion', element: protectedElement(<SettingsPage />, 'settings') },
  { path: '/usuarios', element: protectedElement(<UsersPage />, 'users') },
  { path: '*', element: <Navigate to="/" replace /> },
  ],
  { basename: import.meta.env.BASE_URL },
);
