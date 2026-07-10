/** Repositorio de auditoría / actividad reciente (§24, §39). Solo lectura. */

import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { requireDb } from '@/lib/firebase';
import { COLLECTIONS } from '@/lib/collections';
import type { ChangeHistoryEntry } from '@/types/audit';

export async function fetchRecentActivity(max = 10): Promise<ChangeHistoryEntry[]> {
  const db = requireDb();
  const q = query(
    collection(db, COLLECTIONS.changeHistory),
    orderBy('created_at', 'desc'),
    limit(max),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as ChangeHistoryEntry);
}
