import { useRef, useState, type ChangeEvent } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileUp, Loader2 } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useImport } from '@/features/imports/useImport';
import { usePermissions } from '@/hooks/usePermissions';
import { downloadErrorReport } from '@/lib/error-report';
import type { ImportResult } from '@/domain/import-classification';

const RESULT_LABELS: Record<ImportResult, string> = {
  new_campaign: 'Nueva campaña',
  new_space: 'Nuevo espacio',
  new_line: 'Nueva línea',
  updated_space: 'Espacio actualizado',
  updated_line: 'Línea actualizada',
  unchanged: 'Sin cambios',
  creativity_change: 'Cambio de creatividad',
  possible_replacement: 'Posible sustitución',
  rejected: 'Rechazada',
};

const RESULT_STYLES: Record<ImportResult, string> = {
  new_campaign: 'bg-blue-50 text-accent-blue',
  new_space: 'bg-blue-50 text-accent-blue',
  new_line: 'bg-green-50 text-accent-green',
  updated_space: 'bg-amber-50 text-amber-700',
  updated_line: 'bg-amber-50 text-amber-700',
  unchanged: 'bg-slate-100 text-slate-500',
  creativity_change: 'bg-violet-50 text-accent-violet',
  possible_replacement: 'bg-violet-50 text-accent-violet',
  rejected: 'bg-red-50 text-red-600',
};

