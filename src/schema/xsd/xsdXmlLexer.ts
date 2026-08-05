import type { SchemaSourceRange } from '../model/SchemaSourceMarkup';
import { createXsdDiagnostic, type XsdDiagnostic } from './xsdDiagnostics';
import {
  createXsdSourceMap,
  type XsdSourceMap,
  type XsdXmlQuoteKind,
} from './xsdXmlAst';

export type XsdXmlTokenKind =
  | 'xmlDeclaration'
  | 'processingInstruction'
  | 'comment'
  | 'cdata'
  | 'unsupportedDeclaration'
  | 'startTagOpen'
  | 'endTagOpen'
  | 'tagClose'
  | 'emptyTagClose'
  | 'name'
  | 'equals'
  | 'attributeValue'
  | 'unquotedAttributeValue'
  | 'text';

export interface XsdXmlToken {
  readonly kind: XsdXmlTokenKind;
  readonly raw: string;
  readonly range: SchemaSourceRange;
  readonly value?: string;
  readonly target?: string;
  readonly data?: string;
  readonly quote?: XsdXmlQuoteKind;
  readonly contentRange?: SchemaSourceRange;
}

export interface XsdXmlLexResult {
  readonly tokens: readonly XsdXmlToken[];
  readonly diagnostics: readonly XsdDiagnostic[];
}

const nameStartPattern = /^[:_\p{L}\p{Nl}]$/u;
const nameContinuePattern = /^[-.:\u00b7_\p{L}\p{Nl}\p{M}\p{Nd}]$/u;

function codePointCharacter(sourceText: string, offset: number): string {
  const codePoint = sourceText.codePointAt(offset);
  return codePoint === undefined ? '' : String.fromCodePoint(codePoint);
}

function characterWidth(character: string): number {
  return character.length;
}

export function isXmlNameStartCharacter(character: string): boolean {
  return nameStartPattern.test(character);
}

export function isXmlNameCharacter(character: string): boolean {
  return nameContinuePattern.test(character);
}

export function isValidXmlName(name: string): boolean {
  if (name.length === 0) return false;
  let offset = 0;
  let character = codePointCharacter(name, offset);
  if (!isXmlNameStartCharacter(character)) return false;
  offset += characterWidth(character);
  while (offset < name.length) {
    character = codePointCharacter(name, offset);
    if (!isXmlNameCharacter(character)) return false;
    offset += characterWidth(character);
  }
  return true;
}

export interface ParsedXmlQualifiedName {
  readonly qualifiedName: string;
  readonly prefix?: string;
  readonly localName: string;
}

export function parseXmlQualifiedName(
  qualifiedName: string,
): ParsedXmlQualifiedName | undefined {
  const parts = qualifiedName.split(':');
  if (
    parts.length > 2 ||
    parts.some((part) => part.length === 0 || !isValidXmlName(part))
  ) {
    return undefined;
  }
  return parts.length === 2
    ? {
        qualifiedName,
        prefix: parts[0]!,
        localName: parts[1]!,
      }
    : { qualifiedName, localName: qualifiedName };
}

function isWhitespace(character: string | undefined): boolean {
  return (
    character === ' ' ||
    character === '\t' ||
    character === '\r' ||
    character === '\n'
  );
}

function validXmlScalar(codePoint: number): boolean {
  return (
    Number.isInteger(codePoint) &&
    codePoint > 0 &&
    codePoint <= 0x10ffff &&
    !(codePoint >= 0xd800 && codePoint <= 0xdfff)
  );
}

