import type {
  DtdAnyContentAst,
  DtdAttributeDefaultAst,
  DtdAttributeDefinitionAst,
  DtdAttributeEnumerationTypeAst,
  DtdAttributeListDeclarationAst,
  DtdAttributeTypeAst,
  DtdAttributeValueLiteralAst,
  DtdDeclarationAst,
  DtdDeclarationParseResult,
  DtdElementContentAst,
  DtdElementDeclarationAst,
  DtdExtendedConstructAst,
  DtdElementParseResult,
  DtdElementParticleAst,
  DtdEmptyContentAst,
  DtdGroupAst,
  DtdMixedContentAst,
  DtdNameReferenceAst,
  DtdNotationAttributeTypeAst,
  DtdOccurrence,
  DtdParsedCharacterDataAst,
  DtdSourceMap,
  DtdSourceRange,
} from './dtdAst';
import {
  createDtdParseDiagnostic,
  type DtdParseDiagnostic,
  type DtdParseDiagnosticCode,
} from './dtdDiagnostics';
import { lexDtdElementDeclarations, type DtdToken } from './dtdLexer';
import { parseExtendedDtdConstructs } from './dtdExtendedParser';

const MAX_PARAMETER_ENTITY_EXPANSION_DEPTH = 32;
const MAX_PARAMETER_ENTITY_EXPANSION_TOKENS = 200_000;

function parameterEntityReferenceName(token: DtdToken): string | undefined {
  if (token.kind !== 'parameterEntityReference') return undefined;
  return token.value.match(/^%\s*([^;\s]+)\s*;$/)?.[1];
}

/**
 * Expands only internal parameter entities already present in the supplied
 * source. Xerces remains the validity authority; this bounded token expansion
 * exists solely so the visualization extractor can see declarations and
 * content-model grammar contributed by those entities. Expanded tokens point
 * back to the reference token, preserving truthful source evidence without
 * inventing offsets inside replacement text.
 */
function expandInternalParameterEntityTokens(
  tokens: readonly DtdToken[],
  constructs: readonly DtdExtendedConstructAst[],
  sourceId?: string,
): readonly DtdToken[] {
  const replacements = new Map<string, string>();
  for (const construct of constructs) {
    if (
      construct.kind !== 'entityDeclaration' ||
      !construct.parameter ||
      construct.replacementText === undefined ||
      replacements.has(construct.name)
    ) {
      continue;
    }
    // XML uses the first entity declaration encountered for a given name.
    replacements.set(construct.name, construct.replacementText);
  }
  let emittedTokenCount = 0;

  function expand(
    input: readonly DtdToken[],
    depth: number,
    activeNames: ReadonlySet<string>,
    origin?: DtdToken,
  ): DtdToken[] {
    const output: DtdToken[] = [];
    for (const token of input) {
      const name = parameterEntityReferenceName(token);
      const replacement = name ? replacements.get(name) : undefined;
      if (
        !name ||
        replacement === undefined ||
        depth >= MAX_PARAMETER_ENTITY_EXPANSION_DEPTH ||
        activeNames.has(name)
      ) {
        output.push(origin ? { ...token, range: origin.range } : token);
        emittedTokenCount += 1;
        continue;
      }
      const replacementTokens = lexDtdElementDeclarations(
        replacement,
        sourceId,
      ).tokens;
      const expanded = expand(
        replacementTokens,
        depth + 1,
        new Set([...activeNames, name]),
        origin ?? token,
      );
      output.push(...expanded);
      if (emittedTokenCount > MAX_PARAMETER_ENTITY_EXPANSION_TOKENS) {
        return output;
      }
    }
    return output;
  }

  const expanded = expand(tokens, 0, new Set());
  return expanded.length > MAX_PARAMETER_ENTITY_EXPANSION_TOKENS
    ? expanded.slice(0, MAX_PARAMETER_ENTITY_EXPANSION_TOKENS)
    : expanded;
}

interface ParsedOccurrence {
  readonly occurrence: DtdOccurrence;
  readonly endOffset: number;
}

type DtdParserMode = 'all' | 'elementOnly';

class DtdParser {
  readonly declarations: DtdDeclarationAst[] = [];
  readonly diagnostics: DtdParseDiagnostic[] = [];

  private tokenIndex = 0;

  constructor(
    private readonly tokens: readonly DtdToken[],
    private readonly sourceMap: DtdSourceMap,
    private readonly mode: DtdParserMode,
  ) {}

  parse(): void {
    while (this.currentToken()) {
      const token = this.currentToken();
      if (!token) break;

      if (token.kind === 'declarationOpen') {
        this.parseMarkupDeclaration();
      } else if (token.kind === 'conditionalSectionOpen') {
        this.consumeUnsupportedConditionalSection(
          token,
          'Conditional sections are not supported by the DTD element parser',
        );
      } else if (token.kind === 'parameterEntityReference') {
        this.report(
          'unsupported-syntax',
          `Parameter-entity reference "${token.value}" is not supported`,
          token.range,
        );
        this.consumeToken();
      } else {
        this.report(
          'unexpected-token',
          `Unexpected token "${token.value}" at the top level`,
          token.range,
        );
        this.consumeToken();
      }
    }
  }

