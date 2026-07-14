/// <reference lib="webworker" />
/**
 * Web Worker de parsing/validación Kevel (§26). Ejecuta el pipeline PURO fuera
 * del hilo principal para no bloquear la UI con archivos de decenas de miles de
 * filas. No accede a Firestore ni a la red.
 */
import { buildKevelPlan } from '@/domain/results/kevel-pipeline';
import type { EcommercePeriod } from '@/types/results';

interface RequestMessage {
  text: string;
  periods: EcommercePeriod[];
}

self.onmessage = (event: MessageEvent<RequestMessage>) => {
  try {
    const { text, periods } = event.data;
    const plan = buildKevelPlan(text, periods);
    (self as unknown as Worker).postMessage({ ok: true, plan });
  } catch (err) {
    (self as unknown as Worker).postMessage({
      ok: false,
      error: err instanceof Error ? err.message : 'Error al procesar el archivo.',
    });
  }
};
