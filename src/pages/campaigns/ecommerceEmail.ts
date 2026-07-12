/**
 * Generador del correo de especificaciones técnicas para operativa Ecommerce.
 *
 * Arma un texto listo para copiar (con tabla tabulada) a partir de las líneas
 * Ecommerce filtradas. Las medidas salen del catálogo fijo (`ecommerceMeasures`),
 * nunca de datos dinámicos de requirements.
 */

import { lookupMeasures, type ArtMeasures } from './ecommerceMeasures';

/**
 * Proyección mínima de una línea para el correo. `CampaignLine` es asignable a
 * esta forma; los campos alternativos de descripción son opcionales.
 */
export interface EmailSourceLine {
  cadena?: string | null;
  cliente_original?: string | null;
  anunciante?: string | null;
  periodo_codigo?: string | null;
  periodo_original?: string | null;
  placement_name_snapshot?: string | null;
  creatividad_id_original?: string | null;
  creatividad_titulo_original?: string | null;
  creatividad_descripcion_original?: string | null;
  fecha_fijacion?: string | null;
  fecha_retirada?: string | null;
  // Fuentes alternativas de descripción (por si el modelo cambia).
  creatividad_descripcion?: string | null;
  creative_description?: string | null;
  descripcion?: string | null;
  description?: string | null;
}

export interface EmailRow {
  cadena: string;
  cliente: string;
  anunciante: string;
  periodos: string[];
  articulo: string;
  creatividadDescripcion: string;
  nivel: string;
  fijacionIso: string;
  retiradaIso: string;
  measures: ArtMeasures;
}