  private parseMarkupDeclaration(): void {
    const openToken = this.consumeToken();
    if (!openToken) return;

    const declarationKeyword = this.currentToken();
    if (
      declarationKeyword?.kind === 'name' &&
      declarationKeyword.value === 'ELEMENT'
    ) {
      this.consumeToken();
      this.parseElementDeclaration(openToken);
      return;
    }

    if (
      declarationKeyword?.kind === 'name' &&
      declarationKeyword.value === 'ATTLIST' &&
      this.mode === 'all'
    ) {
      this.consumeToken();
      this.parseAttributeListDeclaration(openToken);
      return;
    }

    {
      this.consumeUnsupportedDeclaration(
        openToken,
        declarationKeyword?.kind === 'name'
          ? `Declaration type "${declarationKeyword.value}" is not supported`
          : 'This markup declaration is not supported by the DTD parser',
      );
    }
  }

  private parseElementDeclaration(openToken: DtdToken): void {
    const diagnosticStart = this.diagnostics.length;
    const nameToken = this.currentToken();

    if (nameToken?.kind !== 'name') {
      const range = nameToken?.range ?? this.eofRange();
      const isInvalid =
        nameToken !== undefined &&
        !['greaterThan', 'leftParenthesis', 'parsedCharacterData'].includes(
          nameToken.kind,
        );
      this.report(
        isInvalid ? 'invalid-element-name' : 'missing-element-name',
        isInvalid
          ? `Expected an ASCII-subset XML element name after <!ELEMENT; found "${nameToken.value}"`
          : 'Expected an element name after <!ELEMENT',
        range,
      );
      this.recoverMalformedDeclaration(openToken, diagnosticStart);
      return;
    }

    this.consumeToken();
    const contentModel = this.parseContentModel();
    if (!contentModel) {
      if (this.diagnostics.length === diagnosticStart) {
        this.report(
          'missing-content-model',
          `Expected EMPTY, ANY, or a parenthesized content model for element "${nameToken.value}"`,
          this.currentToken()?.range ?? this.eofRange(),
        );
      }
      this.recoverMalformedDeclaration(openToken, diagnosticStart);
      return;
    }

    const trailingToken = this.currentToken();
    if (trailingToken?.kind !== 'greaterThan') {
      if (trailingToken?.kind === 'rightParenthesis') {
        this.report(
          'unbalanced-parenthesis',
          `Found an extra closing parenthesis in the declaration for "${nameToken.value}"`,
          trailingToken.range,
        );
      } else if (this.isOccurrenceToken(trailingToken)) {
        this.consumeInvalidOccurrences(
          'Only one occurrence marker may follow a content-model particle',
        );
      } else if (trailingToken) {
        this.report(
          'unexpected-token',
          `Unexpected token "${trailingToken.value}" before the end of the declaration for "${nameToken.value}"`,
          trailingToken.range,
        );
      }
      this.recoverMalformedDeclaration(openToken, diagnosticStart);
      return;
    }

    const closeToken = this.consumeToken();
    if (!closeToken) return;

    if (this.diagnostics.length === diagnosticStart) {
      const declarationRange = this.sourceMap.range(
        openToken.range.start.offset,
        closeToken.range.end.offset,
      );
      this.declarations.push({
        kind: 'elementDeclaration',
        name: nameToken.value,
        contentModel,
        range: declarationRange,
        rawDeclarationRange: declarationRange,
      });
    }
  }

  private parseContentModel(): DtdElementContentAst | undefined {
    const token = this.currentToken();
    if (!token) return undefined;

    if (token.kind === 'name' && token.value === 'EMPTY') {
      this.consumeToken();
      const content: DtdEmptyContentAst = {
        kind: 'empty',
        range: token.range,
      };
      if (this.isOccurrenceToken(this.currentToken())) {
        this.consumeInvalidOccurrences(
          'Occurrence markers are not allowed after EMPTY',
        );
      }
      return content;
    }

    if (token.kind === 'name' && token.value === 'ANY') {
      this.consumeToken();
      const content: DtdAnyContentAst = {
        kind: 'any',
        range: token.range,
      };
      if (this.isOccurrenceToken(this.currentToken())) {
        this.consumeInvalidOccurrences(
          'Occurrence markers are not allowed after ANY',
        );
      }
      return content;
    }

    if (token.kind === 'leftParenthesis') {
      return this.parseParenthesizedContent();
    }

    this.report(
      'missing-content-model',
      'Expected EMPTY, ANY, or a parenthesized content model',
      token.range,
    );
    return undefined;
  }

