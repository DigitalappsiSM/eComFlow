/**
 * Pipeline de importación (§17–§21). Lógica PURA y testeable: valida
 * estructura y filas, resuelve placements, construye identidades, detecta
 * duplicados en el archivo y clasifica cada fila contra el estado de Firestore
 * (inyectado a través de `ImportStoreLookup`).
 *
 * No escribe nada: produce un PLAN que el usuario revisa antes de confirmar
 * (§18). La escritura ocurre en otra capa tras la confirmación.
 */

import type { CampaignIdentity } from './identity';
import { buildIdentity } from './identity';
import { classifyRow, type ExistingLineRef, type ImportResult } from './import-classification';
import type { PlacementIndex } from './placement-index';
import {
  findDuplicateLineKeys,
  validateHeaders,
  validateImportRow,
  type RawImportRow,
  type RowError,
} from '@/schemas/import.schema';

/** Datos existentes consultados en Firestore para clasificar (§20). */
export interface ImportStoreLookup {
  getGroupId(groupKey: string): Promise<string | null>;
  getSpaceId(spaceKey: string): Promise<string | null>;
  getLine(lineKey: string): Promise<(ExistingLineRef & { id: string }) | null>;
  /** Otras líneas vigentes del espacio (distinta Creatividad ID). */
  getSpaceLines(spaceId: string): Promise<ExistingLineRef[]>;
}

