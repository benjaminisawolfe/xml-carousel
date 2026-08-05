import { describe, expect, it } from 'vitest';
import {
  clampSideWindowStart,
  computeSideWindow,
  DEFAULT_LEAFWARD_CARDS,
  formatBranchWindowRange,
  getBranchWindow,
  getLeafwardWindowSize,
  getLeafwardWindowSizeForStage,
  getMaximumEarlierPathRows,
  getMaximumLeafwardCards,
  getRootwardHistoryRowCountForStage,
  getRootwardWindow,
  MAX_EARLIER_PATH_ROWS,
  MAX_LEAFWARD_CARDS,
  MAX_OVERVIEW_EARLIER_PATH_ROWS,
  MAX_OVERVIEW_LEAFWARD_CARDS,
  MAX_ROOTWARD_CARDS,
  MIN_LEAFWARD_CARDS,
  renderedVerticalWindowFits,
  shiftSideWindow,
} from './carouselWindowing';

function visibleValues<T>(window: {
  readonly visible: readonly { readonly item: T }[];
}): readonly T[] {
  return window.visible.map(({ item }) => item);
}

describe('three-card side windows', () => {
  it.each([
    [[], []],
    [['one'], ['one']],
    [
      ['one', 'two'],
      ['one', 'two'],
    ],
    [
      ['one', 'two', 'three'],
      ['one', 'two', 'three'],
    ],
  ])('shows every item when the count is at most three', (items, expected) => {
    const result = computeSideWindow(items);

    expect(visibleValues(result)).toEqual(expected);
    expect(result.hiddenBeforeCount).toBe(0);
    expect(result.hiddenAfterCount).toBe(0);
  });

  it('limits four items to three and reports one below', () => {
    const result = computeSideWindow(['a', 'b', 'c', 'd']);

    expect(MIN_LEAFWARD_CARDS).toBe(1);
    expect(DEFAULT_LEAFWARD_CARDS).toBe(3);
    expect(MAX_LEAFWARD_CARDS).toBe(7);
    expect(visibleValues(result)).toEqual(['a', 'b', 'c']);
    expect(result.hiddenBeforeCount).toBe(0);
    expect(result.hiddenAfterCount).toBe(1);
  });

  it('moves a five-item contiguous window one position at a time', () => {
    const items = ['a', 'b', 'c', 'd', 'e'];
    const initial = getBranchWindow(items);
    const middle = shiftSideWindow(items, initial.startIndex, 1);
    const final = shiftSideWindow(items, middle.startIndex, 1);

    expect(visibleValues(initial)).toEqual(['a', 'b', 'c']);
    expect([initial.hiddenBeforeCount, initial.hiddenAfterCount]).toEqual([
      0, 2,
    ]);
    expect(visibleValues(middle)).toEqual(['b', 'c', 'd']);
    expect([middle.hiddenBeforeCount, middle.hiddenAfterCount]).toEqual([1, 1]);
    expect(visibleValues(final)).toEqual(['c', 'd', 'e']);
    expect([final.hiddenBeforeCount, final.hiddenAfterCount]).toEqual([2, 0]);
  });

  it('clamps shifts beyond both ends', () => {
    const items = ['a', 'b', 'c', 'd', 'e'];

    expect(visibleValues(shiftSideWindow(items, 0, -20))).toEqual([
      'a',
      'b',
      'c',
    ]);
    expect(visibleValues(shiftSideWindow(items, 0, 20))).toEqual([
      'c',
      'd',
      'e',
    ]);
    expect(clampSideWindowStart(items.length, 20)).toBe(2);
    expect(clampSideWindowStart(items.length, -20)).toBe(0);
  });

  it('keeps every position once without skips or duplicates', () => {
    const items = ['a', 'b', 'c', 'd', 'e'];
    const visited = new Set<string>();

    for (let startIndex = 0; startIndex <= 2; startIndex += 1) {
      for (const value of visibleValues(computeSideWindow(items, startIndex))) {
        visited.add(value);
      }
    }

    expect([...visited]).toEqual(items);
  });

  it('does not mutate items and preserves repeated IDs by position', () => {
    const items = Object.freeze(['a', 'b', 'a', 'c', 'a']);
    const before = [...items];
    const result = computeSideWindow(items, 2);

    expect(result.visible).toEqual([
      { item: 'a', itemIndex: 2 },
      { item: 'c', itemIndex: 3 },
      { item: 'a', itemIndex: 4 },
    ]);
    expect(items).toEqual(before);
  });

  it('clamps a stale start when the item count is reduced', () => {
    expect(visibleValues(computeSideWindow(['a', 'b'], 4))).toEqual(['a', 'b']);
    expect(computeSideWindow(['a', 'b'], 4).startIndex).toBe(0);
  });
});