  private parseParenthesizedContent():
    DtdGroupAst | DtdMixedContentAst | DtdParsedCharacterDataAst | undefined {
    const openToken = this.consumeToken();
    if (!openToken) return undefined;

    if (this.currentToken()?.kind === 'parsedCharacterData') {
      return this.parseMixedOrCharacterData(openToken);
    }

    if (this.currentToken()?.kind === 'rightParenthesis') {
      const closeToken = this.consumeToken();
      this.report(
        'empty-group',
        'DTD content-model groups must contain at least one particle',
        this.sourceMap.range(
          openToken.range.start.offset,
          closeToken?.range.end.offset ?? openToken.range.end.offset,
        ),
      );
      return undefined;
    }

    const firstMember = this.parseElementParticle();
    if (!firstMember) return undefined;

    const members: DtdElementParticleAst[] = [firstMember];
    let compositor: 'sequence' | 'choice' | undefined;

    while (true) {
      const token = this.currentToken();
      if (!token) {
        this.report(
          'unbalanced-parenthesis',
          'Expected ")" to close the content-model group',
          this.eofRange(),
        );
        return undefined;
      }

      if (token.kind === 'rightParenthesis') {
        const closeToken = this.consumeToken();
        if (!closeToken) return undefined;
        const parsedOccurrence = this.parseOccurrence(
          closeToken.range.end.offset,
        );
        return {
          kind: 'group',
          compositor: compositor ?? 'sequence',
          members,
          occurrence: parsedOccurrence.occurrence,
          range: this.sourceMap.range(
            openToken.range.start.offset,
            parsedOccurrence.endOffset,
          ),
        };
      }

      if (token.kind === 'greaterThan') {
        this.report(
          'unbalanced-parenthesis',
          'Expected ")" before the declaration ended',
          token.range,
        );
        return undefined;
      }

      if (
        token.kind === 'declarationOpen' ||
        token.kind === 'conditionalSectionOpen'
      ) {
        this.report(
          'unbalanced-parenthesis',
          'Expected ")" before the next declaration began',
          token.range,
        );
        return undefined;
      }

      if (token.kind === 'parsedCharacterData') {
        this.report(
          'invalid-pcdata-placement',
          '#PCDATA must appear first and only in a standard mixed-content model',
          token.range,
        );
        return undefined;
      }

      if (token.kind !== 'comma' && token.kind !== 'pipe') {
        this.report(
          'unexpected-token',
          this.canStartParticle(token)
            ? `Expected "," or "|" before "${token.value}"`
            : `Expected ",", "|", or ")" in the content-model group; found "${token.value}"`,
          token.range,
        );
        return undefined;
      }

      const separatorToken = this.consumeToken();
      if (!separatorToken) return undefined;
      const nextCompositor =
        separatorToken.kind === 'comma' ? 'sequence' : 'choice';
      if (compositor && compositor !== nextCompositor) {
        this.report(
          'mixed-compositor',
          'A content-model group cannot mix "," and "|" without nested groups',
          separatorToken.range,
        );
        return undefined;
      }
      compositor = nextCompositor;

      const nextToken = this.currentToken();
      if (nextToken?.kind === 'rightParenthesis') {
        this.report(
          'trailing-separator',
          `The "${separatorToken.value}" separator must be followed by another particle`,
          this.sourceMap.range(
            separatorToken.range.start.offset,
            nextToken.range.end.offset,
          ),
        );
        return undefined;
      }
      if (nextToken?.kind === 'comma' || nextToken?.kind === 'pipe') {
        this.report(
          'unexpected-token',
          `Unexpected extra "${nextToken.value}" separator`,
          nextToken.range,
        );
        return undefined;
      }

      const member = this.parseElementParticle();
      if (!member) return undefined;
      members.push(member);
    }
  }

  private parseElementParticle(): DtdElementParticleAst | undefined {
    const token = this.currentToken();
    if (!token) {
      this.report(
        'unexpected-end-of-input',
        'Expected a content-model particle before the input ended',
        this.eofRange(),
      );
      return undefined;
    }

    if (token.kind === 'name') {
      this.consumeToken();
      const parsedOccurrence = this.parseOccurrence(token.range.end.offset);
      return {
        kind: 'nameReference',
        name: token.value,
        occurrence: parsedOccurrence.occurrence,
        range: this.sourceMap.range(
          token.range.start.offset,
          parsedOccurrence.endOffset,
        ),
      };
    }

    if (token.kind === 'leftParenthesis') {
      const nestedContent = this.parseParenthesizedContent();
      if (!nestedContent) return undefined;
      if (nestedContent.kind !== 'group') {
        this.report(
          'invalid-pcdata-placement',
          '#PCDATA and mixed content cannot be nested inside an element-only content model',
          nestedContent.range,
        );
        return undefined;
      }
      return nestedContent;
    }

    if (token.kind === 'parsedCharacterData') {
      this.report(
        'invalid-pcdata-placement',
        '#PCDATA must be the first token in a mixed-content group',
        token.range,
      );
    } else {
      this.report(
        'unexpected-token',
        `Expected an element-name reference or nested group; found "${token.value}"`,
        token.range,
      );
    }
    return undefined;
  }

