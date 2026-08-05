import { describe, expect, it } from 'vitest';
import { parseXsd } from './xsdParser';
import parserSource from './xsdParser.ts?raw';
import lexerSource from './xsdXmlLexer.ts?raw';
import xmlParserSource from './xsdXmlParser.ts?raw';
import basicStructure from '../../../tests/fixtures/xsd/basic-structure.xsd?raw';

function expectPlainSerializable(
  value: unknown,
  ancestors: Set<object> = new Set(),
): void {
  expect(typeof value).not.toBe('function');
  expect(typeof value).not.toBe('symbol');
  if (value === null || typeof value !== 'object') return;

  expect(value).not.toBeInstanceOf(Map);
  expect(value).not.toBeInstanceOf(Set);
  expect(value).not.toBeInstanceOf(File);
  expect(value).not.toBeInstanceOf(Node);
  expect(value).not.toBeInstanceOf(Document);
  expect(ancestors.has(value)).toBe(false);

  const prototype = Object.getPrototypeOf(value);
  expect(
    Array.isArray(value) ||
      prototype === Object.prototype ||
      prototype === null,
  ).toBe(true);

  const nextAncestors = new Set(ancestors);
  nextAncestors.add(value);
  for (const child of Object.values(value)) {
    expectPlainSerializable(child, nextAncestors);
  }
}

describe('XSD parser purity and bounded recovery', () => {
  it('returns deterministic plain JSON data without DOM or browser objects', () => {
    const first = parseXsd(basicStructure, 'plain.xsd');
    const second = parseXsd(basicStructure, 'plain.xsd');

    expectPlainSerializable(first);
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
    expect(second).toEqual(first);
  });

  it('has no framework, store, UI, browser parser, file picker, or network dependency', () => {
    const combined = [parserSource, lexerSource, xmlParserSource].join('\n');
    for (const prohibited of [
      'svelte',
      '/stores/',
      '/ui/',
      'DOMParser',
      'XMLSerializer',
      'XPath',
      'showOpenFilePicker',
      'FileReader',
      'fetch(',
      'XMLHttpRequest',
      'WebSocket',
    ]) {
      expect(combined).not.toContain(prohibited);
    }
  });

  it('does not mutate caller-owned data', () => {
    const caller = {
      source: basicStructure,
      metadata: { sourceId: 'caller.xsd' },
    };
    const before = JSON.stringify(caller);
    parseXsd(caller.source, caller.metadata.sourceId);
    expect(JSON.stringify(caller)).toBe(before);
  });

  it.each([
    '',
    '<',
    '<<<<<',
    '<root',
    '<root a=',
    '<root a="',
    '<root><',
    '<root></',
    '<root>&',
    '<root>&#x',
    '<!DOCTYPE',
    '<!--',
    '<![CDATA[',
    '<?xml',
    '<a:b:c/>',
    '<root xmlns:p=""><p:item/></root>',
  ])('never throws or loops for malformed input %#', (source) => {
    let result: ReturnType<typeof parseXsd> | undefined;
    expect(() => {
      result = parseXsd(source, 'malformed.xsd');
    }).not.toThrow();
    expect(result?.status).toBe('failure');
    expect(result?.diagnostics.length).toBeGreaterThan(0);
    expect((result?.diagnostics.length ?? 0) + source.length).toBeLessThan(100);
  });

  it('does not expose functions or retained full-source/parser fields', () => {
    const result = parseXsd(basicStructure);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('"sourceText"');
    expect(serialized).not.toContain('"positionAt"');
    expect(serialized).not.toContain('"parser"');
    expect(serialized).not.toContain('"file"');
  });
});
