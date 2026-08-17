import { describe, expect, it } from 'vitest';
import {
  assembleReconciliationPlan,
  computeMissing,
  decidePresenceAction,
  lineInScope,
  reconcilableOperationTypes,
  RECONCILABLE_OPERATION_TYPES,
  shouldApplyReconciliation,
  type ReconciliationCandidate,
  type ScopeCandidateLine,
  type ScopeFilter,
} from '@/domain/reconciliation';
import type { ImportCoveredPeriod, ImportScope } from '@/types/import';
import type { IdentityStrategy } from '@/domain/retailers/types';

const S33: ImportCoveredPeriod = { code: 'S33', type: 'semana', start: '2026-08-14', end: '2026-08-20' };
const S34: ImportCoveredPeriod = { code: 'S34', type: 'semana', start: '2026-08-21', end: '2026-08-27' };

function scopeFilter(
  periods: ImportCoveredPeriod[],
  chains: string[] = ['soriana'],
  tipos: string[] = ['ECOMMERCE'],
): ScopeFilter {
  const starts = periods.map((p) => p.start);
  const ends = periods.map((p) => p.end);
  return {
    coveredPeriods: periods,
    chainKeys: new Set(chains),
    operationTypes: new Set(tipos),
    windowStart: starts.length ? starts.reduce((a, b) => (b < a ? b : a)) : null,
    windowEnd: ends.length ? ends.reduce((a, b) => (b > a ? b : a)) : null,
  };
}

let seq = 0;
function candidate(overrides: Partial<ReconciliationCandidate> = {}): ReconciliationCandidate {
  seq += 1;
  return {
    campaignLineId: `line_${seq}`,
    campaignSpaceId: `space_${seq}`,
    campaignGroupId: `group_${seq}`,
    clienteOriginal: 'CLIENTE',
    numeroCampanaOriginal: '24802',
    placementName: 'SORIANA / CATEGORY BANNER',
    creatividadIdOriginal: '70001',
    periodoOriginal: 'S33 - 14/08/2026 a 20/08/2026',
    periodoInicio: '2026-08-14',
    periodoFin: '2026-08-20',
    cadena: 'SORIANA',
    tipoOperacion: 'ECOMMERCE',
    ...overrides,
  };
}

function line(overrides: Partial<ScopeCandidateLine> = {}): ScopeCandidateLine {
  const cand = overrides.candidate ?? candidate();
  const strategy: IdentityStrategy = overrides.identityStrategy ?? 'period_range';
  return {
    candidate: cand,
    identityStrategy: strategy,
    cadenaKey: 'soriana',
    tipoOperacion: 'ECOMMERCE',
    periodoCodigo: 'S33',
    periodoInicio: cand.periodoInicio,
    periodoFin: cand.periodoFin,
    activationStart: null,
    activationEnd: null,
    ...overrides,
  };
}

describe('membresía de alcance y ausencias (§5, §8, §16)', () => {
  it('7) una línea activa S33 ausente del Excel S33 aparece en missing', () => {
    const l = line();
    const filter = scopeFilter([S33]);
    expect(lineInScope(l, filter)).toBe(true);
    const missing = computeMissing([l], new Set());
    expect(missing).toHaveLength(1);
    expect(missing[0]!.campaignLineId).toBe(l.candidate.campaignLineId);
  });

  it('8) importar S34 no afecta una línea S33', () => {
    const l = line(); // periodo S33
    expect(lineInScope(l, scopeFilter([S34]))).toBe(false);
  });

  it('9) una línea de otra cadena no se marca ausente', () => {
    const l = line({ cadenaKey: 'chedraui' });
    expect(lineInScope(l, scopeFilter([S33], ['soriana']))).toBe(false);
  });

  it('10) una línea de otro tipo de operación no se marca ausente', () => {
    const l = line({ tipoOperacion: 'DIGITAL SIGNAGE' });
    expect(lineInScope(l, scopeFilter([S33], ['soriana'], ['ECOMMERCE']))).toBe(false);
  });

  it('11) una línea presente no aparece en missing', () => {
    const l = line();
    const missing = computeMissing([l], new Set([l.candidate.campaignLineId]));
    expect(missing).toHaveLength(0);
  });

  it('12) dos líneas de la misma campaña se comparan individualmente', () => {
    const a = line({ candidate: candidate({ campaignLineId: 'campA' }) });
    const b = line({ candidate: candidate({ campaignLineId: 'campB' }) });
    const missing = computeMissing([a, b], new Set(['campA']));
    expect(missing.map((m) => m.campaignLineId)).toEqual(['campB']);
  });

  it('periodo exacto: distinto fin no pertenece al alcance', () => {
    const l = line({ periodoFin: '2026-08-19' }); // fin distinto al de S33
    expect(lineInScope(l, scopeFilter([S33]))).toBe(false);
  });
});

describe('restauración (§6, §16)', () => {
  it('13) línea not_in_source que reaparece obtiene acción restore', () => {
    expect(decidePresenceAction({ active: false, inactiveReason: 'not_in_source' })).toBe('restore');
  });

  it('14) línea inactiva por otra razón no se restaura automáticamente', () => {
    expect(decidePresenceAction({ active: false, inactiveReason: 'cancelled_manual' })).toBeNull();
    expect(decidePresenceAction({ active: false, inactiveReason: null })).toBeNull();
  });

  it('15) la restauración reutiliza el MISMO id de línea', () => {
    const plan = assembleReconciliationPlan({
      detectedScope: {} as ImportScope,
      blockedReasons: [],
      incoming: new Set(['line_x']),
      restoreIds: ['line_x'],
      existingInScope: [],
    });
    expect(plan.restoreIds).toEqual(['line_x']);
  });

  it('16) una importación repetida (línea ya activa) no genera segunda restauración', () => {
    expect(decidePresenceAction({ active: true, inactiveReason: null })).toBe('touch');
  });
});