describe('adaptive leafward windows', () => {
  it('uses rendered lane height plus focus-ring clearance as the final fit gate', () => {
    expect(renderedVerticalWindowFits(588, 600)).toBe(true);
    expect(renderedVerticalWindowFits(589, 600)).toBe(false);
    expect(renderedVerticalWindowFits(600, 600, 0)).toBe(true);
    expect(renderedVerticalWindowFits(601, 600, 0)).toBe(false);
    expect(renderedVerticalWindowFits(0, 600)).toBe(true);
    expect(renderedVerticalWindowFits(700, Number.NaN)).toBe(true);
  });

  it.each([
    [-100, 1],
    [0, 1],
    [319, 1],
    [320, 2],
    [519, 2],
    [520, 3],
    [719, 3],
    [720, 5],
    [899, 5],
    [900, 7],
    [1600, 7],
    [Number.NaN, 3],
    [Number.POSITIVE_INFINITY, 3],
    [Number.NEGATIVE_INFINITY, 3],
  ])('maps viewport height %s to %s cards', (height, expected) => {
    expect(getLeafwardWindowSize(height)).toBe(expected);
  });

  it('derives capacity from both rendered stage dimensions', () => {
    expect(getLeafwardWindowSizeForStage(1200, 920)).toBe(7);
    expect(getLeafwardWindowSizeForStage(680, 920)).toBe(5);
    expect(getLeafwardWindowSizeForStage(400, 920)).toBe(3);
    expect(getLeafwardWindowSizeForStage(1200, 700)).toBe(3);
    expect(getLeafwardWindowSizeForStage(1200, 300)).toBe(1);
    expect(getLeafwardWindowSizeForStage(Number.NaN, 700)).toBe(3);
  });

  it('raises but bounds Overview capacity without reducing Compact', () => {
    expect(MAX_OVERVIEW_LEAFWARD_CARDS).toBe(11);
    expect(getMaximumLeafwardCards('full')).toBe(7);
    expect(getMaximumLeafwardCards('compact')).toBe(7);
    expect(getMaximumLeafwardCards('overview')).toBe(11);
    expect(getLeafwardWindowSizeForStage(1200, 920, 'overview')).toBe(11);
    expect(getLeafwardWindowSizeForStage(1200, 700, 'overview')).toBe(7);
    expect(getLeafwardWindowSizeForStage(1200, 300, 'overview')).toBe(1);
    expect(
      getLeafwardWindowSizeForStage(1200, 700, 'overview'),
    ).toBeGreaterThanOrEqual(
      getLeafwardWindowSizeForStage(1200, 700, 'compact'),
    );
    expect(
      getBranchWindow(Array.from({ length: 20 }), 0, 99, 'overview').size,
    ).toBe(11);
  });

  it.each([1, 2, 3, 4, 5, 6, 7])(
    'accepts an explicit %s-card window',
    (size) => {
      const result = getBranchWindow(
        ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
        0,
        size,
      );
      expect(result.visible).toHaveLength(size);
      expect(result.size).toBe(size);
    },
  );

  it('bounds explicit sizes and clamps stale starts across growth and shrinkage', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

    expect(getBranchWindow(items, 0, 0).size).toBe(1);
    expect(getBranchWindow(items, 0, 99).size).toBe(7);
    expect(getBranchWindow(items, 5, 3).startIndex).toBe(5);
    expect(getBranchWindow(items, 5, 7).startIndex).toBe(1);
    expect(getBranchWindow(items.slice(0, 2), 5, 1).startIndex).toBe(1);
  });

  it('formats truthful one-based ranges with singular grammar and an en dash', () => {
    expect(formatBranchWindowRange(getBranchWindow([], 0, 3))).toBe('');
    expect(formatBranchWindowRange(getBranchWindow(['only'], 0, 3))).toBe(
      'Showing branch 1 of 1.',
    );
    expect(
      formatBranchWindowRange(
        getBranchWindow(
          Array.from({ length: 20 }, (_, index) => index),
          0,
          3,
        ),
      ),
    ).toBe('Showing branches 1–3 of 20.');
    expect(
      formatBranchWindowRange(
        getBranchWindow(
          Array.from({ length: 20 }, (_, index) => index),
          99,
          6,
        ),
      ),
    ).toBe('Showing branches 15–20 of 20.');
  });
});

