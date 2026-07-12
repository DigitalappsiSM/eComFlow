import { useEffect, useState } from 'react';
import { fetchDetectedChanges } from '@/repositories/detected-changes.repository';

const MAX = 100;

// Cache a nivel de módulo: una sola consulta por sesión (el Sidebar se remonta
// en cada navegación). El valor real viene de Firestore (nunca simulado).
let cached: number | null = null;
let inflight: Promise<number> | null = null;

async function load(): Promise<number> {
  if (cached !== null) return cached;
  if (!inflight) {
    inflight = fetchDetectedChanges('pending', MAX)
      .then((changes) => {
        cached = changes.length;
        return cached;
      })
      .catch(() => {
        cached = 0;
        return 0;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/**
 * Nº de cambios detectados pendientes (para badges de navegación). Devuelve
 * `null` mientras carga o si el usuario no tiene permiso de lectura.
 */
export function usePendingChangesCount(enabled: boolean): number | null {
  const [count, setCount] = useState<number | null>(cached);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void load().then((n) => {
      if (active) setCount(n);
    });
    return () => {
      active = false;
    };
  }, [enabled]);

  return enabled ? count : null;
}
