import { describe, expect, it } from 'vitest';
import {
  allocateProportional,
  buildAdjustedMap,
  canTransition,
  isEditable,
  scopeIdsHash,
  type ScopeWeekly,
} from '@/domain/results/adjustments';

const scope: ScopeWeekly[] = [
  { weekly_result_id: 'a', real_value: 100 },
  { weekly_result_id: 'b', real_value: 300 },
  { weekly_result_id: 'c', real_value: 600 },
];

function sum(vals: number[]): number {
  return vals.reduce((a, b) => a + b, 0);
}

describe('adjustments · distribución proporcional (§20)', () => {
  it('override reparte proporcional a la métrica y suma EXACTO el total', () => {
    const r = allocateProportional({ metric: 'impressions', operation: 'override', requestedAdjustedTotal: 2000, scope });
    expect(r.ok).toBe(true);
    expect(r.targetTotal).toBe(2000);
    const vals = r.allocations.map((a) => a.allocated_adjusted_value);
    expect(sum(vals)).toBe(2000); // suma exacta
    // proporcional 10/30/60 → 200/600/1200
    const byId = Object.fromEntries(r.allocations.map((a) => [a.weekly_result_id, a.allocated_adjusted_value]));
    expect(byId).toEqual({ a: 200, b: 600, c: 1200 });
    expect(r.allocations.every((a) => a.allocation_basis_metric === 'impressions')).toBe(true);
  });

  it('delta positivo: total = real + delta, repartido por la misma métrica', () => {
    const r = allocateProportional({ metric: 'clicks', operation: 'delta', requestedDelta: 100, scope });
    expect(r.ok).toBe(true);
    expect(r.targetTotal).toBe(1100); // 1000 + 100
    expect(sum(r.allocations.map((a) => a.allocated_adjusted_value))).toBe(1100);
    const byId = Object.fromEntries(r.allocations.map((a) => [a.weekly_result_id, a.allocated_adjusted_value]));
    // real + delta*share: 100+10, 300+30, 600+60
    expect(byId).toEqual({ a: 110, b: 330, c: 660 });
  });

  it('delta negativo válido reduce sin dejar total negativo', () => {
    const r = allocateProportional({ metric: 'clicks', operation: 'delta', requestedDelta: -100, scope });
    expect(r.ok).toBe(true);
    expect(r.targetTotal).toBe(900);
    expect(sum(r.allocations.map((a) => a.allocated_adjusted_value))).toBe(900);
  });

  it('mayores residuos: total no divisible se cuadra exacto y es determinista', () => {
    const r = allocateProportional({ metric: 'impressions', operation: 'override', requestedAdjustedTotal: 1000, scope });
    expect(sum(r.allocations.map((a) => a.allocated_adjusted_value))).toBe(1000);
    // 10/30/60 de 1000 = 100/300/600 exacto; probamos un caso con residuos:
    const r2 = allocateProportional({
      metric: 'impressions',
      operation: 'override',
      requestedAdjustedTotal: 10,
      scope: [
        { weekly_result_id: 'x', real_value: 1 },
        { weekly_result_id: 'y', real_value: 1 },
        { weekly_result_id: 'z', real_value: 1 },
      ],
    });
    // 10/3 = 3.33 c/u → 3,3,3 + 1 al mayor residuo (empate → menor id 'x')
    expect(sum(r2.allocations.map((a) => a.allocated_adjusted_value))).toBe(10);
    const x = r2.allocations.find((a) => a.weekly_result_id === 'x')!;
    expect(x.allocated_adjusted_value).toBe(4); // desempate determinista por id
  });

  it('base real = 0 BLOQUEA (no reparte uniforme, no usa otra base)', () => {
    const r = allocateProportional({
      metric: 'impressions',
      operation: 'override',
      requestedAdjustedTotal: 500,
      scope: [{ weekly_result_id: 'a', real_value: 0 }, { weekly_result_id: 'b', real_value: 0 }],
    });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('BASE_ZERO');
  });

  it('total ajustado negativo BLOQUEA', () => {
    expect(allocateProportional({ metric: 'clicks', operation: 'override', requestedAdjustedTotal: -5, scope }).error).toBe('NEGATIVE_TOTAL');
    expect(allocateProportional({ metric: 'clicks', operation: 'delta', requestedDelta: -5000, scope }).error).toBe('NEGATIVE_TOTAL');
  });
});

describe('adjustments · modelo ajustado y estados', () => {
  it('buildAdjustedMap indexa por weekly_result_id + métrica', () => {
    const r = allocateProportional({ metric: 'impressions', operation: 'override', requestedAdjustedTotal: 2000, scope });
    const map = buildAdjustedMap(r.allocations);
    expect(map.get('a')?.impressions).toBe(200);
    expect(map.get('c')?.impressions).toBe(1200);
    expect(map.get('a')?.clicks).toBeUndefined();
  });

  it('scopeIdsHash es estable ante el orden', () => {
    expect(scopeIdsHash(['b', 'a', 'c'])).toBe(scopeIdsHash(['a', 'b', 'c']));
  });

  it('transiciones de estado: aprobado es inmutable', () => {
    expect(canTransition('draft', 'pending_approval')).toBe(true);
    expect(canTransition('pending_approval', 'approved')).toBe(true);
    expect(canTransition('approved', 'draft')).toBe(false); // no se edita lo aprobado
    expect(isEditable('draft')).toBe(true);
    expect(isEditable('approved')).toBe(false);
  });
});
