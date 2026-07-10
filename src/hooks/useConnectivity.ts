import { useEffect, useState } from 'react';
import {
  isOnline,
  subscribeToConnectivity,
  type ConnectionStatus,
} from '@/lib/connectivity';

/** Estado de conexión global para el indicador del encabezado (§29, §35). */
export function useConnectivity(): ConnectionStatus {
  const [online, setOnline] = useState<boolean>(isOnline());

  useEffect(() => subscribeToConnectivity(setOnline), []);

  return online ? 'online' : 'offline';
}
