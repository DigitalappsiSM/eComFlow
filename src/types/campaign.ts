/** Tipos de la jerarquía Campaña → Espacio → Línea (§6, §7, §8). */

import type { Timestamp } from 'firebase/firestore';
import type { IsoDate } from '@/lib/dates';
import type { IdentityStrategy, PeriodGranularity } from '@/domain/retailers/types';

/**
 * Estado de una línea respecto a la última exportación EKON confirmada (§3.2).
 * Es INDEPENDIENTE de `cancelled` (decisión manual de negocio):
 *  - 'present'       → apareció en la última exportación de su alcance.
 *  - 'not_in_source' → dejó de aparecer en una exportación autoritativa y se dio
 *                      de baja lógica (active=false), conservando todo su avance.
 *  - 'restored'      → reapareció y fue reactivada (valor informativo; una
 *                      importación posterior lo normaliza a 'present').
 */
export type SourceStatus = 'present' | 'not_in_source' | 'restored';

export interface AuditFields {
  created_at: Timestamp | null;
  created_by: string;
  updated_at: Timestamp | null;
  updated_by: string;
  first_import_id?: string | null;
  last_import_id?: string | null;
}

export interface CampaignGroup extends AuditFields {
  campaign_group_id: string;
  campaign_group_key: string;
  campaign_group_key_raw: string;
  cliente_original: string;
  cliente_key: string;
  numero_campaña_original: string;
  numero_campaña_key: string;
  anunciante: string;
  active: boolean;
}

export type ReplacementStatus =
  | 'not_applicable'
  | 'pending_review'
  | 'additional'
  | 'replacement'
  | 'confirmed'
  | 'rejected';

export interface CampaignSpace extends AuditFields {
  campaign_space_id: string;
  campaign_group_id: string;
  campaign_space_key: string;
  campaign_space_key_raw: string;
  placement_id: string;
  placement_name_snapshot: string;
  fecha_fijacion: IsoDate;
  fecha_retirada: IsoDate;
  creatividad_titulo_original: string;
  creatividad_titulo_key: string;
  creatividad_descripcion_original: string;
  creatividad_descripcion_key: string;
  anunciante: string;
  active: boolean;
  present_in_latest_import: boolean;
  first_seen_at: Timestamp | null;
  last_seen_at: Timestamp | null;
}

export interface CampaignLine extends AuditFields {
  campaign_line_id: string;
  campaign_group_id: string;
  campaign_space_id: string;
  campaign_line_key: string;
  campaign_line_key_raw: string;
  creatividad_id_original: string;
  creatividad_id_key: string;
  is_current: boolean;
  active: boolean;
  present_in_latest_import: boolean;
  replaces_campaign_line_id: string | null;
  replaced_by_campaign_line_id: string | null;
  replacement_status: ReplacementStatus;
  content_hash: string;

  // Campos denormalizados (read-model) para consultas de dashboard y de
  // seguimiento operativo en una sola colección (§53, §54). Se escriben en la
  // importación.
  cliente_key: string;
  cliente_original: string;
  numero_campaña_original: string;
  placement_id: string;
  placement_name_snapshot: string;
  cadena: string | null;
  tipo_operacion: string | null;
  linea_campana?: string | null;
  periodo_original?: string | null;
  periodo_codigo?: string | null;
  periodo_tipo?: string | null;
  periodo_inicio?: IsoDate | null;
  periodo_fin?: IsoDate | null;
  tipo_campana_periodo?: 'fijacion' | 'continua' | null;
  fecha_fijacion: IsoDate;
  fecha_retirada: IsoDate;
  creatividad_titulo_original: string;
  creatividad_descripcion_original: string;
  anunciante: string;
  required_pieces: number;
  cancelled: boolean;

  // --- Conciliación de fuente EKON (§3). Opcionales: los documentos históricos
  // no los tienen y se leen como `present`/activos. `is_current` y `cancelled`
  // NUNCA se tocan por esta lógica. ---
  /** Estrategia de identidad del retailer (period_range | campaign_range). */
  identity_strategy?: IdentityStrategy | null;
  /** Presencia en la última exportación EKON de su alcance. */
  source_status?: SourceStatus | null;
  /** Motivo de la baja lógica; sólo `'not_in_source'` se restaura solo. */
  inactive_reason?: string | null;
  /** Importación en la que se detectó la ausencia. */
  missing_since_import_id?: string | null;
  missing_detected_at?: Timestamp | null;
  /** Importación en la que reapareció y se restauró. */
  restored_in_import_id?: string | null;
  restored_at?: Timestamp | null;
  /** Última vez que la línea se vio en una exportación (touch de presencia). */
  last_seen_at?: Timestamp | null;

  // --- Multi-retailer / consolidación de activaciones diarias (opcionales para
  // documentos históricos; se escriben en importaciones nuevas). ---
  retailer_id?: string | null;
  /** Fechas de activación (días) consolidados en esta línea, únicas y ordenadas. */
  activation_dates?: string[];
  /** Periodo Id Ekon de cada activación (auditoría). */
  period_ids?: string[];
  /** "Línea campaña" Ekon de cada activación (auditoría). */
  external_line_ids?: string[];
  activation_start?: IsoDate | null;
  activation_end?: IsoDate | null;
  activation_count?: number;
  period_granularity?: PeriodGranularity | null;
}
