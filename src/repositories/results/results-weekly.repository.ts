/**
 * Lectura del consolidado semanal (§11, §15). El dashboard consulta
 * PRINCIPALMENTE `results_weekly` (no `results_daily`). Solo lectura.
 */

import { collection, getDocs, limit as fbLimit, query } from 'firebase/firestore';
import { requireDb } from '@/lib/firebase';
import { COLLECTIONS } from '@/lib/collections';
import type { WeeklyResult } from '@/domain/results/consolidation';

/** Documento semanal tal como se almacena (WeeklyResult + campos de auditoría). */
export type ResultsWeeklyDoc = WeeklyResult;

export async function fetchResultsWeekly(maxRows = 8000): Promise<ResultsWeeklyDoc[]> {
  const db = requireDb();
  const snap = await getDocs(query(collection(db, COLLECTIONS.resultsWeekly), fbLimit(maxRows)));
  return snap.docs.map((d) => d.data() as ResultsWeeklyDoc);
}
