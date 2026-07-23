/**
 * Memoización de cargas asíncronas por clave, con una única Promise por clave
 * en vuelo (dedup de lecturas). Un rechazo NO se cachea: la clave se elimina
 * antes de propagar el error para permitir reintentar.
 *
 * Se usa para cachear los lookups de Firestore durante una sesión de
 * preview/importación (grupos, espacios, líneas y líneas por espacio), evitando
 * repetir la misma lectura para claves deterministas repetidas.
 */
export function memoizeAsync<K, V>(loader: (key: K) => Promise<V>): (key: K) => Promise<V> {
  const cache = new Map<K, Promise<V>>();
  return (key: K): Promise<V> => {
    const cached = cache.get(key);
    if (cached) return cached;
    const promise = loader(key).catch((err) => {
      // No cachear errores: liberar la clave para permitir un reintento.
      cache.delete(key);
      throw err;
    });
    cache.set(key, promise);
    return promise;
  };
}