export interface RowPlan {
  rowNumber: number;
  raw: Record<string, string>;
  result: ImportResult;
  possibleReplacement: boolean;
  errors: RowError[];
  identity?: CampaignIdentity;
  normalized?: {
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
  placementId?: string;
  existingGroupId?: string | null;
  existingSpaceId?: string | null;
  existingLineId?: string | null;
  /** Datos adicionales específicos de plantilla (p. ej. Ekon). */
  extra?: {
    placementName?: string;
    cadena?: string;
    lineaCampana?: string;
    requiredPieces?: number;
  };
}

export interface ImportSummary {
  total: number;
  valid: number;
  new_campaigns: number;
  new_spaces: number;
  new_lines: number;
  updated: number;
  unchanged: number;
  rejected: number;
  creativity_changes: number;
  possible_replacements: number;
}

export interface ImportPlan {
  generalRejection: string | null;
  rows: RowPlan[];
  summary: ImportSummary;
  /** Filas de material agrupadas en una misma línea (plantilla Ekon). */
  mergedRows?: number;
}

function rejectRow(
  rowNumber: number,
  raw: Record<string, string>,
  errors: RowError[],
): RowPlan {
  return { rowNumber, raw, result: 'rejected', possibleReplacement: false, errors };
}

function emptySummary(total: number): ImportSummary {
  return {
    total,
    valid: 0,
    new_campaigns: 0,
    new_spaces: 0,
    new_lines: 0,
    updated: 0,
    unchanged: 0,
    rejected: 0,
    creativity_changes: 0,
    possible_replacements: 0,
  };
}

/**
 * Construye el plan de importación. La primera fila de datos corresponde al
 * número de fila 2 (la 1 es el encabezado), reflejando el Excel real.
 */
export async function buildImportPlan(
  headers: readonly string[],
  rawRows: readonly Record<string, string>[],
  placements: PlacementIndex,
  store: ImportStoreLookup,
): Promise<ImportPlan> {
  // 1) Estructura / encabezados (§17): rechazo completo del archivo.
  const headerCheck = validateHeaders(headers);
  if (!headerCheck.ok) {
    const parts: string[] = [];
    if (headerCheck.missing.length > 0) {
      parts.push(`Faltan columnas obligatorias: ${headerCheck.missing.join(', ')}.`);
    }
    if (headerCheck.duplicated.length > 0) {
      parts.push(`Encabezados duplicados: ${headerCheck.duplicated.join(', ')}.`);
    }
    return {
      generalRejection: parts.join(' '),
      rows: [],
      summary: emptySummary(rawRows.length),
    };
  }

  // 2) Validación por fila + resolución de placement + identidad.
  interface Candidate {
    rowNumber: number;
    raw: Record<string, string>;
    plan: RowPlan;
  }
  const candidates: Candidate[] = [];

  rawRows.forEach((raw, index) => {
    const rowNumber = index + 2;
    const validation = validateImportRow(raw as Partial<RawImportRow>);
    if (!validation.ok) {
      candidates.push({ rowNumber, raw, plan: rejectRow(rowNumber, raw, validation.errors) });
      return;
    }

    const placementId = placements.resolve(validation.normalized.articulo);
    if (!placementId) {
      candidates.push({
        rowNumber,
        raw,
        plan: rejectRow(rowNumber, raw, [
          {
            error_field: 'Artículo',
            received_value: validation.normalized.articulo,
            error_code: 'ARTICLE_NOT_FOUND',
            error_reason: 'El artículo no existe en el catálogo de placements.',
            suggested_action: 'Registre el placement o su alias, o corrija el nombre en el archivo.',
          },
        ]),
      });
      return;
    }

    const identity = buildIdentity({
      cliente: validation.normalized.cliente,
      numeroCampana: validation.normalized.numeroCampana,
      placementId,
      fechaFijacionIso: validation.normalized.fechaFijacionIso,
      fechaRetiradaIso: validation.normalized.fechaRetiradaIso,
      creatividadTitulo: validation.normalized.creatividadTitulo,
      creatividadDescripcion: validation.normalized.creatividadDescripcion,
      creatividadId: validation.normalized.creatividadId,
      anunciante: validation.normalized.anunciante,
    });

    candidates.push({
      rowNumber,
      raw,
      plan: {
        rowNumber,
        raw,
        result: 'unchanged', // provisional; se define en la clasificación
        possibleReplacement: false,
        errors: [],
        identity,
        normalized: validation.normalized,
        placementId,
      },
    });
  });

  // 3) Duplicados dentro del archivo (§19): rechazar TODAS las filas implicadas.
  const validForDup = candidates
    .filter((c) => c.plan.result !== 'rejected' && c.plan.identity)
    .map((c) => ({ rowNumber: c.rowNumber, campaignLineKey: c.plan.identity!.campaignLineKey }));
  const duplicates = findDuplicateLineKeys(validForDup);
  const duplicatedRows = new Set<number>();
  for (const rowNumbers of duplicates.values()) {
    for (const n of rowNumbers) duplicatedRows.add(n);
  }

  // 4) Clasificar contra Firestore las filas válidas no duplicadas.
  for (const c of candidates) {
    if (c.plan.result === 'rejected' || !c.plan.identity) continue;

    if (duplicatedRows.has(c.rowNumber)) {
      const others = duplicates.get(c.plan.identity.campaignLineKey) ?? [];
      c.plan = rejectRow(c.rowNumber, c.raw, [
        {
          error_field: 'Creatividad ID',
          received_value: c.plan.normalized?.creatividadId ?? '',
          error_code: 'DUPLICATE_IN_FILE',
          error_reason: `Línea operativa duplicada dentro del archivo. Filas relacionadas: ${others.join(
            ' y ',
          )}.`,
          suggested_action: 'Revise el archivo y conserve únicamente el registro correcto.',
        },
      ]);
      continue;
    }

    const id = c.plan.identity;
    const groupId = await store.getGroupId(id.campaignGroupKey);
    const spaceId = groupId ? await store.getSpaceId(id.campaignSpaceKey) : null;
    const line = spaceId ? await store.getLine(id.campaignLineKey) : null;
    const otherLines = spaceId ? await store.getSpaceLines(spaceId) : [];

    const classification = classifyRow({
      contentHash: id.contentHash,
      existing: {
        groupExists: groupId !== null,
        spaceExists: spaceId !== null,
        matchingLine: line ?? undefined,
        otherLinesInSpace: otherLines.filter(
          (l) => l.creatividadIdKey !== id.creatividadIdKey,
        ),
      },
    });

    c.plan.result = classification.result;
    c.plan.possibleReplacement = classification.possibleReplacement;
    c.plan.existingGroupId = groupId;
    c.plan.existingSpaceId = spaceId;
    c.plan.existingLineId = line?.id ?? null;
  }

  // 5) Resumen.
  const rows = candidates.map((c) => c.plan);
  const summary = emptySummary(rawRows.length);
  for (const r of rows) {
    switch (r.result) {
      case 'rejected':
        summary.rejected++;
        break;
      case 'new_campaign':
        summary.valid++;
        summary.new_campaigns++;
        summary.new_spaces++;
        summary.new_lines++;
        break;
      case 'new_space':
        summary.valid++;
        summary.new_spaces++;
        summary.new_lines++;
        break;
      case 'new_line':
        summary.valid++;
        summary.new_lines++;
        break;
      case 'updated_line':
      case 'updated_space':
        summary.valid++;
        summary.updated++;
        break;
      case 'unchanged':
        summary.valid++;
        summary.unchanged++;
        break;
      case 'creativity_change':
        summary.valid++;
        summary.new_lines++;
        summary.creativity_changes++;
        if (r.possibleReplacement) summary.possible_replacements++;
        break;
      case 'possible_replacement':
        summary.valid++;
        summary.possible_replacements++;
        break;
    }
  }

  return { generalRejection: null, rows, summary };
}
