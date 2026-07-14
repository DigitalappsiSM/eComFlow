/**
 * Catálogo de periodos ecommerce (compartido, §10). El módulo Resultados LEE
 * este catálogo; solo un admin puede sembrarlo. Nunca se modifica desde flujos
 * automáticos.
 */

import { collection, doc, getDocs, query, serverTimestamp, where, writeBatch } from 'firebase/firestore';
import { requireDb } from '@/lib/firebase';
import { COLLECTIONS } from '@/lib/collections';
import type { EcommercePeriod } from '@/types/results';

interface Actor {
  uid: string;
  email: string;
}

export async function fetchActivePeriods(): Promise<EcommercePeriod[]> {
  const db = requireDb();
  const snap = await getDocs(
    query(collection(db, COLLECTIONS.ecommercePeriods), where('active', '==', true)),
  );
  return snap.docs
    .map((d) => d.data() as EcommercePeriod)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
}

/** Siembra (o completa) el catálogo de periodos. Idempotente por period_id. */
export async function seedEcommercePeriods(
  periods: readonly EcommercePeriod[],
  actor: Actor,
): Promise<number> {
  const db = requireDb();
  let written = 0;
  for (let i = 0; i < periods.length; i += 400) {
    const batch = writeBatch(db);
    for (const p of periods.slice(i, i + 400)) {
      batch.set(
        doc(db, COLLECTIONS.ecommercePeriods, p.period_id),
        {
          ...p,
          created_at: serverTimestamp(),
          created_by: actor.uid,
          updated_at: serverTimestamp(),
          updated_by: actor.uid,
        },
        { merge: true },
      );
      written += 1;
    }
    await batch.commit();
  }
  return written;
}
