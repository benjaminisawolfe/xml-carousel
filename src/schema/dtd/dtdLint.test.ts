import { describe, expect, it } from 'vitest';
import { parseDtdDeclarations } from './dtdParser';
import { dtdLintDiagnosticCodes, lintDtdDeclarations } from './dtdLint';

function lint(source: string) {
  const parsed = parseDtdDeclarations(source, 'fixture.dtd');
  expect(parsed.diagnostics).toEqual([]);
  return lintDtdDeclarations(parsed.declarations, 'fixture.dtd');
}

describe('DTD visualization lint', () => {
  it('publishes stable diagnostic codes', () => {
    expect(dtdLintDiagnosticCodes).toEqual([
      'attlist-target-undeclared',
      'duplicate-attribute-declaration',
      'attlist-without-element-declarations',
    ]);
  });

  it('reports an undeclared target and the absence of all ELEMENT declarations', () => {
    const first = lint('<!ATTLIST book id ID #IMPLIED>');
    const second = lint('<!ATTLIST book id ID #IMPLIED>');

    expect(first).toEqual(second);
    expect(first.map(({ code }) => code)).toEqual([
      'attlist-target-undeclared',
      'attlist-without-element-declarations',
    ]);
    expect(
      first.every(
        ({ severity, source, category, range }) =>
          severity === 'warning' &&
          source === 'dtd-lint' &&
          category === 'dtd-lint' &&
          range?.start.line === 1,
      ),
    ).toBe(true);
  });

  it('reports every later duplicate while preserving the first range', () => {
    const diagnostics = lint(`<!ELEMENT book EMPTY>
<!ATTLIST book id ID #IMPLIED>
<!ATTLIST book id CDATA #IMPLIED id NMTOKEN #IMPLIED>`);

    expect(diagnostics.map(({ code }) => code)).toEqual([
      'duplicate-attribute-declaration',
      'duplicate-attribute-declaration',
    ]);
    expect(diagnostics[0]?.range?.start.line).toBe(3);
    expect(diagnostics[0]?.relatedRange?.start.line).toBe(2);
    expect(diagnostics[1]?.relatedRange).toEqual(diagnostics[0]?.relatedRange);
  });

  it('does not lint valid declarations or same names in independent sources', () => {
    expect(
      lint('<!ELEMENT book EMPTY>\n<!ATTLIST book id ID #IMPLIED>'),
    ).toEqual([]);
    expect(lint('<!ELEMENT root EMPTY>')).toEqual([]);
    expect(lint('<!ELEMENT root EMPTY>')).toEqual([]);
  });
});
