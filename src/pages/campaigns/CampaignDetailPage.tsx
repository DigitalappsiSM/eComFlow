import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Copy, Check, AlertCircle } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { EmptyState, ErrorState, LoadingState } from '@/components/feedback/States';
import { FilterBar } from '@/components/filters/FilterBar';
import { distinctOptions, type FilterValues } from '@/components/filters/filter-utils';
import { fetchCampaignDetail, type CampaignDetail } from '@/repositories/campaigns.repository';
import type { CampaignLine } from '@/types/campaign';
import {
  articuloOf,
  buildEmailRows,
  buildEmailText,
  descripcionOf,
  emailRowCells,
  nivelOf,
  periodoLabelOf,
  EMAIL_TABLE_COLUMNS,
} from './ecommerceEmail';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'not_found' }
  | { status: 'ready'; detail: CampaignDetail };

const ECOMMERCE = 'ECOMMERCE';

function isEcommerce(line: CampaignLine): boolean {
  return (line.tipo_operacion ?? '').trim().toUpperCase() === ECOMMERCE;
}

function applyFilters(lines: CampaignLine[], f: FilterValues): CampaignLine[] {
  const q = (f.search ?? '').trim().toLowerCase();
  return lines.filter((l) => {
    if (f.periodo && periodoLabelOf(l) !== f.periodo) return false;
    if (f.cadena && (l.cadena ?? '') !== f.cadena) return false;
    if (f.cliente && (l.cliente_original ?? '') !== f.cliente) return false;
    if (f.anunciante && (l.anunciante ?? '') !== f.anunciante) return false;
    if (f.articulo && articuloOf(l) !== f.articulo) return false;
    if (q !== '') {
      const hay = [
        l.cliente_original,
        l.anunciante,
        l.cadena,
        articuloOf(l),
        nivelOf(l),
        descripcionOf(l),
        periodoLabelOf(l),
        l.creatividad_id_original,
      ]
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function CampaignDetailPage() {
  const { id = '' } = useParams();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [recipient, setRecipient] = useState('');
  const [filters, setFilters] = useState<FilterValues>({});
  const [copyStatus, setCopyStatus] = useState<'idle' | 'ok' | 'error'>('idle');

  useEffect(() => {
    let active = true;
    fetchCampaignDetail(id)
      .then((detail) => {
        if (!active) return;
        setState(detail ? { status: 'ready', detail } : { status: 'not_found' });
      })
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
  }, [id]);

  const detail = state.status === 'ready' ? state.detail : null;

  const ecommerceLines = useMemo<CampaignLine[]>(() => {
    if (!detail) return [];
    return Array.from(detail.linesBySpace.values()).flat().filter(isEcommerce);
  }, [detail]);

  const filtered = useMemo(() => applyFilters(ecommerceLines, filters), [ecommerceLines, filters]);
  const rows = useMemo(() => buildEmailRows(filtered), [filtered]);
  const campaignId = detail?.group.numero_campaña_original ?? '';
  const emailText = useMemo(
    () => buildEmailText(recipient, campaignId, rows),
    [recipient, campaignId, rows],
  );

  const filterFields = useMemo(
    () => [
      { key: 'periodo', label: 'Periodo', options: distinctOptions(ecommerceLines, (l) => periodoLabelOf(l)) },
      { key: 'cadena', label: 'Cadena', options: distinctOptions(ecommerceLines, (l) => l.cadena) },
      { key: 'cliente', label: 'Cliente', options: distinctOptions(ecommerceLines, (l) => l.cliente_original) },
      { key: 'anunciante', label: 'Anunciante', options: distinctOptions(ecommerceLines, (l) => l.anunciante) },
      { key: 'articulo', label: 'Artículo', options: distinctOptions(ecommerceLines, (l) => articuloOf(l)) },
    ],
    [ecommerceLines],
  );

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(emailText);
      setCopyStatus('ok');
    } catch {
      setCopyStatus('error');
    }
    window.setTimeout(() => setCopyStatus('idle'), 2500);
  }

  return (
    <AppLayout title="Detalle de campaña" description="Correo de especificaciones para operativa Ecommerce">
      <Link
        to="/campanas"
        className="focus-ring mb-4 inline-flex items-center gap-1 text-sm text-accent-blue hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Volver
      </Link>

      {state.status === 'loading' && <LoadingState />}
      {state.status === 'error' && <ErrorState description={state.message} />}
      {state.status === 'not_found' && <EmptyState title="Campaña no encontrada" />}

      {state.status === 'ready' && (
        <div className="space-y-4">
          <div className="card p-5">
            <h2 className="text-base font-bold text-slate-900">Correo de especificaciones Ecommerce</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              {state.detail.group.cliente_original} · Campaña #{campaignId} · Anunciante: {state.detail.group.anunciante}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Se arma automáticamente con las líneas de operativa <strong>Ecommerce</strong> de esta campaña.
              Las medidas provienen del catálogo fijo de artes.
            </p>
          </div>

          {ecommerceLines.length === 0 ? (
            <EmptyState
              title="Esta campaña no tiene líneas Ecommerce"
              description="El generador de correo solo aplica a operativa Ecommerce. Esta campaña no tiene líneas de ese tipo."
            />
          ) : (
            <>
              <div className="card p-4">
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  Nombre del cliente (destinatario)
                </label>
                <input
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  placeholder="Ej. Ana, equipo de marketing…"
                  className="focus-ring w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  aria-label="Nombre del cliente"
                />
              </div>

              <FilterBar
                fields={filterFields}
                values={filters}
                onChange={(key, value) => setFilters((f) => ({ ...f, [key]: value }))}
                onClear={() => setFilters({})}
                search={{
                  value: filters.search ?? '',
                  onChange: (v) => setFilters((f) => ({ ...f, search: v })),
                  placeholder: 'Buscar cliente, artículo, creatividad…',
                }}
                meta={`Mostrando ${filtered.length} de ${ecommerceLines.length} líneas Ecommerce`}
              />

              {rows.length === 0 ? (
                <EmptyState
                  title="Sin resultados"
                  description="Ninguna línea Ecommerce coincide con los filtros actuales."
                />
              ) : (
                <>
                  <div className="card overflow-x-auto">
                    <table className="w-full min-w-[1100px] text-sm">
                      <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                        <tr>
                          {EMAIL_TABLE_COLUMNS.map((c) => (
                            <th key={c} className="whitespace-nowrap px-3 py-2 font-medium">
                              {c}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row, i) => (
                          <tr key={`${row.cadena}|${row.articulo}|${row.nivel}|${i}`} className="border-t border-slate-100">
                            {emailRowCells(row).map((cell, j) => (
                              <td key={j} className="whitespace-nowrap px-3 py-2 text-slate-600">
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="card p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold text-slate-800">Vista previa del correo</h3>
                      <div className="flex items-center gap-3">
                        {copyStatus === 'ok' && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-accent-green">
                            <Check className="h-4 w-4" aria-hidden="true" /> Correo copiado
                          </span>
                        )}
                        {copyStatus === 'error' && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600">
                            <AlertCircle className="h-4 w-4" aria-hidden="true" /> No se pudo copiar
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => void handleCopy()}
                          className="focus-ring inline-flex items-center gap-1.5 rounded-lg bg-accent-blue px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-blue/90"
                        >
                          <Copy className="h-4 w-4" aria-hidden="true" /> Copiar correo
                        </button>
                      </div>
                    </div>
                    <pre className="max-h-[28rem] overflow-auto whitespace-pre rounded-lg bg-slate-50 p-4 text-xs leading-relaxed text-slate-700">
                      {emailText}
                    </pre>
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
