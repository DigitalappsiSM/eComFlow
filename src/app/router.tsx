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
import { ResetDataPage } from '@/pages/admin/ResetDataPage';
import { ResultsDashboardPage } from '@/pages/results/ResultsDashboardPage';
import { ResultsNewImportPage } from '@/pages/results/ResultsNewImportPage';
import { ResultsImportHistoryPage } from '@/pages/results/ResultsImportHistoryPage';
import { ResultsValidationsPage } from '@/pages/results/ResultsValidationsPage';
import { ResultsPeriodsPage } from '@/pages/results/ResultsPeriodsPage';

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
  // --- Módulo Resultados Ecommerce (dominio independiente, §3) ---
  { path: '/resultados', element: <Navigate to="/resultados/dashboard" replace /> },
  { path: '/resultados/dashboard', element: protectedElement(<ResultsDashboardPage />, 'results.read') },
  { path: '/resultados/nueva-carga', element: protectedElement(<ResultsNewImportPage />, 'results.import') },
  { path: '/resultados/historial', element: protectedElement(<ResultsImportHistoryPage />, 'results.read') },
  { path: '/resultados/validaciones', element: protectedElement(<ResultsValidationsPage />, 'results.read') },
  { path: '/resultados/periodos', element: protectedElement(<ResultsPeriodsPage />, 'results.read') },
  // Ruta OCULTA (no está en el menú): reinicio de datos de prueba, solo admin.
  { path: '/reiniciar-datos', element: protectedElement(<ResetDataPage />, 'users') },
  { path: '*', element: <Navigate to="/" replace /> },
  ],
  { basename: import.meta.env.BASE_URL },
);
