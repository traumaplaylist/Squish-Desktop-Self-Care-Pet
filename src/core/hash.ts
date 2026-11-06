/** Детерминированный хеш строки (FNV-1a) — для «бросков», которые не должны перебрасываться. */
export function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** true с вероятностью pct% — одинаково для одного и того же ключа. */
export function chance(key: string, pct: number): boolean {
  return hash32(key) % 100 < pct;
}

/** Элемент списка по ключу. */
export function pickBy<T>(list: readonly T[], key: string): T {
  return list[hash32(key) % list.length]!;
}

/** Элемент списка по rnd ∈ [0, 1). */
export function pickRnd<T>(list: readonly T[], rnd: number): T {
  return list[Math.min(list.length - 1, Math.floor(rnd * list.length))]!;
}
