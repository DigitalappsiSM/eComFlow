/** Campañas: listado y detalle jerárquico (§42). Solo lectura. */

import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { requireDb } from '@/lib/firebase';
import { COLLECTIONS } from '@/lib/collections';
import type { CampaignGroup, CampaignLine, CampaignSpace } from '@/types/campaign';

export async function fetchCampaignGroups(max = 100): Promise<CampaignGroup[]> {
  const db = requireDb();
  const q = query(
    collection(db, COLLECTIONS.campaignGroups),
    where('active', '==', true),
    orderBy('cliente_key'),
    limit(max),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as CampaignGroup);
}

/**
 * Carga las líneas actuales y activas de TODAS las campañas (sin agrupar por
 * campaña) para el generador de correo Ecommerce filtro-primero. El filtrado por
 * tipo de operación, cliente, periodo y fechas se hace en cliente (§54).
 */
export async function fetchActiveCampaignLines(max = 2000): Promise<CampaignLine[]> {
  const db = requireDb();
  const q = query(
    collection(db, COLLECTIONS.campaignLines),
    where('active', '==', true),
    where('is_current', '==', true),
    limit(max),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as CampaignLine);
}

export interface CampaignDetail {
  group: CampaignGroup;
  spaces: CampaignSpace[];
  linesBySpace: Map<string, CampaignLine[]>;
}

export async function fetchCampaignDetail(groupId: string): Promise<CampaignDetail | null> {
  const db = requireDb();
  const groupSnap = await getDoc(doc(db, COLLECTIONS.campaignGroups, groupId));
  if (!groupSnap.exists()) return null;

  const [spacesSnap, linesSnap] = await Promise.all([
    getDocs(query(collection(db, COLLECTIONS.campaignSpaces), where('campaign_group_id', '==', groupId))),
    getDocs(
      query(
        collection(db, COLLECTIONS.campaignLines),
        where('campaign_group_id', '==', groupId),
        where('is_current', '==', true),
      ),
    ),
  ]);

  const spaces = spacesSnap.docs.map((d) => d.data() as CampaignSpace);
  const linesBySpace = new Map<string, CampaignLine[]>();
  linesSnap.forEach((d) => {
    const line = d.data() as CampaignLine;
    const list = linesBySpace.get(line.campaign_space_id) ?? [];
    list.push(line);
    linesBySpace.set(line.campaign_space_id, list);
  });

  return { group: groupSnap.data() as CampaignGroup, spaces, linesBySpace };
}
