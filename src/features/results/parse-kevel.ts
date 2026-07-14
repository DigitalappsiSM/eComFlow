/**
 * Wrapper de parsing Kevel: usa el Web Worker cuando está disponible y cae al
 * hilo principal (p. ej. en pruebas) sin romper. El pipeline es el mismo puro.
 */
import { buildKevelPlan } from '@/domain/results/kevel-pipeline';
import type { KevelValidationResult } from '@/domain/results/kevel-validation';
import type { EcommercePeriod } from '@/types/results';

export function parseKevelPlan(
  text: string,
  periods: EcommercePeriod[],
): Promise<KevelValidationResult> {
  if (typeof Worker === 'undefined') {
    return Promise.resolve(buildKevelPlan(text, periods));
  }
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./kevel.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<{ ok: boolean; plan?: KevelValidationResult; error?: string }>) => {
      const data = event.data;
      worker.terminate();
      if (data.ok && data.plan) resolve(data.plan);
      else reject(new Error(data.error ?? 'Error al procesar el archivo.'));
    };
    worker.onerror = () => {
      worker.terminate();
      // Fallback al hilo principal si el worker falla.
      resolve(buildKevelPlan(text, periods));
    };
    worker.postMessage({ text, periods });
  });
}