function decodeReferences(
  raw: string,
  contentOffset: number,
  sourceMap: XsdSourceMap,
  diagnostics: XsdDiagnostic[],
): string {
  let decoded = '';
  let offset = 0;

  while (offset < raw.length) {
    const ampersand = raw.indexOf('&', offset);
    if (ampersand < 0) {
      decoded += raw.slice(offset);
      break;
    }
    decoded += raw.slice(offset, ampersand);

    let end = ampersand + 1;
    while (
      end < raw.length &&
      raw[end] !== ';' &&
      raw[end] !== '&' &&
      raw[end] !== '<' &&
      raw[end] !== '"' &&
      raw[end] !== "'" &&
      !isWhitespace(raw[end])
    ) {
      end += 1;
    }

    if (raw[end] !== ';') {
      const referenceEnd = Math.max(end, ampersand + 1);
      diagnostics.push(
        createXsdDiagnostic(
          'xml',
          'unterminated-entity-reference',
          'error',
          'Entity or character reference is missing its semicolon',
          sourceMap.range(
            contentOffset + ampersand,
            contentOffset + referenceEnd,
          ),
        ),
      );
      decoded += raw.slice(ampersand, referenceEnd);
      offset = referenceEnd;
      continue;
    }

    const body = raw.slice(ampersand + 1, end);
    const fullReference = raw.slice(ampersand, end + 1);
    const predefined: Readonly<Record<string, string>> = {
      amp: '&',
      apos: "'",
      gt: '>',
      lt: '<',
      quot: '"',
    };
    const predefinedValue = predefined[body];
    if (predefinedValue !== undefined) {
      decoded += predefinedValue;
    } else if (body.startsWith('#')) {
      const hexadecimal = body[1] === 'x' || body[1] === 'X';
      const digits = body.slice(hexadecimal ? 2 : 1);
      const validDigits =
        digits.length > 0 &&
        (hexadecimal ? /^[0-9a-fA-F]+$/.test(digits) : /^[0-9]+$/.test(digits));
      const codePoint = validDigits
        ? Number.parseInt(digits, hexadecimal ? 16 : 10)
        : Number.NaN;
      if (!validDigits || !validXmlScalar(codePoint)) {
        diagnostics.push(
          createXsdDiagnostic(
            'xml',
            'invalid-entity-reference',
            'error',
            `Invalid numeric character reference ${fullReference}`,
            sourceMap.range(contentOffset + ampersand, contentOffset + end + 1),
          ),
        );
        decoded += fullReference;
      } else {
        decoded += String.fromCodePoint(codePoint);
      }
    } else {
      diagnostics.push(
        createXsdDiagnostic(
          'xml',
          'unknown-entity-reference',
          'error',
          `Unknown named entity reference ${fullReference}`,
          sourceMap.range(contentOffset + ampersand, contentOffset + end + 1),
        ),
      );
      decoded += fullReference;
    }
    offset = end + 1;
  }

  return decoded;
}

function processingInstructionParts(
  raw: string,
  openingLength: number,
  terminated: boolean,
): { readonly target: string; readonly data: string } {
  const contentEnd = raw.length - (terminated ? 2 : 0);
  const content = raw.slice(openingLength, contentEnd);
  let boundary = 0;
  while (boundary < content.length && !isWhitespace(content[boundary])) {
    boundary += 1;
  }
  return {
    target: content.slice(0, boundary),
    data: content.slice(boundary).trim(),
  };
}

function scanUnsupportedDeclarationEnd(
  sourceText: string,
  startOffset: number,
): number {
  let offset = startOffset + 2;
  let quote: string | undefined;
  let bracketDepth = 0;
  while (offset < sourceText.length) {
    const character = sourceText[offset];
    if (quote) {
      if (character === quote) quote = undefined;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '[') {
      bracketDepth += 1;
    } else if (character === ']') {
      bracketDepth = Math.max(0, bracketDepth - 1);
    } else if (character === '>' && bracketDepth === 0) {
      return offset + 1;
    }
    offset += 1;
  }
  return sourceText.length;
}

