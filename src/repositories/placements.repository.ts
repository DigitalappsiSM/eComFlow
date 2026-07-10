/** Repositorio del catálogo de placements (§14). Solo lectura en esta fase. */

import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { requireDb } from '@/lib/firebase';
import { COLLECTIONS } from '@/lib/collections';
import type { Placement } from '@/types/placement';

export async function fetchPlacements(): Promise<Placement[]> {
  const db = requireDb();
  const q = query(collection(db, COLLECTIONS.placements), orderBy('nombre'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as Placement);
}
