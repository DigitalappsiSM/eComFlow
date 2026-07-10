import { describe, expect, it } from 'vitest';
import { buildErrorReportCsv } from '@/lib/error-report';
import type { RowPlan } from '@/domain/import-pipeline';

const rejected: RowPlan = {
  rowNumber: 18,
  raw: { Cliente: 'Soriana', 'Número de campaña': '45872' },
  result: 'rejected',
  possibleReplacement: false,
  errors: [
    {
      error_field: 'Fecha de fijación',
      received_value: '2026/07/17',
      error_code: 'INVALID_DATE',
      error_reason: 'Formato de fecha no autorizado. Use DD/MM/YYYY o YYYY-MM-DD.',
      suggested_action: 'Use el formato DD/MM/YYYY.',
    },
  ],
};

describe('error-report (§45)', () => {
  it('genera CSV con encabezados y una línea por error', () => {
    const csv = buildErrorReportCsv([rejected]);
    const lines = csv.split('\n');
    expect(lines[0]).toContain('Número de fila');
    expect(lines[1]).toContain('18');
    expect(lines[1]).toContain('INVALID_DATE');
  });

  it('escapa celdas con separadores/comillas', () => {
    const row: RowPlan = {
      ...rejected,
      errors: [{ ...rejected.errors[0]!, error_reason: 'texto; con "comillas"' }],
    };
    const csv = buildErrorReportCsv([row]);
    expect(csv).toContain('"texto; con ""comillas"""');
  });

  it('ignora filas no rechazadas', () => {
    const ok: RowPlan = { ...rejected, result: 'new_line', errors: [] };
    expect(buildErrorReportCsv([ok]).split('\n')).toHaveLength(1); // solo encabezado
  });
});
