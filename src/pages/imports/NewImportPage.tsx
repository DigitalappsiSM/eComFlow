import { useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileUp, Loader2, Tags } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useImport } from '@/features/imports/useImport';
import { usePermissions } from '@/hooks/usePermissions';
import { downloadErrorReport } from '@/lib/error-report';
import type { ImportResult } from '@/domain/import-classification';
import type { ImportPlan } from '@/domain/import-pipeline';
import type { ImportCoverageMode } from '@/types/import';
import type { LoadedFile } from '@/lib/file-reader';

const RESULT_LABELS: Record<ImportResult, string> = {
  new_campaign: 'Nueva campaña',
  new_space: 'Nuevo espacio',
  new_line: 'Nueva línea',
  updated_space: 'Espacio actualizado',
  updated_line: 'Línea actualizada',
  unchanged: 'Sin cambios',
  creativity_change: 'Cambio de creatividad',
  possible_replacement: 'Posible sustitución',
  excluded_by_type: 'Excluida (no digital)',
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
  excluded_by_type: 'bg-slate-100 text-slate-500',
  rejected: 'bg-red-50 text-red-600',
};

/** Máximo de líneas ausentes mostradas en el detalle visual (§8.9). */
const MISSING_PREVIEW_LIMIT = 50;

export function NewImportPage() {
  const { can } = usePermissions();
  const { state, selectFile, confirm, classifyAndContinue, reset } = useImport();
  const inputRef = useRef<HTMLInputElement>(null);

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

      {state.step === 'classify' && (
        <ClassifyArticulos
          unknown={state.unknown}
          tipos={state.tipos}
          canWrite={canWrite}
          onCancel={reset}
          onSubmit={(assignments) => void classifyAndContinue(assignments)}
        />
      )}

      {state.step === 'preview' && (
        // `key` por hash de archivo: el estado de confirmación (modo, checkbox,
        // duplicado reconocido) NO se hereda al siguiente archivo (§13).
        <ImportPreview
          key={state.file.hash}
          file={state.file}
          plan={state.plan}
          alreadyImported={state.alreadyImported}
          canWrite={canWrite}
          onConfirm={(mode) => void confirm(mode)}
          onReset={reset}
        />
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
          {(state.result.missingRows > 0 || state.result.restoredRows > 0) && (
            <p className="mt-1 text-sm text-slate-600">
              Conciliación: {state.result.missingRows} línea(s) marcadas como no incluidas,{' '}
              {state.result.restoredRows} restaurada(s).
            </p>
          )}
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

function ImportPreview({
  file,
  plan,
  alreadyImported,
  canWrite,
  onConfirm,
  onReset,
}: {
  file: LoadedFile;
  plan: ImportPlan;
  alreadyImported: boolean;
  canWrite: boolean;
  onConfirm: (mode: ImportCoverageMode) => void;
  onReset: () => void;
}) {
  const [acknowledgedDuplicate, setAcknowledgedDuplicate] = useState(false);
  const [mode, setMode] = useState<ImportCoverageMode>('additive');
  const [confirmChecked, setConfirmChecked] = useState(false);

  const reconciliation = plan.reconciliation;
  const scope = reconciliation?.detectedScope;
  const missing = reconciliation?.missing ?? [];
  const restoreCount = reconciliation?.restoreIds.length ?? 0;
  const existingInScope = reconciliation?.existingInScope ?? 0;
  const eligible = reconciliation?.eligible ?? false;
  const blockedReasons = reconciliation?.blockedReasons ?? [];

  const dupBlocked = alreadyImported && !acknowledgedDuplicate;
  const authBlocked = mode === 'authoritative' && (!confirmChecked || !eligible);
  const confirmDisabled = !canWrite || dupBlocked || plan.summary.valid === 0 || authBlocked;

  const confirmLabel =
    mode === 'authoritative'
      ? `Importar y marcar ${missing.length} línea(s) como no incluidas`
      : 'Importar sin conciliar';

  const missingShown = missing.slice(0, MISSING_PREVIEW_LIMIT);
  const missingTruncated = missing.length > MISSING_PREVIEW_LIMIT;

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-800">{file.name}</p>
            <p className="text-xs text-slate-400">
              {(file.size / 1024).toFixed(1)} KB · hash {file.hash.slice(0, 12)}…
            </p>
          </div>
          <button
            type="button"
            onClick={onReset}
            className="focus-ring rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            Cancelar
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          <Stat label="Total" value={plan.summary.total} />
          <Stat label="Válidos" value={plan.summary.valid} />
          <Stat label="Nuevas camp." value={plan.summary.new_campaigns} />
          <Stat label="Nuevas líneas" value={plan.summary.new_lines} />
          <Stat label="Actualizados" value={plan.summary.updated} />
          <Stat label="Sin cambios" value={plan.summary.unchanged} />
          <Stat label="Rechazados" value={plan.summary.rejected} tone="danger" />
          <Stat label="Excluidas (no digital)" value={plan.summary.excluded} />
        </div>

        {typeof plan.mergedRows === 'number' && plan.mergedRows > 0 && (
          <p className="mt-3 text-xs text-slate-500">
            {plan.mergedRows} fila(s) de material se agruparon en su línea operativa
            correspondiente (misma Creatividad Id).
          </p>
        )}

        {alreadyImported && (
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
      </div>

      {/* Alcance detectado + conciliación de fuente EKON (§13). */}
      {reconciliation && scope && (
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-800">Alcance detectado de EKON</h2>
          <p className="mt-1 text-xs text-slate-500">
            La ausencia de una línea sólo se concilia cuando el archivo cubre el mismo alcance
            confirmado. Revise que estos periodos, cadenas y tipos correspondan a lo exportado.
          </p>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <ScopeBlock title="Periodos">
              {(scope.covered_periods ?? []).length === 0 ? (
                <span className="text-slate-400">Sin periodos detectados</span>
              ) : (
                <ul className="space-y-0.5">
                  {(scope.covered_periods ?? []).map((p) => (
                    <li key={`${p.code}|${p.start}|${p.end}`} className="tabular-nums">
                      <span className="font-medium text-slate-700">{p.code || 'Sin código'}</span>{' '}
                      <span className="text-slate-500">
                        {p.start} → {p.end}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </ScopeBlock>
            <ScopeBlock title="Cadenas">
              {(scope.scope_chains ?? []).length === 0 ? (
                <span className="text-slate-400">—</span>
              ) : (
                (scope.scope_chains ?? []).join(', ')
              )}
            </ScopeBlock>
            <ScopeBlock title="Tipos digitales">
              {(scope.scope_operation_types ?? []).length === 0 ? (
                <span className="text-slate-400">—</span>
              ) : (
                (scope.scope_operation_types ?? []).join(', ')
              )}
            </ScopeBlock>
            <ScopeBlock title="Conteos">
              <ul className="space-y-0.5">
                <li>Entrantes válidas: <strong className="tabular-nums">{plan.summary.valid}</strong></li>
                <li>En alcance: <strong className="tabular-nums">{existingInScope}</strong></li>
                <li>No incluidas: <strong className="tabular-nums text-red-600">{missing.length}</strong></li>
                <li>Restauradas: <strong className="tabular-nums text-accent-green">{restoreCount}</strong></li>
              </ul>
            </ScopeBlock>
          </div>

          {/* Selector de modo de cobertura. */}
          <fieldset className="mt-5">
            <legend className="text-xs font-semibold uppercase text-slate-500">Modo de importación</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label
                className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm ${
                  mode === 'additive' ? 'border-accent-blue bg-blue-50' : 'border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="coverage-mode"
                  className="mt-0.5"
                  checked={mode === 'additive'}
                  onChange={() => {
                    setMode('additive');
                    setConfirmChecked(false);
                  }}
                />
                <span>
                  <span className="font-medium text-slate-800">Importar sin conciliar</span>
                  <span className="block text-xs text-slate-500">
                    Modo seguro. Crea/actualiza líneas y refresca su presencia, pero no desactiva
                    nada.
                  </span>
                </span>
              </label>
              <label
                className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm ${
                  mode === 'authoritative' ? 'border-accent-blue bg-blue-50' : 'border-slate-300'
                } ${!eligible ? 'opacity-60' : ''}`}
              >
                <input
                  type="radio"
                  name="coverage-mode"
                  className="mt-0.5"
                  checked={mode === 'authoritative'}
                  disabled={!eligible}
                  onChange={() => setMode('authoritative')}
                />
                <span>
                  <span className="font-medium text-slate-800">Importar y conciliar con EKON</span>
                  <span className="block text-xs text-slate-500">
                    Trata el archivo como fotografía completa del alcance detectado. Las líneas que
                    no aparezcan se marcarán como no incluidas (baja lógica reversible).
                  </span>
                </span>
              </label>
            </div>
          </fieldset>

          {mode === 'authoritative' && eligible && (
            <label className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={confirmChecked}
                onChange={(e) => setConfirmChecked(e.target.checked)}
              />
              <span>
                Confirmo que esta exportación contiene todas las campañas digitales de EKON para los
                periodos, cadenas y tipos indicados. Las líneas que no aparezcan se marcarán como no
                incluidas en EKON.
              </span>
            </label>
          )}

          {!eligible && blockedReasons.length > 0 && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <p className="font-medium">La conciliación autoritativa no está disponible:</p>
              <ul className="mt-1 list-disc pl-5 text-xs">
                {blockedReasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
              <p className="mt-1 text-xs">Puede importar en modo aditivo sin desactivar datos.</p>
            </div>
          )}

          <p className="mt-3 text-xs text-slate-400">
            Nota: las líneas consolidadas de La Comer (identidad por rango de campaña) se concilian
            por contención de su rango de activación dentro del alcance confirmado; omitir días
            sueltos no las desactiva mientras aparezca cualquier fila de la campaña.
          </p>
        </div>
      )}

      {/* Detalle de líneas no incluidas (§13.5). */}
      {mode === 'authoritative' && missingShown.length > 0 && (
        <div className="card overflow-x-auto">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-800">
              Líneas que no aparecen en el nuevo archivo ({missing.length})
            </h2>
            {missingTruncated && (
              <p className="text-xs text-slate-400">
                Mostrando las primeras {MISSING_PREVIEW_LIMIT}. Todas se procesarán al confirmar.
              </p>
            )}
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                <th className="px-3 py-2 font-medium">Cliente</th>
                <th className="px-3 py-2 font-medium">Campaña</th>
                <th className="px-3 py-2 font-medium">Periodo</th>
                <th className="px-3 py-2 font-medium">Cadena</th>
                <th className="px-3 py-2 font-medium">Artículo/placement</th>
                <th className="px-3 py-2 font-medium">Creatividad ID</th>
              </tr>
            </thead>
            <tbody>
              {missingShown.map((m) => (
                <tr key={m.campaignLineId} className="border-b border-slate-100">
                  <td className="px-3 py-2 text-slate-700">{m.clienteOriginal}</td>
                  <td className="px-3 py-2 text-slate-700">{m.numeroCampanaOriginal}</td>
                  <td className="px-3 py-2 text-slate-600">{m.periodoOriginal ?? '—'}</td>
                  <td className="px-3 py-2 text-slate-600">{m.cadena ?? '—'}</td>
                  <td className="px-3 py-2 text-slate-600">{m.placementName}</td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-600">{m.creatividadIdOriginal}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={confirmDisabled}
            onClick={() => onConfirm(mode)}
            className="focus-ring rounded-lg bg-accent-blue px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {confirmLabel}
          </button>
          {plan.summary.rejected > 0 && (
            <button
              type="button"
              onClick={() => downloadErrorReport(plan.rows, `errores-${file.name}.csv`)}
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
            {plan.rows.map((row) => (
              <tr key={row.rowNumber} className="border-b border-slate-100">
                <td className="px-3 py-2 tabular-nums text-slate-500">{row.rowNumber}</td>
                <td className="px-3 py-2 text-slate-700">{row.raw['Cliente'] ?? ''}</td>
                <td className="px-3 py-2 text-slate-700">{row.raw['Número de campaña'] ?? row.raw['Campaña'] ?? ''}</td>
                <td className="px-3 py-2 text-slate-600">{row.raw['Artículo'] ?? ''}</td>
                <td className="px-3 py-2 font-mono text-xs text-slate-600">{row.raw['Creatividad ID'] ?? row.raw['Creatividad Id'] ?? ''}</td>
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
  );
}

function ScopeBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3 text-xs text-slate-600">
      <p className="mb-1 font-semibold uppercase text-slate-500">{title}</p>
      {children}
    </div>
  );
}

function ClassifyArticulos({
  unknown,
  tipos,
  canWrite,
  onCancel,
  onSubmit,
}: {
  unknown: string[];
  tipos: string[];
  canWrite: boolean;
  onCancel: () => void;
  onSubmit: (assignments: Record<string, string>) => void;
}) {
  const [mode, setMode] = useState<Record<string, 'existing' | 'new'>>({});
  const [val, setVal] = useState<Record<string, string>>({});

  const effective = (a: string) => (val[a] ?? '').trim().toUpperCase();
  const allAssigned = unknown.every((a) => effective(a) !== '');

  function submit() {
    const assignments: Record<string, string> = {};
    for (const a of unknown) assignments[a] = effective(a);
    onSubmit(assignments);
  }

  return (
    <div className="card p-6">
      <div className="mb-3 flex items-center gap-2">
        <Tags className="h-5 w-5 text-accent-violet" aria-hidden="true" />
        <h2 className="text-base font-semibold text-slate-800">Artículos sin clasificar</h2>
      </div>
      <p className="mb-4 text-sm text-slate-500">
        El archivo contiene {unknown.length} artículo(s) que aún no tienen tipo de operación.
        Clasifícalos antes de continuar (se guardan para futuras cargas).
      </p>

      <div className="space-y-2">
        {unknown.map((a) => (
          <div key={a} className="flex flex-wrap items-center gap-3">
            <span className="w-64 font-medium text-slate-700">{a}</span>
            <select
              disabled={!canWrite}
              value={mode[a] === 'new' ? '__new__' : (val[a] ?? '')}
              onChange={(e) => {
                if (e.target.value === '__new__') {
                  setMode((m) => ({ ...m, [a]: 'new' }));
                  setVal((v) => ({ ...v, [a]: '' }));
                } else {
                  setMode((m) => ({ ...m, [a]: 'existing' }));
                  setVal((v) => ({ ...v, [a]: e.target.value }));
                }
              }}
              className="focus-ring rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
              aria-label={`Tipo de operación para ${a}`}
            >
              <option value="">Seleccionar tipo…</option>
              {tipos.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
              <option value="__new__">＋ Nuevo tipo…</option>
            </select>
            {mode[a] === 'new' && (
              <input
                value={val[a] ?? ''}
                disabled={!canWrite}
                onChange={(e) => setVal((v) => ({ ...v, [a]: e.target.value }))}
                placeholder="Nombre del nuevo tipo"
                className="focus-ring rounded-lg border border-slate-300 px-3 py-1.5 text-sm uppercase"
                aria-label={`Nombre del nuevo tipo para ${a}`}
              />
            )}
          </div>
        ))}
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          disabled={!canWrite || !allAssigned}
          onClick={submit}
          className="focus-ring rounded-lg bg-accent-blue px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Guardar clasificación y continuar
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="focus-ring rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          Cancelar
        </button>
      </div>
    </div>
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
