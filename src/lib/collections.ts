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

  // --- Módulo Resultados Ecommerce (Kevel). Dominio independiente (§3). ---
  // Catálogo compartido de periodos ecommerce (semanas viernes→jueves).
  ecommercePeriods: 'ecommerce_periods',
  // Exclusivas de Resultados (prefijo results_). Nunca se mezclan con operación.
  resultsImports: 'results_imports',
  resultsDaily: 'results_daily',
  resultsWeekly: 'results_weekly',
  resultsValidationIssues: 'results_validation_issues',
  resultsCampaignLinks: 'results_campaign_links',
  resultsAdvertiserMappings: 'results_advertiser_mappings',
  resultsPlacementMappings: 'results_placement_mappings',
  resultsDeviceMappings: 'results_device_mappings',
  resultsAdjustmentSets: 'results_adjustment_sets',
  resultsWeeklyAdjustments: 'results_weekly_adjustments',
  resultsWeeklyAdjustmentAllocations: 'results_weekly_adjustment_allocations',
  resultsAdjustmentHistory: 'results_adjustment_history',
  resultsChangeHistory: 'results_change_history',
} as const;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];
