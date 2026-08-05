import { describe, expect, it } from 'vitest';
import type { SchemaSourceRange } from '../model';
import type {
  XsdAnnotationEntryMetadata,
  XsdAnnotationMetadata,
  XsdNodeMetadata,
} from './xsdProjectMetadata';
import { selectOrderedXsdAnnotationEntries } from './xsdAnnotationQueries';

function range(start: number, end: number): SchemaSourceRange {
  return {
    sourceId: 'fixture.xsd',
    start: { offset: start, line: 1, column: start + 1 },
    end: { offset: end, line: 1, column: end + 1 },
  };
}

function entry(
  kind: XsdAnnotationEntryMetadata['kind'],
  text: string,
  sourceOrder: number,
  offset: number,
): XsdAnnotationEntryMetadata {
  const shared = {
    text,
    rawXml: `<xs:${kind}>${text}</xs:${kind}>`,
    sourceRange: range(offset, offset + 5),
    startTagRange: range(offset, offset + 1),
    contentRange: range(offset + 1, offset + 4),
    sourceOrder,
  };
  return kind === 'documentation'
    ? { kind: 'documentation', ...shared }
    : { kind: 'appInfo', ...shared };
}

function annotation(
  entries: readonly XsdAnnotationEntryMetadata[],
  sourceOrder: number,
  offset: number,
): XsdAnnotationMetadata {
  return {
    entries,
    rawXml: '<xs:annotation />',
    sourceRange: range(offset, offset + 20),
    startTagRange: range(offset, offset + 1),
    sourceOrder,
  };
}

function metadata(
  annotations?: readonly XsdAnnotationMetadata[],
): XsdNodeMetadata {
  return {
    kind: 'schema',
    scope: 'schema',
    sourceFileId: 'fixture.xsd',
    sourceOrder: 0,
    sourceRange: range(0, 500),
    startTagRange: range(0, 1),
    ...(annotations ? { annotations } : {}),
  };
}

describe('ordered XSD annotation queries', () => {
  it('returns a fresh empty array for missing metadata or annotations', () => {
    const missing = selectOrderedXsdAnnotationEntries(undefined);
    const absent = selectOrderedXsdAnnotationEntries(metadata());

    expect(missing).toEqual([]);
    expect(absent).toEqual([]);
    expect(missing).not.toBe(absent);
  });

  it('orders wrappers by source order, offset, and stable input order', () => {
    const result = selectOrderedXsdAnnotationEntries(
      metadata([
        annotation([entry('documentation', 'offset second', 0, 61)], 1, 60),
        annotation([entry('documentation', 'order second', 0, 21)], 2, 20),
        annotation([entry('documentation', 'first tie', 0, 41)], 1, 40),
        annotation([entry('appInfo', 'second tie', 0, 42)], 1, 40),
      ]),
    );

    expect(result.map(({ entry: value }) => value.text)).toEqual([
      'first tie',
      'second tie',
      'offset second',
      'order second',
    ]);
    expect(result.map(({ annotationOrder }) => annotationOrder)).toEqual([
      1, 1, 1, 2,
    ]);
    expect(result.map(({ annotationOffset }) => annotationOffset)).toEqual([
      40, 40, 60, 20,
    ]);
  });

  it('orders entries by source order, offset, and stable input order', () => {
    const result = selectOrderedXsdAnnotationEntries(
      metadata([
        annotation(
          [
            entry('documentation', 'order second', 2, 11),
            entry('appInfo', 'first tie', 1, 31),
            entry('documentation', 'offset second', 1, 41),
            entry('documentation', 'second tie', 1, 31),
          ],
          0,
          0,
        ),
      ]),
    );

    expect(result.map(({ entry: value }) => value.text)).toEqual([
      'first tie',
      'second tie',
      'offset second',
      'order second',
    ]);
    expect(result.map(({ entryOrder }) => entryOrder)).toEqual([1, 1, 1, 2]);
    expect(result.map(({ entryOffset }) => entryOffset)).toEqual([
      31, 31, 41, 11,
    ]);
  });

  it('preserves duplicate Documentation and AppInfo entries', () => {
    const result = selectOrderedXsdAnnotationEntries(
      metadata([
        annotation(
          [
            entry('documentation', 'duplicate', 0, 10),
            entry('appInfo', 'duplicate', 1, 20),
            entry('documentation', 'duplicate', 2, 30),
          ],
          0,
          0,
        ),
      ]),
    );

    expect(result.map(({ entry: value }) => value.kind)).toEqual([
      'documentation',
      'appInfo',
      'documentation',
    ]);
    expect(result.map(({ stableIndex }) => stableIndex)).toEqual([0, 1, 2]);
  });

  it('is deterministic, non-mutating, and independently allocated', () => {
    const input = metadata([
      annotation([entry('documentation', 'second', 1, 20)], 1, 10),
      annotation([entry('documentation', 'first', 0, 40)], 0, 30),
    ]);
    const snapshot = JSON.stringify(input);
    const first = selectOrderedXsdAnnotationEntries(input);
    const second = selectOrderedXsdAnnotationEntries(input);

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first[0]).not.toBe(second[0]);
    expect(JSON.stringify(input)).toBe(snapshot);

    (first as Array<(typeof first)[number]>).reverse();
    expect(second.map(({ entry: value }) => value.text)).toEqual([
      'first',
      'second',
    ]);
  });
});
