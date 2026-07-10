import { NavLink } from 'react-router-dom';
import { NAV_ITEMS } from './nav';
import { usePermissions } from '@/hooks/usePermissions';

/** Sidebar azul marino fija (§33, §34). */
export function Sidebar() {
  const { can } = usePermissions();
  const items = NAV_ITEMS.filter((item) => can(item.permission));

  return (
    <aside className="flex h-full w-64 flex-shrink-0 flex-col bg-navy-900 text-slate-200">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-blue/20 ring-1 ring-accent-blue/40">
          <span className="h-3.5 w-3.5 rounded-full border-2 border-accent-blue" />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-bold text-white">eComFlow</p>
          <p className="text-[11px] font-medium text-slate-400">Next</p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2" aria-label="Navegación principal">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                [
                  'focus-ring flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-accent-blue text-white'
                    : 'text-slate-300 hover:bg-white/5 hover:text-white',
                ].join(' ')
              }
            >
              <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="px-5 py-4 text-[11px] text-slate-500">
        eComFlow Next · v0.1.0
      </div>
    </aside>
  );
}