  private parseMixedOrCharacterData(
    openToken: DtdToken,
  ): DtdMixedContentAst | DtdParsedCharacterDataAst | undefined {
    const pcdataToken = this.consumeToken();
    if (!pcdataToken) return undefined;

    const nextToken = this.currentToken();
    if (nextToken?.kind === 'rightParenthesis') {
      const closeToken = this.consumeToken();
      if (!closeToken) return undefined;
      let endOffset = closeToken.range.end.offset;
      if (this.isOccurrenceToken(this.currentToken())) {
        this.report(
          'invalid-mixed-content',
          'A #PCDATA-only content model must use "(#PCDATA)" without an occurrence marker',
          this.currentToken()?.range ?? closeToken.range,
        );
        endOffset = this.consumeOccurrenceTokens();
      }
      return {
        kind: 'parsedCharacterData',
        range: this.sourceMap.range(openToken.range.start.offset, endOffset),
      };
    }

    if (nextToken?.kind !== 'pipe') {
      if (
        nextToken?.kind === 'greaterThan' ||
        nextToken?.kind === 'declarationOpen' ||
        nextToken === undefined
      ) {
        this.report(
          'unbalanced-parenthesis',
          'Expected ")" to close the #PCDATA content model',
          nextToken?.range ?? this.eofRange(),
        );
      } else {
        this.report(
          'invalid-mixed-content',
          'Expected "|" followed by a named alternative, or ")" after #PCDATA',
          nextToken.range,
        );
      }
      return undefined;
    }

    const alternatives: DtdNameReferenceAst[] = [];
    while (this.currentToken()?.kind === 'pipe') {
      const separatorToken = this.consumeToken();
      const alternativeToken = this.currentToken();
      if (!separatorToken) return undefined;

      if (alternativeToken?.kind === 'parsedCharacterData') {
        this.report(
          'invalid-pcdata-placement',
          '#PCDATA may appear only once and first in mixed content',
          alternativeToken.range,
        );
        return undefined;
      }

      if (alternativeToken?.kind !== 'name') {
        this.report(
          'invalid-mixed-content',
          `Expected a named alternative after "${separatorToken.value}" in mixed content`,
          alternativeToken?.range ?? this.eofRange(),
        );
        return undefined;
      }

      this.consumeToken();
      let alternativeEnd = alternativeToken.range.end.offset;
      if (this.isOccurrenceToken(this.currentToken())) {
        this.report(
          'invalid-occurrence',
          'Named alternatives in mixed content cannot carry occurrence markers',
          this.currentToken()?.range ?? alternativeToken.range,
        );
        alternativeEnd = this.consumeOccurrenceTokens();
      }
      alternatives.push({
        kind: 'nameReference',
        name: alternativeToken.value,
        occurrence: 'once',
        range: this.sourceMap.range(
          alternativeToken.range.start.offset,
          alternativeEnd,
        ),
      });
    }

    const closeToken = this.currentToken();
    if (closeToken?.kind !== 'rightParenthesis') {
      if (closeToken?.kind === 'comma') {
        this.report(
          'invalid-mixed-content',
          'Mixed content uses "|" separators, not "," separators',
          closeToken.range,
        );
      } else if (
        closeToken?.kind === 'greaterThan' ||
        closeToken?.kind === 'declarationOpen' ||
        closeToken === undefined
      ) {
        this.report(
          'unbalanced-parenthesis',
          'Expected ")" to close the mixed-content group',
          closeToken?.range ?? this.eofRange(),
        );
      } else {
        this.report(
          'invalid-mixed-content',
          `Expected "|" or ")" in mixed content; found "${closeToken.value}"`,
          closeToken.range,
        );
      }
      return undefined;
    }

    this.consumeToken();
    const starToken = this.currentToken();
    if (starToken?.kind !== 'star') {
      this.report(
        'invalid-mixed-content',
        'Mixed content with named alternatives must end with a group-level "*"',
        starToken?.range ?? this.eofRange(),
      );
      return undefined;
    }
    this.consumeToken();

    let endOffset = starToken.range.end.offset;
    if (this.isOccurrenceToken(this.currentToken())) {
      this.report(
        'invalid-occurrence',
        'Only the required single "*" may follow a mixed-content group',
        this.currentToken()?.range ?? starToken.range,
      );
      endOffset = this.consumeOccurrenceTokens();
    }

    return {
      kind: 'mixed',
      namedAlternatives: alternatives,
      occurrence: 'zeroOrMore',
      parsedCharacterDataRange: pcdataToken.range,
      range: this.sourceMap.range(openToken.range.start.offset, endOffset),
    };
  }

