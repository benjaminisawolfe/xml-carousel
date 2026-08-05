import { describe, expect, it } from 'vitest';
import {
  buildSchemaOutlineListPresentation,
  SCHEMA_OUTLINE_FILTER_THRESHOLD,
  SCHEMA_OUTLINE_PAGE_SIZE,
  type SchemaOutlineListRow,
} from './schemaOutlineListPresentation';

function rows(count: number): SchemaOutlineListRow[] {
  return Array.from({ length: count }, (_, index) => ({
    nodeId: `node:${index}`,
    displayName: `Customer ${index}`,
    kindLabel: 'DTD element',
    sourceFilename: index % 2 === 0 ? 'one.dtd' : 'two.dtd',
  }));
}

describe('schema outline list presentation', () => {
  it('uses the required threshold and bounded page size', () => {
    expect(SCHEMA_OUTLINE_FILTER_THRESHOLD).toBe(50);
    expect(SCHEMA_OUTLINE_PAGE_SIZE).toBe(100);
    expect(
      buildSchemaOutlineListPresentation({
        rows: rows(49),
        label: 'elements',
        query: '',
      }).showFilter,
    ).toBe(false);
    const fifty = buildSchemaOutlineListPresentation({
      rows: rows(50),
      label: 'elements',
      query: '',
    });
    expect(fifty.showFilter).toBe(true);
    expect(fifty.visibleRows).toHaveLength(50);
  });

  it('pages 40,000 rows with truthful partial counts and status', () => {
    const fixture = rows(40_037);
    const first = buildSchemaOutlineListPresentation({
      rows: fixture,
      label: 'DTD elements',
      query: '',
    });
    expect(first.visibleRows).toHaveLength(100);
    expect(first.nextCount).toBe(100);
    expect(first.statusText).toBe('Showing 1–100 of 40037 DTD elements.');
    const last = buildSchemaOutlineListPresentation({
      rows: fixture,
      label: 'DTD elements',
      query: '',
      pageStart: 40_000,
    });
    expect(last.visibleRows).toHaveLength(37);
    expect(last.previousCount).toBe(100);
    expect(last.nextCount).toBe(0);
  });

  it('normalizes AND filters and reports a hidden current focus', () => {
    const fixture = rows(200);
    const filtered = buildSchemaOutlineListPresentation({
      rows: fixture,
      label: 'declarations',
      query: '  CUSTOMER   12  ',
      currentFocusNodeId: 'node:99',
    });
    expect(filtered.visibleRows.map(({ nodeId }) => nodeId)).toContain(
      'node:12',
    );
    expect(filtered.currentFocusHiddenByFilter).toBe(true);
    expect(filtered.statusText).toContain('matching declarations');
  });

  it('opens the page containing the current focus when page start is omitted', () => {
    const focused = buildSchemaOutlineListPresentation({
      rows: rows(400),
      label: 'elements',
      query: '',
      currentFocusNodeId: 'node:321',
    });
    expect(focused.pageStart).toBe(300);
    expect(
      focused.visibleRows.some(({ nodeId }) => nodeId === 'node:321'),
    ).toBe(true);
  });
});
