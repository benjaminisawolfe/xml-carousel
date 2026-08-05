import { describe, expect, it } from 'vitest';
import type { SchemaSourceRange } from '../../schema/model';
import type {
  XsdAnnotationEntryMetadata,
  XsdAnnotationMetadata,
  XsdMetadataByNodeId,
  XsdNodeMetadata,
} from '../../schema/xsd';
import {
  buildXsdDocumentationCardExcerpt,
  selectXsdDocumentationCardPresentation,
  XSD_DOCUMENTATION_CARD_EXCERPT_LENGTH,
} from './xsdDocumentationCardPresentation';

function range(start: number, end: number): SchemaSourceRange {
  return {
    sourceId: 'annotations.xsd',
    start: { offset: start, line: 1, column: start + 1 },
    end: { offset: end, line: 1, column: end + 1 },
  };
}

function documentation(
  start: number,
  text: string,
  options: {
    readonly sourceOrder?: number;
    readonly xmlLang?: string;
  } = {},
): XsdAnnotationEntryMetadata {
  return {
    kind: 'documentation',
    text,
    rawXml: `<xs:documentation>${text}</xs:documentation>`,
    ...(options.xmlLang !== undefined
      ? {
          xmlLang: {
            value: options.xmlLang,
            lexicalValue: options.xmlLang,
            range: range(start + 1, start + 2),
          },
        }
      : {}),
    sourceRange: range(start, start + 10),
    startTagRange: range(start, start + 2),
    contentRange: range(start + 2, start + 8),
    sourceOrder: options.sourceOrder ?? start,
  };
}

function appInfo(start: number, text: string): XsdAnnotationEntryMetadata {
  return {
    kind: 'appInfo',
    text,
    rawXml: `<xs:appinfo>${text}</xs:appinfo>`,
    sourceRange: range(start, start + 10),
    startTagRange: range(start, start + 2),
    contentRange: range(start + 2, start + 8),
    sourceOrder: start,
  };
}

function annotation(
  start: number,
  entries: readonly XsdAnnotationEntryMetadata[],
  sourceOrder = start,
): XsdAnnotationMetadata {
  return {
    entries,
    rawXml: '<xs:annotation />',
    sourceRange: range(start, start + 50),
    startTagRange: range(start, start + 2),
    sourceOrder,
  };
}

function metadata(
  annotations: readonly XsdAnnotationMetadata[],
): XsdMetadataByNodeId {
  const nodeMetadata: XsdNodeMetadata = {
    kind: 'schema',
    scope: 'schema',
    sourceFileId: 'annotations.xsd',
    sourceOrder: 0,
    sourceRange: range(0, 500),
    startTagRange: range(0, 10),
    annotations,
  };
  return { schema: nodeMetadata };
}

