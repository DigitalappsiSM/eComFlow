import { describe, it, expect } from 'vitest';
import { applyDashboardLimit } from '@/repositories/campaign-lines.repository';

/**
 * Lógica de truncamiento del dashboard: se consulta `limit + 1` para saber si
 * hay más de los mostrados, se devuelve como máximo `limit` y se marca
 * `truncated` sin inventar totales.
 */
describe('applyDashboardLimit', () => {
  it('no trunca cuando hay menos elementos que el límite', () => {
    const { items, truncated } = applyDashboardLimit([1, 2, 3], 5);
    expect(items).toEqual([1, 2, 3]);
    expect(truncated).toBe(false);
  });

  it('no trunca cuando hay exactamente el límite', () => {
    const { items, truncated } = applyDashboardLimit([1, 2, 3], 3);
    expect(items).toEqual([1, 2, 3]);
    expect(truncated).toBe(false);
  });

  it('trunca cuando se recuperó más que el límite (limit + 1)', () => {
    const { items, truncated } = applyDashboardLimit([1, 2, 3, 4], 3);
    expect(items).toEqual([1, 2, 3]);
    expect(truncated).toBe(true);
  });

  it('devuelve como máximo `limit` elementos', () => {
    const fetched = Array.from({ length: 12 }, (_, i) => i);
    const { items, truncated } = applyDashboardLimit(fetched, 10);
    expect(items).toHaveLength(10);
    expect(truncated).toBe(true);
  });
});
