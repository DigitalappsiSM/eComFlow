/** Importaciones y auditoría (§22, §23, §24, §32). */

import type { Timestamp } from 'firebase/firestore';
import type { IsoDate } from '@/lib/dates';
import type { ImportResult } from '@/domain/import-classification';

export type ImportStatus =
  | 'draft'
  | 'validated'
  | 'awaiting_confirmation'
  | 'processing'
  | 'processed'
  | 'partially_processed'
  | 'rejected'
  | 'failed'
  | 'cancelled';

export type ImportScopeType =
  | 'complete'
  | 'partial'
  | 'client'
  | 'date_range'
  | 'campaign';

/**
 * Periodo exacto detectado en una exportación EKON (§4.2). No se infiere por
 * min/max: cada periodo discreto (semana/catorcena) que aparece en el archivo
 * se lista de forma explícita para no desactivar periodos intermedios ausentes.
 */
export interface ImportCoveredPeriod {
  code: string;
  type: 'semana' | 'catorcena' | 'otro';
  start: IsoDate;
  end: IsoDate;
}

/**
 * Modo de cobertura de una importación:
 *  - 'additive'      → nunca desactiva nada (modo seguro por defecto).
 *  - 'authoritative' → trata el archivo como fotografía completa del alcance
 *                      detectado y da de baja lógica las líneas ausentes (§4.4).
 */
export type ImportCoverageMode = 'additive' | 'authoritative';

export interface ImportScope {
  scope_type: ImportScopeType;
  scope_clients: string[];
  scope_start_date: IsoDate | null;
  scope_end_date: IsoDate | null;
  scope_campaigns: string[];
  is_complete_scope: boolean;

  // --- Conciliación de fuente EKON (opcionales; documentos históricos no los
  // tienen y se leen como ausentes). ---
  source_system?: 'ekon' | 'generic';
  coverage_mode?: ImportCoverageMode;
  covered_periods?: ImportCoveredPeriod[];
  scope_chains?: string[];
  scope_operation_types?: string[];
}

export interface ImportRecord {
  import_id: string;
  file_name: string;
  file_size: number;
  file_hash: string;
  template_version: string;
  import_scope: ImportScope;
  status: ImportStatus;
  uploaded_at: Timestamp | null;
  uploaded_by: string;
  total_rows: number;
  valid_rows: number;
  new_campaigns: number;
  new_spaces: number;
  new_lines: number;
  updated_rows: number;
  unchanged_rows: number;
  rejected_rows: number;
  creativity_changes: number;
  possible_replacements: number;
  general_rejection_reason: string | null;
  started_at: Timestamp | null;
  finished_at: Timestamp | null;
  last_confirmed_batch: number;
  processing_version: string;
  /** Motivo acotado del fallo (fase + mensaje) cuando status === 'failed'. */
  failure_reason?: string | null;

  // --- Conciliación de fuente EKON (opcionales, retrocompatibles). ---
  /** Líneas dentro del alcance que dejaron de aparecer y se dieron de baja. */
  missing_rows?: number;
  /** Líneas ausentes previas que reaparecieron y se restauraron. */
  restored_rows?: number;
  /** Resultado de la conciliación de fuente en esta importación. */
  reconciliation_status?: 'skipped' | 'blocked' | 'completed';
  /** Motivos por los que la conciliación autoritativa no fue elegible. */
  reconciliation_blocked_reasons?: string[];
}

export interface ImportRow {
  import_row_id: string;
  import_id: string;
  row_number: number;
  received_data: Record<string, unknown>;
  normalized_data: Record<string, unknown>;
  result: ImportResult;
  campaign_group_id: string | null;
  campaign_space_id: string | null;
  campaign_line_id: string | null;
  error_field: string | null;
  received_value: string | null;
  error_code: string | null;
  error_reason: string | null;
  suggested_action: string | null;
  created_at: Timestamp | null;
  created_by: string;
}
