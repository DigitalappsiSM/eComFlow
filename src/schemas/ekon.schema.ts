/**
 * Plantilla de importación "Ekon" — export operativo real (§16–§18).
 *
 * Mapea las columnas del archivo Ekon a los conceptos del dominio. A diferencia
 * de la plantilla de la especificación (§11):
 *   - "Cliente" (agrupación) = columna "Cliente" (empresa anunciante).
 *   - El espacio operativo se identifica por Cadena + Artículo (+ fecha +
 *     creatividad), porque en retail media el lugar concreto es la cadena y el
 *     artículo (p. ej. "CHEDRAUI / ALARM-MEDIA").
 *   - "Creatividad Desc." y "Creativitad Título" son OPCIONALES (vienen vacías
 *     en la mayoría de filas). La línea operativa se identifica por Creatividad
 *     Id (las filas de material se agrupan).
 *   - Fechas en ISO (YYYY-MM-DD) o DD/MM/YYYY.
 */

import { parseStrictDate } from '@/lib/dates';
import type { RowError } from './import.schema';

/** Nota: los nombres respetan EXACTAMENTE los del archivo, incluida la errata
 *  "Creativitad Título". */
export const EKON_COLUMNS = {
  cliente: 'Cliente',
  anunciante: 'Anunciante',
  cadena: 'Cadena',
  articulo: 'Artículo',
  campana: 'Campaña',
  lineaCampana: 'Línea campaña',
  fechaFijacion: 'Fecha Fijación',
  fechaRetirada: 'Fecha Retirada',
  creatividadId: 'Creatividad Id',
  creatividadTitulo: 'Creativitad Título',
  creatividadDesc: 'Creatividad Desc.',
  numSoportes: 'Nº Soportes',
} as const;

/** Columnas que DEBEN existir como encabezado (rechazo estructural si faltan). */
export const EKON_REQUIRED_COLUMNS: readonly string[] = [
  EKON_COLUMNS.cliente,
  EKON_COLUMNS.anunciante,
  EKON_COLUMNS.cadena,
  EKON_COLUMNS.articulo,
  EKON_COLUMNS.campana,
  EKON_COLUMNS.fechaFijacion,
  EKON_COLUMNS.fechaRetirada,
  EKON_COLUMNS.creatividadId,
];

export interface EkonNormalizedRow {
  cliente: string;
  anunciante: string;
  cadena: string;
  articulo: string;
  campana: string;
  lineaCampana: string;
  fechaFijacionIso: string;
  fechaRetiradaIso: string;
  creatividadId: string;
  creatividadTitulo: string;
  creatividadDescripcion: string;
  numSoportes: number;
}

export type EkonRowResult =
  | { ok: true; normalized: EkonNormalizedRow }
  | { ok: false; errors: RowError[] };

export function validateEkonHeaders(headers: readonly string[]): {
  ok: boolean;
  missing: string[];
} {
  const missing = EKON_REQUIRED_COLUMNS.filter((c) => !headers.includes(c));
  return { ok: missing.length === 0, missing };
}

function toInt(value: string): number {
  const n = parseInt(value.replace(/[^\d-]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

export function mapEkonRow(row: Record<string, string>): EkonRowResult {
  const errors: RowError[] = [];
  const val = (k: string) => (row[k] ?? '').toString().trim();

  const required: { key: string; label: string }[] = [
    { key: EKON_COLUMNS.cliente, label: 'Cliente' },
    { key: EKON_COLUMNS.anunciante, label: 'Anunciante' },
    { key: EKON_COLUMNS.cadena, label: 'Cadena' },
    { key: EKON_COLUMNS.articulo, label: 'Artículo' },
    { key: EKON_COLUMNS.campana, label: 'Campaña' },
    { key: EKON_COLUMNS.creatividadId, label: 'Creatividad Id' },
  ];
  for (const { key, label } of required) {
    if (val(key) === '') {
      errors.push({
        error_field: label,
        received_value: val(key),
        error_code: 'EMPTY_REQUIRED',
        error_reason: `${label} vacío.`,
        suggested_action: `Complete ${label} en el archivo.`,
      });
    }
  }

  const fij = parseStrictDate(val(EKON_COLUMNS.fechaFijacion));
  if (!fij.ok) {
    errors.push({
      error_field: 'Fecha Fijación',
      received_value: val(EKON_COLUMNS.fechaFijacion),
      error_code: 'INVALID_DATE',
      error_reason: fij.reason,
      suggested_action: 'Use formato YYYY-MM-DD o DD/MM/YYYY.',
    });
  }
  const ret = parseStrictDate(val(EKON_COLUMNS.fechaRetirada));
  if (!ret.ok) {
    errors.push({
      error_field: 'Fecha Retirada',
      received_value: val(EKON_COLUMNS.fechaRetirada),
      error_code: 'INVALID_DATE',
      error_reason: ret.reason,
      suggested_action: 'Use formato YYYY-MM-DD o DD/MM/YYYY.',
    });
  }
  if (fij.ok && ret.ok && ret.value < fij.value) {
    errors.push({
      error_field: 'Fecha Retirada',
      received_value: val(EKON_COLUMNS.fechaRetirada),
      error_code: 'RETIRADA_BEFORE_FIJACION',
      error_reason: 'La fecha de retirada es anterior a la fecha de fijación.',
      suggested_action: 'Corrija las fechas en el archivo.',
    });
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    normalized: {
      cliente: val(EKON_COLUMNS.cliente),
      anunciante: val(EKON_COLUMNS.anunciante),
      cadena: val(EKON_COLUMNS.cadena),
      articulo: val(EKON_COLUMNS.articulo),
      campana: val(EKON_COLUMNS.campana),
      lineaCampana: val(EKON_COLUMNS.lineaCampana),
      fechaFijacionIso: (fij as { ok: true; value: string }).value,
      fechaRetiradaIso: (ret as { ok: true; value: string }).value,
      creatividadId: val(EKON_COLUMNS.creatividadId),
      creatividadTitulo: val(EKON_COLUMNS.creatividadTitulo),
      creatividadDescripcion: val(EKON_COLUMNS.creatividadDesc),
      numSoportes: toInt(val(EKON_COLUMNS.numSoportes)),
    },
  };
}
