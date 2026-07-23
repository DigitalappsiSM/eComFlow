import { describe, it, expect } from 'vitest';
import { memoizeAsync } from '@/lib/memoize';

/**
 * `memoizeAsync` es la base del caché de lookups de importación (grupos,
 * espacios, líneas, líneas por espacio): una sola lectura por clave repetida y
 * sin cachear errores. Cada escenario del importador se refleja aquí con una
 * clave distinta contando cuántas veces se ejecuta el loader.
 */
describe('memoizeAsync', () => {
  it('dos llamadas con la misma clave (groupKey) ejecutan el loader una sola vez', async () => {
    let reads = 0;
    const load = memoizeAsync<string, string>(async (k) => {
      reads += 1;
      return `group:${k}`;
    });
    const [a, b] = await Promise.all([load('G1'), load('G1')]);
    expect(a).toBe('group:G1');
    expect(b).toBe('group:G1');
    expect(reads).toBe(1);
    // Una tercera llamada posterior tampoco vuelve a leer.
    await load('G1');
    expect(reads).toBe(1);
  });

  it('claves distintas (spaceKey) leen una vez cada una', async () => {
    let reads = 0;
    const load = memoizeAsync<string, number>(async () => {
      reads += 1;
      return reads;
    });
    await Promise.all([load('S1'), load('S1'), load('S2'), load('S2')]);
    expect(reads).toBe(2);
  });

  it('misma lineKey → una sola lectura', async () => {
    let reads = 0;
    const load = memoizeAsync<string, string>(async (k) => {
      reads += 1;
      return k;
    });
    await load('L1');
    await load('L1');
    expect(reads).toBe(1);
  });

  it('mismo spaceId → una sola lectura aunque devuelva un arreglo', async () => {
    let reads = 0;
    const load = memoizeAsync<string, string[]>(async () => {
      reads += 1;
      return ['a', 'b'];
    });
    const first = await load('SP1');
    const second = await load('SP1');
    expect(second).toEqual(first);
    expect(reads).toBe(1);
  });

  it('un error NO queda cacheado: permite reintentar', async () => {
    let attempts = 0;
    const load = memoizeAsync<string, string>(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('lectura falló');
      return 'ok';
    });
    await expect(load('K')).rejects.toThrow('lectura falló');
    // La clave se liberó tras el error: el segundo intento vuelve a ejecutar.
    await expect(load('K')).resolves.toBe('ok');
    expect(attempts).toBe(2);
  });
});