  private parseAttributeListDeclaration(openToken: DtdToken): void {
    const diagnosticStart = this.diagnostics.length;
    const elementNameToken = this.currentToken();

    if (elementNameToken?.kind !== 'name') {
      this.report(
        'missing-attlist-element-name',
        'Expected an element name after <!ATTLIST',
        elementNameToken?.range ?? this.eofRange(),
      );
      this.recoverMalformedDeclaration(
        openToken,
        diagnosticStart,
        '<!ATTLIST declaration',
      );
      return;
    }

    this.consumeToken();
    const attributeDefinitions: DtdAttributeDefinitionAst[] = [];

    while (true) {
      const token = this.currentToken();
      if (token?.kind === 'greaterThan') {
        const closeToken = this.consumeToken();
        if (!closeToken) return;
        if (this.diagnostics.length === diagnosticStart) {
          const declarationRange = this.sourceMap.range(
            openToken.range.start.offset,
            closeToken.range.end.offset,
          );
          const declaration: DtdAttributeListDeclarationAst = {
            kind: 'attributeListDeclaration',
            elementName: elementNameToken.value,
            attributeDefinitions,
            range: declarationRange,
            rawDeclarationRange: declarationRange,
          };
          this.declarations.push(declaration);
        }
        return;
      }

      if (
        !token ||
        token.kind === 'declarationOpen' ||
        token.kind === 'conditionalSectionOpen'
      ) {
        this.report(
          'incomplete-attribute-definition',
          `The ATTLIST declaration for "${elementNameToken.value}" ended before an attribute definition or closing ">" was complete`,
          token?.range ?? this.eofRange(),
        );
        this.recoverMalformedDeclaration(
          openToken,
          diagnosticStart,
          '<!ATTLIST declaration',
        );
        return;
      }

      const attribute = this.parseAttributeDefinition();
      if (!attribute) {
        this.recoverMalformedDeclaration(
          openToken,
          diagnosticStart,
          '<!ATTLIST declaration',
        );
        return;
      }
      attributeDefinitions.push(attribute);
    }
  }

  private parseAttributeDefinition(): DtdAttributeDefinitionAst | undefined {
    const nameToken = this.currentToken();
    if (nameToken?.kind !== 'name') {
      this.report(
        'missing-attribute-name',
        nameToken
          ? `Expected an attribute name; found "${nameToken.value}"`
          : 'Expected an attribute name before the input ended',
        nameToken?.range ?? this.eofRange(),
      );
      return undefined;
    }
    this.consumeToken();

    const type = this.parseAttributeType(nameToken.value);
    if (!type) return undefined;

    const defaultDeclaration = this.parseAttributeDefault(nameToken.value);
    if (!defaultDeclaration) return undefined;

    return {
      kind: 'attributeDefinition',
      name: nameToken.value,
      type,
      defaultDeclaration,
      range: this.sourceMap.range(
        nameToken.range.start.offset,
        defaultDeclaration.range.end.offset,
      ),
    };
  }

  private parseAttributeType(
    attributeName: string,
  ): DtdAttributeTypeAst | undefined {
    const token = this.currentToken();
    if (
      !token ||
      token.kind === 'greaterThan' ||
      token.kind === 'declarationOpen' ||
      token.kind === 'hashKeyword' ||
      token.kind === 'quotedLiteral'
    ) {
      this.report(
        'missing-attribute-type',
        `Expected an attribute type for "${attributeName}"`,
        token?.range ?? this.eofRange(),
      );
      return undefined;
    }

    if (token.kind === 'leftParenthesis') {
      return this.parseAttributeEnumeration();
    }

    if (token.kind !== 'name') {
      this.report(
        'invalid-attribute-type',
        `Expected a supported attribute type for "${attributeName}"; found "${token.value}"`,
        token.range,
      );
      return undefined;
    }

    const kindBySpelling = {
      CDATA: 'cdata',
      ID: 'id',
      IDREF: 'idref',
      IDREFS: 'idrefs',
      ENTITY: 'entity',
      ENTITIES: 'entities',
      NMTOKEN: 'nmtoken',
      NMTOKENS: 'nmtokens',
    } as const;
    const spelling = token.value as keyof typeof kindBySpelling;
    const kind = kindBySpelling[spelling];
    if (kind) {
      this.consumeToken();
      return { kind, spelling, range: token.range };
    }

    if (token.value === 'NOTATION') {
      this.consumeToken();
      return this.parseNotationType(token);
    }

    this.report(
      'invalid-attribute-type',
      `Attribute type "${token.value}" is not supported`,
      token.range,
    );
    return undefined;
  }

