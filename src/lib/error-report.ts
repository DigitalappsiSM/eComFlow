/**
 * Reporte de errores descargable (§45). Se genera localmente en el navegador,
 * sin servidor. Formato CSV (compatible con Excel).
 */

import type { RowPlan } from '@/domain/import-pipeline';

const COLUMNS = [
  'Número de fila',
  'Cliente',
  'Número de campaña',
  'Campo afectado',
  'Valor recibido',
  'Código de error',
  'Motivo',
  'Acción sugerida',
] as const;

function csvCell(value: string): string {
  const v = value ?? '';
  if (/[";\n]/.test(v)) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

export function buildErrorReportCsv(rows: readonly RowPlan[]): string {
  const lines: string[] = [COLUMNS.join(';')];
  for (const row of rows) {
    if (row.result !== 'rejected') continue;
    for (const err of row.errors) {
      lines.push(
        [
          String(row.rowNumber),
          row.raw['Cliente'] ?? '',
          row.raw['Número de campaña'] ?? '',
          err.error_field,
          err.received_value,
          err.error_code,
          err.error_reason,
          err.suggested_action,
        ]
          .map(csvCell)
          .join(';'),
      );
    }
  }
  return lines.join('\n');
}

/** Dispara la descarga del CSV en el navegador. */
export function downloadErrorReport(rows: readonly RowPlan[], fileName = 'reporte-errores.csv'): void {
  const csv = '﻿' + buildErrorReportCsv(rows); // BOM para acentos en Excel
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
