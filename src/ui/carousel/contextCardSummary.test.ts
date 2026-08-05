import { describe, expect, it } from 'vitest';
import {
  bookDtdNodeIds,
  bookDtdProject,
} from '../../schema/samples/bookDtdProject';
import {
  buildContextCardStructureSummary,
  CONTEXT_CARD_DESTINATION_LIMIT,
} from './contextCardSummary';

describe('context-card structure summary', () => {
  it('keeps the first three chapter destinations and reports two hidden', () => {
    const summary = buildContextCardStructureSummary(
      bookDtdProject,
      bookDtdNodeIds.chapter,
    );

    expect(CONTEXT_CARD_DESTINATION_LIMIT).toBe(3);
    expect(summary?.visibleText).toBe('title, epigraph?, section*');
    expect(
      summary?.visibleDestinations.map(
        ({ displayName, occurrence }) => `${displayName}${occurrence}`,
      ),
    ).toEqual(['title', 'epigraph?', 'section*']);
    expect(summary?.hiddenDestinationCount).toBe(2);
  });

  it('does not add structural detail to leaves or unknown nodes', () => {
    expect(
      buildContextCardStructureSummary(bookDtdProject, bookDtdNodeIds.title),
    ).toBeUndefined();
    expect(
      buildContextCardStructureSummary(bookDtdProject, 'missing'),
    ).toBeUndefined();
  });

  it('does not mutate the normalized project', () => {
    const before = JSON.stringify(bookDtdProject);

    buildContextCardStructureSummary(bookDtdProject, bookDtdNodeIds.chapter);

    expect(JSON.stringify(bookDtdProject)).toBe(before);
  });
});