  private parseAttributeEnumeration():
    DtdAttributeEnumerationTypeAst | undefined {
    const openToken = this.consumeToken();
    if (!openToken) return undefined;
    const values: DtdAttributeEnumerationTypeAst['values'][number][] = [];
    let expectsValue = true;

    while (true) {
      const token = this.currentToken();
      if (!token) {
        this.report(
          'invalid-attribute-enumeration',
          'Expected ")" to close the attribute enumeration',
          this.eofRange(),
        );
        return undefined;
      }

      if (token.kind === 'rightParenthesis') {
        const closeToken = this.consumeToken();
        if (!closeToken) return undefined;
        if (values.length === 0) {
          this.report(
            'empty-attribute-enumeration',
            'Attribute enumerations must contain at least one NMTOKEN value',
            this.sourceMap.range(
              openToken.range.start.offset,
              closeToken.range.end.offset,
            ),
          );
          return undefined;
        }
        if (expectsValue) {
          this.report(
            'invalid-attribute-enumeration',
            'An attribute enumeration cannot end with "|"',
            closeToken.range,
          );
          return undefined;
        }
        return {
          kind: 'enumeration',
          values,
          range: this.sourceMap.range(
            openToken.range.start.offset,
            closeToken.range.end.offset,
          ),
        };
      }

      if (!expectsValue) {
        if (token.kind !== 'pipe') {
          this.report(
            'invalid-attribute-enumeration',
            `Expected "|" or ")" in the attribute enumeration; found "${token.value}"`,
            token.range,
          );
          return undefined;
        }
        this.consumeToken();
        expectsValue = true;
        continue;
      }

      if (token.kind === 'pipe') {
        this.report(
          'invalid-attribute-enumeration',
          'An attribute enumeration cannot begin with "|"',
          token.range,
        );
        return undefined;
      }

      if (token.kind !== 'name' && token.kind !== 'nmtoken') {
        this.report(
          'invalid-attribute-enumeration',
          `Expected an ASCII-subset NMTOKEN value; found "${token.value}"`,
          token.range,
        );
        return undefined;
      }

      this.consumeToken();
      values.push({
        kind: 'enumerationValue',
        value: token.value,
        range: token.range,
      });
      expectsValue = false;
    }
  }

  private parseNotationType(
    notationToken: DtdToken,
  ): DtdNotationAttributeTypeAst | undefined {
    const openToken = this.currentToken();
    if (openToken?.kind !== 'leftParenthesis') {
      this.report(
        'invalid-notation-type',
        'Expected a parenthesized name list after NOTATION',
        openToken?.range ?? this.eofRange(),
      );
      return undefined;
    }
    this.consumeToken();
    const names: DtdNotationAttributeTypeAst['names'][number][] = [];
    let expectsName = true;

    while (true) {
      const token = this.currentToken();
      if (!token) {
        this.report(
          'invalid-notation-type',
          'Expected ")" to close the NOTATION type',
          this.eofRange(),
        );
        return undefined;
      }

      if (token.kind === 'rightParenthesis') {
        const closeToken = this.consumeToken();
        if (!closeToken) return undefined;
        if (names.length === 0) {
          this.report(
            'invalid-notation-type',
            'A NOTATION type must contain at least one name',
            this.sourceMap.range(
              notationToken.range.start.offset,
              closeToken.range.end.offset,
            ),
          );
          return undefined;
        }
        if (expectsName) {
          this.report(
            'invalid-notation-type',
            'A NOTATION type cannot end with "|"',
            closeToken.range,
          );
          return undefined;
        }
        return {
          kind: 'notation',
          names,
          range: this.sourceMap.range(
            notationToken.range.start.offset,
            closeToken.range.end.offset,
          ),
        };
      }

      if (!expectsName) {
        if (token.kind !== 'pipe') {
          this.report(
            'invalid-notation-type',
            `Expected "|" or ")" in the NOTATION type; found "${token.value}"`,
            token.range,
          );
          return undefined;
        }
        this.consumeToken();
        expectsName = true;
        continue;
      }

      if (token.kind === 'pipe') {
        this.report(
          'invalid-notation-type',
          'A NOTATION type cannot begin with "|"',
          token.range,
        );
        return undefined;
      }

      if (token.kind !== 'name') {
        this.report(
          'invalid-notation-type',
          `Expected an ASCII-subset XML name; found "${token.value}"`,
          token.range,
        );
        return undefined;
      }

      this.consumeToken();
      names.push({
        kind: 'notationName',
        name: token.value,
        range: token.range,
      });
      expectsName = false;
    }
  }

  private parseAttributeDefault(
    attributeName: string,
  ): DtdAttributeDefaultAst | undefined {
    const token = this.currentToken();
    if (
      !token ||
      token.kind === 'greaterThan' ||
      token.kind === 'declarationOpen' ||
      token.kind === 'conditionalSectionOpen'
    ) {
      this.report(
        'missing-attribute-default',
        `Expected a default declaration for attribute "${attributeName}"`,
        token?.range ?? this.eofRange(),
      );
      return undefined;
    }

    if (token.kind === 'quotedLiteral') {
      const literal = this.parseAttributeValueLiteral();
      if (!literal) return undefined;
      return { kind: 'value', value: literal, range: literal.range };
    }

    if (token.kind !== 'hashKeyword') {
      this.report(
        'invalid-attribute-default',
        `Expected #REQUIRED, #IMPLIED, #FIXED, or a quoted value for attribute "${attributeName}"`,
        token.range,
      );
      return undefined;
    }

    this.consumeToken();
    if (token.value === '#REQUIRED') {
      return { kind: 'required', range: token.range };
    }
    if (token.value === '#IMPLIED') {
      return { kind: 'implied', range: token.range };
    }
    if (token.value === '#FIXED') {
      const valueToken = this.currentToken();
      if (valueToken?.kind !== 'quotedLiteral') {
        this.report(
          'missing-fixed-value',
          `Expected a quoted value after #FIXED for attribute "${attributeName}"`,
          valueToken?.range ?? this.eofRange(),
        );
        return undefined;
      }
      const value = this.parseAttributeValueLiteral();
      if (!value) return undefined;
      return {
        kind: 'fixed',
        value,
        range: this.sourceMap.range(
          token.range.start.offset,
          value.range.end.offset,
        ),
      };
    }

    this.report(
      'invalid-attribute-default',
      `Default keyword "${token.value}" is not supported`,
      token.range,
    );
    return undefined;
  }