describe('role-aware rootward windows', () => {
  it('uses presentation-aware earlier-history maximums', () => {
    expect(MAX_OVERVIEW_EARLIER_PATH_ROWS).toBe(5);
    expect(getMaximumEarlierPathRows('full')).toBe(2);
    expect(getMaximumEarlierPathRows('compact')).toBe(2);
    expect(getMaximumEarlierPathRows('overview')).toBe(5);
    expect(getRootwardHistoryRowCountForStage(900, 'overview')).toBe(5);
    expect(getRootwardHistoryRowCountForStage(550, 'overview')).toBe(3);
    expect(
      getRootwardWindow(
        ['previous', 'one', 'two', 'three', 'four', 'five', 'six'],
        0,
        8,
        99,
        'overview',
      ).earlierSteps,
    ).toHaveLength(5);
  });

  it('reduces earlier-path rows when rendered stage height contracts', () => {
    expect(getRootwardHistoryRowCountForStage(900)).toBe(2);
    expect(getRootwardHistoryRowCountForStage(519)).toBe(1);
    expect(getRootwardHistoryRowCountForStage(Number.NaN)).toBe(2);

    const compact = getRootwardWindow(['previous', 'near', 'oldest'], 0, 4, 1);
    expect(compact.earlierSteps).toEqual([
      { item: 'near', journeyPosition: 1 },
    ]);
    expect(compact.hiddenEarlierCount).toBe(1);
  });

  it.each([
    [[], undefined, []],
    [['a'], 'a', []],
    [['a', 'b'], 'a', ['b']],
    [['a', 'b', 'c'], 'a', ['b', 'c']],
    [['a', 'b', 'c', 'd'], 'a', ['b', 'c']],
    [['a', 'b', 'c', 'd', 'e'], 'a', ['b', 'c']],
    [['a', 'b', 'c', 'd', 'e', 'f'], 'a', ['b', 'c']],
  ])(
    'separates the previous step from zero through six rootward entries',
    (items, expectedPrevious, expectedEarlier) => {
      const result = getRootwardWindow(items);

      expect(result.previousStep?.item).toBe(expectedPrevious);
      expect(result.earlierSteps.map(({ item }) => item)).toEqual(
        expectedEarlier,
      );
      expect(
        result.earlierSteps.some(
          ({ item }) => item === result.previousStep?.item,
        ),
      ).toBe(false);
    },
  );

  it('pins the immediate previous step while windowing two earlier rows', () => {
    const nearestFirst = [
      'IdentifierType',
      'identifier',
      'sequence',
      'Anonymous complex type for root',
      'root',
    ];
    const initial = getRootwardWindow(nearestFirst, 0, 6);
    const oldest = getRootwardWindow(nearestFirst, 20, 6);

    expect(MAX_EARLIER_PATH_ROWS).toBe(2);
    expect(MAX_ROOTWARD_CARDS).toBe(3);
    expect(initial).toEqual({
      previousStep: { item: 'IdentifierType', journeyPosition: 4 },
      earlierSteps: [
        { item: 'identifier', journeyPosition: 3 },
        { item: 'sequence', journeyPosition: 2 },
      ],
      historyStartIndex: 0,
      hiddenCloserCount: 0,
      hiddenEarlierCount: 2,
    });
    expect(oldest).toEqual({
      previousStep: { item: 'IdentifierType', journeyPosition: 4 },
      earlierSteps: [
        {
          item: 'Anonymous complex type for root',
          journeyPosition: 1,
        },
        { item: 'root', journeyPosition: 0 },
      ],
      historyStartIndex: 2,
      hiddenCloserCount: 2,
      hiddenEarlierCount: 0,
    });
  });

  it('clamps shifts and preserves exact explicit journey positions', () => {
    const nearestFirst = ['previous', 'near', 'middle', 'oldest'];

    expect(getRootwardWindow(nearestFirst, -20, 9)).toMatchObject({
      previousStep: { item: 'previous', journeyPosition: 7 },
      earlierSteps: [
        { item: 'near', journeyPosition: 6 },
        { item: 'middle', journeyPosition: 5 },
      ],
      historyStartIndex: 0,
    });
    expect(getRootwardWindow(nearestFirst, 20, 9)).toMatchObject({
      previousStep: { item: 'previous', journeyPosition: 7 },
      earlierSteps: [
        { item: 'middle', journeyPosition: 5 },
        { item: 'oldest', journeyPosition: 4 },
      ],
      historyStartIndex: 1,
    });
  });

  it('is deterministic, positional for repeated values, and nonmutating', () => {
    const nearestFirst = Object.freeze(['a', 'b', 'a', 'c']);
    const before = [...nearestFirst];
    const first = getRootwardWindow(nearestFirst, 1);
    const second = getRootwardWindow(nearestFirst, 1);

    expect(first).toEqual(second);
    expect(first).toEqual({
      previousStep: { item: 'a', journeyPosition: 3 },
      earlierSteps: [
        { item: 'a', journeyPosition: 1 },
        { item: 'c', journeyPosition: 0 },
      ],
      historyStartIndex: 1,
      hiddenCloserCount: 1,
      hiddenEarlierCount: 0,
    });
    expect(nearestFirst).toEqual(before);
  });
});