describe('retailers: period_range vs campaign_range (§5, §16)', () => {
  it('20) campaign_range sólo entra al alcance si su rango queda contenido en la ventana', () => {
    // Rango de activación DENTRO de la ventana → conciliable (contención total).
    const contained = line({
      identityStrategy: 'campaign_range',
      cadenaKey: 'la comer',
      candidate: candidate({ campaignLineId: 'lc_in', cadena: 'LA COMER' }),
      activationStart: '2026-08-15',
      activationEnd: '2026-08-19',
    });
    // Rango que se sale de la ventana → NO conciliable (se importa aditivamente).
    const notContained = line({
      identityStrategy: 'campaign_range',
      cadenaKey: 'la comer',
      candidate: candidate({ campaignLineId: 'lc_out', cadena: 'LA COMER' }),
      activationStart: '2026-08-10',
      activationEnd: '2026-08-27',
    });
    const filter = scopeFilter([S33], ['la comer']);
    expect(lineInScope(contained, filter)).toBe(true);
    expect(lineInScope(notContained, filter)).toBe(false);
    // El repositorio sólo entrega a computeMissing las líneas EN alcance; la no
    // contenida se descarta antes y nunca aparece en missing.
    const inScope = [contained, notContained].filter((l) => lineInScope(l, filter));
    const missing = computeMissing(inScope, new Set());
    expect(missing.map((m) => m.campaignLineId)).toEqual(['lc_in']);
    expect(missing.map((m) => m.campaignLineId)).not.toContain('lc_out');
  });

  it('21) un archivo mixto concilia period_range sin tocar campaign_range fuera de ventana', () => {
    const pr = line({ candidate: candidate({ campaignLineId: 'pr_soriana' }) });
    const crOut = line({
      identityStrategy: 'campaign_range',
      cadenaKey: 'la comer',
      candidate: candidate({ campaignLineId: 'cr_lacomer', cadena: 'LA COMER' }),
      activationStart: '2026-08-01',
      activationEnd: '2026-09-30',
    });
    const filter = scopeFilter([S33], ['soriana', 'la comer']);
    const inScope = [pr, crOut].filter((l) => lineInScope(l, filter));
    const missing = computeMissing(inScope, new Set());
    expect(missing.map((m) => m.campaignLineId)).toEqual(['pr_soriana']);
  });
});

describe('tipos conciliables (solo ECOMMERCE/DIGITAL SIGNAGE/TOMATURNOS)', () => {
  it('conserva sólo los tipos conciliables y descarta el resto', () => {
    const detected = ['ECOMMERCE', 'DIGITAL SIGNAGE', 'TOMATURNOS', 'GRAFICA', 'OTRO'];
    const kept = reconcilableOperationTypes(detected);
    expect([...kept].sort()).toEqual(['DIGITAL SIGNAGE', 'ECOMMERCE', 'TOMATURNOS']);
    expect(kept.has('GRAFICA')).toBe(false);
  });

  it('los tres tipos acordados son conciliables', () => {
    expect(RECONCILABLE_OPERATION_TYPES.has('ECOMMERCE')).toBe(true);
    expect(RECONCILABLE_OPERATION_TYPES.has('DIGITAL SIGNAGE')).toBe(true);
    expect(RECONCILABLE_OPERATION_TYPES.has('TOMATURNOS')).toBe(true);
    expect(RECONCILABLE_OPERATION_TYPES.has('GRAFICA')).toBe(false);
  });

  it('DIGITAL SIGNAGE en alcance sí puede marcarse ausente', () => {
    const l = line({ tipoOperacion: 'DIGITAL SIGNAGE' });
    const filter = scopeFilter([S33], ['soriana'], ['DIGITAL SIGNAGE']);
    expect(lineInScope(l, filter)).toBe(true);
  });
});

describe('compuerta de bajas y modo aditivo (§9, §16)', () => {
  it('22) additive nunca aplica bajas', () => {
    expect(shouldApplyReconciliation('additive', true)).toBe(false);
    expect(shouldApplyReconciliation('additive', false)).toBe(false);
  });

  it('23) authoritative bloqueado nunca aplica bajas', () => {
    expect(shouldApplyReconciliation('authoritative', false)).toBe(false);
    expect(shouldApplyReconciliation('authoritative', true)).toBe(true);
  });

  it('assemble marca eligible=false cuando hay motivos de bloqueo', () => {
    const plan = assembleReconciliationPlan({
      detectedScope: {} as ImportScope,
      blockedReasons: ['El archivo contiene filas rechazadas.'],
      incoming: new Set(),
      restoreIds: [],
      existingInScope: [line()],
    });
    expect(plan.eligible).toBe(false);
    expect(plan.existingInScope).toBe(1);
    // Aunque no sea elegible, missing se calcula de forma informativa.
    expect(plan.missing).toHaveLength(1);
  });
});
