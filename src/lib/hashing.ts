/**
 * Hashing determinista (§6, §21, §25).
 *
 * - `stableHash` / `contentHash`: hash sincrónico y determinista (FNV-1a de
 *   64 bits en hex) para claves canónicas y `content_hash`. No requiere
 *   servidor ni APIs asíncronas y es estable entre ejecuciones.
 * - `fileHashSha256`: hash SHA-256 (Web Crypto) para `file_hash` de archivos
 *   importados y detección de doble importación.
 */

/** FNV-1a 64 bits → cadena hex de 16 caracteres. Determinista. */
export function stableHash(input: string): string {
  // Constantes FNV-1a 64-bit usando BigInt para evitar pérdida de precisión.
  const FNV_OFFSET = 0xcbf29ce484222325n;
  const FNV_PRIME = 0x100000001b3n;
  const MASK = 0xffffffffffffffffn;

  let hash = FNV_OFFSET;
  for (let i = 0; i < input.length; i++) {
    hash ^= BigInt(input.charCodeAt(i) & 0xff);
    // También mezclar el byte alto para caracteres multibyte.
    hash = (hash * FNV_PRIME) & MASK;
    hash ^= BigInt((input.charCodeAt(i) >> 8) & 0xff);
    hash = (hash * FNV_PRIME) & MASK;
  }
  return hash.toString(16).padStart(16, '0');
}

/**
 * `content_hash` (§21). Se calcula sobre los campos relevantes de contenido,
 * en orden fijo, con separador que no puede aparecer dentro de un valor
 * (usamos un carácter de control) para evitar colisiones por concatenación.
 */
export function contentHash(fields: readonly string[]): string {
  return stableHash(fields.join(''));
}

/** SHA-256 de un ArrayBuffer → hex. Para `file_hash` (§22, §25). */
export async function fileHashSha256(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
