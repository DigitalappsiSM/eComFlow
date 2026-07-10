/** Configuración de la aplicación (§47). Lectura/escritura solo admin (reglas). */

import { collection, doc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { requireDb } from '@/lib/firebase';
import { COLLECTIONS } from '@/lib/collections';
import { DEFAULT_APP_SETTINGS, type AppSettings } from '@/types/operations';

const SETTINGS_DOC = 'global';

export async function fetchSettings(): Promise<AppSettings> {
  const db = requireDb();
  const snap = await getDoc(doc(db, COLLECTIONS.appSettings, SETTINGS_DOC));
  if (!snap.exists()) return { ...DEFAULT_APP_SETTINGS };
  return { ...DEFAULT_APP_SETTINGS, ...(snap.data() as Partial<AppSettings>) };
}

/** Guarda configuración y registra el cambio en historial (§47). */
export async function saveSettings(
  next: AppSettings,
  previous: AppSettings,
  actor: { uid: string; email: string },
): Promise<void> {
  const db = requireDb();
  const batch = writeBatch(db);

  batch.set(
    doc(db, COLLECTIONS.appSettings, SETTINGS_DOC),
    { ...next, updated_at: serverTimestamp(), updated_by: actor.uid },
    { merge: true },
  );

  const changeId = doc(collection(db, COLLECTIONS.changeHistory)).id;
  batch.set(doc(db, COLLECTIONS.changeHistory, changeId), {
    change_id: changeId,
    entity_type: 'app_settings',
    entity_id: SETTINGS_DOC,
    campaign_group_id: null,
    campaign_space_id: null,
    campaign_line_id: null,
    import_id: null,
    change_type: 'updated',
    field_name: null,
    previous_value: previous,
    new_value: next,
    origin: 'manual_operation',
    created_at: serverTimestamp(),
    created_by: actor.uid,
    created_by_email: actor.email,
  });

  await batch.commit();
}
