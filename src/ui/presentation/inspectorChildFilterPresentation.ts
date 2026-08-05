export const INSPECTOR_CHILD_FILTER_THRESHOLD = 10;
export const INSPECTOR_CHILD_PAGE_SIZE = 50;

export interface InspectorChildFilterPresentation<T extends object> {
  readonly query: string;
  readonly normalizedQuery: string;
  readonly totalCount: number;
  readonly matchCount: number;
  readonly visibleCount: number;
  readonly rows: readonly Readonly<T>[];
  readonly remainingCount: number;
  readonly hasMore: boolean;
  readonly status: string;
  readonly emptyMessage?: string;
}

export function normalizeInspectorChildQuery(query: string): string {
  return query
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/\s+/gu, ' ')
    .trim();
}

export function buildInspectorChildFilterPresentation<T extends object>(
  rows: readonly T[],
  query: string,
  visibleLimit: number,
  itemLabel: 'child structures' | 'declarations',
  searchableFields: (row: T) => readonly string[],
): InspectorChildFilterPresentation<T> {
  const normalizedQuery = normalizeInspectorChildQuery(query);
  const terms = normalizedQuery === '' ? [] : normalizedQuery.split(' ');
  const matches =
    terms.length === 0
      ? rows
      : rows.filter((row) => {
          const haystack = normalizeInspectorChildQuery(
            searchableFields(row).join(' '),
          );
          return terms.every((term) => haystack.includes(term));
        });
  const safeLimit = Number.isFinite(visibleLimit)
    ? Math.max(0, Math.floor(visibleLimit))
    : INSPECTOR_CHILD_PAGE_SIZE;
  const visibleRows = Object.freeze(
    matches
      .slice(0, safeLimit)
      .map((row) => Object.freeze({ ...row }) as Readonly<T>),
  );
  const visibleCount = visibleRows.length;
  const matchCount = matches.length;
  const remainingCount = Math.max(0, matchCount - visibleCount);
  const hasQuery = normalizedQuery !== '';
  const status = hasQuery
    ? `Showing ${visibleCount} of ${matchCount} matching ${itemLabel}.`
    : `Showing ${visibleCount} of ${rows.length} ${itemLabel}.`;
  const trimmedQuery = query.trim();

  return Object.freeze({
    query,
    normalizedQuery,
    totalCount: rows.length,
    matchCount,
    visibleCount,
    rows: visibleRows,
    remainingCount,
    hasMore: remainingCount > 0,
    status,
    ...(hasQuery && matchCount === 0
      ? { emptyMessage: `No ${itemLabel} match “${trimmedQuery}”.` }
      : {}),
  });
}