  private parseAttributeValueLiteral():
    DtdAttributeValueLiteralAst | undefined {
    const token = this.consumeToken();
    if (!token || token.kind !== 'quotedLiteral') return undefined;
    if (token.terminated !== true) {
      this.report(
        'unterminated-attribute-value',
        'Expected a matching quote to close the attribute value',
        token.range,
      );
      return undefined;
    }
    return {
      kind: 'attributeValueLiteral',
      value: token.value.slice(1, -1),
      quote: token.value[0] === "'" ? 'single' : 'double',
      range: token.range,
    };
  }

  private parseOccurrence(baseEndOffset: number): ParsedOccurrence {
    const token = this.currentToken();
    if (!this.isOccurrenceToken(token)) {
      return { occurrence: 'once', endOffset: baseEndOffset };
    }

    this.consumeToken();
    const occurrenceByKind: Readonly<
      Record<'question' | 'star' | 'plus', DtdOccurrence>
    > = {
      question: 'optional',
      star: 'zeroOrMore',
      plus: 'oneOrMore',
    };
    let endOffset = token.range.end.offset;

    if (this.isOccurrenceToken(this.currentToken())) {
      const extraStart = this.currentToken()?.range.start.offset ?? endOffset;
      endOffset = this.consumeOccurrenceTokens();
      this.report(
        'invalid-occurrence',
        'A content-model particle may have at most one occurrence marker',
        this.sourceMap.range(extraStart, endOffset),
      );
    }

    return {
      occurrence: occurrenceByKind[token.kind],
      endOffset,
    };
  }

  private consumeInvalidOccurrences(message: string): void {
    const firstToken = this.currentToken();
    if (!firstToken) return;
    const endOffset = this.consumeOccurrenceTokens();
    this.report(
      'invalid-occurrence',
      message,
      this.sourceMap.range(firstToken.range.start.offset, endOffset),
    );
  }

  private consumeOccurrenceTokens(): number {
    let endOffset = this.currentToken()?.range.end.offset ?? 0;
    while (this.isOccurrenceToken(this.currentToken())) {
      const token = this.consumeToken();
      if (token) endOffset = token.range.end.offset;
    }
    return endOffset;
  }

  private consumeUnsupportedDeclaration(
    openToken: DtdToken,
    message: string,
  ): void {
    let endOffset = openToken.range.end.offset;
    let scanIndex = this.tokenIndex;

    while (scanIndex < this.tokens.length) {
      const token = this.tokens[scanIndex];
      if (!token) break;
      if (
        scanIndex > this.tokenIndex &&
        (token.kind === 'declarationOpen' ||
          token.kind === 'conditionalSectionOpen')
      ) {
        break;
      }
      scanIndex += 1;
      endOffset = token.range.end.offset;
      if (token.kind === 'greaterThan') break;
    }

    this.report(
      'unsupported-declaration',
      message,
      this.sourceMap.range(openToken.range.start.offset, endOffset),
    );
    this.tokenIndex = Math.max(scanIndex, this.tokenIndex + 1);
  }

  private consumeUnsupportedConditionalSection(
    openToken: DtdToken,
    message: string,
  ): void {
    const sectionEnd = this.sourceMap.sourceText.indexOf(
      ']]>',
      openToken.range.end.offset,
    );
    const endOffset =
      sectionEnd < 0 ? this.sourceMap.sourceText.length : sectionEnd + 3;

    while (
      this.currentToken() &&
      (this.currentToken()?.range.end.offset ?? 0) <= endOffset
    ) {
      this.consumeToken();
    }

    this.report(
      'unsupported-declaration',
      message,
      this.sourceMap.range(openToken.range.start.offset, endOffset),
    );
  }

  private recoverMalformedDeclaration(
    openToken: DtdToken,
    diagnosticStart: number,
    declarationLabel = '<!ELEMENT declaration',
  ): void {
    let closed = false;

    while (this.currentToken()) {
      const token = this.currentToken();
      if (!token) break;
      if (
        token.kind === 'declarationOpen' ||
        token.kind === 'conditionalSectionOpen'
      ) {
        break;
      }
      this.consumeToken();
      if (token.kind === 'greaterThan') {
        closed = true;
        break;
      }
    }

    if (!closed) {
      const endOffset =
        this.currentToken()?.range.start.offset ??
        this.sourceMap.sourceText.length;
      if (
        !this.diagnostics
          .slice(diagnosticStart)
          .some(({ code }) => code === 'unterminated-declaration')
      ) {
        this.report(
          'unterminated-declaration',
          `Expected ">" to close the ${declarationLabel}`,
          this.sourceMap.range(openToken.range.start.offset, endOffset),
        );
      }
      if (
        !this.currentToken() &&
        !this.diagnostics
          .slice(diagnosticStart)
          .some(({ code }) => code === 'unexpected-end-of-input')
      ) {
        this.report(
          'unexpected-end-of-input',
          `The input ended before the ${declarationLabel} was complete`,
          this.eofRange(),
        );
      }
    }
  }

