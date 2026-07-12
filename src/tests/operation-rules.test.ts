import { describe, expect, it } from 'vitest';
import {
  initialChecksForImportedLine,
  requiredChecksForOperationType,
} from '@/domain/operation-rules';


describe('operation rules by operation type and continuity', () => {
  it('requires all checks for Ecommerce', () => {
    expect(requiredChecksForOperationType('ECOMMERCE')).toEqual([
      'correo_enviado',
      'artes',
      'validacion',
      'link',
      'kevel',
      'testigos_app',
      'testigos_web',
    ]);
  });

  it('requires only artes for Digital Signage', () => {
    expect(requiredChecksForOperationType('DIGITAL SIGNAGE')).toEqual(['artes']);
  });

  it('inherits Ecommerce continuous checks except testigos', () => {
    expect(
      initialChecksForImportedLine({
        tipoOperacion: 'ECOMMERCE',
        tipoCampanaPeriodo: 'continua',
      }),
    ).toMatchObject({
      correo_enviado: true,
      artes: true,
      validacion: true,
      link: true,
      kevel: true,
      testigos_app: false,
      testigos_web: false,
    });
  });

  it('does not inherit Digital Signage continuous checks', () => {
    expect(
      initialChecksForImportedLine({
        tipoOperacion: 'DIGITAL SIGNAGE',
        tipoCampanaPeriodo: 'continua',
      }).artes,
    ).toBe(false);
  });
});
