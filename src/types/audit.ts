/** Auditoría y cambios detectados (§24, §43). */

import type { Timestamp } from 'firebase/firestore';

export type ChangeOrigin =
  | 'excel_import'
  | 'manual_operation'
  | 'catalog_change'
  | 'assignment'
  | 'comment'
  | 'system_calculation';

export type ChangeType =
  | 'created'
  | 'updated'
  | 'check_changed'
  | 'responsible_changed'
  | 'comment_added'
  | 'comment_edited'
  | 'comment_archived'
  | 'date_changed'
  | 'creativity_detected'
  | 'replacement_confirmed'
  | 'replacement_rejected'
  | 'status_changed';

export type EntityType =
  | 'campaign_group'
  | 'campaign_space'
  | 'campaign_line'
  | 'campaign_operation'
  | 'campaign_comment'
  | 'placement';

export interface ChangeHistoryEntry {
  change_id: string;
  entity_type: EntityType;
  entity_id: string;
  campaign_group_id: string | null;
  campaign_space_id: string | null;
  campaign_line_id: string | null;
  import_id: string | null;
  change_type: ChangeType;
  field_name: string | null;
  previous_value: unknown;
  new_value: unknown;
  origin: ChangeOrigin;
  created_at: Timestamp | null;
  created_by: string;
  created_by_email: string;
}

export type DetectedChangeType =
  | 'new_creativity'
  | 'possible_replacement'
  | 'date_change'
  | 'title_change'
  | 'description_change'
  | 'placement_change'
  | 'missing_record'
  | 'ambiguous_identity'
  | 'duplicate'
  | 'prior_import_diff';

export type DetectedChangeStatus = 'pending' | 'confirmed' | 'rejected' | 'resolved';

export interface DetectedChange {
  detected_change_id: string;
  type: DetectedChangeType;
  status: DetectedChangeStatus;
  campaign_group_id: string | null;
  campaign_space_id: string | null;
  campaign_line_id: string | null;
  import_id: string | null;
  detail: string;
  reviewed_at: Timestamp | null;
  reviewed_by: string | null;
  review_comment: string | null;
  created_at: Timestamp | null;
  created_by: string;
}
