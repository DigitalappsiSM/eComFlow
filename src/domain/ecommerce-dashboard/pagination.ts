/**
 * Paginación completa sin truncamiento silencioso (§10).
 *
 * El dashboard debe recuperar TODAS las líneas Ecommerce relevantes, no las
 * primeras N. Este helper genérico y puro recorre las páginas hasta agotarlas
 * (cursor nulo), acumulando los elementos. Un `safetyMaxPages` evita bucles
 * infinitos ante un pager defectuoso, pero por defecto es muy alto para no
 * introducir un límite arbitrario como el anterior de 1,500 líneas.
 */

export interface Page<TItem, TCursor> {
  items: TItem[];
  /** Cursor de la siguiente página, o null cuando ya no hay más. */
  cursor: TCursor | null;
}

export async function fetchAllPages<TItem, TCursor>(
  fetchPage: (cursor: TCursor | null) => Promise<Page<TItem, TCursor>>,
  safetyMaxPages = 10_000,
): Promise<TItem[]> {
  const all: TItem[] = [];
  let cursor: TCursor | null = null;
  for (let i = 0; i < safetyMaxPages; i += 1) {
    const page: Page<TItem, TCursor> = await fetchPage(cursor);
    all.push(...page.items);
    if (page.cursor === null) return all;
    cursor = page.cursor;
  }
  throw new Error(
    `fetchAllPages superó ${safetyMaxPages} páginas sin agotar el cursor; posible bucle de paginación.`,
  );
}
