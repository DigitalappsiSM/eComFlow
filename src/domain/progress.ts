/**
 * Checks operativos y cálculo de avance (§12).
 *
 * El porcentaje de avance se calcula automáticamente y NUNCA se captura a
 * mano. La ponderación inicial es uniforme entre los checks obligatorios,
 * salvo que la configuración (`app_settings.required_checks`) indique otra
 * regla.
 */

export const CHECK_KEYS = [
  'correo_enviado',
  'artes',
  'validacion',
  'link',
  'kevel',
  'testigos_app',
  'testigos_web',
] as const;

export type CheckKey = (typeof CHECK_KEYS)[number];

/** Checks considerados obligatorios por defecto para el avance y el riesgo. */
export const DEFAULT_REQUIRED_CHECKS: readonly CheckKey[] = CHECK_KEYS;

/** Valor booleano de cada check (proyección simple del subdocumento). */
export type CheckValues = Record<CheckKey, boolean>;

/**
 * Avance como porcentaje entero 0..100, ponderación uniforme entre los checks
 * obligatorios indicados. Si no hay checks obligatorios, devuelve 0.
 */
export function computeProgress(
  checks: CheckValues,
  requiredChecks: readonly CheckKey[] = DEFAULT_REQUIRED_CHECKS,
): number {
  if (requiredChecks.length === 0) return 0;
  const done = requiredChecks.reduce(
    (acc, key) => acc + (checks[key] ? 1 : 0),
    0,
  );
  return Math.round((done / requiredChecks.length) * 100);
}

/** ¿Faltan checks obligatorios? */
export function hasPendingRequiredChecks(
  checks: CheckValues,
  requiredChecks: readonly CheckKey[] = DEFAULT_REQUIRED_CHECKS,
): boolean {
  return requiredChecks.some((key) => !checks[key]);
}

/** Estado "todo en falso" para una línea recién creada (§9). */
export function initialCheckValues(): CheckValues {
  return {
    correo_enviado: false,
    artes: false,
    validacion: false,
    link: false,
    kevel: false,
    testigos_app: false,
    testigos_web: false,
  };
}
