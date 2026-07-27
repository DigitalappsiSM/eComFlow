import { CHECK_KEYS, type CheckKey, type CheckValues } from './progress';
import { adapterForLine } from './retailers/registry';
import type { CampaignLine } from '@/types/campaign';

const ECOMMERCE_REQUIRED_CHECKS: readonly CheckKey[] = CHECK_KEYS;
const DIGITAL_SIGNAGE_REQUIRED_CHECKS: readonly CheckKey[] = ['artes'];
const TESTIGO_CHECKS = new Set<CheckKey>(['testigos_app', 'testigos_web']);

function normalizeTipo(tipo: string | null | undefined): string {
  return (tipo ?? '').trim().toUpperCase();
}

/** Artículo a partir del nombre de placement ("CADENA / ARTÍCULO" → "ARTÍCULO"). */
function articleFromPlacementName(name: string | null | undefined): string {
  const value = (name ?? '').trim();
  const sep = value.indexOf(' / ');
  return (sep >= 0 ? value.slice(sep + 3) : value).trim();
}

export function requiredChecksForOperationType(
  tipoOperacion: string | null | undefined,
): readonly CheckKey[] {
  if (normalizeTipo(tipoOperacion) === 'DIGITAL SIGNAGE') return DIGITAL_SIGNAGE_REQUIRED_CHECKS;
  return ECOMMERCE_REQUIRED_CHECKS;
}

/** Campos de una línea que influyen en qué checks son obligatorios. */
type CheckRuleLine = Pick<
  CampaignLine,
  'tipo_operacion' | 'retailer_id' | 'cadena' | 'placement_name_snapshot'
>;

/**
 * Checks obligatorios de una línea. Considera:
 *  - tipo de operación (Digital Signage solo exige Artes);
 *  - el artículo/retailer: si su configuración NO requiere arte (p. ej.
 *    SPONSORED PRODUCT de La Comer), el check "Artes" no participa.
 */
export function requiredChecksForLine(line: CheckRuleLine): readonly CheckKey[] {
  const base = requiredChecksForOperationType(line.tipo_operacion);
  const article = articleFromPlacementName(line.placement_name_snapshot);
  if (article) {
    const cfg = adapterForLine(line).articleConfig(article);
    if (cfg && !cfg.requiresArtCheck) {
      return base.filter((k) => k !== 'artes');
    }
  }
  return base;
}

export function isCheckRequiredForLine(line: CheckRuleLine, key: CheckKey): boolean {
  return requiredChecksForLine(line).includes(key);
}

export function initialChecksForImportedLine(input: {
  tipoOperacion: string | null | undefined;
  tipoCampanaPeriodo: 'fijacion' | 'continua' | null | undefined;
}): CheckValues {
  const checks = Object.fromEntries(CHECK_KEYS.map((key) => [key, false])) as CheckValues;

  if (
    normalizeTipo(input.tipoOperacion) === 'ECOMMERCE' &&
    input.tipoCampanaPeriodo === 'continua'
  ) {
    for (const key of ECOMMERCE_REQUIRED_CHECKS) {
      checks[key] = !TESTIGO_CHECKS.has(key);
    }
  }

  return checks;
}
