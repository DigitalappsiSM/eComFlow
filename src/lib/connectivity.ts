/**
 * Estado de conexión (§29, §48). Indicador global: En línea / Sin conexión /
 * Sincronizando / Error de sincronización.
 */

export type ConnectionStatus =
  | 'online'
  | 'offline'
  | 'syncing'
  | 'sync_error';

export const CONNECTION_LABELS: Record<ConnectionStatus, string> = {
  online: 'En línea',
  offline: 'Sin conexión',
  syncing: 'Sincronizando',
  sync_error: 'Error de sincronización',
};

/** Suscribe a cambios online/offline del navegador. Devuelve un desuscriptor. */
export function subscribeToConnectivity(
  callback: (isOnline: boolean) => void,
): () => void {
  const handleOnline = () => callback(true);
  const handleOffline = () => callback(false);
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}

export function isOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine;
}
