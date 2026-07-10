/** Seguimiento operativo, comentarios y configuración (§12, §13, §47). */

import type { Timestamp } from 'firebase/firestore';
import type { CheckKey } from '@/domain/progress';

/** Cada check almacena valor + quién y cuándo lo cambió (§12). */
export interface CheckState {
  value: boolean;
  updated_at: Timestamp | null;
  updated_by: string;
}

export interface CampaignOperation {
  campaign_operation_id: string;
  campaign_line_id: string;
  campaign_space_id: string;
  campaign_group_id: string;
  checks: Record<CheckKey, CheckState>;
  comentarios: string;
  responsable_operativo: string | null;
  porcentaje_avance: number;
  created_at: Timestamp | null;
  created_by: string;
  updated_at: Timestamp | null;
  updated_by: string;
}

export interface CampaignComment {
  comment_id: string;
  campaign_line_id: string;
  campaign_space_id: string;
  campaign_group_id: string;
  comment: string;
  created_at: Timestamp | null;
  created_by: string;
  edited_at: Timestamp | null;
  edited_by: string | null;
  active: boolean;
}

export interface AppSettings {
  risk_days: number;
  week_start_day: number;
  week_end_day: number;
  required_checks: CheckKey[];
  import_template_version: string;
  allowed_file_extensions: string[];
  max_file_size: number;
  pagination_size: number;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  risk_days: 3,
  week_start_day: 5, // viernes
  week_end_day: 4, // jueves
  required_checks: [
    'correo_enviado',
    'artes',
    'validacion',
    'link',
    'kevel',
    'testigos_app',
    'testigos_web',
  ],
  import_template_version: 'v1',
  allowed_file_extensions: ['.xlsx', '.xls', '.csv'],
  max_file_size: 10 * 1024 * 1024,
  pagination_size: 50,
};
