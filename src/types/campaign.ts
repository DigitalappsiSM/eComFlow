/** Tipos de la jerarquía Campaña → Espacio → Línea (§6, §7, §8). */

import type { Timestamp } from 'firebase/firestore';
import type { IsoDate } from '@/lib/dates';

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
  fecha_fijacion: IsoDate;
  fecha_retirada: IsoDate;
  creatividad_titulo_original: string;
  creatividad_descripcion_original: string;
  anunciante: string;
  required_pieces: number;
  cancelled: boolean;
}
