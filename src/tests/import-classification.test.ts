import { describe, expect, it } from 'vitest';
import {
  classifyRow,
  type ExistingLineRef,
  type ExistingState,
} from '@/domain/import-classification';

const priorLine: ExistingLineRef = {
  campaignLineKey: 'line-a',
  creatividadIdKey: '10025',
  contentHash: 'hash-a',
  isCurrent: true,
  active: true,
};

function state(overrides: Partial<ExistingState>): ExistingState {
  return {
    groupExists: true,
    spaceExists: true,
    otherLinesInSpace: [],
    ...overrides,
  };
}

describe('import-classification (§20, §21)', () => {
  it('new_campaign cuando la campaña no existe', () => {
    expect(
      classifyRow({ contentHash: 'h', existing: state({ groupExists: false }) }).result,
    ).toBe('new_campaign');
  });

  it('new_space cuando la campaña existe pero el espacio no', () => {
    expect(
      classifyRow({ contentHash: 'h', existing: state({ spaceExists: false }) }).result,
    ).toBe('new_space');
  });

  it('unchanged: misma clave + mismo content_hash', () => {
    const existing = state({
      matchingLine: { ...priorLine, contentHash: 'h' },
    });
    expect(classifyRow({ contentHash: 'h', existing }).result).toBe('unchanged');
  });

  it('updated_line: misma clave + content_hash diferente (p. ej. retirada)', () => {
    const existing = state({
      matchingLine: { ...priorLine, contentHash: 'old' },
    });
    expect(classifyRow({ contentHash: 'new', existing }).result).toBe('updated_line');
  });

  it('creativity_change + posible sustitución: nueva creatividad en espacio con línea vigente', () => {
    const existing = state({ otherLinesInSpace: [priorLine] });
    const c = classifyRow({ contentHash: 'h', existing });
    expect(c.result).toBe('creativity_change');
    expect(c.possibleReplacement).toBe(true);
  });

  it('new_line: espacio existe sin líneas vigentes', () => {
    const existing = state({ otherLinesInSpace: [] });
    expect(classifyRow({ contentHash: 'h', existing }).result).toBe('new_line');
  });
});
