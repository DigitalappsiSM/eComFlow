import { CHECK_KEYS, type CheckKey, type CheckValues } from './progress';
import type { CampaignLine } from '@/types/campaign';

const ECOMMERCE_REQUIRED_CHECKS: readonly CheckKey[] = CHECK_KEYS;
const DIGITAL_SIGNAGE_REQUIRED_CHECKS: readonly CheckKey[] = ['artes'];
const TESTIGO_CHECKS = new Set<CheckKey>(['testigos_app', 'testigos_web']);

function normalizeTipo(tipo: string | null | undefined): string {
  return (tipo ?? '').trim().toUpperCase();
}

export function requiredChecksForOperationType(
  tipoOperacion: string | null | undefined,
): readonly CheckKey[] {
  if (normalizeTipo(tipoOperacion) === 'DIGITAL SIGNAGE') return DIGITAL_SIGNAGE_REQUIRED_CHECKS;
  return ECOMMERCE_REQUIRED_CHECKS;
}

export function requiredChecksForLine(line: Pick<CampaignLine, 'tipo_operacion'>): readonly CheckKey[] {
  return requiredChecksForOperationType(line.tipo_operacion);
}

export function isCheckRequiredForLine(
  line: Pick<CampaignLine, 'tipo_operacion'>,
  key: CheckKey,
): boolean {
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
