import { normalizeProjectSearchText } from '../../app/search';

export const SCHEMA_OUTLINE_FILTER_THRESHOLD = 50;
export const SCHEMA_OUTLINE_PAGE_SIZE = 100;

export interface SchemaOutlineListRow {
  readonly nodeId: string;
  readonly displayName: string;
  readonly kindLabel: string;
  readonly sourceFilename?: string;
  readonly beginNewJourney?: boolean;
  readonly activationAction?: 'center' | 'inspect';
  readonly activationLabel?: string;
}

export interface SchemaOutlineListInput {
  readonly rows: readonly SchemaOutlineListRow[];
  readonly label: string;
  readonly query: string;
  readonly pageStart?: number;
  readonly pageSize?: number;
  readonly currentFocusNodeId?: string;
}

export interface SchemaOutlineListPresentation {
  readonly normalizedQuery: string;
  readonly totalCount: number;
  readonly matchCount: number;
  readonly pageStart: number;
  readonly pageEnd: number;
  readonly visibleRows: readonly SchemaOutlineListRow[];
  readonly previousCount: number;
  readonly nextCount: number;
  readonly statusText: string;
  readonly emptyText?: string;
  readonly showFilter: boolean;
  readonly currentFocusHiddenByFilter: boolean;
}

function matchesTerms(
  row: SchemaOutlineListRow,
  terms: readonly string[],
): boolean {
  const searchable = normalizeProjectSearchText(
    [row.displayName, row.kindLabel, row.sourceFilename ?? ''].join(' '),
  );
  return terms.every((term) => searchable.includes(term));
}

export function buildSchemaOutlineListPresentation(
  input: SchemaOutlineListInput,
): SchemaOutlineListPresentation {
  const normalizedQuery = normalizeProjectSearchText(input.query);
  const terms = normalizedQuery.length > 0 ? normalizedQuery.split(' ') : [];
  const matchedRows =
    terms.length === 0
      ? [...input.rows]
      : input.rows.filter((row) => matchesTerms(row, terms));
  const pageSize = Math.max(
    1,
    Math.floor(input.pageSize ?? SCHEMA_OUTLINE_PAGE_SIZE),
  );
  const currentMatchIndex = input.currentFocusNodeId
    ? matchedRows.findIndex(({ nodeId }) => nodeId === input.currentFocusNodeId)
    : -1;
  const requestedStart =
    input.pageStart === undefined && currentMatchIndex >= 0
      ? Math.floor(currentMatchIndex / pageSize) * pageSize
      : Math.max(0, Math.floor(input.pageStart ?? 0));
  const maximumStart =
    matchedRows.length === 0
      ? 0
      : Math.floor((matchedRows.length - 1) / pageSize) * pageSize;
  const pageStart = Math.min(requestedStart, maximumStart);
  const pageEnd = Math.min(pageStart + pageSize, matchedRows.length);
  const visibleRows = Object.freeze(matchedRows.slice(pageStart, pageEnd));
  const currentFocusHiddenByFilter =
    normalizedQuery.length > 0 &&
    input.currentFocusNodeId !== undefined &&
    input.rows.some(({ nodeId }) => nodeId === input.currentFocusNodeId) &&
    currentMatchIndex < 0;
  const rangeStart = matchedRows.length === 0 ? 0 : pageStart + 1;
  const matchQualifier = normalizedQuery.length > 0 ? ' matching' : '';
  const statusText =
    matchedRows.length === 0
      ? `No ${input.label} match “${input.query.trim()}”.`
      : `Showing ${rangeStart}–${pageEnd} of ${matchedRows.length}${matchQualifier} ${input.label}.`;

  return Object.freeze({
    normalizedQuery,
    totalCount: input.rows.length,
    matchCount: matchedRows.length,
    pageStart,
    pageEnd,
    visibleRows,
    previousCount: Math.min(pageSize, pageStart),
    nextCount: Math.min(pageSize, matchedRows.length - pageEnd),
    statusText,
    ...(matchedRows.length === 0 ? { emptyText: statusText } : {}),
    showFilter: input.rows.length >= SCHEMA_OUTLINE_FILTER_THRESHOLD,
    currentFocusHiddenByFilter,
  });
}
