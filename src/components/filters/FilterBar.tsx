/**
 * Barra de filtros dinámicos reutilizable (§40). Panel claro con búsqueda,
 * selectores etiquetados y chips de filtros activos. Las opciones se derivan de
 * los datos cargados (dinámicas).
 */
import { Search, SlidersHorizontal, X } from 'lucide-react';
import type { FilterField, FilterValues } from './filter-utils';

interface FilterBarProps {
  fields: FilterField[];
  values: FilterValues;
  onChange: (key: string, value: string) => void;
  onClear: () => void;
  search?: { value: string; onChange: (v: string) => void; placeholder?: string };
  /** Texto opcional a la derecha (p. ej. "120 de 434 líneas"). */
  meta?: string;
  /** 'dark' usa vidrio oscuro con texto claro (dashboard tech ejecutivo). */
  tone?: 'light' | 'dark';
}

export function FilterBar({ fields, values, onChange, onClear, search, meta, tone = 'light' }: FilterBarProps) {
  const active = fields
    .map((f) => ({ field: f, value: values[f.key] ?? '' }))
    .filter((x) => x.value !== '');
  const hasActive = active.length > 0 || !!search?.value;
  const dark = tone === 'dark';
  const inputCls = dark
    ? 'border-white/15 bg-white/5 text-slate-100 placeholder-slate-500'
    : 'border-slate-300 bg-white';

  return (
    <div className={`${dark ? 'glass' : 'card'} mb-4 p-3`}>
      <div className="flex flex-wrap items-end gap-3">
        {search && (
          <div className="min-w-[220px] flex-1">
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">
              Buscar
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" />
              <input
                value={search.value}
                onChange={(e) => search.onChange(e.target.value)}
                placeholder={search.placeholder ?? 'Buscar…'}
                className={`focus-ring w-full rounded-lg border py-2 pl-8 pr-3 text-sm ${inputCls}`}
                aria-label="Buscar"
              />
            </div>
          </div>
        )}

        {fields.map((f) => (
          <div key={f.key} className="min-w-[140px] flex-1 sm:flex-none sm:min-w-[150px]">
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">
              {f.label}
            </label>
            <select
              value={values[f.key] ?? ''}
              onChange={(e) => onChange(f.key, e.target.value)}
              className={`focus-ring w-full rounded-lg border px-2.5 py-2 text-sm ${dark ? 'border-white/15 bg-white/5 text-slate-100 [&>option]:text-slate-900' : 'border-slate-300 bg-white'}`}
              aria-label={f.label}
            >
              <option value="">Todos</option>
              {f.options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>
        ))}

        <div className="ml-auto flex items-center gap-3 self-center pt-4">
          {meta && <span className="whitespace-nowrap text-xs text-slate-400">{meta}</span>}
          {hasActive && (
            <button
              type="button"
              onClick={onClear}
              className={`focus-ring inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium ${dark ? 'border-white/15 text-slate-300 hover:bg-white/10' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" /> Limpiar
            </button>
          )}
        </div>
      </div>

      {hasActive && (
        <div className={`mt-2 flex flex-wrap items-center gap-1.5 border-t pt-2 ${dark ? 'border-white/10' : 'border-slate-100'}`}>
          <SlidersHorizontal className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
          {active.map(({ field, value }) => (
            <button
              key={field.key}
              type="button"
              onClick={() => onChange(field.key, '')}
              className="focus-ring inline-flex items-center gap-1 rounded-full bg-accent-blue/10 px-2.5 py-0.5 text-xs font-medium text-accent-blue hover:bg-accent-blue/20"
              title="Quitar filtro"
            >
              {field.label}: {value}
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