export function NewImportPage() {
  const { can } = usePermissions();
  const { state, selectFile, confirm, reset } = useImport();
  const inputRef = useRef<HTMLInputElement>(null);
  const [acknowledgedDuplicate, setAcknowledgedDuplicate] = useState(false);

  const canWrite = can('imports.write');

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void selectFile(file);
    e.target.value = '';
  }

  return (
    <AppLayout title="Nueva carga" description="Importación estricta de Excel / CSV (todo local en el navegador)">
      {!canWrite && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Su rol no tiene permiso para escribir importaciones. Puede revisar la vista previa, pero no
          confirmar.
        </div>
      )}

      {(state.step === 'idle' || state.step === 'rejected' || state.step === 'error') && (
        <div className="card p-8">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="focus-ring flex w-full flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-slate-300 py-12 text-slate-500 hover:border-accent-blue hover:text-accent-blue"
          >
            <FileUp className="h-8 w-8" aria-hidden="true" />
            <span className="text-sm font-medium">Seleccionar archivo .xlsx / .xls / .csv</span>
            <span className="text-xs text-slate-400">El archivo permanece en su equipo; solo se procesan los datos.</span>
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={onPick}
            className="sr-only"
            aria-label="Seleccionar archivo de importación"
          />

          {state.step === 'rejected' && (
            <div role="alert" className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4">
              <div className="flex items-center gap-2 font-semibold text-red-700">
                <AlertTriangle className="h-5 w-5" aria-hidden="true" />
                Archivo rechazado
              </div>
              <p className="mt-1 text-sm text-red-600">{state.reason}</p>
              <p className="mt-2 text-xs text-red-500">
                No se guardó ninguna campaña, espacio ni línea.
              </p>
            </div>
          )}

          {state.step === 'error' && (
            <div role="alert" className="mt-6 rounded-lg border border-orange-200 bg-orange-50 p-4 text-sm text-accent-orange">
              {state.message}
            </div>
          )}
        </div>
      )}

      {state.step === 'reading' && (
        <div className="card flex items-center gap-3 p-8 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          Leyendo y validando el archivo…
        </div>
      )}

      {state.step === 'preview' && (
        <div className="space-y-4">
          <div className="card p-5">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-800">{state.file.name}</p>
                <p className="text-xs text-slate-400">
                  {(state.file.size / 1024).toFixed(1)} KB · hash {state.file.hash.slice(0, 12)}…
                </p>
              </div>
              <button
                type="button"
                onClick={reset}
                className="focus-ring rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancelar
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
              <Stat label="Total" value={state.plan.summary.total} />
              <Stat label="Válidos" value={state.plan.summary.valid} />
              <Stat label="Nuevas camp." value={state.plan.summary.new_campaigns} />
              <Stat label="Nuevas líneas" value={state.plan.summary.new_lines} />
              <Stat label="Actualizados" value={state.plan.summary.updated} />
              <Stat label="Sin cambios" value={state.plan.summary.unchanged} />
              <Stat label="Rechazados" value={state.plan.summary.rejected} tone="danger" />
              <Stat label="Cambios creat." value={state.plan.summary.creativity_changes} />
            </div>

            {typeof state.plan.mergedRows === 'number' && state.plan.mergedRows > 0 && (
              <p className="mt-3 text-xs text-slate-500">
                {state.plan.mergedRows} fila(s) de material se agruparon en su línea operativa
                correspondiente (misma Creatividad Id).
              </p>
            )}

            {state.alreadyImported && (
              <label className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                <input
                  type="checkbox"
                  checked={acknowledgedDuplicate}
                  onChange={(e) => setAcknowledgedDuplicate(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  Este archivo (mismo <code>file_hash</code>) ya fue procesado. Marque para confirmar
                  que desea procesarlo de nuevo. Las entidades usan IDs deterministas, por lo que no
                  se duplican.
                </span>
              </label>
            )}

            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                disabled={!canWrite || (state.alreadyImported && !acknowledgedDuplicate) || state.plan.summary.valid === 0}
                onClick={() => void confirm()}
                className="focus-ring rounded-lg bg-accent-blue px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Confirmar importación
              </button>
              {state.plan.summary.rejected > 0 && (
                <button
                  type="button"
                  onClick={() => downloadErrorReport(state.plan.rows, `errores-${state.file.name}.csv`)}
                  className="focus-ring flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Descargar reporte de errores
                </button>
              )}
            </div>
          </div>

          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                  <th className="px-3 py-2 font-medium">Fila</th>
                  <th className="px-3 py-2 font-medium">Cliente</th>
                  <th className="px-3 py-2 font-medium">Campaña</th>
                  <th className="px-3 py-2 font-medium">Artículo</th>
                  <th className="px-3 py-2 font-medium">Creatividad ID</th>
                  <th className="px-3 py-2 font-medium">Resultado</th>
                  <th className="px-3 py-2 font-medium">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {state.plan.rows.map((row) => (
                  <tr key={row.rowNumber} className="border-b border-slate-100">
                    <td className="px-3 py-2 tabular-nums text-slate-500">{row.rowNumber}</td>
                    <td className="px-3 py-2 text-slate-700">{row.raw['Cliente'] ?? ''}</td>
                    <td className="px-3 py-2 text-slate-700">{row.raw['Número de campaña'] ?? ''}</td>
                    <td className="px-3 py-2 text-slate-600">{row.raw['Artículo'] ?? ''}</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-600">{row.raw['Creatividad ID'] ?? ''}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${RESULT_STYLES[row.result]}`}>
                        {RESULT_LABELS[row.result]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-500">{row.errors[0]?.error_reason ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {state.step === 'confirming' && (
        <div className="card p-8">
          <div className="flex items-center gap-3 text-slate-600">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            <span className="text-sm font-medium">Escribiendo en Firestore…</span>
          </div>
          <div className="mt-4 h-2 rounded-full bg-slate-100">
            <div
              className="h-2 rounded-full bg-accent-blue transition-all"
              style={{
                width: `${state.progress.total === 0 ? 0 : Math.round((state.progress.confirmed / state.progress.total) * 100)}%`,
              }}
            />
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Lote {state.progress.batch} · {state.progress.confirmed} / {state.progress.total} escrituras confirmadas.
            No cierre la ventana.
          </p>
        </div>
      )}

      {state.step === 'done' && (
        <div className="card p-8">
          <div className="flex items-center gap-2 text-accent-green">
            <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
            <span className="text-base font-semibold">
              Importación {state.result.status === 'processed' ? 'completada' : 'completada parcialmente'}
            </span>
          </div>
          <p className="mt-2 text-sm text-slate-500">
            Registro de importación: <code>{state.result.importId}</code>. Las métricas del dashboard
            ya reflejan estos datos desde Firestore.
          </p>
          <button
            type="button"
            onClick={reset}
            className="focus-ring mt-4 rounded-lg bg-accent-blue px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Nueva importación
          </button>
        </div>
      )}
    </AppLayout>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'danger' }) {
  return (
    <div className="rounded-lg border border-slate-200 p-2 text-center">
      <p className={`text-lg font-bold ${tone === 'danger' && value > 0 ? 'text-red-600' : 'text-slate-800'}`}>
        {value}
      </p>
      <p className="text-[11px] text-slate-400">{label}</p>
    </div>
  );
}
