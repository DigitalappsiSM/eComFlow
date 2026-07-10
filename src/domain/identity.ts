/**
 * Identidad canónica de campaña / espacio / línea (§6, §7, §8, §21).
 *
 * Jerarquía:
 *   Cliente → Campaña → Espacio operativo → Línea operativa → Piezas
 *
 * Claves canónicas (se construyen con las formas *_raw concatenadas con "|",
 * tal como muestran los ejemplos de la especificación):
 *
 *   campaign_group_key_raw = cliente_key | numero_campaña_key
 *   campaign_space_key_raw = group_key_raw | placement_id | fecha_fijacion_iso
 *                            | creatividad_titulo_key | creatividad_descripcion_key
 *   campaign_line_key_raw  = space_key_raw | creatividad_id_key
 *
 * Cada `*_key` es un hash determinista de su `*_raw` (§6).
 *
 * La fecha de retirada NO forma parte de ninguna identidad (§7, §10): un
 * cambio de retirada actualiza el mismo espacio/línea, no crea otra.
 */

import { contentHash, stableHash } from '@/lib/hashing';
import type { IsoDate } from '@/lib/dates';
import {
  normalizeIdKey,
  normalizeKey,
  normalizeSlugKey,
} from './normalization';

/** Entrada cruda de una fila, ya con el `placement_id` resuelto del catálogo. */
export interface IdentityInput {
  cliente: string;
  numeroCampana: string;
  /** placement_id resuelto contra el catálogo (coincidencia exacta / alias). */
  placementId: string;
  /** Fecha de fijación ya validada y en ISO (`YYYY-MM-DD`). */
  fechaFijacionIso: IsoDate;
  /** Fecha de retirada en ISO. NO forma parte de la identidad. */
  fechaRetiradaIso: IsoDate;
  creatividadTitulo: string;
  creatividadDescripcion: string;
  creatividadId: string;
  anunciante: string;
}

export interface CampaignIdentity {
  // Claves normalizadas de componentes.
  clienteKey: string;
  numeroCampanaKey: string;
  creatividadTituloKey: string;
  creatividadDescripcionKey: string;
  creatividadIdKey: string;
  anuncianteKey: string;

  // Formas canónicas raw.
  campaignGroupKeyRaw: string;
  campaignSpaceKeyRaw: string;
  campaignLineKeyRaw: string;

  // Hashes deterministas.
  campaignGroupKey: string;
  campaignSpaceKey: string;
  campaignLineKey: string;

  /** content_hash (§21): incluye retirada; detecta actualizaciones. */
  contentHash: string;
}

const SEP = '|';

export function buildIdentity(input: IdentityInput): CampaignIdentity {
  const clienteKey = normalizeKey(input.cliente);
  const numeroCampanaKey = normalizeIdKey(input.numeroCampana);
  const creatividadTituloKey = normalizeSlugKey(input.creatividadTitulo);
  const creatividadDescripcionKey = normalizeSlugKey(input.creatividadDescripcion);
  const creatividadIdKey = normalizeIdKey(input.creatividadId);
  const anuncianteKey = normalizeKey(input.anunciante);

  const campaignGroupKeyRaw = [clienteKey, numeroCampanaKey].join(SEP);

  const campaignSpaceKeyRaw = [
    campaignGroupKeyRaw,
    input.placementId,
    input.fechaFijacionIso,
    creatividadTituloKey,
    creatividadDescripcionKey,
  ].join(SEP);

  const campaignLineKeyRaw = [campaignSpaceKeyRaw, creatividadIdKey].join(SEP);

  // content_hash: campos de contenido canónicos, incluyendo la retirada
  // (que NO está en la identidad) para detectar su cambio como actualización.
  const contentHashValue = contentHash([
    clienteKey,
    numeroCampanaKey,
    input.placementId,
    anuncianteKey,
    input.fechaFijacionIso,
    input.fechaRetiradaIso,
    creatividadTituloKey,
    creatividadDescripcionKey,
    creatividadIdKey,
  ]);

  return {
    clienteKey,
    numeroCampanaKey,
    creatividadTituloKey,
    creatividadDescripcionKey,
    creatividadIdKey,
    anuncianteKey,
    campaignGroupKeyRaw,
    campaignSpaceKeyRaw,
    campaignLineKeyRaw,
    campaignGroupKey: stableHash(campaignGroupKeyRaw),
    campaignSpaceKey: stableHash(campaignSpaceKeyRaw),
    campaignLineKey: stableHash(campaignLineKeyRaw),
    contentHash: contentHashValue,
  };
}
