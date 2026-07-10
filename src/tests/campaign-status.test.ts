import { describe, expect, it } from 'vitest';
import { computeStatus } from '@/domain/campaign-status';
import { initialCheckValues, type CheckValues } from '@/domain/progress';

const allDone: CheckValues = {
  correo_enviado: true,
  artes: true,
  validacion: true,
  link: true,
  kevel: true,
  testigos_app: true,
  testigos_web: true,
};

describe('campaign-status (§31)', () => {
  it('cancelled: solo por acción explícita', () => {
    expect(
      computeStatus({
        fechaFijacion: '2026-07-01',
        fechaRetirada: '2026-07-30',
        checks: allDone,
        cancelled: true,
        today: '2026-07-10',
      }),
    ).toBe('cancelled');
  });

  it('completed: retirada anterior a hoy', () => {
    expect(
      computeStatus({
        fechaFijacion: '2026-06-01',
        fechaRetirada: '2026-06-30',
        checks: initialCheckValues(),
        today: '2026-07-10',
      }),
    ).toBe('completed');
  });

  it('live (pautándose): en vigencia con kevel=true', () => {
    expect(
      computeStatus({
        fechaFijacion: '2026-07-01',
        fechaRetirada: '2026-07-30',
        checks: allDone,
        today: '2026-07-10',
      }),
    ).toBe('live');
  });

  it('incomplete: en vigencia con checks obligatorios faltantes', () => {
    expect(
      computeStatus({
        fechaFijacion: '2026-07-01',
        fechaRetirada: '2026-07-30',
        checks: initialCheckValues(),
        today: '2026-07-10',
      }),
    ).toBe('incomplete');
  });

  it('at_risk: inicia dentro de la ventana de riesgo y faltan checks', () => {
    expect(
      computeStatus({
        fechaFijacion: '2026-07-12',
        fechaRetirada: '2026-07-30',
        checks: initialCheckValues(),
        today: '2026-07-10',
        riskDays: 3,
      }),
    ).toBe('at_risk');
  });

  it('pending: futuro con tareas pendientes fuera de la ventana de riesgo', () => {
    expect(
      computeStatus({
        fechaFijacion: '2026-07-25',
        fechaRetirada: '2026-08-10',
        checks: initialCheckValues(),
        today: '2026-07-10',
        riskDays: 3,
      }),
    ).toBe('pending');
  });

  it('upcoming: futuro sin pendientes y fuera de la ventana de riesgo', () => {
    expect(
      computeStatus({
        fechaFijacion: '2026-07-25',
        fechaRetirada: '2026-08-10',
        checks: allDone,
        today: '2026-07-10',
        riskDays: 3,
      }),
    ).toBe('upcoming');
  });
});
