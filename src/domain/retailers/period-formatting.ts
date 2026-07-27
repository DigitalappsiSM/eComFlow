/**
 * Helpers puros para presentar rangos y activaciones (multi-retailer, §13).
 *
 * - Detectan consecutividad de fechas.
 * - Comprimen a rango solo cuando las fechas son realmente consecutivas.
 * - Formatean rangos y listas de fechas en español, sin inventar continuidad.
 */

const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isIso(v: string): boolean {
  return ISO_RE.test((v ?? '').trim());
}

/** Fechas ISO únicas, ordenadas ascendentemente (descarta no-ISO). */
export function sortUniqueDates(dates: readonly string[]): string[] {
  return [...new Set(dates.filter(isIso))].sort();
}

function nextDay(iso: string): string {
  return new Date(new Date(`${iso}T00:00:00Z`).getTime() + DAY_MS).toISOString().slice(0, 10);
}

/** ¿Las fechas (una vez ordenadas y sin duplicar) son día a día consecutivas? */
export function areConsecutive(dates: readonly string[]): boolean {
  const s = sortUniqueDates(dates);
  if (s.length <= 1) return true;
  for (let i = 1; i < s.length; i += 1) {
    if (nextDay(s[i - 1]!) !== s[i]) return false;
  }
  return true;
}

/** Cuenta de activaciones (fechas únicas válidas). */
export function activationCount(dates: readonly string[]): number {
  return sortUniqueDates(dates).length;
}

/** Rango [start,end] si las fechas son consecutivas; null si no (o vacío). */
export function compressDateRange(dates: readonly string[]): { start: string; end: string } | null {
  const s = sortUniqueDates(dates);
  if (s.length === 0) return null;
  if (!areConsecutive(s)) return null;
  return { start: s[0]!, end: s[s.length - 1]! };
}

/** "15 ago 2026" (día). */
export function formatDay(iso: string, withYear = true): string {
  const m = ISO_RE.exec((iso ?? '').trim());
  if (!m) return iso ?? '';
  const day = Number(m[3]);
  const mon = MONTHS_SHORT[Number(m[2]) - 1] ?? '';
  return withYear ? `${day} ${mon} ${m[1]}` : `${day} ${mon}`;
}

/**
 * Formatea un rango [start,end]:
 *  - mismo día → "15 ago 2026"
 *  - mismo año → "15 ago–3 sep 2026"
 *  - distinto año → "28 dic 2025–3 ene 2026"
 */
export function formatDateRange(start: string, end: string): string {
  if (!isIso(start) && !isIso(end)) return '';
  if (!isIso(end) || start === end) return formatDay(start);
  if (!isIso(start)) return formatDay(end);
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  const sameMonth = sameYear && start.slice(0, 7) === end.slice(0, 7);
  if (sameMonth) {
    // "24–30 jul 2026": mes/año una sola vez.
    return `${Number(start.slice(8, 10))}–${formatDay(end)}`;
  }
  // "15 ago–3 sep 2026" (mismo año) / "28 dic 2025–3 ene 2026" (distinto año).
  return `${formatDay(start, !sameYear)}–${formatDay(end)}`;
}

/**
 * Consolida fechas en bloques CONTIGUOS y formatea cada bloque como rango.
 * A diferencia de `formatActivationDates`, no colapsa a "N fechas no
 * consecutivas": presenta cada tramo continuo como su propio rango.
 *  - []                              → ""
 *  - 15..31 ago                      → "15–31 ago 2026"
 *  - 15..31 ago + 1..13 sep          → "15 ago–13 sep 2026" (si son contiguas)
 *  - 15..20 ago + 25..28 ago (hueco) → "15–20 ago 2026 y 25–28 ago 2026"
 */
export function formatConsolidatedRanges(dates: readonly string[]): string {
  const s = sortUniqueDates(dates);
  if (s.length === 0) return '';
  const blocks: Array<{ start: string; end: string }> = [];
  let start = s[0]!;
  let prev = s[0]!;
  for (let i = 1; i < s.length; i += 1) {
    if (nextDay(prev) === s[i]) {
      prev = s[i]!;
      continue;
    }
    blocks.push({ start, end: prev });
    start = s[i]!;
    prev = s[i]!;
  }
  blocks.push({ start, end: prev });
  const parts = blocks.map((b) => formatDateRange(b.start, b.end));
  if (parts.length === 1) return parts[0]!;
  return `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`;
}

/**
 * Presenta una lista de fechas de activación (§13):
 *  - vacío → ""
 *  - consecutivas → rango comprimido ("15 ago–3 sep 2026")
 *  - no consecutivas, pocas (≤ maxList) → "15, 17 y 20 ago 2026"
 *  - no consecutivas, muchas → "N fechas no consecutivas (15 ago–3 sep 2026)"
 */
export function formatActivationDates(dates: readonly string[], maxList = 4): string {
  const s = sortUniqueDates(dates);
  if (s.length === 0) return '';
  if (s.length === 1) return formatDay(s[0]!);
  const range = compressDateRange(s);
  if (range) return formatDateRange(range.start, range.end);
  if (s.length <= maxList) {
    const sameYear = s.every((d) => d.slice(0, 4) === s[0]!.slice(0, 4));
    const sameMonth = sameYear && s.every((d) => d.slice(0, 7) === s[0]!.slice(0, 7));
    if (sameMonth) {
      // "15, 17 y 20 ago 2026": solo días, mes/año una vez al final.
      const days = s.map((d) => Number(d.slice(8, 10)));
      const mon = MONTHS_SHORT[Number(s[0]!.slice(5, 7)) - 1] ?? '';
      return `${days.slice(0, -1).join(', ')} y ${days[days.length - 1]} ${mon} ${s[0]!.slice(0, 4)}`;
    }
    if (sameYear) {
      // "15 ago, 17 sep y 20 oct 2026": día+mes en cada uno, año una vez al final.
      const dayMon = s.map((d) => formatDay(d, false));
      return `${dayMon.slice(0, -1).join(', ')} y ${dayMon[dayMon.length - 1]} ${s[0]!.slice(0, 4)}`;
    }
    const withYear = s.map((d) => formatDay(d, true));
    return `${withYear.slice(0, -1).join(', ')} y ${withYear[withYear.length - 1]}`;
  }
  return `${s.length} fechas no consecutivas (${formatDateRange(s[0]!, s[s.length - 1]!)})`;
}
