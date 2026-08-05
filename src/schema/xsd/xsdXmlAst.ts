import type {
  SchemaSourcePosition,
  SchemaSourceRange,
} from '../model/SchemaSourceMarkup';

export const xmlNamespaceUri = 'http://www.w3.org/XML/1998/namespace';
export const xmlnsNamespaceUri = 'http://www.w3.org/2000/xmlns/';
export const xmlSchemaNamespaceUri = 'http://www.w3.org/2001/XMLSchema';

export type XsdXmlQuoteKind = 'single' | 'double';

export interface XsdXmlDeclarationAst {
  readonly kind: 'xmlDeclaration';
  readonly raw: string;
  readonly target: string;
  readonly data: string;
  readonly range: SchemaSourceRange;
  readonly sourceOrder: number;
}

export interface XsdXmlAttributeAst {
  readonly qualifiedName: string;
  readonly prefix?: string;
  readonly localName: string;
  readonly namespaceUri?: string;
  readonly value: string;
  readonly rawValue: string;
  readonly quote: XsdXmlQuoteKind;
  readonly range: SchemaSourceRange;
  readonly nameRange: SchemaSourceRange;
  readonly valueRange: SchemaSourceRange;
  readonly valueContentRange: SchemaSourceRange;
  readonly sourceOrder: number;
}

export interface XsdXmlElementAst {
  readonly kind: 'element';
  readonly qualifiedName: string;
  readonly prefix?: string;
  readonly localName: string;
  readonly namespaceUri?: string;
  readonly attributes: readonly XsdXmlAttributeAst[];
  readonly children: readonly XsdXmlNodeAst[];
  readonly namespaceBindings: Readonly<Record<string, string>>;
  readonly range: SchemaSourceRange;
  readonly startTagRange: SchemaSourceRange;
  readonly endTagRange?: SchemaSourceRange;
  readonly sourceOrder: number;
}

export interface XsdXmlTextAst {
  readonly kind: 'text';
  readonly raw: string;
  readonly value: string;
  readonly range: SchemaSourceRange;
  readonly sourceOrder: number;
}

export interface XsdXmlCommentAst {
  readonly kind: 'comment';
  readonly raw: string;
  readonly text: string;
  readonly range: SchemaSourceRange;
  readonly contentRange: SchemaSourceRange;
  readonly sourceOrder: number;
}

export interface XsdXmlCdataAst {
  readonly kind: 'cdata';
  readonly raw: string;
  readonly value: string;
  readonly range: SchemaSourceRange;
  readonly contentRange: SchemaSourceRange;
  readonly sourceOrder: number;
}

export interface XsdXmlProcessingInstructionAst {
  readonly kind: 'processingInstruction';
  readonly raw: string;
  readonly target: string;
  readonly data: string;
  readonly range: SchemaSourceRange;
  readonly sourceOrder: number;
}

export type XsdXmlNodeAst =
  | XsdXmlElementAst
  | XsdXmlTextAst
  | XsdXmlCommentAst
  | XsdXmlCdataAst
  | XsdXmlProcessingInstructionAst;

export interface XsdXmlDocumentAst {
  readonly kind: 'document';
  readonly declaration?: XsdXmlDeclarationAst;
  readonly children: readonly XsdXmlNodeAst[];
  readonly root?: XsdXmlElementAst;
  readonly range: SchemaSourceRange;
}

export interface XsdSourceMap {
  readonly sourceText: string;
  readonly sourceId?: string;
  readonly positionAt: (offset: number) => SchemaSourcePosition;
  readonly range: (startOffset: number, endOffset: number) => SchemaSourceRange;
}

/**
 * Maps zero-based UTF-16 offsets to one-based locations. End offsets are
 * exclusive; CRLF is one line break and isolated CR/LF are line breaks.
 */
export function createXsdSourceMap(
  sourceText: string,
  sourceId?: string,
): XsdSourceMap {
  const lineStarts = [0];

  for (let offset = 0; offset < sourceText.length; offset += 1) {
    if (sourceText[offset] === '\r') {
      if (sourceText[offset + 1] === '\n') offset += 1;
      lineStarts.push(offset + 1);
    } else if (sourceText[offset] === '\n') {
      lineStarts.push(offset + 1);
    }
  }

  function positionAt(unboundedOffset: number): SchemaSourcePosition {
    const offset = Math.min(Math.max(unboundedOffset, 0), sourceText.length);
    let low = 0;
    let high = lineStarts.length - 1;

    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if ((lineStarts[middle] ?? 0) <= offset) {
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }

    const lineIndex = Math.max(high, 0);
    return {
      offset,
      line: lineIndex + 1,
      column: offset - (lineStarts[lineIndex] ?? 0) + 1,
    };
  }

  return {
    sourceText,
    ...(sourceId === undefined ? {} : { sourceId }),
    positionAt,
    range: (startOffset, endOffset) => ({
      start: positionAt(startOffset),
      end: positionAt(endOffset),
      ...(sourceId === undefined ? {} : { sourceId }),
    }),
  };
}
