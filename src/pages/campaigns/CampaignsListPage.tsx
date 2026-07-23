import { useEffect, useMemo, useState } from 'react';
import { Copy, Check, AlertCircle, FileText, Trash2, RotateCcw } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { EmptyState, ErrorState, LoadingState } from '@/components/feedback/States';
import { FilterBar } from '@/components/filters/FilterBar';
import { distinctOptions, type FilterValues } from '@/components/filters/filter-utils';
import { fetchActiveCampaignLines } from '@/repositories/campaigns.repository';
import type { CampaignLine } from '@/types/campaign';
import {
  articuloOf,
  buildEmailHtml,
  buildEmailRows,
  buildEmailText,
  buildTrackingSubjects,
  computeEmailContext,
  descripcionOf,
  emailRowCells,
  formatDateLong,
  greeting,
  nivelOf,
  periodoLabelOf,
  EMAIL_TABLE_COLUMNS,
} from './ecommerceEmail';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; lines: CampaignLine[] };

type CopyStatus = 'idle' | 'html' | 'text' | 'error';

const ECOMMERCE = 'ECOMMERCE';

function isEcommerce(line: CampaignLine): boolean {
  return (line.tipo_operacion ?? '').trim().toUpperCase() === ECOMMERCE;
}

function applyFilters(lines: CampaignLine[], f: FilterValues, desde: string, hasta: string): CampaignLine[] {
  const q = (f.search ?? '').trim().toLowerCase();
  return lines.filter((l) => {
    if (f.cliente && (l.cliente_original ?? '') !== f.cliente) return false;
    if (f.periodo && periodoLabelOf(l) !== f.periodo) return false;
    if (f.cadena && (l.cadena ?? '') !== f.cadena) return false;
    if (f.anunciante && (l.anunciante ?? '') !== f.anunciante) return false;
    if (f.articulo && articuloOf(l) !== f.articulo) return false;
    const fijacion = (l.fecha_fijacion ?? '').trim();
    if (desde && fijacion && fijacion < desde) return false;
    if (hasta && fijacion && fijacion > hasta) return false;
    if (q !== '') {
      const hay = [
        l.cliente_original,
        l.anunciante,
        l.cadena,
        articuloOf(l),
        nivelOf(l),
        descripcionOf(l),
        periodoLabelOf(l),
        l.numero_campaña_original,
        l.creatividad_id_original,
      ]
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function CampaignsListPage() {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [recipient, setRecipient] = useState('');
  const [filters, setFilters] = useState<FilterValues>({});
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle');
  const [copiedSubject, setCopiedSubject] = useState<string | null>(null);
  // Filas excluidas del borrador (por su clave estable) + fila en confirmación.
  const [excludedKeys, setExcludedKeys] = useState<Set<string>>(new Set());
  const [confirmKey, setConfirmKey] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchActiveCampaignLines()
      .then((lines) => active && setState({ status: 'ready', lines }))
      .catch(
        (err: unknown) =>
          active &&
          setState({
            status: 'error',
            message: err instanceof Error ? err.message : 'Error desconocido.',
          }),
      );
    return () => {
      active = false;
    };
  }, []);

  const ecommerceLines = useMemo<CampaignLine[]>(
    () => (state.status === 'ready' ? state.lines.filter(isEcommerce) : []),
    [state],
  );

  const filtered = useMemo(
    () => applyFilters(ecommerceLines, filters, desde, hasta),
    [ecommerceLines, filters, desde, hasta],
  );
  const rows = useMemo(() => buildEmailRows(filtered), [filtered]);
  // Borrador efectivo: sin las filas que el usuario eliminó manualmente.
  const visibleRows = useMemo(() => rows.filter((r) => !excludedKeys.has(r.key)), [rows, excludedKeys]);
  const excludedCount = rows.length - visibleRows.length;
  const ctx = useMemo(() => computeEmailContext(visibleRows), [visibleRows]);
  const subjects = useMemo(() => buildTrackingSubjects(filtered), [filtered]);

  const removeRow = (key: string) => {
    setExcludedKeys((prev) => new Set(prev).add(key));
    setConfirmKey(null);
  };
  const restoreRows = () => {
    setExcludedKeys(new Set());
    setConfirmKey(null);
  };

  const campaignRef = useMemo(() => {
    const set = new Set<string>();
    for (const l of filtered) {
      const n = (l.numero_campaña_original ?? '').trim();
      if (n) set.add(n);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'es')).join(', ');
  }, [filtered]);

  const filterFields = useMemo(
    () => [
      { key: 'cliente', label: 'Cliente', options: distinctOptions(ecommerceLines, (l) => l.cliente_original) },
      { key: 'periodo', label: 'Periodo', options: distinctOptions(ecommerceLines, (l) => periodoLabelOf(l)) },
      { key: 'cadena', label: 'Cadena', options: distinctOptions(ecommerceLines, (l) => l.cadena) },
      { key: 'anunciante', label: 'Anunciante', options: distinctOptions(ecommerceLines, (l) => l.anunciante) },
      { key: 'articulo', label: 'Artículo', options: distinctOptions(ecommerceLines, (l) => articuloOf(l)) },
    ],
    [ecommerceLines],
  );

  const hasSelection = filters.cliente || filters.periodo || filters.cadena || filters.anunciante ||
    filters.articulo || filters.search || desde || hasta;

  async function handleCopyHtml() {
    const html = buildEmailHtml(recipient, campaignRef, visibleRows);
    const text = buildEmailText(recipient, campaignRef, visibleRows);
    try {
      const clip = navigator.clipboard;
      if (clip && 'write' in clip && typeof ClipboardItem !== 'undefined') {
        await clip.write([
          new ClipboardItem({
            'text/html': new Blob([html], { type: 'text/html' }),
            'text/plain': new Blob([text], { type: 'text/plain' }),
          }),
        ]);
      } else {
        await clip.writeText(text);
      }
      setCopyStatus('html');
    } catch {
      setCopyStatus('error');
    }
    window.setTimeout(() => setCopyStatus('idle'), 2500);
  }

  async function handleCopyText() {
    try {
      await navigator.clipboard.writeText(buildEmailText(recipient, campaignRef, visibleRows));
      setCopyStatus('text');
    } catch {
      setCopyStatus('error');
    }
    window.setTimeout(() => setCopyStatus('idle'), 2500);
  }

  async function handleCopySubject(subject: string) {
    try {
      await navigator.clipboard.writeText(subject);
      setCopiedSubject(subject);
    } catch {
      setCopiedSubject(null);
    }
    window.setTimeout(() => setCopiedSubject(null), 2500);
  }

  return (
    <AppLayout
      title="Correo de especificaciones Ecommerce"
      description="Filtra por cliente, periodo o fechas y arma un correo listo para Outlook"
    >
      {state.status === 'loading' && <LoadingState label="Cargando líneas Ecommerce…" />}
      {state.status === 'error' && <ErrorState description={state.message} />}

      {state.status === 'ready' && (
        <div className="space-y-4">
          <div className="card p-5">
            <h2 className="text-base font-bold text-slate-900">Correo de especificaciones Ecommerce</h2>
            <p className="mt-1 text-xs text-slate-400">
              Selecciona con filtros (cliente, periodo, fechas…) y el correo se arma con las líneas de operativa
              <strong> Ecommerce</strong> de todas las campañas que apliquen. Las medidas provienen del catálogo fijo.
            </p>
          </div>

          {ecommerceLines.length === 0 ? (
            <EmptyState
              title="Sin líneas Ecommerce"
              description="No hay líneas de operativa Ecommerce activas para generar un correo."
            />
          ) : (
            <>
              <div className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="lg:col-span-2">
                  <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">
                    Nombre del cliente (destinatario)
                  </label>
                  <input
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                    placeholder="Ej. Ana, equipo de marketing…"
                    className="focus-ring w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    aria-label="Nombre del cliente"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">
                    Fijación desde
                  </label>
                  <input
                    type="date"
                    value={desde}
                    onChange={(e) => setDesde(e.target.value)}
                    className="focus-ring w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    aria-label="Fijación desde"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">
                    Fijación hasta
                  </label>
                  <input
                    type="date"
                    value={hasta}
                    onChange={(e) => setHasta(e.target.value)}
                    className="focus-ring w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    aria-label="Fijación hasta"
                  />
                </div>
              </div>

              <FilterBar
                fields={filterFields}
                values={filters}
                onChange={(key, value) => setFilters((f) => ({ ...f, [key]: value }))}
                onClear={() => {
                  setFilters({});
                  setDesde('');
                  setHasta('');
                }}
                search={{
                  value: filters.search ?? '',
                  onChange: (v) => setFilters((f) => ({ ...f, search: v })),
                  placeholder: 'Buscar cliente, campaña, artículo, creatividad…',
                }}
                meta={`Mostrando ${filtered.length} de ${ecommerceLines.length} líneas Ecommerce`}
              />

              {rows.length === 0 ? (
                <EmptyState
                  title={hasSelection ? 'Sin resultados' : 'Ajusta los filtros'}
                  description={
                    hasSelection
                      ? 'Ninguna línea Ecommerce coincide con los filtros actuales.'
                      : 'Selecciona un cliente, periodo o rango de fechas para armar el correo.'
                  }
                />
              ) : (
                <>
                <div className="card p-5">
                  <h3 className="text-sm font-semibold text-slate-800">Título del correo (tracking)</h3>
                  <p className="mb-3 text-xs text-slate-400">
                    Un título por cliente · formato <span className="font-mono"># campaña | cliente | Campañas Soriana.com</span>
                  </p>
                  <ul className="space-y-2">
                    {subjects.map((s) => (
                      <li
                        key={s.cliente}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                      >
                        <span className="font-mono text-xs text-slate-700">{s.subject}</span>
                        <button
                          type="button"
                          onClick={() => void handleCopySubject(s.subject)}
                          className="focus-ring inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          {copiedSubject === s.subject ? (
                            <>
                              <Check className="h-3.5 w-3.5 text-accent-green" aria-hidden="true" /> Copiado
                            </>
                          ) : (
                            <>
                              <Copy className="h-3.5 w-3.5" aria-hidden="true" /> Copiar título
                            </>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="card p-5">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-800">Vista previa del correo</h3>
                      <p className="text-xs text-slate-400">
                        Campaña(s) #{campaignRef || '—'} · {visibleRows.length} creatividad(es)
                        {excludedCount > 0 && (
                          <>
                            {' '}·{' '}
                            <span className="text-amber-700">{excludedCount} fila(s) eliminada(s)</span>{' '}
                            <button
                              type="button"
                              onClick={restoreRows}
                              className="focus-ring inline-flex items-center gap-1 rounded border border-slate-300 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                            >
                              <RotateCcw className="h-3 w-3" aria-hidden="true" /> Restaurar
                            </button>
                          </>
                        )}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      {copyStatus === 'html' && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-accent-green">
                          <Check className="h-4 w-4" aria-hidden="true" /> Copiado (HTML)
                        </span>
                      )}
                      {copyStatus === 'text' && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-accent-green">
                          <Check className="h-4 w-4" aria-hidden="true" /> Copiado (texto)
                        </span>
                      )}
                      {copyStatus === 'error' && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600">
                          <AlertCircle className="h-4 w-4" aria-hidden="true" /> No se pudo copiar
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => void handleCopyText()}
                        className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <FileText className="h-4 w-4" aria-hidden="true" /> Copiar texto
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleCopyHtml()}
                        className="focus-ring inline-flex items-center gap-1.5 rounded-lg bg-accent-blue px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-blue/90"
                      >
                        <Copy className="h-4 w-4" aria-hidden="true" /> Copiar para Outlook
                      </button>
                    </div>
                  </div>

                  {visibleRows.length === 0 ? (
                    <EmptyState
                      title="Eliminaste todas las filas"
                      description="No queda ninguna creatividad en el borrador. Usa “Restaurar” para recuperarlas."
                    />
                  ) : (
                    <EmailPreview
                      recipient={recipient}
                      campaignRef={campaignRef}
                      rows={visibleRows}
                      ctx={ctx}
                      confirmKey={confirmKey}
                      onAskDelete={setConfirmKey}
                      onConfirmDelete={removeRow}
                    />
                  )}
                </div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </AppLayout>
  );
}

function EmailPreview({
  recipient,
  campaignRef,
  rows,
  ctx,
  confirmKey,
  onAskDelete,
  onConfirmDelete,
}: {
  recipient: string;
  campaignRef: string;
  rows: ReturnType<typeof buildEmailRows>;
  ctx: ReturnType<typeof computeEmailContext>;
  confirmKey: string | null;
  onAskDelete: (key: string | null) => void;
  onConfirmDelete: (key: string) => void;
}) {
  const deadline = ctx.deadlineIso ? formatDateLong(ctx.deadlineIso) : 'Por confirmar';
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 text-sm leading-relaxed text-slate-700">
      <p>{greeting(recipient)}</p>
      <p className="mt-3">
        Espero se encuentren muy bien. Les compartimos las especificaciones técnicas de la campaña #
        {campaignRef || '—'} para <strong>Soriana.com</strong>, activa del {formatDateLong(ctx.inicioIso)} al{' '}
        {formatDateLong(ctx.finIso)}, correspondiente a los periodos {ctx.periodos.join(', ') || '—'}.
      </p>
      <p className="mt-3">A continuación encontrarán el detalle de las creatividades requeridas:</p>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[1000px] border-collapse text-xs">
          <thead>
            <tr className="bg-navy text-white">
              <th className="whitespace-nowrap border border-slate-300 px-2 py-1.5 text-center font-semibold">
                <span className="sr-only">Eliminar</span>
              </th>
              {EMAIL_TABLE_COLUMNS.map((c) => (
                <th key={c} className="whitespace-nowrap border border-slate-300 px-2.5 py-1.5 text-left font-semibold">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="odd:bg-slate-50">
                <td className="border border-slate-300 px-1.5 py-1.5 text-center align-middle">
                  {confirmKey === row.key ? (
                    <span className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onConfirmDelete(row.key)}
                        className="focus-ring rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold text-white hover:bg-red-700"
                      >
                        Eliminar
                      </button>
                      <button
                        type="button"
                        onClick={() => onAskDelete(null)}
                        className="focus-ring rounded border border-slate-300 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-50"
                      >
                        Cancelar
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onAskDelete(row.key)}
                      title="Eliminar esta fila del borrador"
                      aria-label="Eliminar esta fila del borrador"
                      className="focus-ring inline-flex text-slate-400 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  )}
                </td>
                {emailRowCells(row).map((cell, j) => (
                  <td key={j} className="whitespace-nowrap border border-slate-300 px-2.5 py-1.5">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3">
        📅 <strong>Fecha límite de entrega de materiales:</strong> {deadline}
      </p>
      <p className="mt-3">
        Esta fecha es indispensable para asegurar la correcta implementación de su campaña. Materiales recibidos
        fuera de plazo podrán quedar sujetos a reprogramación.
      </p>
      <p className="mt-3">
        📎 Adjunto encontrarán nuestra Guía de Buenas Prácticas con los requisitos técnicos que deben cumplir todos
        los materiales antes del envío.
      </p>
      <p className="mt-3">Ante cualquier duda, con gusto les orientamos.</p>
      <p className="mt-3">Saludos,</p>
    </div>
  );
}