  private canStartParticle(token: DtdToken): boolean {
    return token.kind === 'name' || token.kind === 'leftParenthesis';
  }

  private isOccurrenceToken(
    token: DtdToken | undefined,
  ): token is DtdToken & { readonly kind: 'question' | 'star' | 'plus' } {
    return (
      token?.kind === 'question' ||
      token?.kind === 'star' ||
      token?.kind === 'plus'
    );
  }

  private currentToken(): DtdToken | undefined {
    return this.tokens[this.tokenIndex];
  }

  private consumeToken(): DtdToken | undefined {
    const token = this.currentToken();
    if (token) this.tokenIndex += 1;
    return token;
  }

  private eofRange(): DtdSourceRange {
    const endOffset = this.sourceMap.sourceText.length;
    return this.sourceMap.range(endOffset, endOffset);
  }

  private report(
    code: DtdParseDiagnosticCode,
    message: string,
    range: DtdSourceRange,
  ): void {
    this.diagnostics.push(createDtdParseDiagnostic(code, message, range));
  }
}

/**
 * Parses DTD <!ELEMENT ...> declarations without mutating the input or the
 * application's normalized schema model. Ordinary malformed input is reported
 * through structured diagnostics rather than thrown exceptions.
 */
export function parseDtdElementDeclarations(
  sourceText: string,
  sourceId?: string,
): DtdElementParseResult {
  const lexicalResult = lexDtdElementDeclarations(sourceText, sourceId);
  const parser = new DtdParser(
    lexicalResult.tokens,
    lexicalResult.sourceMap,
    'elementOnly',
  );
  parser.parse();

  const diagnostics = [
    ...lexicalResult.diagnostics,
    ...parser.diagnostics,
  ].sort(
    (left, right) =>
      left.range.start.offset - right.range.start.offset ||
      left.range.end.offset - right.range.end.offset,
  );

  return {
    declarations: parser.declarations.filter(
      (declaration): declaration is DtdElementDeclarationAst =>
        declaration.kind === 'elementDeclaration',
    ),
    comments: lexicalResult.comments,
    diagnostics,
  };
}

/**
 * Parses supported DTD markup declarations into one source-ordered AST without
 * mutating the input or depending on the application's normalized model.
 */
export function parseDtdDeclarations(
  sourceText: string,
  sourceId?: string,
): DtdDeclarationParseResult {
  const constructs = parseExtendedDtdConstructs(sourceText, sourceId);
  const structuralSource = [...sourceText];
  const mask = (start: number, end: number) => {
    for (let offset = start; offset < end; offset += 1) {
      if (
        structuralSource[offset] !== '\r' &&
        structuralSource[offset] !== '\n'
      ) {
        structuralSource[offset] = ' ';
      }
    }
  };
  for (const construct of constructs) {
    if (construct.kind !== 'conditionalSection') continue;
    if (construct.mode !== 'include') {
      mask(construct.range.start.offset, construct.range.end.offset);
      continue;
    }
    const contentStart =
      sourceText.indexOf('[', construct.range.start.offset + 3) + 1;
    const contentEnd = construct.range.end.offset - 3;
    mask(construct.range.start.offset, contentStart);
    mask(contentEnd, construct.range.end.offset);
  }
  const lexicalResult = lexDtdElementDeclarations(
    structuralSource.join(''),
    sourceId,
  );
  const parser = new DtdParser(
    expandInternalParameterEntityTokens(
      lexicalResult.tokens,
      constructs,
      sourceId,
    ),
    lexicalResult.sourceMap,
    'all',
  );
  parser.parse();

  const extractedRanges = constructs.map(({ range }) => range);
  const isCoveredByExtendedExtraction = (diagnostic: DtdParseDiagnostic) =>
    extractedRanges.some(
      (range) =>
        diagnostic.range.start.offset >= range.start.offset &&
        diagnostic.range.end.offset <= range.end.offset,
    );

  const diagnostics = [...lexicalResult.diagnostics, ...parser.diagnostics]
    .filter((diagnostic) => !isCoveredByExtendedExtraction(diagnostic))
    .sort(
      (left, right) =>
        left.range.start.offset - right.range.start.offset ||
        left.range.end.offset - right.range.end.offset,
    );

  return {
    declarations: parser.declarations,
    comments: lexicalResult.comments,
    constructs,
    diagnostics,
  };
}
