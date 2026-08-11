/**
 * Dashboard de Avance Operativo Ecommerce — capa de dominio pura y testable.
 *
 * Separa la lógica de negocio (semanas, checks, fechas límite, progreso,
 * estado, consolidación de La Comer, KPIs, series y drill-down) de la lectura
 * de Firestore y de la presentación React (§12).
 */

export * from './time';
export * from './weeks';
export * from './checks';
export * from './deadlines';
export * from './progress';
export * from './types';
export * from './consolidation';
export * from './status';
export * from './kpis';
export * from './series';
export * from './drilldown';
export * from './pagination';
