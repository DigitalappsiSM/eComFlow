import { describe, expect, it } from 'vitest';
import {
  computeProgress,
  hasPendingRequiredChecks,
  initialCheckValues,
  type CheckValues,
} from '@/domain/progress';

describe('progress (§12)', () => {
  it('línea nueva: todos los checks en false y avance 0', () => {
    const checks = initialCheckValues();
    expect(computeProgress(checks)).toBe(0);
    expect(hasPendingRequiredChecks(checks)).toBe(true);
  });

  it('ponderación uniforme entre 7 checks obligatorios', () => {
    const checks: CheckValues = { ...initialCheckValues(), artes: true, validacion: true };
    // 2 de 7 ≈ 29%
    expect(computeProgress(checks)).toBe(29);
  });

  it('todos completos → 100% y sin pendientes', () => {
    const checks: CheckValues = {
      correo_enviado: true,
      artes: true,
      validacion: true,
      link: true,
      kevel: true,
      testigos_app: true,
      testigos_web: true,
    };
    expect(computeProgress(checks)).toBe(100);
    expect(hasPendingRequiredChecks(checks)).toBe(false);
  });

  it('respeta un subconjunto de checks obligatorios configurado', () => {
    const checks: CheckValues = { ...initialCheckValues(), artes: true };
    expect(computeProgress(checks, ['artes', 'kevel'])).toBe(50);
  });
});
