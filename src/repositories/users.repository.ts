/** Repositorio de usuarios (§27). Lee el doc users/{uid}. */

import { doc, getDoc } from 'firebase/firestore';
import { requireDb } from '@/lib/firebase';
import { COLLECTIONS } from '@/lib/collections';
import type { AppUser } from '@/types/user';

export async function fetchUser(uid: string): Promise<AppUser | null> {
  const db = requireDb();
  const ref = doc(db, COLLECTIONS.users, uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return snap.data() as AppUser;
}
