/**
 * DTD source offsets are zero-based UTF-16 code-unit offsets. End offsets are
 * exclusive. Lines and columns are one-based and treat CRLF as one line break;
 * isolated CR and LF characters are also line breaks.
 */
export interface DtdSourcePosition {
  readonly offset: number;
  readonly line: number;
  readonly column: number;
}

export interface DtdSourceRange {
  readonly start: DtdSourcePosition;
  readonly end: DtdSourcePosition;
  readonly sourceId?: string;
}

export interface DtdCommentAst {
  readonly kind: 'comment';
  readonly raw: string;
  readonly text: string;
  readonly range: DtdSourceRange;
  readonly contentRange: DtdSourceRange;
  readonly sourceId?: string;
  readonly order: number;
}

export type DtdOccurrence = 'once' | 'optional' | 'zeroOrMore' | 'oneOrMore';

export interface DtdEmptyContentAst {
  readonly kind: 'empty';
  readonly range: DtdSourceRange;
}

export interface DtdAnyContentAst {
  readonly kind: 'any';
  readonly range: DtdSourceRange;
}

export interface DtdParsedCharacterDataAst {
  readonly kind: 'parsedCharacterData';
  readonly range: DtdSourceRange;
}

export interface DtdNameReferenceAst {
  readonly kind: 'nameReference';
  readonly name: string;
  readonly occurrence: DtdOccurrence;
  readonly range: DtdSourceRange;
}

export interface DtdGroupAst {
  readonly kind: 'group';
  readonly compositor: 'sequence' | 'choice';
  readonly members: readonly DtdElementParticleAst[];
  readonly occurrence: DtdOccurrence;
  readonly range: DtdSourceRange;
}

export interface DtdMixedContentAst {
  readonly kind: 'mixed';
  readonly namedAlternatives: readonly DtdNameReferenceAst[];
  readonly occurrence: 'zeroOrMore';
  readonly parsedCharacterDataRange: DtdSourceRange;
  readonly range: DtdSourceRange;
}

export type DtdElementParticleAst = DtdNameReferenceAst | DtdGroupAst;

export type DtdElementContentAst =
  | DtdEmptyContentAst
  | DtdAnyContentAst
  | DtdParsedCharacterDataAst
  | DtdGroupAst
  | DtdMixedContentAst;

export interface DtdElementDeclarationAst {
  readonly kind: 'elementDeclaration';
  readonly name: string;
  readonly contentModel: DtdElementContentAst;
  readonly range: DtdSourceRange;
  readonly rawDeclarationRange: DtdSourceRange;
}

export type DtdTokenizedAttributeTypeKind =
  | 'cdata'
  | 'id'
  | 'idref'
  | 'idrefs'
  | 'entity'
  | 'entities'
  | 'nmtoken'
  | 'nmtokens';

export interface DtdTokenizedAttributeTypeAst {
  readonly kind: DtdTokenizedAttributeTypeKind;
  readonly spelling:
    | 'CDATA'
    | 'ID'
    | 'IDREF'
    | 'IDREFS'
    | 'ENTITY'
    | 'ENTITIES'
    | 'NMTOKEN'
    | 'NMTOKENS';
  readonly range: DtdSourceRange;
}

export interface DtdAttributeEnumerationValueAst {
  readonly kind: 'enumerationValue';
  readonly value: string;
  readonly range: DtdSourceRange;
}

export interface DtdAttributeEnumerationTypeAst {
  readonly kind: 'enumeration';
  readonly values: readonly DtdAttributeEnumerationValueAst[];
  readonly range: DtdSourceRange;
}

export interface DtdNotationNameAst {
  readonly kind: 'notationName';
  readonly name: string;
  readonly range: DtdSourceRange;
}

export interface DtdNotationAttributeTypeAst {
  readonly kind: 'notation';
  readonly names: readonly DtdNotationNameAst[];
  readonly range: DtdSourceRange;
}

export type DtdAttributeTypeAst =
  | DtdTokenizedAttributeTypeAst
  | DtdAttributeEnumerationTypeAst
  | DtdNotationAttributeTypeAst;

export interface DtdAttributeValueLiteralAst {
  readonly kind: 'attributeValueLiteral';
  readonly value: string;
  readonly quote: 'single' | 'double';
  readonly range: DtdSourceRange;
}

export interface DtdRequiredAttributeDefaultAst {
  readonly kind: 'required';
  readonly range: DtdSourceRange;
}

export interface DtdImpliedAttributeDefaultAst {
  readonly kind: 'implied';
  readonly range: DtdSourceRange;
}

export interface DtdFixedAttributeDefaultAst {
  readonly kind: 'fixed';
  readonly value: DtdAttributeValueLiteralAst;
  readonly range: DtdSourceRange;
}

export interface DtdValueAttributeDefaultAst {
  readonly kind: 'value';
  readonly value: DtdAttributeValueLiteralAst;
  readonly range: DtdSourceRange;
}

