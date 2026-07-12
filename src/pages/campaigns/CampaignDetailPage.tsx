import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Copy } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { EmptyState, ErrorState, LoadingState } from '@/components/feedback/States';
import { FilterBar } from '@/components/filters/FilterBar';
import { distinctOptions, sortedOptions, type FilterValues } from '@/components/filters/filter-utils';
import { fetchCampaignDetail, type CampaignDetail } from '@/repositories/campaigns.repository';
import type { CampaignLine } from '@/types/campaign';
import type { IsoDate } from '@/lib/dates';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'not_found' }
  | { status: 'ready'; detail: CampaignDetail };

interface EmailRow {
  line: CampaignLine;
  measures: ArtMeasures;
}

interface ArtMeasures {
  desktop: string;
  mobile: string;
  app1: string;
  app2: string;
}

interface MeasuresCatalogItem extends ArtMeasures {
  label: string;
  aliases: string[];
}

const EMPTY_MEASURES: ArtMeasures = { desktop: '—', mobile: '—', app1: '—', app2: '—' };

const MEASURES_CATALOG: MeasuresCatalogItem[] = [
  {
    label: 'CATEGORY BANNER N1,N2 ó N3',
    aliases: ['CATEGORY BANNER N1', 'CATEGORY BANNER N2', 'CATEGORY BANNER N3', 'CATEGORY BANNER'],
    desktop: '1920 x 259',
    mobile: '640 x 242',
    app1: '375 x 213',
    app2: '320 x 93',
  },
  {
    label: 'HOME SLIDER',
    aliases: ['HOME SLIDER'],
    desktop: '1920x640',
    mobile: '640x520',
    app1: '640x520',
    app2: '—',
  },
  {
    label: 'HOME CENTRAL',
    aliases: ['HOME CENTRAL'],
    desktop: '1920 x 260',
    mobile: '640 x 243',
    app1: '578x187',
    app2: '—',
  },
  {
    label: 'HOME SECUNDARIO',
    aliases: ['HOME SECUNDARIO'],
    desktop: '1920x344',
    mobile: '640x242',
    app1: '289 x 93',
    app2: '—',
  },
  {
    label: 'PACK PROMOS (Folletos y Ofertas)',
    aliases: ['PACK PROMOS', 'FOLLETOS Y OFERTAS'],
    desktop: '1920x259',
    mobile: '640x242',
    app1: '578x186',
    app2: '—',
  },
  {
    label: 'SEARCH BANNER',
    aliases: ['SEARCH BANNER'],
    desktop: '1920 x 259',
    mobile: '640 x 242',
    app1: '320 x 93',
    app2: '—',
  },
  {
    label: 'MIS LISTAS HEADER',
    aliases: ['MIS LISTAS HEADER'],
    desktop: '1920x259',
    mobile: '640x242',
    app1: '578x186',
    app2: '—',
  },
  {
    label: 'CATEGORY LANDING (N1 juguetes)',
    aliases: ['CATEGORY LANDING', 'CATEGORY LANDING N1', 'CATEGORY LANDING N1 JUGUETES'],
    desktop: '1920x640',
    mobile: '640x612',
    app1: '375 X 213',
    app2: '—',
  },
  {
    label: 'BUNDLE BOOST N3 O BUNDLE SEARCH',
    aliases: ['BUNDLE BOOST N3', 'BUNDLE BOOST', 'BUNDLE SEARCH'],
    desktop: '240 x 410',
    mobile: '430 x 281',
    app1: '254x380',
    app2: '—',
  },
  {
    label: 'CATEGORY MEDIA WEB',
    aliases: ['CATEGORY MEDIA WEB'],
    desktop: '1920 x 260',
    mobile: '640 x 243',
    app1: '578x186',
    app2: '—',
  },
];

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

