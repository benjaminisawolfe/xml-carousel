import { describe, expect, it } from 'vitest';
import type { SchemaSourceRange } from '../../schema/model';
import type {
  XsdAnnotationEntryMetadata,
  XsdAnnotationMetadata,
  XsdMetadataByNodeId,
  XsdNodeMetadata,
} from '../../schema/xsd';
import {
  formatExplicitXsdAnnotationValue,
  selectXsdAnnotationPresentation,
} from './xsdAnnotationPresentation';

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
    readonly source?: string;
    readonly rawXml?: string;
  } = {},
): XsdAnnotationEntryMetadata {
  return {
    kind: 'documentation',
    text,
    rawXml: options.rawXml ?? `<xs:documentation>${text}</xs:documentation>`,
    ...(options.xmlLang !== undefined
      ? {
          xmlLang: {
            value: options.xmlLang,
            lexicalValue: options.xmlLang,
            range: range(start + 1, start + 2),
          },
        }
      : {}),
    ...(options.source !== undefined
      ? {
          source: {
            value: options.source,
            lexicalValue: options.source,
            range: range(start + 2, start + 3),
          },
        }
      : {}),
    sourceRange: range(start, start + 10),
    startTagRange: range(start, start + 2),
    contentRange: range(start + 2, start + 8),
    sourceOrder: options.sourceOrder ?? start,
  };
}

