/**
 * Validación estricta de importación (§16, §17, §18, §23).
 *
 * - Columnas obligatorias esperadas (§11).
 * - Validación por fila con motivo EXACTO y acción sugerida (§18, §45).
 * - No corrige, no completa, no adivina (§3).
 *
 * La existencia del placement (coincidencia exacta / alias) se valida aparte
 * contra el catálogo (§14) porque requiere datos de Firestore.
 */

import { z } from 'zod';
import { parseStrictDate } from '@/lib/dates';

/** Encabezados obligatorios de la plantilla (§11, §17). */
export const REQUIRED_COLUMNS = [
  'Cliente',
  'Número de campaña',
  'Artículo',
  'Anunciante',
  'Fecha de fijación',
  'Fecha de retirada',
  'Creatividad título',
  'Creatividad descripción',
  'Creatividad ID',
] as const;

export type RequiredColumn = (typeof REQUIRED_COLUMNS)[number];

/** Fila cruda tal como sale del Excel/CSV (todas las celdas como texto). */
export interface RawImportRow {
  Cliente: string;
  'Número de campaña': string;
  Artículo: string;
  Anunciante: string;
  'Fecha de fijación': string;
  'Fecha de retirada': string;
  'Creatividad título': string;
  'Creatividad descripción': string;
  'Creatividad ID': string;
}

export interface RowError {
  error_field: string;
  received_value: string;
  error_code: string;
  error_reason: string;
  suggested_action: string;
}

export interface RowValidationOk {
  ok: true;
  normalized: {
    cliente: string;
    numeroCampana: string;
    articulo: string;
    anunciante: string;
    fechaFijacionIso: string;
    fechaRetiradaIso: string;
    creatividadTitulo: string;
    creatividadDescripcion: string;
    creatividadId: string;
  };
}

export interface RowValidationError {
  ok: false;
  errors: RowError[];
}

export type RowValidationResult = RowValidationOk | RowValidationError;

const nonEmpty = (label: string) =>
  z
    .string({ required_error: `${label} vacío.` })
    .trim()
    .min(1, `${label} vacío.`);

/** Esquema base estructural (presencia y tipo texto). */
export const rawImportRowSchema = z.object({
  Cliente: nonEmpty('Cliente'),
  'Número de campaña': nonEmpty('Número de campaña'),
  Artículo: nonEmpty('Artículo'),
  Anunciante: nonEmpty('Anunciante'),
  'Fecha de fijación': nonEmpty('Fecha de fijación'),
  'Fecha de retirada': nonEmpty('Fecha de retirada'),
  'Creatividad título': nonEmpty('Creatividad título'),
  'Creatividad descripción': nonEmpty('Creatividad descripción'),
  'Creatividad ID': nonEmpty('Creatividad ID'),
});

/**
 * Valida una fila completa acumulando TODOS los errores de la fila (no se
 * detiene en el primero) para que el reporte muestre el motivo exacto (§18).
 */
export function validateImportRow(row: Partial<RawImportRow>): RowValidationResult {
  const errors: RowError[] = [];

  const field = (key: RequiredColumn): string => (row[key] ?? '').toString();

  // Requeridos no vacíos.
  const requiredText: RequiredColumn[] = [
    'Cliente',
    'Número de campaña',
    'Artículo',
    'Anunciante',
    'Creatividad título',
    'Creatividad descripción',
    'Creatividad ID',
  ];
  for (const key of requiredText) {
    if (field(key).trim() === '') {
      errors.push({
        error_field: key,
        received_value: field(key),
        error_code: 'EMPTY_REQUIRED',
        error_reason: `${key} vacío.`,
        suggested_action: `Complete ${key} en el archivo.`,
      });
    }
  }

  // Fechas.
  const fij = parseStrictDate(field('Fecha de fijación'));
  if (!fij.ok) {
    errors.push({
      error_field: 'Fecha de fijación',
      received_value: field('Fecha de fijación'),
      error_code: 'INVALID_DATE',
      error_reason: fij.reason,
      suggested_action: 'Use el formato DD/MM/YYYY.',
    });
  }
  const ret = parseStrictDate(field('Fecha de retirada'));
  if (!ret.ok) {
    errors.push({
      error_field: 'Fecha de retirada',
      received_value: field('Fecha de retirada'),
      error_code: 'INVALID_DATE',
      error_reason: ret.reason,
      suggested_action: 'Use el formato DD/MM/YYYY.',
    });
  }

  // Retirada no puede ser anterior a fijación.
  if (fij.ok && ret.ok && ret.value < fij.value) {
    errors.push({
      error_field: 'Fecha de retirada',
      received_value: field('Fecha de retirada'),
      error_code: 'RETIRADA_BEFORE_FIJACION',
      error_reason: 'La fecha de retirada es anterior a la fecha de fijación.',
      suggested_action: 'Corrija las fechas en el archivo.',
    });
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    normalized: {
      cliente: field('Cliente').trim(),
      numeroCampana: field('Número de campaña').trim(),
      articulo: field('Artículo').trim(),
      anunciante: field('Anunciante').trim(),
      fechaFijacionIso: (fij as { ok: true; value: string }).value,
      fechaRetiradaIso: (ret as { ok: true; value: string }).value,
      creatividadTitulo: field('Creatividad título').trim(),
      creatividadDescripcion: field('Creatividad descripción').trim(),
      creatividadId: field('Creatividad ID').trim(),
    },
  };
}

/**
 * Detecta filas que generan la MISMA `campaign_line_key` dentro del archivo
 * (§19). Devuelve, por cada clave duplicada, los números de fila implicados.
 * Ambas (o todas) las filas deben rechazarse; no se elige una automáticamente.
 */
export function findDuplicateLineKeys(
  rows: readonly { rowNumber: number; campaignLineKey: string }[],
): Map<string, number[]> {
  const byKey = new Map<string, number[]>();
  for (const r of rows) {
    const list = byKey.get(r.campaignLineKey) ?? [];
    list.push(r.rowNumber);
    byKey.set(r.campaignLineKey, list);
  }
  const duplicates = new Map<string, number[]>();
  for (const [key, rowNumbers] of byKey) {
    if (rowNumbers.length > 1) duplicates.set(key, rowNumbers);
  }
  return duplicates;
}

/** Verifica que existan exactamente los encabezados obligatorios (§17). */
export function validateHeaders(headers: readonly string[]): {
  ok: boolean;
  missing: string[];
  duplicated: string[];
} {
  const seen = new Set<string>();
  const duplicated: string[] = [];
  for (const h of headers) {
    if (seen.has(h)) duplicated.push(h);
    seen.add(h);
  }
  const missing = REQUIRED_COLUMNS.filter((c) => !headers.includes(c));
  return { ok: missing.length === 0 && duplicated.length === 0, missing, duplicated };
}
