import { describe, expect, it } from 'vitest';
import {
  buildInspectorChildFilterPresentation,
  INSPECTOR_CHILD_FILTER_THRESHOLD,
  INSPECTOR_CHILD_PAGE_SIZE,
  normalizeInspectorChildQuery,
} from './inspectorChildFilterPresentation';

interface Row {
  readonly id: number;
  readonly name: string;
  readonly kind: string;
  readonly relationship: string;
}

const fields = (row: Row): readonly string[] => [
  row.name,
  row.kind,
  row.relationship,
];

function rows(count: number): readonly Row[] {
  return Array.from({ length: count }, (_, id) => ({
    id,
    name: `Child ${id}`,
    kind: id % 2 === 0 ? 'Global Element' : 'Complex Type',
    relationship: id % 3 === 0 ? 'Recursive child' : 'Child',
  }));
}

describe('inspector child filter presentation', () => {
  it('exports the threshold and page size', () => {
    expect(INSPECTOR_CHILD_FILTER_THRESHOLD).toBe(10);
    expect(INSPECTOR_CHILD_PAGE_SIZE).toBe(50);
  });

  it('normalizes NFKC, case, and whitespace deterministically', () => {
    expect(normalizeInspectorChildQuery('  ＣＨＩＬＤ\t  １２  ')).toBe(
      'child 12',
    );
    expect(normalizeInspectorChildQuery('ÉLÉMENT')).toBe('élément');
  });

  it('uses AND terms across all searchable fields and preserves source order', () => {
    const result = buildInspectorChildFilterPresentation(
      rows(20),
      'complex recursive',
      50,
      'child structures',
      fields,
    );

    expect(result.rows.map(({ id }) => id)).toEqual([3, 9, 15]);
    expect(result.status).toBe('Showing 3 of 3 matching child structures.');
  });

  it.each([
    [49, 49, 0, false],
    [50, 50, 0, false],
    [51, 50, 1, true],
    [2000, 50, 1950, true],
  ])(
    'presents %s rows with bounded initial visibility',
    (count, visible, remaining, hasMore) => {
      const result = buildInspectorChildFilterPresentation(
        rows(count),
        '',
        50,
        'declarations',
        fields,
      );

      expect(result.visibleCount).toBe(visible);
      expect(result.remainingCount).toBe(remaining);
      expect(result.hasMore).toBe(hasMore);
      expect(result.status).toBe(
        `Showing ${visible} of ${count} declarations.`,
      );
    },
  );

  it('supports exact 50-row increments and final partial pages', () => {
    const source = rows(121);
    expect(
      buildInspectorChildFilterPresentation(
        source,
        '',
        100,
        'declarations',
        fields,
      ).remainingCount,
    ).toBe(21);
    expect(
      buildInspectorChildFilterPresentation(
        source,
        '',
        150,
        'declarations',
        fields,
      ).visibleCount,
    ).toBe(121);
  });

  it('uses exact empty-match grammar and never calls declarations nodes', () => {
    const result = buildInspectorChildFilterPresentation(
      rows(20),
      '  absent  ',
      50,
      'declarations',
      fields,
    );

    expect(result.status).toBe('Showing 0 of 0 matching declarations.');
    expect(result.emptyMessage).toBe('No declarations match “absent”.');
    expect(JSON.stringify(result)).not.toContain('nodes');
  });

  it('is frozen, serializable, repeatable, and does not mutate inputs', () => {
    const source = Object.freeze(rows(51).map((row) => Object.freeze(row)));
    const before = JSON.stringify(source);
    const first = buildInspectorChildFilterPresentation(
      source,
      'child',
      50,
      'child structures',
      fields,
    );
    const second = buildInspectorChildFilterPresentation(
      source,
      'child',
      50,
      'child structures',
      fields,
    );

    expect(first).toEqual(second);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.rows)).toBe(true);
    expect(first.rows.every(Object.isFrozen)).toBe(true);
    expect(() => JSON.stringify(first)).not.toThrow();
    expect(JSON.stringify(source)).toBe(before);
    expect(first.rows[0]).not.toBe(source[0]);
  });
});