function formatShortDate(iso: IsoDate): string {
  if (!iso) return '—';
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

function formatLongDate(iso: IsoDate): string {
  if (!iso) return '—';
  const [year, month, day] = iso.split('-').map(Number);
  return `${day} de ${MONTHS[(month ?? 1) - 1]} de ${year}`;
}

function addDays(iso: IsoDate, days: number): IsoDate {
  const base = new Date(`${iso}T00:00:00Z`).getTime();
  return new Date(base + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function normalizeMeasureKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]+/gi, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

function findMeasures(line: CampaignLine): ArtMeasures {
  const haystack = normalizeMeasureKey(
    [line.placement_name_snapshot, line.creatividad_titulo_original, line.creatividad_descripcion_original].join(' '),
  );
  const item = MEASURES_CATALOG.find((catalogItem) =>
    catalogItem.aliases.some((alias) => haystack.includes(normalizeMeasureKey(alias))),
  );
  return item ?? EMPTY_MEASURES;
}

function joinUnique(values: Array<string | null | undefined>, fallback = '—'): string {
  const unique = [...new Set(values.map((v) => (v ?? '').trim()).filter(Boolean))];
  return unique.length === 0 ? fallback : unique.join(', ');
}

function buildEmailText(nombre: string, rows: EmailRow[]): string {
  const first = rows[0]?.line;
  const campaign = first?.numero_campaña_original ?? '—';
  const cliente = first?.cliente_original ?? '—';
  const start = rows.reduce((min, row) => (row.line.fecha_fijacion < min ? row.line.fecha_fijacion : min), first?.fecha_fijacion ?? '');
  const end = rows.reduce((max, row) => (row.line.fecha_retirada > max ? row.line.fecha_retirada : max), first?.fecha_retirada ?? '');
  const periods = joinUnique(rows.map((row) => row.line.periodo_original));
  const deadline = start ? addDays(start, -2) : '';

  const header = [
    'Cadena',
    'Cliente',
    'Anunciante / Marca',
    'Periodo(s)',
    'Artículo',
    'Creatividad descripción',
    'Fijación',
    'Retirada',
    'Desktop',
    'Mobile',
    'App 1',
    'App 2',
  ].join('\t');

  const table = rows
    .map(({ line, measures }) =>
      [
        line.cadena ?? '—',
        line.cliente_original,
        line.anunciante,
        line.periodo_original ?? '—',
        line.placement_name_snapshot,
        line.creatividad_descripcion_original || line.creatividad_titulo_original || '—',
        formatShortDate(line.fecha_fijacion),
        formatShortDate(line.fecha_retirada),
        measures.desktop,
        measures.mobile,
        measures.app1,
        measures.app2,
      ].join('\t'),
    )
    .join('\n');

  return `Hola ${nombre || '[nombre]'},\n\nEspero se encuentren muy bien. Les compartimos las especificaciones técnicas de la campaña #${campaign} para ${cliente}, activa del ${formatShortDate(start)} al ${formatShortDate(end)}, correspondiente a los periodos ${periods}.\n\nA continuación encontrarán el detalle de las creatividades requeridas:\n${header}\n${table}\n\n📅 Fecha límite de entrega de materiales: ${deadline ? formatLongDate(deadline) : '—'}\nEsta fecha es indispensable para asegurar la correcta implementación de su campaña. Materiales recibidos fuera de plazo podrán quedar sujetos a reprogramación.\n\n📎 Adjunto encontrarán nuestra Guía de Buenas Prácticas con los requisitos técnicos que deben cumplir todos los materiales antes del envío.\n\nAnte cualquier duda, con gusto les orientamos.\n\nSaludos,`;
}

export function CampaignDetailPage() {
  const { id = '' } = useParams();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [filters, setFilters] = useState<FilterValues>({});
  const [search, setSearch] = useState('');
  const [recipientName, setRecipientName] = useState('[nombre]');

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

  const emailRows = useMemo<EmailRow[]>(() => {
    if (state.status !== 'ready') return [];
    return [...state.detail.linesBySpace.values()]
      .flat()
      .filter((line) => (line.tipo_operacion ?? '').toLowerCase().includes('ecommerce'))
      .map((line) => ({ line, measures: findMeasures(line) }));
  }, [state]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return emailRows.filter(({ line }) => {
      if (filters.periodo && (line.periodo_original ?? '') !== filters.periodo) return false;
      if (filters.cadena && (line.cadena ?? '') !== filters.cadena) return false;
      if (filters.cliente && line.cliente_original !== filters.cliente) return false;
      if (filters.anunciante && line.anunciante !== filters.anunciante) return false;
      if (filters.articulo && line.placement_name_snapshot !== filters.articulo) return false;
      if (q !== '') {
        const hay = [
          line.cliente_original,
          line.numero_campaña_original,
          line.anunciante,
          line.placement_name_snapshot,
          line.creatividad_descripcion_original,
          line.creatividad_titulo_original,
          line.periodo_original ?? '',
          line.cadena ?? '',
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [emailRows, filters, search]);

  const filterFields = useMemo(
    () => [
      { key: 'periodo', label: 'Periodo', options: sortedOptions(emailRows, (r) => r.line.periodo_original, (r) => r.line.periodo_inicio) },
      { key: 'cadena', label: 'Cadena', options: distinctOptions(emailRows, (r) => r.line.cadena) },
      { key: 'cliente', label: 'Cliente', options: distinctOptions(emailRows, (r) => r.line.cliente_original) },
      { key: 'anunciante', label: 'Anunciante', options: distinctOptions(emailRows, (r) => r.line.anunciante) },
      { key: 'articulo', label: 'Artículo', options: distinctOptions(emailRows, (r) => r.line.placement_name_snapshot) },
    ],
    [emailRows],
  );

  const emailText = useMemo(() => buildEmailText(recipientName, filteredRows), [recipientName, filteredRows]);

  return (
    <AppLayout title="Detalle de campaña" description="Correo de especificaciones técnicas para Ecommerce">
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
            <h2 className="text-base font-bold text-slate-900">
              {state.detail.group.cliente_original} · Campaña {state.detail.group.numero_campaña_original}
            </h2>
            <p className="text-sm text-slate-500">Anunciante: {state.detail.group.anunciante}</p>
            <p className="mt-1 text-xs text-slate-400">
              {filteredRows.length} de {emailRows.length} línea(s) Ecommerce listas para el correo
            </p>
          </div>

          {emailRows.length === 0 ? (
            <EmptyState title="Sin líneas Ecommerce" description="Esta campaña no tiene líneas actuales de la operativa Ecommerce." />
          ) : (
            <>
              <FilterBar
                fields={filterFields}
                values={filters}
                onChange={(key, value) => setFilters((f) => ({ ...f, [key]: value }))}
                onClear={() => {
                  setFilters({});
                  setSearch('');
                }}
                search={{ value: search, onChange: setSearch, placeholder: 'Buscar campaña, anunciante, artículo…' }}
                meta={`${filteredRows.length} de ${emailRows.length} líneas`}
              />

              <div className="card p-4">
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  Nombre del destinatario
                </label>
                <input
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  className="focus-ring w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="[nombre]"
                />
              </div>

              <div className="card overflow-hidden">
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-800">Correo para clientes</h3>
                    <p className="text-xs text-slate-500">El detalle reemplaza la jerarquía anterior de espacios y líneas.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void navigator.clipboard.writeText(emailText)}
                    className="focus-ring inline-flex items-center gap-2 rounded-lg bg-accent-blue px-3 py-2 text-sm font-medium text-white hover:bg-blue-600"
                  >
                    <Copy className="h-4 w-4" aria-hidden="true" /> Copiar
                  </button>
                </div>
                <pre className="max-h-[620px] overflow-auto whitespace-pre-wrap p-4 text-sm leading-6 text-slate-700">{emailText}</pre>
              </div>
            </>
          )}
        </div>
      )}
    </AppLayout>
  );
}
