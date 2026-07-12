/**
 * Pipeline de importación para la plantilla Ekon (§17–§21).
 *
 * Diferencias clave frente al pipeline genérico:
 *   - Mapea columnas Ekon (schemas/ekon.schema.ts).
 *   - El placement (espacio) se deriva de Cadena + Artículo, sin catálogo.
 *   - Varias filas de "material" con la misma Creatividad Id se AGRUPAN en una
 *     sola línea (no se rechazan como duplicados).
 */

import { buildIdentity } from './identity';
import { normalizeKey, normalizeSlugKey } from './normalization';
import { classifyRow } from './import-classification';
import { DEFAULT_DIGITAL_TIPOS, type TipoClassifier } from './articulo-tipos';
import type {
  ImportPlan,
  ImportStoreLookup,
  ImportSummary,
  RowPlan,
} from './import-pipeline';
import {
  mapEkonRow,
  validateEkonHeaders,
  type EkonNormalizedRow,
} from '@/schemas/ekon.schema';


const DAY_MS = 24 * 60 * 60 * 1000;

function addDays(iso: string, days: number): string {
  const base = new Date(`${iso}T00:00:00Z`).getTime();
  return new Date(base + days * DAY_MS).toISOString().slice(0, 10);
}

function periodStart(plan: RowPlan): string {
  return plan.extra?.periodoInicio || plan.normalized?.fechaFijacionIso || '';
}

function periodEnd(plan: RowPlan): string {
  return plan.extra?.periodoFin || plan.normalized?.fechaRetiradaIso || '';
}

function continuityKey(plan: RowPlan): string {
  return [
    plan.identity?.clienteKey ?? '',
    plan.identity?.numeroCampanaKey ?? '',
    plan.placementId ?? '',
    plan.identity?.creatividadIdKey ?? '',
    plan.identity?.creatividadDescripcionKey ?? normalizeKey(plan.normalized?.creatividadDescripcion ?? ''),
  ].join('|');
}

function classifyPeriodContinuity(plans: Iterable<RowPlan>): void {
  const ordered = [...plans].sort((a, b) => periodStart(a).localeCompare(periodStart(b)));
  const previousByKey = new Map<string, RowPlan>();

  for (const plan of ordered) {
    const key = continuityKey(plan);
    const previous = previousByKey.get(key);
    const isImmediateContinuation = previous ? addDays(periodEnd(previous), 1) === periodStart(plan) : false;
    plan.extra = {
      ...plan.extra,
      tipoCampanaPeriodo: isImmediateContinuation ? 'continua' : 'fijacion',
    };
    previousByKey.set(key, plan);
  }
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
    excluded: 0,
  };
}

/** placement_id derivado de Cadena + Artículo (p. ej. "chedraui_alarm_media"). */
export function ekonPlacementId(cadena: string, articulo: string): string {
  return normalizeSlugKey(`${cadena} ${articulo}`);
}

export function ekonPlacementName(cadena: string, articulo: string): string {
  return `${cadena.trim()} / ${articulo.trim()}`;
}

function buildRowPlan(
  rowNumber: number,
  raw: Record<string, string>,
  n: EkonNormalizedRow,
  classifier?: TipoClassifier,
): RowPlan {
  const placementId = ekonPlacementId(n.cadena, n.articulo);
  const identity = buildIdentity({
    cliente: n.cliente,
    numeroCampana: n.campana,
    placementId,
    fechaFijacionIso: n.fechaFijacionIso,
    fechaRetiradaIso: n.fechaRetiradaIso,
    creatividadTitulo: n.creatividadTitulo,
    creatividadDescripcion: n.creatividadDescripcion,
    creatividadId: n.creatividadId,
    anunciante: n.anunciante,
  });
  return {
    rowNumber,
    raw,
    result: 'unchanged',
    possibleReplacement: false,
    errors: [],
    identity,
    placementId,
    normalized: {
      cliente: n.cliente,
      numeroCampana: n.campana,
      articulo: n.articulo,
      anunciante: n.anunciante,
      fechaFijacionIso: n.fechaFijacionIso,
      fechaRetiradaIso: n.fechaRetiradaIso,
      creatividadTitulo: n.creatividadTitulo,
      creatividadDescripcion: n.creatividadDescripcion,
      creatividadId: n.creatividadId,
    },
    extra: {
      placementName: ekonPlacementName(n.cadena, n.articulo),
      cadena: n.cadena,
      lineaCampana: n.lineaCampana,
      requiredPieces: n.numSoportes,
      tipoOperacion: classifier ? classifier.resolve(n.articulo) : null,
      periodoOriginal: n.periodo.original,
      periodoCodigo: n.periodo.codigo,
      periodoTipo: n.periodo.tipo,
      periodoInicio: n.periodo.inicioIso,
      periodoFin: n.periodo.finIso,
    },
  };
}

