import { AlertTriangle, XCircle } from 'lucide-react';
import type { ValidationIssue } from '@/types/results';

/** Lista de incidencias de validación (errores y advertencias). */
export function IssuesList({ issues, max = 200 }: { issues: ValidationIssue[]; max?: number }) {
  if (issues.length === 0) return null;
  const shown = issues.slice(0, max);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
          <tr>
            <th className="px-3 py-2 font-medium">Severidad</th>
            <th className="px-3 py-2 font-medium">Código</th>
            <th className="px-3 py-2 font-medium">Fila</th>
            <th className="px-3 py-2 font-medium">Campo</th>
            <th className="px-3 py-2 font-medium">Descripción</th>
            <th className="px-3 py-2 font-medium">Acción sugerida</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((i, idx) => (
            <tr key={idx} className="border-t border-slate-100">
              <td className="px-3 py-2">
                {i.severity === 'error' ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-600">
                    <XCircle className="h-3.5 w-3.5" aria-hidden="true" /> Error
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> Aviso
                  </span>
                )}
              </td>
              <td className="px-3 py-2 font-mono text-xs text-slate-600">{i.code}</td>
              <td className="px-3 py-2 tabular-nums text-slate-500">{i.row_number ?? '—'}</td>
              <td className="px-3 py-2 text-slate-500">{i.field ?? '—'}</td>
              <td className="px-3 py-2 text-slate-700">{i.description}</td>
              <td className="px-3 py-2 text-slate-400">{i.suggested_action}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {issues.length > shown.length && (
        <p className="px-3 py-2 text-xs text-slate-400">
          Mostrando {shown.length} de {issues.length} incidencias. Descargue el reporte para verlas todas.
        </p>
      )}
    </div>
  );
}
