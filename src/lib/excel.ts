/**
 * Lectura de Excel / CSV con SheetJS (§16, §17).
 *
 * Se extrae UNA sola tabla. El rechazo estructural es estricto: no se elige una
 * tabla parecida, no se mueven columnas, no se adivinan encabezados (§3, §17).
 */

import * as XLSX from 'xlsx';

export interface ExtractedTable {
  sheetName: string;
  headers: string[];
  /** Filas mapeadas por nombre de encabezado; celdas como texto. */
  rows: Record<string, string>[];
}

export type ExtractResult =
  | { ok: true; table: ExtractedTable }
  | { ok: false; reason: string };

/**
 * Lee el workbook y extrae la tabla de su ÚNICA hoja. Si hay varias hojas se
 * rechaza (no se puede identificar la correcta de forma segura).
 */
export function extractSingleTable(data: ArrayBuffer): ExtractResult {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(data, { type: 'array', cellDates: false });
  } catch {
    return { ok: false, reason: 'El archivo está corrupto o no pudo leerse.' };
  }

  const sheetNames = wb.SheetNames;
  if (sheetNames.length === 0) {
    return { ok: false, reason: 'El archivo no contiene ninguna hoja.' };
  }
  if (sheetNames.length > 1) {
    return {
      ok: false,
      reason: `El archivo contiene varias hojas (${sheetNames.join(
        ', ',
      )}) y no se puede identificar la correcta. Deje solo la hoja de datos.`,
    };
  }

  const sheetName = sheetNames[0]!;
  const ws = wb.Sheets[sheetName];
  if (!ws) {
    return { ok: false, reason: 'No se pudo abrir la hoja de datos.' };
  }

  // Como matriz de celdas de texto para inspeccionar encabezados sin interpretar.
  const aoa = XLSX.utils.sheet_to_json<string[]>(ws, {
    header: 1,
    raw: false,
    defval: '',
    blankrows: false,
  });

  if (aoa.length === 0) {
    return { ok: false, reason: 'La hoja está vacía.' };
  }

  const headers = (aoa[0] ?? []).map((h) => String(h ?? '').trim());
  if (headers.every((h) => h === '')) {
    return { ok: false, reason: 'No se encontró una fila de encabezados.' };
  }

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < aoa.length; i++) {
    const cells = aoa[i] ?? [];
    // Ignorar filas totalmente vacías.
    if (cells.every((c) => String(c ?? '').trim() === '')) continue;
    const obj: Record<string, string> = {};
    headers.forEach((header, idx) => {
      if (header === '') return;
      obj[header] = String(cells[idx] ?? '').trim();
    });
    rows.push(obj);
  }

  return { ok: true, table: { sheetName, headers, rows } };
}
