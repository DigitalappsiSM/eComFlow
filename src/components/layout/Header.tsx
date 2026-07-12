import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, ChevronDown, LogOut, Menu } from 'lucide-react';
import { ConnectionIndicator } from './ConnectionIndicator';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { usePendingChangesCount } from '@/features/changes/usePendingChangesCount';

interface HeaderProps {
  title: string;
  description?: string;
  onOpenMenu?: () => void;
}

/** Encabezado de vista (§35). */
export function Header({ title, description, onOpenMenu }: HeaderProps) {
  const { appUser, firebaseUser, signOut } = useAuth();
  const { can } = usePermissions();
  const canReadChanges = can('changes');
  const pendingChanges = usePendingChangesCount(canReadChanges);
  const [menuOpen, setMenuOpen] = useState(false);

  const displayName = appUser?.name ?? firebaseUser?.email ?? 'Usuario';
  const roleLabel = appUser?.role ?? '—';
  const hasPending = pendingChanges !== null && pendingChanges > 0;

  return (
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
      <div className="flex min-w-0 items-center gap-2">
        {onOpenMenu && (
          <button
            type="button"
            onClick={onOpenMenu}
            className="focus-ring -ml-1 rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
            aria-label="Abrir menú"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold text-slate-900">{title}</h1>
          {description && <p className="hidden truncate text-sm text-slate-500 sm:block">{description}</p>}
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <ConnectionIndicator />

        {canReadChanges && (
          <Link
            to="/cambios"
            className="focus-ring relative rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            aria-label={hasPending ? `Cambios detectados (${pendingChanges} pendientes)` : 'Cambios detectados'}
          >
            <Bell className="h-5 w-5" aria-hidden="true" />
            {hasPending && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-white bg-red-600 px-1 text-[10px] font-bold tabular-nums text-white">
                {pendingChanges > 99 ? '99+' : pendingChanges}
              </span>
            )}
          </Link>
        )}

        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="focus-ring flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-100"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy-600 text-xs font-semibold text-white">
              {displayName.slice(0, 2).toUpperCase()}
            </span>
            <span className="hidden text-left sm:block">
              <span className="block text-sm font-medium text-slate-800">{displayName}</span>
              <span className="block text-[11px] capitalize text-slate-400">{roleLabel}</span>
            </span>
            <ChevronDown className="h-4 w-4 text-slate-400" aria-hidden="true" />
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => void signOut()}
                className="focus-ring flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
