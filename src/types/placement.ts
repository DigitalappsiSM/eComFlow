/** Catálogo de placements y requerimientos (§14, §15). */

import type { Timestamp } from 'firebase/firestore';
import type { IsoDate } from '@/lib/dates';

export interface Placement {
  placement_id: string;
  nombre: string;
  nombre_normalizado: string;
  descripcion: string;
  aliases?: string[];
  active: boolean;
  created_at: Timestamp | null;
  created_by: string;
  updated_at: Timestamp | null;
  updated_by: string;
}

export interface PlacementRequirement {
  requirement_id: string;
  placement_id: string;
  canal: string;
  dispositivo: string;
  variante: string;
  ancho: number;
  alto: number;
  peso_maximo: number | null;
  unidad_peso: string | null;
  formatos_permitidos: string[];
  obligatorio: boolean;
  active: boolean;
  fecha_inicio_vigencia: IsoDate;
  fecha_fin_vigencia: IsoDate | null;
  created_at: Timestamp | null;
  created_by: string;
  updated_at: Timestamp | null;
  updated_by: string;
}

/** Fotografía de requisitos aplicables al crear una línea (§15). */
export interface CampaignLineRequirement {
  campaign_line_requirement_id: string;
  campaign_line_id: string;
  campaign_space_id: string;
  campaign_group_id: string;
  requirement_id: string;
  placement_id: string;
  canal: string;
  dispositivo: string;
  variante: string;
  ancho: number;
  alto: number;
  peso_maximo: number | null;
  unidad_peso: string | null;
  formatos_permitidos: string[];
  obligatorio: boolean;
  requirement_snapshot_version: number;
  created_at: Timestamp | null;
}