export type DtdAttributeDefaultAst =
  | DtdRequiredAttributeDefaultAst
  | DtdImpliedAttributeDefaultAst
  | DtdFixedAttributeDefaultAst
  | DtdValueAttributeDefaultAst;

export interface DtdAttributeDefinitionAst {
  readonly kind: 'attributeDefinition';
  readonly name: string;
  readonly type: DtdAttributeTypeAst;
  readonly defaultDeclaration: DtdAttributeDefaultAst;
  readonly range: DtdSourceRange;
}

export interface DtdAttributeListDeclarationAst {
  readonly kind: 'attributeListDeclaration';
  readonly elementName: string;
  readonly attributeDefinitions: readonly DtdAttributeDefinitionAst[];
  readonly range: DtdSourceRange;
  readonly rawDeclarationRange: DtdSourceRange;
}

export type DtdDeclarationAst =
  DtdElementDeclarationAst | DtdAttributeListDeclarationAst;

export interface DtdDeclarationParseResult {
  readonly declarations: readonly DtdDeclarationAst[];
  readonly comments: readonly DtdCommentAst[];
  readonly constructs?: readonly DtdExtendedConstructAst[];
  readonly diagnostics: readonly import('./dtdDiagnostics').DtdParseDiagnostic[];
}

export interface DtdExternalIdentifierAst {
  readonly kind: 'system' | 'public';
  readonly systemId?: string;
  readonly publicId?: string;
}

export interface DtdEntityDeclarationAst {
  readonly kind: 'entityDeclaration';
  readonly name: string;
  readonly parameter: boolean;
  readonly entityKind:
    | 'internalParsed'
    | 'externalParsed'
    | 'externalUnparsed'
    | 'internalParameter'
    | 'externalParameter';
  readonly replacementText?: string;
  readonly externalIdentifier?: DtdExternalIdentifierAst;
  readonly notationName?: string;
  readonly range: DtdSourceRange;
  readonly rawDeclarationRange: DtdSourceRange;
}

export interface DtdNotationDeclarationAst {
  readonly kind: 'notationDeclaration';
  readonly name: string;
  readonly externalIdentifier: DtdExternalIdentifierAst;
  readonly range: DtdSourceRange;
  readonly rawDeclarationRange: DtdSourceRange;
}

export interface DtdConditionalSectionAst {
  readonly kind: 'conditionalSection';
  readonly keyword: string;
  readonly mode: 'include' | 'ignore' | 'parameterEntity';
  readonly content: string;
  readonly range: DtdSourceRange;
  readonly rawDeclarationRange: DtdSourceRange;
}

export interface DtdProcessingInstructionAst {
  readonly kind: 'processingInstruction';
  readonly target: string;
  readonly data: string;
  readonly range: DtdSourceRange;
  readonly rawDeclarationRange: DtdSourceRange;
}

export interface DtdParameterEntityReferenceAst {
  readonly kind: 'parameterEntityReference';
  readonly name: string;
  readonly range: DtdSourceRange;
  readonly rawDeclarationRange: DtdSourceRange;
}

export type DtdExtendedConstructAst =
  | DtdEntityDeclarationAst
  | DtdNotationDeclarationAst
  | DtdConditionalSectionAst
  | DtdProcessingInstructionAst
  | DtdParameterEntityReferenceAst;

export interface DtdElementParseResult {
  readonly declarations: readonly DtdElementDeclarationAst[];
  readonly comments: readonly DtdCommentAst[];
  readonly diagnostics: readonly import('./dtdDiagnostics').DtdParseDiagnostic[];
}

export interface DtdSourceMap {
  readonly sourceText: string;
  readonly sourceId?: string;
  readonly positionAt: (offset: number) => DtdSourcePosition;
  readonly range: (startOffset: number, endOffset: number) => DtdSourceRange;
}

export function createDtdSourceMap(
  sourceText: string,
  sourceId?: string,
): DtdSourceMap {
  const lineStarts = [0];

  for (let offset = 0; offset < sourceText.length; offset += 1) {
    const character = sourceText[offset];
    if (character === '\r') {
      if (sourceText[offset + 1] === '\n') offset += 1;
      lineStarts.push(offset + 1);
    } else if (character === '\n') {
      lineStarts.push(offset + 1);
    }
  }

  function positionAt(unboundedOffset: number): DtdSourcePosition {
    const offset = Math.min(Math.max(unboundedOffset, 0), sourceText.length);
    let low = 0;
    let high = lineStarts.length - 1;

    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      const lineStart = lineStarts[middle] ?? 0;
      if (lineStart <= offset) {
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
    sourceId,
    positionAt,
    range: (startOffset, endOffset) => ({
      start: positionAt(startOffset),
      end: positionAt(endOffset),
      ...(sourceId === undefined ? {} : { sourceId }),
    }),
  };
}
