import {
  createDtdSourceMap,
  type DtdConditionalSectionAst,
  type DtdEntityDeclarationAst,
  type DtdExtendedConstructAst,
  type DtdExternalIdentifierAst,
  type DtdNotationDeclarationAst,
  type DtdParameterEntityReferenceAst,
  type DtdProcessingInstructionAst,
  type DtdSourceMap,
} from './dtdAst';

interface SourceSpan {
  readonly start: number;
  readonly end: number;
  readonly raw: string;
}

function scanQuotedEnd(
  source: string,
  start: number,
  terminator: string,
): number {
  let quote: '"' | "'" | undefined;
  for (let offset = start; offset < source.length; offset += 1) {
    const character = source[offset];
    if (quote) {
      if (character === quote) quote = undefined;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (source.startsWith(terminator, offset))
      return offset + terminator.length;
  }
  return source.length;
}

function scanConditionalEnd(source: string, start: number): number {
  let depth = 1;
  let quote: '"' | "'" | undefined;
  for (let offset = start; offset < source.length; offset += 1) {
    const character = source[offset];
    if (quote) {
      if (character === quote) quote = undefined;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (source.startsWith('<![', offset)) {
      depth += 1;
      offset += 2;
    } else if (source.startsWith(']]>', offset)) {
      depth -= 1;
      if (depth === 0) return offset + 3;
      offset += 2;
    }
  }
  return source.length;
}

function quotedValues(value: string): string[] {
  return [...value.matchAll(/(['"])([\s\S]*?)\1/g)].map(
    (match) => match[2] ?? '',
  );
}

function externalIdentifier(
  value: string,
): DtdExternalIdentifierAst | undefined {
  const keyword = value.match(/^\s*(SYSTEM|PUBLIC)\b/i)?.[1]?.toUpperCase();
  const literals = quotedValues(value);
  if (keyword === 'SYSTEM' && literals[0] !== undefined) {
    return { kind: 'system', systemId: literals[0] };
  }
  if (keyword === 'PUBLIC' && literals[0] !== undefined) {
    return {
      kind: 'public',
      publicId: literals[0],
      ...(literals[1] === undefined ? {} : { systemId: literals[1] }),
    };
  }
  return undefined;
}

function parseEntity(
  span: SourceSpan,
  sourceMap: DtdSourceMap,
): DtdEntityDeclarationAst | undefined {
  const match = span.raw.match(/^<!ENTITY\s+(%\s*)?([^\s>]+)\s+([\s\S]*?)>$/i);
  if (!match) return undefined;
  const parameter = match[1] !== undefined;
  const name = match[2] ?? '';
  const body = (match[3] ?? '').trim();
  const literal = body.match(/^(['"])([\s\S]*?)\1\s*$/);
  const identifier = externalIdentifier(body);
  const notationName = body.match(/\s+NDATA\s+([^\s>]+)\s*$/i)?.[1];
  const entityKind = parameter
    ? literal
      ? 'internalParameter'
      : 'externalParameter'
    : literal
      ? 'internalParsed'
      : notationName
        ? 'externalUnparsed'
        : 'externalParsed';
  const range = sourceMap.range(span.start, span.end);
  return {
    kind: 'entityDeclaration',
    name,
    parameter,
    entityKind,
    ...(literal ? { replacementText: literal[2] ?? '' } : {}),
    ...(identifier ? { externalIdentifier: identifier } : {}),
    ...(notationName ? { notationName } : {}),
    range,
    rawDeclarationRange: range,
  };
}

function parseNotation(
  span: SourceSpan,
  sourceMap: DtdSourceMap,
): DtdNotationDeclarationAst | undefined {
  const match = span.raw.match(/^<!NOTATION\s+([^\s>]+)\s+([\s\S]*?)>$/i);
  if (!match) return undefined;
  const identifier = externalIdentifier(match[2] ?? '');
  if (!identifier) return undefined;
  const range = sourceMap.range(span.start, span.end);
  return {
    kind: 'notationDeclaration',
    name: match[1] ?? '',
    externalIdentifier: identifier,
    range,
    rawDeclarationRange: range,
  };
}

function parseConditional(
  span: SourceSpan,
  sourceMap: DtdSourceMap,
): DtdConditionalSectionAst {
  const bracket = span.raw.indexOf('[', 3);
  const keyword = bracket < 0 ? '' : span.raw.slice(3, bracket).trim();
  const content = bracket < 0 ? '' : span.raw.slice(bracket + 1, -3);
  const upper = keyword.toUpperCase();
  const range = sourceMap.range(span.start, span.end);
  return {
    kind: 'conditionalSection',
    keyword,
    mode:
      upper === 'INCLUDE'
        ? 'include'
        : upper === 'IGNORE'
          ? 'ignore'
          : 'parameterEntity',
    content,
    range,
    rawDeclarationRange: range,
  };
}

function parseProcessingInstruction(
  span: SourceSpan,
  sourceMap: DtdSourceMap,
): DtdProcessingInstructionAst | undefined {
  const match = span.raw.match(/^<\?([^\s?]+)([\s\S]*?)\?>$/);
  if (!match) return undefined;
  const range = sourceMap.range(span.start, span.end);
  return {
    kind: 'processingInstruction',
    target: match[1] ?? '',
    data: (match[2] ?? '').trim(),
    range,
    rawDeclarationRange: range,
  };
}

/**
 * Source-preserving extraction for valid constructs that the structural DTD
 * parser does not need in order to parse ELEMENT and ATTLIST declarations.
 * It never decides standards validity and never expands entity text.
 */
export function parseExtendedDtdConstructs(
  sourceText: string,
  sourceId?: string,
): readonly DtdExtendedConstructAst[] {
  const sourceMap = createDtdSourceMap(sourceText, sourceId);
  const constructs: DtdExtendedConstructAst[] = [];
  let offset = 0;

  while (offset < sourceText.length) {
    if (sourceText.startsWith('<!--', offset)) {
      const end = sourceText.indexOf('-->', offset + 4);
      offset = end < 0 ? sourceText.length : end + 3;
      continue;
    }
    if (sourceText.startsWith('<?', offset)) {
      const end = scanQuotedEnd(sourceText, offset + 2, '?>');
      const span = { start: offset, end, raw: sourceText.slice(offset, end) };
      const construct = parseProcessingInstruction(span, sourceMap);
      if (construct) constructs.push(construct);
      offset = end;
      continue;
    }
    if (sourceText.startsWith('<![', offset)) {
      const end = scanConditionalEnd(sourceText, offset + 3);
      const span = { start: offset, end, raw: sourceText.slice(offset, end) };
      constructs.push(parseConditional(span, sourceMap));
      offset = end;
      continue;
    }
    if (/^<!ENTITY\b/i.test(sourceText.slice(offset))) {
      const end = scanQuotedEnd(sourceText, offset + 2, '>');
      const span = { start: offset, end, raw: sourceText.slice(offset, end) };
      const construct = parseEntity(span, sourceMap);
      if (construct) constructs.push(construct);
      offset = end;
      continue;
    }
    if (/^<!NOTATION\b/i.test(sourceText.slice(offset))) {
      const end = scanQuotedEnd(sourceText, offset + 2, '>');
      const span = { start: offset, end, raw: sourceText.slice(offset, end) };
      const construct = parseNotation(span, sourceMap);
      if (construct) constructs.push(construct);
      offset = end;
      continue;
    }
    if (sourceText[offset] === '%') {
      const match = sourceText.slice(offset).match(/^%\s*([^;\s]+)\s*;/);
      if (match) {
        const end = offset + match[0].length;
        const range = sourceMap.range(offset, end);
        const construct: DtdParameterEntityReferenceAst = {
          kind: 'parameterEntityReference',
          name: match[1] ?? '',
          range,
          rawDeclarationRange: range,
        };
        constructs.push(construct);
        offset = end;
        continue;
      }
    }
    offset += 1;
  }

  return constructs.sort(
    (left, right) =>
      left.range.start.offset - right.range.start.offset ||
      left.range.end.offset - right.range.end.offset,
  );
}
