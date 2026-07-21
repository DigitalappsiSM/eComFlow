/**
 * Wrapper de parsing Kevel: usa el Web Worker cuando está disponible y cae al
 * hilo principal (p. ej. en pruebas, si el worker no carga, o si no responde a
 * tiempo) sin romper. El pipeline es el mismo puro.
 */
import { buildKevelPlan } from '@/domain/results/kevel-pipeline';
import type { KevelValidationResult } from '@/domain/results/kevel-validation';
import type { EcommercePeriod } from '@/types/results';

/**
 * Tope de espera del worker. El pipeline es O(n) y termina en <1s aún con
 * decenas de miles de filas, así que si en este tiempo no respondió es que el
 * worker no cargó/colgó: se procesa en el hilo principal como respaldo, en vez
 * de dejar la UI colgada indefinidamente.
 */
const WORKER_TIMEOUT_MS = 30_000;

export function parseKevelPlan(
  text: string,
  periods: EcommercePeriod[],
): Promise<KevelValidationResult> {
  if (typeof Worker === 'undefined') {
    return Promise.resolve(buildKevelPlan(text, periods));
  }
  return new Promise((resolve, reject) => {
    let worker: Worker | null = null;
    let settled = false;

    const fallbackToMainThread = () => {
      try {
        resolve(buildKevelPlan(text, periods));
      } catch (err) {
        reject(err instanceof Error ? err : new Error('Error al procesar el archivo.'));
      }
    };

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        worker?.terminate();
      } catch {
        /* noop */
      }
      fn();
    };

    const timer = setTimeout(() => finish(fallbackToMainThread), WORKER_TIMEOUT_MS);

    try {
      worker = new Worker(new URL('./kevel.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      // El navegador no pudo crear el worker (p. ej. no soporta módulos): respaldo.
      finish(fallbackToMainThread);
      return;
    }

    worker.onmessage = (event: MessageEvent<{ ok: boolean; plan?: KevelValidationResult; error?: string }>) => {
      const data = event.data;
      if (data.ok && data.plan) finish(() => resolve(data.plan!));
      else finish(() => reject(new Error(data.error ?? 'Error al procesar el archivo.')));
    };
    worker.onerror = () => {
      // El worker falló al cargar/ejecutar: respaldo al hilo principal.
      finish(fallbackToMainThread);
    };
    worker.postMessage({ text, periods });
  });
}
