/**
 * Normalización técnica (§5).
 *
 * La normalización técnica SOLO puede:
 *   - Eliminar espacios al inicio / final.
 *   - Colapsar múltiples espacios internos en uno.
 *   - Aplicar normalización Unicode.
 *   - Comparar sin distinguir mayúsculas / minúsculas.
 *
 * La normalización técnica NUNCA puede:
 *   - Corregir ortografía.
 *   - Sustituir / relacionar / abreviar palabras.
 *   - Agregar o eliminar información.
 *   - Interpretar que dos valores distintos son el mismo.
 *
 * Estas funciones producen SOLO claves técnicas (`*_key`). El valor original
 * (`*_original`) SIEMPRE se conserva por separado, sin transformar.
 */

/** Colapsa espacios (incluye tabs / saltos) a un único espacio y recorta. */
export function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** Elimina diacríticos vía descomposición Unicode (NFD) sin sustituir letras. */
function stripDiacritics(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Clave técnica base: normaliza Unicode, elimina diacríticos, colapsa
 * espacios y compara sin distinguir mayúsculas. Usada para `cliente_key`.
 *
 *   "  Soriana  " -> "soriana"
 *   "Panadería"   -> "panaderia"
 */
export function normalizeKey(value: string): string {
  return collapseWhitespace(stripDiacritics(value)).toLowerCase();
}

/**
 * Clave para identificadores textuales (número de campaña, Creatividad ID).
 * Conserva ceros a la izquierda y demás caracteres; solo recorta, colapsa
 * espacios internos y compara sin distinguir mayúsculas.
 *
 *   "000125" -> "000125"   (NO se convierte a "125")
 *   " 45872 " -> "45872"
 */
export function normalizeIdKey(value: string): string {
  return collapseWhitespace(value).toLowerCase();
}

/**
 * Clave tipo "slug": elimina diacríticos, pasa a minúsculas y reemplaza
 * cualquier secuencia no alfanumérica por `_`. Usada para títulos /
 * descripciones de creatividad y para identificadores de placement.
 *
 *   "Category Banner"             -> "category_banner"
 *   "Panadería"                   -> "panaderia"
 *   "Banner categoría panadería"  -> "banner_categoria_panaderia"
 */
export function normalizeSlugKey(value: string): string {
  return stripDiacritics(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Normalización para nombres de placement en el catálogo (búsqueda/alias). */
export function normalizePlacementName(value: string): string {
  return normalizeKey(value);
}
