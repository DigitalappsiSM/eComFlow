import { NavLink } from 'react-router-dom';
import { ChevronsLeft } from 'lucide-react';
import { NAV_SECTIONS, type NavBadge } from './nav';
import { usePermissions } from '@/hooks/usePermissions';
import { usePendingChangesCount } from '@/features/changes/usePendingChangesCount';

function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

function badgeText(count: number): string {
  return count > 99 ? '99+' : String(count);
}

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

/** Sidebar azul marino: agrupada, colapsable (escritorio) y drawer en móvil (§33, §34). */
export function Sidebar({ collapsed, onToggleCollapse, mobileOpen, onCloseMobile }: SidebarProps) {
  const { can } = usePermissions();
  const pendingChanges = usePendingChangesCount(can('changes'));

  const badgeCount = (badge?: NavBadge): number | null =>
    badge === 'pendingChanges' ? pendingChanges : null;

  const sections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => can(item.permission)),
  })).filter((section) => section.items.length > 0);

  return (
    <>
      <div
        className={cx(
          'fixed inset-0 z-30 bg-navy-900/50 transition-opacity lg:hidden',
          mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={onCloseMobile}
        aria-hidden="true"
      />

      <aside
        className={cx(
          'fixed inset-y-0 left-0 z-40 flex h-full flex-col bg-navy-900 text-slate-200 transition-[width,transform] duration-200 ease-out',
          'w-64 -translate-x-full lg:static lg:z-auto lg:translate-x-0',
          mobileOpen && 'translate-x-0',
          collapsed ? 'lg:w-[68px]' : 'lg:w-64',
        )}
        aria-label="Navegación principal"
      >
        <div className={cx('flex items-center gap-2.5 px-5 py-5', collapsed && 'lg:justify-center lg:px-0')}>
          <div className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-accent-blue/20 ring-1 ring-accent-blue/40">
            <span className="h-3.5 w-3.5 rounded-full border-2 border-accent-blue" />
          </div>
          <div className={cx('leading-tight', collapsed && 'lg:hidden')}>
            <p className="text-sm font-bold text-white">eComFlow</p>
            <p className="text-[11px] font-medium text-slate-400">Next</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-2" aria-label="Secciones">
          {sections.map((section, index) => (
            <div key={section.label} className="mb-1">
              <p
                className={cx(
                  'px-3 pb-1 pt-4 text-[10px] font-bold uppercase tracking-wider text-slate-500',
                  collapsed && 'lg:hidden',
                )}
              >
                {section.label}
              </p>
              {index > 0 && (
                <div className={cx('mx-2 mb-2 h-px bg-white/10', collapsed ? 'hidden lg:block' : 'hidden')} />
              )}
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const count = badgeCount(item.badge);
                  const hasBadge = count !== null && count > 0;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === '/'}
                      onClick={onCloseMobile}
                      className="focus-ring block rounded-lg"
                    >
                      {({ isActive }) => (
                        <span
                          className={cx(
                            'group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                            isActive ? 'bg-accent-blue text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white',
                            collapsed && 'lg:justify-center lg:gap-0 lg:px-0',
                          )}
                        >
                          <Icon className="h-[18px] w-[18px] flex-none" aria-hidden="true" />
                          {hasBadge && (
                            <span
                              className={cx(
                                'absolute right-3 top-1.5 h-2 w-2 rounded-full bg-accent-blue ring-2 ring-navy-900',
                                collapsed ? 'hidden lg:block' : 'hidden',
                              )}
                            />
                          )}
                          <span className={cx('flex-1 truncate', collapsed && 'lg:hidden')}>{item.label}</span>
                          {hasBadge && (
                            <span
                              className={cx(
                                'flex-none rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums',
                                isActive ? 'bg-white/25 text-white' : 'bg-white/15 text-white',
                                collapsed && 'lg:hidden',
                              )}
                            >
                              {badgeText(count)}
                            </span>
                          )}
                          <span
                            className={cx(
                              'pointer-events-none absolute left-full z-50 ml-3 whitespace-nowrap rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white opacity-0 shadow-lg',
                              collapsed ? 'hidden lg:block lg:group-hover:opacity-100' : 'hidden',
                            )}
                          >
                            {item.label}
                            {hasBadge ? ` · ${badgeText(count)}` : ''}
                          </span>
                        </span>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-white/10 px-3 py-3">
          <button
            type="button"
            onClick={onToggleCollapse}
            className={cx(
              'focus-ring hidden w-full items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-semibold text-slate-400 hover:bg-white/5 hover:text-white lg:flex',
              collapsed && 'lg:justify-center lg:px-0',
            )}
            aria-label={collapsed ? 'Expandir menú' : 'Colapsar menú'}
          >
            <ChevronsLeft
              className={cx('h-[18px] w-[18px] flex-none transition-transform', collapsed && 'rotate-180')}
              aria-hidden="true"
            />
            <span className={cx(collapsed && 'lg:hidden')}>Colapsar</span>
          </button>
          <p className={cx('px-3 pt-2 text-[11px] text-slate-500', collapsed && 'lg:hidden')}>eComFlow Next · v0.1.0</p>
        </div>
      </aside>
    </>
  );
}
