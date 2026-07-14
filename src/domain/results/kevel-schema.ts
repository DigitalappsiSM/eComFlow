/**
 * Contrato del CSV de Kevel (§5) y parsing/normalización. Puro y testeable.
 *
 * El archivo se lee, valida y prepara EN EL NAVEGADOR. Aquí solo hay funciones
 * puras (sin Firestore, sin red): tokenizador CSV, validación estructural,
 * mapeo/normalización de filas y derivación de dispositivo.
 */

import type { IsoDate } from '@/lib/dates';
import type { KevelNormalizedRow, ResultDevice, ValidationIssue } from '@/types/results';

/** Las 42 columnas EXACTAS y en orden (§5). */
export const KEVEL_COLUMNS = [
  'Date',
  'Advertiser',
  'Campaign',
  'Flight',
  'Ad',
  'Rate Type',
  'Price',
  'Creative',
  'AdType',
  'Site',
  'Zone',
  'Impressions',
  'Unfiltered Impressions',
  'Invalid UA Impressions',
  'Clicks',
  'Invalid UA Clicks',
  'Test Clicks',
  'Duplicate Impression Clicks',
  'Duplicate IP Clicks',
  'Suspicious Clicks (Bucket)',
  'Unique Clicks',
  'Unfiltered Clicks',
  'CTR',
  'Unique CTR',
  'CVR',
  'CVR (Impressions)',
  'CVR (Clicks)',
  'CPC',
  'Revenue',
  'GMV',
  'eCPM',
  'ROAS',
  'CampaignId',
  'FlightId',
  'Flight Start Date',
  'Flight End Date',
  'AdvertiserId',
  'CreativeId',
  'AdTypeId',
  'SiteId',
  'ZoneId',
  'AdId',
] as const;

export const KEVEL_COLUMN_COUNT = KEVEL_COLUMNS.length; // 42

/**
 * Tokenizador CSV (RFC-4180): soporta comillas dobles, comillas escapadas (""),
 * comas y saltos de línea dentro de comillas, y separadores CRLF/LF/CR.
 * Devuelve una fila por línea; una línea vacía produce `['']`.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (i < n) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += c;
      i += 1;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (c === ',') {
      endField();
      i += 1;
      continue;
    }
    if (c === '\r') {
      if (text[i + 1] === '\n') i += 1;
      endRow();
      i += 1;
      continue;
    }
    if (c === '\n') {
      endRow();
      i += 1;
      continue;
    }
    field += c;
    i += 1;
  }
  // Última fila (si el texto no termina en salto de línea, o para cerrar campo).
  if (field !== '' || row.length > 0) endRow();
  return rows;
}

/** ¿La fila está totalmente vacía (todas las celdas en blanco)? */
export function isBlankRow(cells: string[] | undefined): boolean {
  return !cells || cells.every((c) => c.trim() === '');
}

const ISO_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
// Formato con año al final y separador / o -: A(sep)B(sep)YYYY.
const DMY_RE = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/;

function isRealDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function toIso(y: number, m: number, d: number): IsoDate | null {
  if (!isRealDate(y, m, d)) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Fecha Kevel → ISO `YYYY-MM-DD`. Acepta:
 *  - ISO `YYYY-MM-DD`.
 *  - `A/B/YYYY` o `A-B-YYYY`, **desambiguando** día/mes: si un componente es
 *    > 12 es el día; si ambos son ≤ 12 se asume `DD/MM/YYYY` (contexto MX).
 *  - Con o sin componente de hora (se descarta).
 * Devuelve null si no coincide o la fecha no existe.
 */
export function parseKevelDate(raw: string): IsoDate | null {
  const value = ((raw ?? '').trim().split(/[T ]/)[0] ?? '').trim();
  if (value === '') return null;

  const iso = ISO_RE.exec(value);
  if (iso) {
    const [, y, m, d] = iso.map(Number) as [number, number, number, number];
    return toIso(y, m, d);
  }

  const g = DMY_RE.exec(value);
  if (g) {
    const a = Number(g[1]);
    const b = Number(g[2]);
    const y = Number(g[3]);
    if (a > 12 && b <= 12) return toIso(y, b, a); // DD/MM
    if (b > 12 && a <= 12) return toIso(y, a, b); // MM/DD
    if (a <= 12 && b <= 12) return toIso(y, b, a); // ambiguo → DD/MM (MX)
    return null; // ambos > 12: imposible
  }
  return null;
}

/** Número Kevel → number | null. Quita separadores de miles, `%`, `$` y espacios. */
export function parseKevelNumber(raw: string): number | null {
  const value = (raw ?? '').trim();
  if (value === '') return null;
  const cleaned = value.replace(/[$,%\s]/g, '');
  if (cleaned === '' || cleaned === '-') return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

/** Entero de una métrica absoluta: null si no convierte o no es entero finito. */
export function parseKevelInt(raw: string): number | null {
  const num = parseKevelNumber(raw);
  if (num === null) return null;
  return Number.isInteger(num) ? num : num; // se valida entero/negativo aparte
}

/**
 * Deriva el dispositivo a partir de AdType / Site / Zone (heurística, §9).
 * Si no reconoce señales claras, devuelve `unknown` (nunca inventa).
 */
export function deriveDevice(adType: string, site: string, zone: string): ResultDevice {
  const hay = `${adType} ${site} ${zone}`.toLowerCase();
  if (/\bapp\b|aplicaci|in-app|android|ios/.test(hay)) return 'app';
  if (/mobile|móvil|movil|celular|smartphone/.test(hay)) return 'mobile';
  if (/desktop|escritorio|web\b|pc\b/.test(hay)) return 'desktop';
  return 'unknown';
}

export interface KevelStructure {
  ok: boolean;
  issues: ValidationIssue[];
  meta?: { declaredStart: string; declaredEnd: string };
  dataCells: string[][]; // filas de datos (celdas crudas), a partir de la fila 5
}

function issue(
  code: string,
  description: string,
  extra: Partial<ValidationIssue> = {},
): ValidationIssue {
  return {
    severity: 'error',
    code,
    row_number: null,
    field: null,
    received_value: null,
    description,
    suggested_action: 'Corrija el archivo y vuelva a exportarlo desde Kevel.',
    blocks_import: true,
    ...extra,
  };
}

/**
 * Valida la estructura del archivo (§5, §6): fila 1 metadatos, filas 2 y 3
 * vacías, fila 4 cabecera exacta (42 columnas en orden) y que cada fila de
 * datos tenga exactamente 42 valores. Errores aquí son bloqueantes.
 */
export function validateKevelStructure(rows: string[][]): KevelStructure {
  const issues: ValidationIssue[] = [];

  if (rows.length === 0 || (rows.length === 1 && isBlankRow(rows[0]))) {
    return { ok: false, issues: [issue('EMPTY_FILE', 'El archivo está vacío.')], dataCells: [] };
  }

  // Fila 1: "Start Date:,{fecha},End Date,{fecha}"
  const meta = rows[0] ?? [];
  const startLabel = (meta[0] ?? '').trim().toLowerCase();
  const endLabel = (meta[2] ?? '').trim().toLowerCase();
  let declaredStart = '';
  let declaredEnd = '';
  if (!startLabel.startsWith('start date') || !endLabel.startsWith('end date')) {
    issues.push(
      issue('MISSING_META_ROW', 'Falta la fila de metadatos (Start Date / End Date) en la fila 1.', {
        row_number: 1,
        received_value: meta.join(','),
      }),
    );
  } else {
    const s = parseKevelDate(meta[1] ?? '');
    const e = parseKevelDate(meta[3] ?? '');
    // Fechas de metadatos ilegibles NO bloquean: el rango real se toma de los
    // datos (columna Date). Solo se avisa.
    if (!s) {
      issues.push(
        issue('INVALID_META_DATE', 'La fecha inicial declarada no se pudo interpretar; se usará el rango real de los datos.', {
          row_number: 1,
          field: 'Start Date',
          received_value: meta[1] ?? '',
          severity: 'warning',
          blocks_import: false,
          suggested_action: 'Revise; la importación puede continuar.',
        }),
      );
    }
    if (!e) {
      issues.push(
        issue('INVALID_META_DATE', 'La fecha final declarada no se pudo interpretar; se usará el rango real de los datos.', {
          row_number: 1,
          field: 'End Date',
          received_value: meta[3] ?? '',
          severity: 'warning',
          blocks_import: false,
          suggested_action: 'Revise; la importación puede continuar.',
        }),
      );
    }
    if (s && e && s > e) {
      issues.push(
        issue('INVALID_META_RANGE', 'La fecha inicial declarada es posterior a la final.', {
          row_number: 1,
          received_value: `${meta[1]} → ${meta[3]}`,
        }),
      );
    }
    declaredStart = s ?? '';
    declaredEnd = e ?? '';
  }

  // Filas 2 y 3 deben estar vacías.
  if (!isBlankRow(rows[1])) {
    issues.push(
      issue('ROW2_NOT_EMPTY', 'La fila 2 debe estar vacía.', {
        row_number: 2,
        received_value: (rows[1] ?? []).join(','),
      }),
    );
  }
  if (!isBlankRow(rows[2])) {
    issues.push(
      issue('ROW3_NOT_EMPTY', 'La fila 3 debe estar vacía.', {
        row_number: 3,
        received_value: (rows[2] ?? []).join(','),
      }),
    );
  }

  // Fila 4: cabecera exacta.
  const header = (rows[3] ?? []).map((h) => h.trim());
  if (header.length !== KEVEL_COLUMN_COUNT) {
    issues.push(
      issue(
        'HEADER_COLUMN_COUNT',
        `La cabecera (fila 4) debe tener exactamente ${KEVEL_COLUMN_COUNT} columnas; tiene ${header.length}.`,
        { row_number: 4, received_value: header.join(',') },
      ),
    );
  } else {
    for (let c = 0; c < KEVEL_COLUMN_COUNT; c++) {
      if (header[c] !== KEVEL_COLUMNS[c]) {
        issues.push(
          issue(
            'HEADER_MISMATCH',
            `Columna ${c + 1}: se esperaba "${KEVEL_COLUMNS[c]}" y llegó "${header[c]}".`,
            { row_number: 4, field: KEVEL_COLUMNS[c], received_value: header[c] ?? '' },
          ),
        );
      }
    }
  }

  // Filas de datos: a partir de la fila 5 (índice 4). Cada una con 42 valores.
  const dataCells: string[][] = [];
  for (let r = 4; r < rows.length; r++) {
    const cells = rows[r] ?? [];
    if (isBlankRow(cells)) continue; // ignora líneas en blanco al final
    if (cells.length !== KEVEL_COLUMN_COUNT) {
      issues.push(
        issue(
          'ROW_COLUMN_COUNT',
          `La fila ${r + 1} debe tener exactamente ${KEVEL_COLUMN_COUNT} valores; tiene ${cells.length}.`,
          { row_number: r + 1, received_value: cells.join(',') },
        ),
      );
      continue;
    }
    dataCells.push(cells);
  }

  const hasHeaderProblem = issues.some(
    (i) => i.code === 'HEADER_MISMATCH' || i.code === 'HEADER_COLUMN_COUNT',
  );
  const ok = issues.length === 0;
  return {
    ok,
    issues,
    meta: hasHeaderProblem ? undefined : { declaredStart, declaredEnd },
    dataCells,
  };
}

const COL = Object.fromEntries(KEVEL_COLUMNS.map((name, i) => [name, i])) as Record<
  (typeof KEVEL_COLUMNS)[number],
  number
>;

/** Mapea una fila de datos (42 celdas) a una fila normalizada tipada. */
export function mapKevelRow(cells: string[], rowNumber: number): KevelNormalizedRow {
  const s = (name: (typeof KEVEL_COLUMNS)[number]): string => (cells[COL[name]] ?? '').trim();
  const int = (name: (typeof KEVEL_COLUMNS)[number]): number => parseKevelInt(s(name)) ?? NaN;
  const num = (name: (typeof KEVEL_COLUMNS)[number]): number | null => parseKevelNumber(s(name));

  const adType = s('AdType');
  const site = s('Site');
  const zone = s('Zone');

  return {
    row_number: rowNumber,
    date: parseKevelDate(s('Date')) ?? '',
    advertiser: s('Advertiser'),
    campaign: s('Campaign'),
    flight: s('Flight'),
    ad: s('Ad'),
    rate_type: s('Rate Type'),
    price: num('Price'),
    creative: s('Creative'),
    ad_type: adType,
    site,
    zone,
    impressions: int('Impressions'),
    unfiltered_impressions: int('Unfiltered Impressions'),
    invalid_ua_impressions: int('Invalid UA Impressions'),
    clicks: int('Clicks'),
    invalid_ua_clicks: int('Invalid UA Clicks'),
    test_clicks: int('Test Clicks'),
    duplicate_impression_clicks: int('Duplicate Impression Clicks'),
    duplicate_ip_clicks: int('Duplicate IP Clicks'),
    suspicious_clicks: int('Suspicious Clicks (Bucket)'),
    unique_clicks: int('Unique Clicks'),
    unfiltered_clicks: int('Unfiltered Clicks'),
    ctr_reported: num('CTR'),
    unique_ctr_reported: num('Unique CTR'),
    cvr: num('CVR'),
    cvr_impressions: num('CVR (Impressions)'),
    cvr_clicks: num('CVR (Clicks)'),
    cpc: num('CPC'),
    revenue: num('Revenue'),
    gmv: num('GMV'),
    ecpm: num('eCPM'),
    roas: num('ROAS'),
    campaign_id: s('CampaignId'),
    flight_id: s('FlightId'),
    flight_start_date: parseKevelDate(s('Flight Start Date')),
    flight_end_date: parseKevelDate(s('Flight End Date')),
    advertiser_id: s('AdvertiserId'),
    creative_id: s('CreativeId'),
    ad_type_id: s('AdTypeId'),
    site_id: s('SiteId'),
    zone_id: s('ZoneId'),
    ad_id: s('AdId'),
    device: deriveDevice(adType, site, zone),
  };
}
