/** One reusable ranking for symbol search and ambiguity candidates. */
export interface Rankable {
  readonly name: string;
  readonly kind: string;
  readonly path: string;
  readonly owner?: string | null;
}

export interface RankQuery {
  readonly text?: string;
  readonly owner?: string;
}

export const isSpecPath = (path: string): boolean =>
  /\.(spec|test)\.[cm]?[jt]sx?$/.test(path);

const KIND_WEIGHT: Record<string, number> = {
  class: 20,
  interface: 20,
  function: 16,
  variable: 10,
  method: 8,
};

const nameScore = (name: string, text: string | undefined): number => {
  const q = (text ?? '').replace(/\s+/g, '');
  if (q === '') return 0;
  if (name === q) return 100;
  const n = name.toLowerCase();
  const l = q.toLowerCase();
  if (n === l) return 90;
  if (n.startsWith(l)) return 60;
  if (n.includes(l)) return 30;
  return 0;
};

const score = (item: Rankable, query: RankQuery): number => {
  const depth = Math.min(item.path.split('/').length - 1, 12);
  return (
    nameScore(item.name, query.text) +
    (KIND_WEIGHT[item.kind] ?? 0) +
    (query.owner !== undefined && item.owner === query.owner ? 40 : 0) +
    (isSpecPath(item.path) ? -50 : 0) +
    (query.owner === undefined && item.owner != null ? -4 : 0) -
    depth * 0.1
  );
};

/** Stable sort, highest score first. */
const sort = <T>(
  items: readonly T[],
  pick: (item: T) => Rankable,
  query: RankQuery,
): T[] =>
  items
    .map((item, i) => ({ item, i, s: score(pick(item), query) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.item);

export const Ranking = { score, sort };
