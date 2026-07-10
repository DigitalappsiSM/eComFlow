/** Repositorio de usuarios (§27). Lee el doc users/{uid}. */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { requireDb } from '@/lib/firebase';
import { COLLECTIONS } from '@/lib/collections';
import type { AppUser, Role } from '@/types/user';

export async function fetchUser(uid: string): Promise<AppUser | null> {
  const db = requireDb();
  const ref = doc(db, COLLECTIONS.users, uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return snap.data() as AppUser;
}

/** Lista de usuarios (solo admin, según reglas). */
export async function fetchUsers(): Promise<AppUser[]> {
  const db = requireDb();
  const snap = await getDocs(query(collection(db, COLLECTIONS.users), orderBy('email')));
  return snap.docs.map((d) => d.data() as AppUser);
}

interface Actor {
  uid: string;
  email: string;
}

function userHistory(
  db: ReturnType<typeof requireDb>,
  uid: string,
  actor: Actor,
  field: string,
  previous: unknown,
  next: unknown,
) {
  const id = doc(collection(db, COLLECTIONS.changeHistory)).id;
  return {
    ref: doc(db, COLLECTIONS.changeHistory, id),
    data: {
      change_id: id,
      entity_type: 'user',
      entity_id: uid,
      campaign_group_id: null,
      campaign_space_id: null,
      campaign_line_id: null,
      import_id: null,
      change_type: 'updated',
      field_name: field,
      previous_value: previous,
      new_value: next,
      origin: 'manual_operation',
      created_at: serverTimestamp(),
      created_by: actor.uid,
      created_by_email: actor.email,
    },
  };
}

/** Activa/desactiva un usuario (solo admin) con auditoría (§27). */
export async function setUserActive(
  uid: string,
  active: boolean,
  previous: boolean,
  actor: Actor,
): Promise<void> {
  const db = requireDb();
  const batch = writeBatch(db);
  batch.update(doc(db, COLLECTIONS.users, uid), { active, updated_at: serverTimestamp() });
  const h = userHistory(db, uid, actor, 'active', previous, active);
  batch.set(h.ref, h.data);
  await batch.commit();
}

/**
 * Cambia el rol de un usuario (solo admin). Un usuario NO puede cambiar su
 * propio rol (§27) — validado también por reglas de Firestore.
 */
export async function setUserRole(
  uid: string,
  role: Role,
  previous: Role,
  actor: Actor,
): Promise<void> {
  if (uid === actor.uid) {
    throw new Error('No puede cambiar su propio rol.');
  }
  const db = requireDb();
  const batch = writeBatch(db);
  batch.update(doc(db, COLLECTIONS.users, uid), { role, updated_at: serverTimestamp() });
  const h = userHistory(db, uid, actor, 'role', previous, role);
  batch.set(h.ref, h.data);
  await batch.commit();
}
