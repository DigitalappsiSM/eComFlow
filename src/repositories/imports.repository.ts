/** Repositorio de importaciones (§22). Solo lectura en esta fase. */

import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { requireDb } from '@/lib/firebase';
import { COLLECTIONS } from '@/lib/collections';
import type { ImportRecord } from '@/types/import';

export async function fetchRecentImports(max = 10): Promise<ImportRecord[]> {
  const db = requireDb();
  const q = query(
    collection(db, COLLECTIONS.imports),
    orderBy('uploaded_at', 'desc'),
    limit(max),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as ImportRecord);
}