function appInfo(
  start: number,
  text: string,
  options: {
    readonly sourceOrder?: number;
    readonly source?: string;
    readonly rawXml?: string;
  } = {},
): XsdAnnotationEntryMetadata {
  return {
    kind: 'appInfo',
    text,
    rawXml: options.rawXml ?? `<xs:appinfo>${text}</xs:appinfo>`,
    ...(options.source !== undefined
      ? {
          source: {
            value: options.source,
            lexicalValue: options.source,
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

describe('XSD annotation presentation', () => {
  it('returns empty arrays for absent or mismatched metadata', () => {
    expect(selectXsdAnnotationPresentation('missing')).toEqual({
      documentation: [],
      appInfo: [],
    });
    expect(
      selectXsdAnnotationPresentation('schema', {
        schema: { kind: 'schema' },
      } as unknown as XsdMetadataByNodeId),
    ).toEqual({
      documentation: [],
      appInfo: [],
    });
  });

  it('flattens multiple wrappers and separates interleaved entries in source order', () => {
    const presentation = selectXsdAnnotationPresentation(
      'schema',
      metadata([
        annotation(
          100,
          [
            appInfo(130, 'second appinfo', { sourceOrder: 2 }),
            documentation(120, 'second documentation', { sourceOrder: 1 }),
          ],
          2,
        ),
        annotation(
          10,
          [
            appInfo(30, 'first appinfo', { sourceOrder: 2 }),
            documentation(20, 'first documentation', { sourceOrder: 1 }),
          ],
          1,
        ),
      ]),
    );

    expect(
      presentation.documentation.map(({ displayText }) => displayText),
    ).toEqual(['first documentation', 'second documentation']);
    expect(presentation.appInfo.map(({ displayText }) => displayText)).toEqual([
      'first appinfo',
      'second appinfo',
    ]);
    expect(presentation.documentation.map(({ order }) => order)).toEqual([
      0, 1,
    ]);
    expect(presentation.appInfo.map(({ order }) => order)).toEqual([0, 1]);
  });

  it('derives deterministic source IDs and keeps duplicate text distinct', () => {
    const annotations = [
      annotation(0, [
        documentation(10, 'duplicate'),
        documentation(30, 'duplicate'),
      ]),
    ];
    const first = selectXsdAnnotationPresentation(
      'schema',
      metadata(annotations),
    );
    const second = selectXsdAnnotationPresentation(
      'schema',
      metadata(annotations),
    );

    expect(first.documentation.map(({ id }) => id)).toEqual([
      'documentation:annotations.xsd:10-20',
      'documentation:annotations.xsd:30-40',
    ]);
    expect(new Set(first.documentation.map(({ id }) => id)).size).toBe(2);
    expect(second).toEqual(first);
  });

  it('formats explicit empty values without confusing them with absence', () => {
    const presentation = selectXsdAnnotationPresentation(
      'schema',
      metadata([
        annotation(0, [
          documentation(10, 'with empty metadata', {
            xmlLang: '',
            source: '',
          }),
          documentation(30, 'without metadata'),
          appInfo(50, 'empty source', { source: '' }),
        ]),
      ]),
    );

    expect(formatExplicitXsdAnnotationValue('')).toEqual({
      value: '',
      displayValue: '(empty)',
    });
    expect(presentation.documentation[0]).toMatchObject({
      language: { value: '', displayValue: '(empty)' },
      source: { value: '', displayValue: '(empty)' },
    });
    expect(presentation.documentation[1]).not.toHaveProperty('language');
    expect(presentation.documentation[1]).not.toHaveProperty('source');
    expect(presentation.appInfo[0]?.source).toEqual({
      value: '',
      displayValue: '(empty)',
    });
  });

  it('retains empty documentation and appinfo with explicit messages', () => {
    const presentation = selectXsdAnnotationPresentation(
      'schema',
      metadata([annotation(0, [documentation(10, ''), appInfo(30, '')])]),
    );

    expect(presentation.documentation[0]).toMatchObject({
      text: '',
      displayText: 'No text content.',
      isEmpty: true,
    });
    expect(presentation.appInfo[0]).toMatchObject({
      text: '',
      displayText: 'No extracted text content.',
      isEmpty: true,
    });
  });

  it('keeps raw XML in normalized metadata without exposing per-entry UI data', () => {
    const documentationRaw =
      "<xs:documentation xml:lang='en'><m:em>text</m:em></xs:documentation>";
    const appInfoRaw = '<xs:appinfo><m:config enabled="true"/></xs:appinfo>';
    const metadataByNodeId = metadata([
      annotation(0, [
        documentation(10, 'text', { rawXml: documentationRaw }),
        appInfo(30, 'config', { rawXml: appInfoRaw }),
      ]),
    ]);
    const presentation = selectXsdAnnotationPresentation(
      'schema',
      metadataByNodeId,
    );

    expect(presentation.documentation[0]).not.toHaveProperty('rawXml');
    expect(presentation.appInfo[0]).not.toHaveProperty('rawXml');
    expect(
      metadataByNodeId.schema?.annotations?.[0]?.entries.map(
        (entry) => entry.rawXml,
      ),
    ).toEqual([documentationRaw, appInfoRaw]);
  });

  it('keeps all language variants in source order without preference', () => {
    const presentation = selectXsdAnnotationPresentation(
      'schema',
      metadata([
        annotation(0, [
          documentation(10, 'Français', { xmlLang: 'fr' }),
          documentation(30, 'English', { xmlLang: 'en' }),
          documentation(50, 'Unlabelled'),
        ]),
      ]),
    );

    expect(
      presentation.documentation.map(({ text, language }) => [
        text,
        language?.value,
      ]),
    ).toEqual([
      ['Français', 'fr'],
      ['English', 'en'],
      ['Unlabelled', undefined],
    ]);
  });

  it('keeps malicious-looking values as inert presentation strings', () => {
    const dangerousDocumentation = '<script>alert(1)</script>';
    const dangerousAppInfo = '<img src=x onerror=alert(1)>';
    const presentation = selectXsdAnnotationPresentation(
      'schema',
      metadata([
        annotation(0, [
          documentation(10, dangerousDocumentation),
          appInfo(30, dangerousAppInfo),
        ]),
      ]),
    );

    expect(presentation.documentation[0]?.displayText).toBe(
      dangerousDocumentation,
    );
    expect(presentation.appInfo[0]?.displayText).toBe(dangerousAppInfo);
  });

  it('does not mutate input metadata while sorting', () => {
    const input = metadata([
      annotation(100, [documentation(120, 'second')], 2),
      annotation(10, [documentation(20, 'first')], 1),
    ]);
    const snapshot = JSON.stringify(input);

    selectXsdAnnotationPresentation('schema', input);

    expect(JSON.stringify(input)).toBe(snapshot);
  });
});
