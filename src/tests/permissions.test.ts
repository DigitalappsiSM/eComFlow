import { describe, it, expect } from 'vitest';
import { roleHasPermission } from '@/types/user';

/**
 * Matriz de permisos de importación (§27). Debe ser coherente con las reglas de
 * Firestore: solo admin/manager crean/confirman importaciones; el operator (KAM)
 * conserva la operación (checks, responsables, comentarios) pero NO importa.
 */
describe('matriz de permisos de importación', () => {
  it('admin puede imports e imports.write', () => {
    expect(roleHasPermission('admin', 'imports')).toBe(true);
    expect(roleHasPermission('admin', 'imports.write')).toBe(true);
  });

  it('manager puede imports e imports.write', () => {
    expect(roleHasPermission('manager', 'imports')).toBe(true);
    expect(roleHasPermission('manager', 'imports.write')).toBe(true);
  });

  it('operator NO puede imports ni imports.write', () => {
    expect(roleHasPermission('operator', 'imports')).toBe(false);
    expect(roleHasPermission('operator', 'imports.write')).toBe(false);
  });

  it('viewer NO puede imports ni imports.write', () => {
    expect(roleHasPermission('viewer', 'imports')).toBe(false);
    expect(roleHasPermission('viewer', 'imports.write')).toBe(false);
  });

  it('operator conserva operations y operations.write', () => {
    expect(roleHasPermission('operator', 'operations')).toBe(true);
    expect(roleHasPermission('operator', 'operations.write')).toBe(true);
  });
});
