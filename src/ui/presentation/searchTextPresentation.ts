import { normalizeProjectSearchText } from '../../app/search';

export const SEARCH_RESULT_CONTEXT_LENGTH = 180;

export interface SearchTextRange {
  readonly start: number;
  readonly end: number;
}

export interface SearchTextSegment {
  readonly text: string;
  readonly highlighted: boolean;
}

export interface SearchTextExcerpt {
  readonly text: string;
  readonly segments: readonly SearchTextSegment[];
}

interface NormalizedSourceUnit {
  readonly value: string;
  readonly sourceStart: number;
  readonly sourceEnd: number;
}

interface SourceCluster {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

const combiningMark = /\p{M}/u;
const normalizedWhitespace = /\s/u;

function sourceClusters(text: string): readonly SourceCluster[] {
  const clusters: SourceCluster[] = [];
  let offset = 0;

  for (const point of text) {
    const start = offset;
    offset += point.length;
    const previous = clusters[clusters.length - 1];
    const joinsPrevious =
      previous !== undefined &&
      (combiningMark.test(point) ||
        point === '\u200d' ||
        point === '\ufe0f' ||
        previous.text.endsWith('\u200d'));

    if (joinsPrevious) {
      clusters[clusters.length - 1] = {
        text: `${previous.text}${point}`,
        start: previous.start,
        end: offset,
      };
    } else {
      clusters.push({ text: point, start, end: offset });
    }
  }

  return clusters;
}

function normalizedSourceUnits(text: string): readonly NormalizedSourceUnit[] {
  const units: NormalizedSourceUnit[] = [];

  for (const cluster of sourceClusters(text)) {
    const normalized = cluster.text.normalize('NFKC').toLowerCase();
    for (const point of normalized) {
      if (normalizedWhitespace.test(point)) {
        const previous = units[units.length - 1];
        if (previous?.value === ' ') {
          units[units.length - 1] = {
            value: ' ',
            sourceStart: previous.sourceStart,
            sourceEnd: cluster.end,
          };
        } else {
          units.push({
            value: ' ',
            sourceStart: cluster.start,
            sourceEnd: cluster.end,
          });
        }
      } else {
        units.push({
          value: point,
          sourceStart: cluster.start,
          sourceEnd: cluster.end,
        });
      }
    }
  }

  return units;
}

function normalizedQueryTerms(query: string): readonly string[][] {
  const normalized = normalizeProjectSearchText(query);
  return normalized.length === 0
    ? []
    : normalized.split(' ').map((term) => Array.from(term));
}

function includesAt(
  units: readonly NormalizedSourceUnit[],
  term: readonly string[],
  start: number,
): boolean {
  return term.every((point, offset) => units[start + offset]?.value === point);
}

function mergeRanges(ranges: readonly SearchTextRange[]): SearchTextRange[] {
  const ordered = [...ranges].sort(
    (left, right) => left.start - right.start || left.end - right.end,
  );
  const merged: SearchTextRange[] = [];

  for (const range of ordered) {
    const previous = merged[merged.length - 1];
    if (previous && range.start <= previous.end) {
      merged[merged.length - 1] = {
        start: previous.start,
        end: Math.max(previous.end, range.end),
      };
    } else {
      merged.push({ ...range });
    }
  }

  return merged;
}

export function projectSearchHighlightRanges(
  text: string,
  query: string,
): readonly SearchTextRange[] {
  const units = normalizedSourceUnits(text);
  const ranges: SearchTextRange[] = [];

  for (const term of normalizedQueryTerms(query)) {
    if (term.length === 0 || term.length > units.length) continue;
    for (let index = 0; index <= units.length - term.length;) {
      if (includesAt(units, term, index)) {
        ranges.push({
          start: units[index]!.sourceStart,
          end: units[index + term.length - 1]!.sourceEnd,
        });
        index += term.length;
      } else {
        index += 1;
      }
    }
  }

  return Object.freeze(
    mergeRanges(ranges).map((range) => Object.freeze(range)),
  );
}

export function buildSearchTextSegments(
  text: string,
  query: string,
): readonly SearchTextSegment[] {
  const ranges = projectSearchHighlightRanges(text, query);
  if (text.length === 0) return Object.freeze([]);
  if (ranges.length === 0) {
    return Object.freeze([Object.freeze({ text, highlighted: false })]);
  }

  const segments: SearchTextSegment[] = [];
  let offset = 0;
  for (const range of ranges) {
    if (range.start > offset) {
      segments.push({
        text: text.slice(offset, range.start),
        highlighted: false,
      });
    }
    segments.push({
      text: text.slice(range.start, range.end),
      highlighted: true,
    });
    offset = range.end;
  }
  if (offset < text.length) {
    segments.push({ text: text.slice(offset), highlighted: false });
  }

  return Object.freeze(segments.map((segment) => Object.freeze(segment)));
}

function codePointOffset(text: string, utf16Offset: number): number {
  return Array.from(text.slice(0, utf16Offset)).length;
}

function preferWordBoundaries(
  points: readonly string[],
  start: number,
  end: number,
  matchStart: number,
  matchEnd: number,
): readonly [number, number] {
  let preferredStart = start;
  if (start > 0) {
    for (
      let index = start;
      index < Math.min(matchStart, start + 24);
      index += 1
    ) {
      if (points[index] === ' ') {
        preferredStart = index + 1;
        break;
      }
    }
  }

  let preferredEnd = end;
  if (end < points.length) {
    for (
      let index = end - 1;
      index > Math.max(matchEnd, end - 24);
      index -= 1
    ) {
      if (points[index] === ' ') {
        preferredEnd = index;
        break;
      }
    }
  }

  return [preferredStart, preferredEnd];
}

function excerptWindow(
  text: string,
  query: string,
  maximumLength: number,
): readonly [number, number] {
  const points = Array.from(text);
  const ranges = projectSearchHighlightRanges(text, query);
  if (ranges.length === 0) {
    return [0, Math.max(0, maximumLength - 1)];
  }

  const matchStart = codePointOffset(text, ranges[0]!.start);
  const matchEnd = codePointOffset(text, ranges[0]!.end);
  const matchLength = matchEnd - matchStart;
  let contentLength = Math.max(1, maximumLength - 2);
  let start = Math.max(
    0,
    Math.min(
      matchStart - Math.floor((contentLength - matchLength) / 2),
      points.length - contentLength,
    ),
  );
  let end = Math.min(points.length, start + contentLength);

  for (let pass = 0; pass < 2; pass += 1) {
    const ellipsisCount = Number(start > 0) + Number(end < points.length);
    contentLength = Math.max(1, maximumLength - ellipsisCount);
    start = Math.max(
      0,
      Math.min(
        matchStart - Math.floor((contentLength - matchLength) / 2),
        points.length - contentLength,
      ),
    );
    end = Math.min(points.length, start + contentLength);
  }

  return preferWordBoundaries(points, start, end, matchStart, matchEnd);
}

export function collapseSearchDisplayWhitespace(text: string): string {
  return text.replace(/\s+/gu, ' ').trim();
}

export function buildSearchTextExcerpt(
  text: string,
  query: string,
  options: {
    readonly collapseWhitespace?: boolean;
    readonly maximumLength?: number;
  } = {},
): SearchTextExcerpt {
  const maximumLength = Math.max(
    1,
    Math.floor(options.maximumLength ?? SEARCH_RESULT_CONTEXT_LENGTH),
  );
  const displayText =
    options.collapseWhitespace === false
      ? text
      : collapseSearchDisplayWhitespace(text);
  const points = Array.from(displayText);

  if (points.length <= maximumLength) {
    return Object.freeze({
      text: displayText,
      segments: buildSearchTextSegments(displayText, query),
    });
  }

  const [start, end] = excerptWindow(displayText, query, maximumLength);
  const leading = start > 0 ? '…' : '';
  const trailing = end < points.length ? '…' : '';
  const excerpt = `${leading}${points.slice(start, end).join('')}${trailing}`;

  return Object.freeze({
    text: excerpt,
    segments: buildSearchTextSegments(excerpt, query),
  });
}