describe('XSD documentation-card presentation', () => {
  it('returns undefined for absent metadata, absent annotations, and AppInfo-only metadata', () => {
    expect(selectXsdDocumentationCardPresentation('missing')).toBeUndefined();
    expect(
      selectXsdDocumentationCardPresentation('schema', metadata([])),
    ).toBeUndefined();
    expect(
      selectXsdDocumentationCardPresentation(
        'schema',
        metadata([annotation(0, [appInfo(10, 'technical metadata')])]),
      ),
    ).toBeUndefined();
  });

  it('omits empty-only documentation and skips earlier empty entries', () => {
    expect(
      selectXsdDocumentationCardPresentation(
        'schema',
        metadata([
          annotation(0, [documentation(10, ''), documentation(30, '')]),
        ]),
      ),
    ).toBeUndefined();

    expect(
      selectXsdDocumentationCardPresentation(
        'schema',
        metadata([
          annotation(0, [
            documentation(10, ''),
            documentation(30, 'first useful block'),
          ]),
        ]),
      ),
    ).toEqual({
      excerpt: 'first useful block',
      documentationCount: 1,
      additionalDocumentationCount: 0,
    });
  });

  it('reuses accepted source ordering across wrappers and counts non-empty duplicates separately', () => {
    const presentation = selectXsdDocumentationCardPresentation(
      'schema',
      metadata([
        annotation(100, [documentation(120, 'duplicate')], 2),
        annotation(
          10,
          [
            documentation(20, 'first in source order', { sourceOrder: 1 }),
            documentation(40, 'duplicate', { sourceOrder: 2 }),
            appInfo(60, 'not documentation'),
          ],
          1,
        ),
      ]),
    );

    expect(presentation).toEqual({
      excerpt: 'first in source order',
      documentationCount: 3,
      additionalDocumentationCount: 2,
    });
  });

  it('retains a selected non-empty language and omits absent or explicitly empty language', () => {
    expect(
      selectXsdDocumentationCardPresentation(
        'schema',
        metadata([
          annotation(0, [documentation(10, 'English', { xmlLang: 'en' })]),
        ]),
      ),
    ).toMatchObject({ language: 'en' });

    expect(
      selectXsdDocumentationCardPresentation(
        'schema',
        metadata([
          annotation(0, [
            documentation(10, 'Explicitly empty', { xmlLang: '' }),
          ]),
        ]),
      ),
    ).not.toHaveProperty('language');
    expect(
      selectXsdDocumentationCardPresentation(
        'schema',
        metadata([annotation(0, [documentation(10, 'Absent')])]),
      ),
    ).not.toHaveProperty('language');
  });

  it('uses forwarded owner metadata without inventing origin badges or language preference', () => {
    const presentation = selectXsdDocumentationCardPresentation(
      'schema',
      metadata([
        annotation(10, [documentation(20, 'Direct owner documentation.')], 1),
        annotation(
          100,
          [documentation(110, 'Forwarded complex-content documentation.')],
          2,
        ),
      ]),
    );

    expect(presentation).toEqual({
      excerpt: 'Direct owner documentation.',
      documentationCount: 2,
      additionalDocumentationCount: 1,
    });
  });

  it('keeps under-limit and exact-limit text unchanged', () => {
    expect(buildXsdDocumentationCardExcerpt('short text')).toBe('short text');
    const exact = 'x'.repeat(XSD_DOCUMENTATION_CARD_EXCERPT_LENGTH);
    expect(buildXsdDocumentationCardExcerpt(exact)).toBe(exact);
  });

  it('truncates at a practical word boundary and preserves punctuation', () => {
    expect(buildXsdDocumentationCardExcerpt('alpha, beta gamma', 13)).toBe(
      'alpha, beta…',
    );
  });

  it('falls back to the hard boundary and never exceeds the configured maximum', () => {
    expect(buildXsdDocumentationCardExcerpt('abcdefghij', 6)).toBe('abcde…');
    const excerpt = buildXsdDocumentationCardExcerpt(
      'word '.repeat(100),
      XSD_DOCUMENTATION_CARD_EXCERPT_LENGTH,
    );
    expect(excerpt.endsWith('…')).toBe(true);
    expect(excerpt.length).toBeLessThanOrEqual(
      XSD_DOCUMENTATION_CARD_EXCERPT_LENGTH,
    );
    expect(buildXsdDocumentationCardExcerpt('abc', 1)).toBe('…');
    expect(buildXsdDocumentationCardExcerpt('abc', 0)).toBe('');
  });

  it('keeps malicious-looking normalized text literal', () => {
    const text =
      '<script>alert(1)</script> <img src=x onerror=alert(1)> plain text';
    expect(buildXsdDocumentationCardExcerpt(text)).toBe(text);
    expect(
      selectXsdDocumentationCardPresentation(
        'schema',
        metadata([annotation(0, [documentation(10, text)])]),
      )?.excerpt,
    ).toBe(text);
  });

  it('is deterministic and does not mutate normalized metadata', () => {
    const metadataByNodeId = metadata([
      annotation(0, [
        documentation(10, 'first', { xmlLang: 'en' }),
        documentation(30, 'second'),
      ]),
    ]);
    const before = JSON.stringify(metadataByNodeId);
    const first = selectXsdDocumentationCardPresentation(
      'schema',
      metadataByNodeId,
    );
    const second = selectXsdDocumentationCardPresentation(
      'schema',
      metadataByNodeId,
    );

    expect(second).toEqual(first);
    expect(JSON.stringify(metadataByNodeId)).toBe(before);
  });
});
