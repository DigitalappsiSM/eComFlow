/**
 * Etapas y checks Ecommerce (§4).
 *
 * Los checks se separan en dos etapas:
 *  - Preparación: correo, artes, validación, link, ad server (kevel).
 *  - Cierre operativo: testigos App y testigos Web.
 *
 * Los checks aplicables por creatividad se derivan de las reglas de negocio
 * existentes (`requiredChecksForLine`), que ya contemplan que, p. ej.,
 * SPONSORED PRODUCT de La Comer no requiere `artes`.
 */

import type { CheckKey } from '@/domain/progress';

export const PREPARATION_CHECKS: readonly CheckKey[] = [
  'correo_enviado',
  'artes',
  'validacion',
  'link',
  'kevel',
];

export const CLOSING_CHECKS: readonly CheckKey[] = ['testigos_app', 'testigos_web'];

export type CheckStage = 'preparation' | 'closing';

export const CHECK_STAGE: Record<CheckKey, CheckStage> = {
  correo_enviado: 'preparation',
  artes: 'preparation',
  validacion: 'preparation',
  link: 'preparation',
  kevel: 'preparation',
  testigos_app: 'closing',
  testigos_web: 'closing',
};

/** Etiquetas para UI (kevel se muestra como "Ad server", §4). */
export const CHECK_LABELS: Record<CheckKey, string> = {
  correo_enviado: 'Correo',
  artes: 'Artes',
  validacion: 'Validación',
  link: 'Link',
  kevel: 'Ad server',
  testigos_app: 'Testigos App',
  testigos_web: 'Testigos Web',
};

/** Orden estable para gráficas por check (preparación y luego cierre). */
export const CHECK_ORDER: readonly CheckKey[] = [...PREPARATION_CHECKS, ...CLOSING_CHECKS];

export function isPreparationCheck(key: CheckKey): boolean {
  return CHECK_STAGE[key] === 'preparation';
}
export function isClosingCheck(key: CheckKey): boolean {
  return CHECK_STAGE[key] === 'closing';
}

/** Separa una lista de checks aplicables en preparación y cierre. */
export function splitApplicableChecks(applicable: readonly CheckKey[]): {
  preparation: CheckKey[];
  closing: CheckKey[];
} {
  return {
    preparation: applicable.filter(isPreparationCheck),
    closing: applicable.filter(isClosingCheck),
  };
}
