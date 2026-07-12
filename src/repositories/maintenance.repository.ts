/**
 * Mantenimiento de datos — SOLO para pruebas iniciales.
 *
 * Borra físicamente las colecciones OPERATIVAS. Requiere que las reglas lo
 * permitan (admin + interruptor `dev_reset_enabled` encendido). NO toca users,
 * app_settings ni el catálogo de placements.
 */

import { collection, getDocs, limit, query, writeBatch } from 'firebase/firestore';
import { requireDb } from '@/lib/firebase';
import { COLLECTIONS } from '@/lib/collections';

/** Colecciones que se vacían en un reinicio de pruebas. */
export const RESETTABLE_COLLECTIONS: string[] = [
  COLLECTIONS.campaignOperations,
  COLLECTIONS.campaignLineRequirements,
  COLLECTIONS.campaignComments,
  COLLECTIONS.campaignLines,
  COLLECTIONS.campaignSpaces,
  COLLECTIONS.campaignGroups,
  COLLECTIONS.detectedChanges,
  COLLECTIONS.changeHistory,
  COLLECTIONS.importRows,
  COLLECTIONS.imports,
];

const BATCH = 300;

export interface WipeProgress {
  collection: string;
  deleted: number;
  totalDeleted: number;
}

/**
 * Borra en lotes todas las colecciones operativas. Devuelve el total borrado.
 * `onProgress` se invoca por lote para mostrar avance.
 */
export async function wipeOperationalData(
  onProgress?: (p: WipeProgress) => void,
): Promise<number> {
  const db = requireDb();
  let totalDeleted = 0;

  for (const coll of RESETTABLE_COLLECTIONS) {
    let collDeleted = 0;
    // Repetir hasta vaciar la colección.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const snap = await getDocs(query(collection(db, coll), limit(BATCH)));
      if (snap.empty) break;
      const batch = writeBatch(db);
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      collDeleted += snap.size;
      totalDeleted += snap.size;
      onProgress?.({ collection: coll, deleted: collDeleted, totalDeleted });
      if (snap.size < BATCH) break;
    }
  }

  return totalDeleted;
}
