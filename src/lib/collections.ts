/**
 * Nombres de colecciones de Firestore (§26). Fuente única para evitar nombres
 * divergentes para el mismo concepto.
 */
export const COLLECTIONS = {
  campaignGroups: 'campaign_groups',
  campaignSpaces: 'campaign_spaces',
  campaignLines: 'campaign_lines',
  campaignOperations: 'campaign_operations',
  campaignComments: 'campaign_comments',
  campaignLineRequirements: 'campaign_line_requirements',
  placements: 'placements',
  placementRequirements: 'placement_requirements',
  imports: 'imports',
  importRows: 'import_rows',
  changeHistory: 'change_history',
  users: 'users',
  appSettings: 'app_settings',
  detectedChanges: 'detected_changes',
} as const;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];