export async function buildEkonImportPlan(
  headers: readonly string[],
  rawRows: readonly Record<string, string>[],
  store: ImportStoreLookup,
  classifier?: TipoClassifier,
  /** Tipos que SÍ se importan; el resto (p. ej. GRÁFICA) se excluye. */
  includedTipos: readonly string[] = DEFAULT_DIGITAL_TIPOS,
): Promise<ImportPlan> {
  const included = new Set(includedTipos);
  const headerCheck = validateEkonHeaders(headers);
  if (!headerCheck.ok) {
    return {
      generalRejection: `Faltan columnas obligatorias de la plantilla Ekon: ${headerCheck.missing.join(
        ', ',
      )}.`,
      rows: [],
      summary: emptySummary(rawRows.length),
    };
  }

  const rejected: RowPlan[] = [];
  // Agrupación de material: primera fila por campaign_line_key gana.
  const byLineKey = new Map<string, RowPlan>();
  let mergedRows = 0;

  rawRows.forEach((raw, index) => {
    const rowNumber = index + 2;
    const mapped = mapEkonRow(raw);
    if (!mapped.ok) {
      rejected.push({
        rowNumber,
        raw,
        result: 'rejected',
        possibleReplacement: false,
        errors: mapped.errors,
      });
      return;
    }
    const plan = buildRowPlan(rowNumber, raw, mapped.normalized, classifier);
    const key = plan.identity!.campaignLineKey;
    const existing = byLineKey.get(key);
    if (existing) {
      mergedRows += 1; // material adicional de una línea ya vista
      existing.extra = {
        ...existing.extra,
        requiredPieces:
          (existing.extra?.requiredPieces ?? 0) + (plan.extra?.requiredPieces ?? 0),
      };
      return;
    }
    byLineKey.set(key, plan);
  });

  // Una campaña es continua si el periodo inmediato anterior tiene la misma
  // campaña/artículo/creatividad/descripción; si no, es una fijación.
  classifyPeriodContinuity(byLineKey.values());

  // Clasificar cada línea distinta contra Firestore.
  for (const plan of byLineKey.values()) {
    // Excluir por tipo de operación no incluido (p. ej. GRÁFICA): no se guarda.
    const tipo = plan.extra?.tipoOperacion ?? null;
    if (tipo !== null && !included.has(tipo)) {
      plan.result = 'excluded_by_type';
      continue;
    }
    const id = plan.identity!;
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
        otherLinesInSpace: otherLines.filter((l) => l.creatividadIdKey !== id.creatividadIdKey),
      },
    });

    plan.result = classification.result;
    plan.possibleReplacement = classification.possibleReplacement;
    plan.existingGroupId = groupId;
    plan.existingSpaceId = spaceId;
    plan.existingLineId = line?.id ?? null;
  }

  const rows = [...byLineKey.values(), ...rejected].sort((a, b) => a.rowNumber - b.rowNumber);
  const summary = emptySummary(rawRows.length);
  for (const r of rows) {
    switch (r.result) {
      case 'rejected':
        summary.rejected++;
        break;
      case 'excluded_by_type':
        summary.excluded++;
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

  return { generalRejection: null, rows, summary, mergedRows };
}
