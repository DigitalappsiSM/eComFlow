/**
 * Pipeline de importación Kevel (orquestación pura): parse → estructura →
 * normalización → validación. No toca Firestore ni red. El repositorio añade
 * las verificaciones que dependen de la base (file_hash, traslape, claves ya
 * existentes) y la escritura.
 */

import type { EcommercePeriod } from '@/types/results';
import { mapKevelRow, parseCsv, validateKevelStructure } from './kevel-schema';
import { validateKevelImport, type KevelValidationResult } from './kevel-validation';
import { applyImpressionEstimates } from './impressions-estimate';

/**
 * Construye el plan de validación del archivo. Si la estructura falla en la
 * cabecera, no intenta mapear filas (las columnas no son fiables).
 */
export function buildKevelPlan(text: string, periods: readonly EcommercePeriod[]): KevelValidationResult {
  const tokens = parseCsv(text);
  const structure = validateKevelStructure(tokens);

  if (!structure.meta) {
    // Problema de cabecera/metadatos: no se puede mapear con seguridad.
    const errorCount = structure.issues.filter((i) => i.severity === 'error').length;
    return {
      issues: structure.issues,
      blocks: errorCount > 0,
      errorCount,
      warningCount: structure.issues.length - errorCount,
      actualStartDate: '',
      actualEndDate: '',
      periodIds: [],
      mergedRows: 0,
      enriched: [],
    };
  }

  const rows = structure.dataCells.map((cells, i) => mapKevelRow(cells, i + 5));
  const result = validateKevelImport({
    meta: { declaredStart: structure.meta.declaredStart, declaredEnd: structure.meta.declaredEnd },
    rows,
    periods,
    structuralIssues: structure.issues,
  });

  // Proyección de impresiones para filas con clics y cero impresiones reales
  // (Soriana no siempre las envía). No altera la impresión real (§14).
  const estimate = applyImpressionEstimates(result.enriched);
  if (estimate.estimatedRows > 0) {
    result.issues.push({
      severity: 'warning',
      code: 'IMPRESSIONS_ESTIMATED',
      row_number: null,
      field: 'Impressions',
      received_value: String(estimate.estimatedImpressions),
      description: `${estimate.estimatedRows} línea(s) con clics y cero impresiones: se estimaron ${estimate.estimatedImpressions} impresiones con el CTR de CATEGORY BANNER (la impresión real de Kevel se conserva en 0).`,
      suggested_action: 'Se usará en la vista de resultados como estimado, separado del dato real.',
      blocks_import: false,
    });
    result.warningCount = result.issues.filter((i) => i.severity === 'warning').length;
  }

  return result;
}
