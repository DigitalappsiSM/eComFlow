/** Reporte de validación descargable (§6). Solo en el navegador. */
import type { ValidationIssue } from '@/types/results';

function csvCell(value: string | number | null | boolean): string {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function validationReportCsv(issues: readonly ValidationIssue[]): string {
  const header = ['severity', 'code', 'row_number', 'field', 'received_value', 'description', 'suggested_action', 'blocks_import'];
  const lines = issues.map((i) =>
    [i.severity, i.code, i.row_number, i.field, i.received_value, i.description, i.suggested_action, i.blocks_import]
      .map(csvCell)
      .join(','),
  );
  return [header.join(','), ...lines].join('\n');
}

export function downloadValidationReport(issues: readonly ValidationIssue[], fileName: string): void {
  const blob = new Blob([validationReportCsv(issues)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
