/**
 * Lectura local de archivos (§16). El archivo se lee en memoria del navegador;
 * NUNCA se sube a Storage ni a un servidor, no se mueve ni se modifica.
 */

import { fileHashSha256 } from './hashing';

export interface LoadedFile {
  name: string;
  size: number;
  hash: string;
  buffer: ArrayBuffer;
}

/** Lee un `File` a ArrayBuffer y calcula su hash SHA-256 (§22, §25). */
export async function loadFile(file: File): Promise<LoadedFile> {
  const buffer = await file.arrayBuffer();
  const hash = await fileHashSha256(buffer);
  return { name: file.name, size: file.size, hash, buffer };
}

/** Valida extensión y tamaño según configuración (§47). */
export function validateFileMeta(
  file: File,
  allowedExtensions: readonly string[],
  maxSize: number,
): { ok: boolean; reason?: string } {
  const lower = file.name.toLowerCase();
  const okExt = allowedExtensions.some((ext) => lower.endsWith(ext.toLowerCase()));
  if (!okExt) {
    return {
      ok: false,
      reason: `Extensión no permitida. Permitidas: ${allowedExtensions.join(', ')}.`,
    };
  }
  if (file.size > maxSize) {
    return {
      ok: false,
      reason: `El archivo excede el tamaño máximo (${Math.round(maxSize / 1024 / 1024)} MB).`,
    };
  }
  return { ok: true };
}
