/**
 * Barra de filtros dinámicos reutilizable (§40). Las opciones se derivan de los
 * datos cargados (dinámicas). Combinable con búsqueda; permite limpiar.
 */
import { Filter, X } from 'lucide-react';
import type { FilterField, FilterValues } from './filter-utils';

interface FilterBarProps {
  fields: FilterField[];
  values: FilterValues;
  onChange: (key: string, value: string) => void;
  onClear: () => void;
  search?: { value: string; onChange: (v: string) => void; placeholder?: string };
}

export function FilterBar({ fields, values, onChange, onClear, search }: FilterBarProps) {
  const activeCount = Object.values(values).filter((v) => v && v !== '').length;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <span className="flex items-center gap-1 text-xs font-medium text-slate-500">
        <Filter className="h-3.5 w-3.5" aria-hidden="true" /> Filtros
      </span>

      {search && (
        <input
          value={search.value}
          onChange={(e) => search.onChange(e.target.value)}
          placeholder={search.placeholder ?? 'Buscar…'}
          className="focus-ring w-56 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          aria-label="Buscar"
        />
      )}

      {fields.map((f) => (
        <select
          key={f.key}
          value={values[f.key] ?? ''}
          onChange={(e) => onChange(f.key, e.target.value)}
          className="focus-ring rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
          aria-label={f.label}
        >
          <option value="">{f.label}: todos</option>
          {f.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ))}

      {(activeCount > 0 || (search && search.value)) && (
        <button
          type="button"
          onClick={onClear}
          className="focus-ring inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" /> Limpiar
        </button>
      )}
    </div>
  );
}