const EM_DASH = '—';

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** dd/mm/yyyy (formato corto para la tabla). "—" si no es una fecha ISO. */
export function formatDateShort(iso: string | null | undefined): string {
  const m = ISO_RE.exec((iso ?? '').trim());
  if (!m) return EM_DASH;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** "15 de julio de 2026" (formato largo para el texto narrativo). */
export function formatDateLong(iso: string | null | undefined): string {
  const m = ISO_RE.exec((iso ?? '').trim());
  if (!m) return EM_DASH;
  const dia = Number(m[3]);
  const mes = MESES[Number(m[2]) - 1] ?? '';
  return `${dia} de ${mes} de ${m[1]}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Suma (o resta) días a una fecha ISO; "" si la entrada no es válida. */
export function addDaysIso(iso: string | null | undefined, days: number): string {
  const m = ISO_RE.exec((iso ?? '').trim());
  if (!m) return '';
  const base = new Date(`${m[0]}T00:00:00Z`).getTime();
  return new Date(base + days * DAY_MS).toISOString().slice(0, 10);
}

/** Artículo derivado del placement ("Cadena / Artículo" → "Artículo"). */
export function articuloOf(line: EmailSourceLine): string {
  const name = (line.placement_name_snapshot ?? '').trim();
  const sep = name.indexOf(' / ');
  const art = sep >= 0 ? name.slice(sep + 3) : name;
  return art.trim() || EM_DASH;
}

/** Etiqueta de periodo (código si existe; si no, el original). */
export function periodoLabelOf(line: EmailSourceLine): string {
  const codigo = (line.periodo_codigo ?? '').trim();
  if (codigo !== '') return codigo;
  return (line.periodo_original ?? '').trim();
}

/** "Nivel" = título de la creatividad (p. ej. "N2 DESTILADOS Y LICORES"). */
export function nivelOf(line: EmailSourceLine): string {
  return (line.creatividad_titulo_original ?? '').trim() || EM_DASH;
}

/** Descripción de la creatividad, de la mejor fuente disponible (sin inventar). */
export function descripcionOf(line: EmailSourceLine): string {
  const candidates = [
    line.creatividad_descripcion_original,
    line.creatividad_descripcion,
    line.creative_description,
    line.descripcion,
    line.description,
  ];
  for (const c of candidates) {
    const v = (c ?? '').trim();
    if (v !== '') return v;
  }
  const titulo = (line.creatividad_titulo_original ?? '').trim();
  return titulo || EM_DASH;
}

function minIso(a: string, b: string): string {
  if (!a) return b;
  if (!b) return a;
  return a <= b ? a : b;
}
function maxIso(a: string, b: string): string {
  if (!a) return b;
  if (!b) return a;
  return a >= b ? a : b;
}

/** Ordena periodos únicos de forma estable (S28 < S29 < S30, C16 …). */
function sortPeriods(periods: Iterable<string>): string[] {
  return [...new Set([...periods].filter((p) => p !== ''))].sort((a, b) => a.localeCompare(b, 'es'));
}

/**
 * Agrupa las líneas por creatividad (cadena · artículo · id · nivel ·
 * descripción), uniendo periodos y tomando la mínima fijación y máxima retirada.
 * Distintas creatividades quedan como filas distintas.
 */
export function buildEmailRows(lines: readonly EmailSourceLine[]): EmailRow[] {
  const groups = new Map<string, EmailRow & { _periods: Set<string> }>();

  for (const line of lines) {
    const cadena = (line.cadena ?? '').trim() || EM_DASH;
    const cliente = (line.cliente_original ?? '').trim() || EM_DASH;
    const anunciante = (line.anunciante ?? '').trim() || EM_DASH;
    const articulo = articuloOf(line);
    const nivel = nivelOf(line);
    const descripcion = descripcionOf(line);
    const creatividadId = (line.creatividad_id_original ?? '').trim();
    const key = [cadena, articulo, creatividadId, nivel, descripcion].join('||');

    const fijacion = (line.fecha_fijacion ?? '').trim();
    const retirada = (line.fecha_retirada ?? '').trim();
    const periodo = periodoLabelOf(line);

    const existing = groups.get(key);
    if (existing) {
      if (periodo) existing._periods.add(periodo);
      existing.fijacionIso = minIso(existing.fijacionIso, fijacion);
      existing.retiradaIso = maxIso(existing.retiradaIso, retirada);
      continue;
    }
    groups.set(key, {
      cadena,
      cliente,
      anunciante,
      periodos: [],
      articulo,
      creatividadDescripcion: descripcion,
      nivel,
      fijacionIso: fijacion,
      retiradaIso: retirada,
      measures: lookupMeasures(articulo),
      _periods: new Set(periodo ? [periodo] : []),
    });
  }

  return [...groups.values()]
    .map(({ _periods, ...row }) => ({ ...row, periodos: sortPeriods(_periods) }))
    .sort(
      (a, b) =>
        a.cadena.localeCompare(b.cadena, 'es') ||
        a.articulo.localeCompare(b.articulo, 'es') ||
        a.nivel.localeCompare(b.nivel, 'es'),
    );
}

/** Columnas EXACTAS de la tabla del correo. */
export const EMAIL_TABLE_COLUMNS = [
  'Cadena',
  'Cliente',
  'Anunciante / Marca',
  'Periodo(s)',
  'Artículo',
  'Creatividad descripción',
  'Nivel',
  'Fijación',
  'Retirada',
  'Desktop',
  'Mobile',
  'App 1',
  'App 2',
] as const;

/** Celdas de una fila de la tabla, en el orden de `EMAIL_TABLE_COLUMNS`. */
export function emailRowCells(row: EmailRow): string[] {
  return [
    row.cadena,
    row.cliente,
    row.anunciante,
    row.periodos.join(', ') || EM_DASH,
    row.articulo,
    row.creatividadDescripcion,
    row.nivel,
    formatDateShort(row.fijacionIso),
    formatDateShort(row.retiradaIso),
    row.measures.desktop,
    row.measures.mobile,
    row.measures.app1,
    row.measures.app2,
  ];
}

export interface EmailContext {
  inicioIso: string;
  finIso: string;
  periodos: string[];
  deadlineIso: string;
}

/** Fechas, periodos y fecha límite (2 días antes de la 1ª fijación). */
export function computeEmailContext(rows: readonly EmailRow[]): EmailContext {
  let inicio = '';
  let fin = '';
  const periods = new Set<string>();
  for (const r of rows) {
    inicio = minIso(inicio, r.fijacionIso);
    fin = maxIso(fin, r.retiradaIso);
    for (const p of r.periodos) periods.add(p);
  }
  return {
    inicioIso: inicio,
    finIso: fin,
    periodos: sortPeriods(periods),
    deadlineIso: addDaysIso(inicio, -2),
  };
}

/** Saludo: "Hola nombre," o "Hola," si no hay nombre. */
export function greeting(recipientName: string): string {
  const name = recipientName.trim();
  return name ? `Hola ${name},` : 'Hola,';
}

/**
 * Arma el correo completo listo para copiar. La tabla usa TABULACIONES (`\t`)
 * para que se pegue bien en correo/documentos.
 */
export function buildEmailText(
  recipientName: string,
  campaignId: string,
  rows: readonly EmailRow[],
): string {
  const ctx = computeEmailContext(rows);
  const periodosTexto = ctx.periodos.join(', ') || EM_DASH;
  const deadlineTexto = ctx.deadlineIso ? formatDateLong(ctx.deadlineIso) : 'Por confirmar';

  const headerLine = EMAIL_TABLE_COLUMNS.join('\t');
  const bodyLines = rows.map((r) => emailRowCells(r).join('\t'));
  const table = [headerLine, ...bodyLines].join('\n');

  return [
    greeting(recipientName),
    '',
    `Espero se encuentren muy bien. Les compartimos las especificaciones técnicas de la campaña #${campaignId || EM_DASH} para Soriana.com, activa del ${formatDateLong(ctx.inicioIso)} al ${formatDateLong(ctx.finIso)}, correspondiente a los periodos ${periodosTexto}.`,
    '',
    'A continuación encontrarán el detalle de las creatividades requeridas:',
    '',
    table,
    '',
    `📅 Fecha límite de entrega de materiales: ${deadlineTexto}`,
    '',
    'Esta fecha es indispensable para asegurar la correcta implementación de su campaña. Materiales recibidos fuera de plazo podrán quedar sujetos a reprogramación.',
    '',
    '📎 Adjunto encontrarán nuestra Guía de Buenas Prácticas con los requisitos técnicos que deben cumplir todos los materiales antes del envío.',
    '',
    'Ante cualquier duda, con gusto les orientamos.',
    '',
    'Saludos,',
  ].join('\n');
}