export function lexXsdXml(
  sourceText: string,
  sourceId?: string,
): XsdXmlLexResult {
  const sourceMap = createXsdSourceMap(sourceText, sourceId);
  const tokens: XsdXmlToken[] = [];
  const diagnostics: XsdDiagnostic[] = [];
  let offset = 0;
  let inTag = false;
  let expectingAttributeValue = false;

  function token(
    kind: XsdXmlTokenKind,
    start: number,
    end: number,
    details: Omit<XsdXmlToken, 'kind' | 'raw' | 'range'> = {},
  ): void {
    tokens.push({
      kind,
      raw: sourceText.slice(start, end),
      range: sourceMap.range(start, end),
      ...details,
    });
  }

  while (offset < sourceText.length) {
    if (!inTag) {
      if (sourceText.startsWith('<!--', offset)) {
        const endMarker = sourceText.indexOf('-->', offset + 4);
        const terminated = endMarker >= 0;
        const end = terminated ? endMarker + 3 : sourceText.length;
        if (!terminated) {
          diagnostics.push(
            createXsdDiagnostic(
              'xml',
              'unterminated-comment',
              'error',
              'XML comment is not terminated',
              sourceMap.range(offset, end),
            ),
          );
        }
        token('comment', offset, end, {
          value: sourceText.slice(offset + 4, terminated ? end - 3 : end),
          contentRange: sourceMap.range(offset + 4, terminated ? end - 3 : end),
        });
        offset = end;
        continue;
      }

      if (sourceText.startsWith('<![CDATA[', offset)) {
        const endMarker = sourceText.indexOf(']]>', offset + 9);
        const terminated = endMarker >= 0;
        const end = terminated ? endMarker + 3 : sourceText.length;
        if (!terminated) {
          diagnostics.push(
            createXsdDiagnostic(
              'xml',
              'unterminated-cdata',
              'error',
              'CDATA section is not terminated',
              sourceMap.range(offset, end),
            ),
          );
        }
        token('cdata', offset, end, {
          value: sourceText.slice(offset + 9, terminated ? end - 3 : end),
          contentRange: sourceMap.range(offset + 9, terminated ? end - 3 : end),
        });
        offset = end;
        continue;
      }

      if (sourceText.startsWith('<?', offset)) {
        const endMarker = sourceText.indexOf('?>', offset + 2);
        const terminated = endMarker >= 0;
        const end = terminated ? endMarker + 2 : sourceText.length;
        const raw = sourceText.slice(offset, end);
        const parts = processingInstructionParts(raw, 2, terminated);
        if (!terminated) {
          diagnostics.push(
            createXsdDiagnostic(
              'xml',
              'unterminated-processing-instruction',
              'error',
              'Processing instruction is not terminated',
              sourceMap.range(offset, end),
            ),
          );
        }
        token(
          parts.target === 'xml' ? 'xmlDeclaration' : 'processingInstruction',
          offset,
          end,
          {
            target: parts.target,
            data: parts.data,
          },
        );
        offset = end;
        continue;
      }

      if (sourceText.startsWith('</', offset)) {
        token('endTagOpen', offset, offset + 2);
        offset += 2;
        inTag = true;
        continue;
      }

      if (sourceText[offset] === '<') {
        if (sourceText.startsWith('<!', offset)) {
          const end = scanUnsupportedDeclarationEnd(sourceText, offset);
          const raw = sourceText.slice(offset, end);
          const isDoctype = /^<!DOCTYPE(?:\s|>)/i.test(raw);
          diagnostics.push(
            createXsdDiagnostic(
              'xml',
              isDoctype ? 'doctype-not-allowed' : 'unsupported-declaration',
              'error',
              isDoctype
                ? 'DOCTYPE declarations are not allowed'
                : 'Unsupported XML markup declaration',
              sourceMap.range(offset, end),
            ),
          );
          token('unsupportedDeclaration', offset, end);
          offset = end;
          continue;
        }
        token('startTagOpen', offset, offset + 1);
        offset += 1;
        inTag = true;
        continue;
      }

      const start = offset;
      while (offset < sourceText.length && sourceText[offset] !== '<') {
        offset += 1;
      }
      const raw = sourceText.slice(start, offset);
      token('text', start, offset, {
        value: decodeReferences(raw, start, sourceMap, diagnostics),
      });
      continue;
    }

    if (isWhitespace(sourceText[offset])) {
      offset += 1;
      continue;
    }
    if (sourceText.startsWith('/>', offset)) {
      if (expectingAttributeValue) {
        diagnostics.push(
          createXsdDiagnostic(
            'xml',
            'unquoted-attribute-value',
            'error',
            'Attribute is missing its quoted value',
            sourceMap.range(offset, offset + 2),
          ),
        );
      }
      token('emptyTagClose', offset, offset + 2);
      offset += 2;
      inTag = false;
      expectingAttributeValue = false;
      continue;
    }
    if (sourceText[offset] === '>') {
      if (expectingAttributeValue) {
        diagnostics.push(
          createXsdDiagnostic(
            'xml',
            'unquoted-attribute-value',
            'error',
            'Attribute is missing its quoted value',
            sourceMap.range(offset, offset + 1),
          ),
        );
      }
      token('tagClose', offset, offset + 1);
      offset += 1;
      inTag = false;
      expectingAttributeValue = false;
      continue;
    }
    if (sourceText[offset] === '=') {
      token('equals', offset, offset + 1);
      offset += 1;
      expectingAttributeValue = true;
      continue;
    }
    if (sourceText[offset] === '"' || sourceText[offset] === "'") {
      const start = offset;
      const quoteCharacter = sourceText[offset]!;
      const quote: XsdXmlQuoteKind =
        quoteCharacter === '"' ? 'double' : 'single';
      offset += 1;
      const contentStart = offset;
      while (
        offset < sourceText.length &&
        sourceText[offset] !== quoteCharacter &&
        sourceText[offset] !== '<'
      ) {
        offset += 1;
      }
      const terminated = sourceText[offset] === quoteCharacter;
      const contentEnd = offset;
      if (terminated) offset += 1;
      if (!terminated) {
        diagnostics.push(
          createXsdDiagnostic(
            'xml',
            'unterminated-attribute-value',
            'error',
            'Quoted attribute value is not terminated',
            sourceMap.range(start, offset),
          ),
        );
      }
      const rawValue = sourceText.slice(contentStart, contentEnd);
      token('attributeValue', start, offset, {
        value: decodeReferences(rawValue, contentStart, sourceMap, diagnostics),
        quote,
        contentRange: sourceMap.range(contentStart, contentEnd),
      });
      expectingAttributeValue = false;
      continue;
    }

    const character = codePointCharacter(sourceText, offset);
    if (isXmlNameStartCharacter(character)) {
      const start = offset;
      offset += characterWidth(character);
      while (offset < sourceText.length) {
        const next = codePointCharacter(sourceText, offset);
        if (!isXmlNameCharacter(next)) break;
        offset += characterWidth(next);
      }
      const value = sourceText.slice(start, offset);
      if (expectingAttributeValue) {
        diagnostics.push(
          createXsdDiagnostic(
            'xml',
            'unquoted-attribute-value',
            'error',
            'Attribute values must be single- or double-quoted',
            sourceMap.range(start, offset),
          ),
        );
        token('unquotedAttributeValue', start, offset, { value });
        expectingAttributeValue = false;
      } else {
        token('name', start, offset, { value });
      }
      continue;
    }

    const malformedStart = offset;
    while (
      offset < sourceText.length &&
      !isWhitespace(sourceText[offset]) &&
      !['=', '>', '/', '"', "'", '<'].includes(sourceText[offset]!)
    ) {
      offset += 1;
    }
    if (offset === malformedStart) offset += characterWidth(character) || 1;
    const value = sourceText.slice(malformedStart, offset);
    if (expectingAttributeValue) {
      diagnostics.push(
        createXsdDiagnostic(
          'xml',
          'unquoted-attribute-value',
          'error',
          'Attribute values must be single- or double-quoted',
          sourceMap.range(malformedStart, offset),
        ),
      );
      token('unquotedAttributeValue', malformedStart, offset, { value });
      expectingAttributeValue = false;
    } else {
      diagnostics.push(
        createXsdDiagnostic(
          'xml',
          'malformed-name',
          'error',
          'Malformed XML name or tag syntax',
          sourceMap.range(malformedStart, offset),
        ),
      );
      token('name', malformedStart, offset, { value });
    }
  }

  if (inTag) {
    diagnostics.push(
      createXsdDiagnostic(
        'xml',
        'unterminated-tag',
        'error',
        'XML tag is not terminated',
        sourceMap.range(
          Math.max(0, sourceText.lastIndexOf('<')),
          sourceText.length,
        ),
      ),
    );
  }

  return { tokens, diagnostics };
}
