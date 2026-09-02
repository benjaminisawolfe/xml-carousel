import type { SchemaSourceRange } from '../model';
import {
  createXsdSourceMap,
  xmlNamespaceUri,
  type XsdXmlAttributeAst,
  type XsdXmlDocumentAst,
  type XsdXmlElementAst,
  type XsdXmlNodeAst,
  type XsdXmlTextAst,
} from '../xsd';
import {
  relaxNgCompatibilityAnnotationsNamespace,
  relaxNgStructureNamespace,
} from './relaxNgSemanticModel';

export type RelaxNgCompactDiagnosticKind = 'lexical' | 'syntax' | 'translation';

export interface RelaxNgCompactDiagnostic {
  readonly kind: RelaxNgCompactDiagnosticKind;
  readonly code: string;
  readonly message: string;
  readonly range: SchemaSourceRange;
}

export interface RelaxNgCompactGeneratedSource {
  readonly xml: string;
  readonly lineRanges: Readonly<Record<number, SchemaSourceRange>>;
}

export interface RelaxNgCompactParseResult {
  readonly document?: XsdXmlDocumentAst;
  readonly diagnostics: readonly RelaxNgCompactDiagnostic[];
  readonly generated?: RelaxNgCompactGeneratedSource;
}

type TokenKind =
  'identifier' | 'string' | 'punctuation' | 'documentation' | 'eof';

interface Token {
  readonly kind: TokenKind;
  readonly value: string;
  readonly raw: string;
  readonly start: number;
  readonly end: number;
  readonly contentStart: number;
  readonly contentEnd: number;
  readonly escaped?: boolean;
}

interface Literal {
  readonly value: string;
  readonly raw: string;
  readonly range: SchemaSourceRange;
  readonly contentRange: SchemaSourceRange;
  readonly start: number;
  readonly end: number;
}

interface MutableElement {
  readonly localName: string;
  readonly qualifiedName: string;
  readonly namespaceUri?: string;
  readonly attributes: MutableAttribute[];
  readonly children: MutableNode[];
  readonly range: SchemaSourceRange;
  readonly start: number;
  readonly end: number;
}

interface MutableAttribute {
  readonly qualifiedName: string;
  readonly localName: string;
  readonly prefix?: string;
  readonly namespaceUri?: string;
  readonly value: string;
  readonly rawValue: string;
  readonly range: SchemaSourceRange;
  readonly nameRange: SchemaSourceRange;
  readonly valueRange: SchemaSourceRange;
  readonly valueContentRange: SchemaSourceRange;
  readonly start: number;
}

interface MutableText {
  readonly kind: 'text';
  readonly value: string;
  readonly raw: string;
  readonly range: SchemaSourceRange;
  readonly start: number;
}

type MutableNode = MutableElement | MutableText;

const punctuation = new Set([
  '=',
  '{',
  '}',
  '[',
  ']',
  '(',
  ')',
  ',',
  '|',
  '&',
  '?',
  '*',
  '+',
  '-',
  '~',
  ':',
]);
const maxCompactTokens = 250_000;
const maxCompactPatternDepth = 256;

function isIdentifierStart(character: string | undefined): boolean {
  return character !== undefined && /[\p{L}_]/u.test(character);
}

function isIdentifierContinue(character: string | undefined): boolean {
  return character !== undefined && /[\p{L}\p{N}_.-]/u.test(character);
}

function decodedEscape(
  sourceText: string,
  offset: number,
): { value: string; end: number } | undefined {
  if (sourceText[offset] !== '\\') return undefined;
  if (sourceText[offset + 1] === 'x' && sourceText[offset + 2] === '{') {
    const close = sourceText.indexOf('}', offset + 3);
    if (close < 0) return undefined;
    const digits = sourceText.slice(offset + 3, close);
    if (!/^[0-9a-f]+$/iu.test(digits)) return undefined;
    const codePoint = Number.parseInt(digits, 16);
    if (codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff))
      return undefined;
    return { value: String.fromCodePoint(codePoint), end: close + 1 };
  }
  const next = sourceText[offset + 1];
  return next === undefined ? undefined : { value: next, end: offset + 2 };
}

function lexCompactSyntax(
  sourceText: string,
  sourceFileId: string,
): {
  tokens: Token[];
  diagnostics: RelaxNgCompactDiagnostic[];
} {
  const sourceMap = createXsdSourceMap(sourceText, sourceFileId);
  const tokens: Token[] = [];
  const diagnostics: RelaxNgCompactDiagnostic[] = [];
  let offset = sourceText.charCodeAt(0) === 0xfeff ? 1 : 0;

  const diagnostic = (
    code: string,
    message: string,
    start: number,
    end: number,
  ) => {
    diagnostics.push({
      kind: 'lexical',
      code,
      message,
      range: sourceMap.range(start, end),
    });
  };

  while (offset < sourceText.length) {
    if (tokens.length >= maxCompactTokens) {
      diagnostic(
        'rnc:token-limit',
        `Compact Syntax exceeds the ${maxCompactTokens.toLocaleString('en-US')} token safety limit.`,
        offset,
        offset,
      );
      break;
    }
    const character = sourceText[offset]!;
    if (/\s/u.test(character)) {
      offset += 1;
      continue;
    }
    if (character === '#') {
      const start = offset;
      const documentation = sourceText[offset + 1] === '#';
      offset += documentation ? 2 : 1;
      const contentStart = offset;
      while (
        offset < sourceText.length &&
        sourceText[offset] !== '\r' &&
        sourceText[offset] !== '\n'
      )
        offset += 1;
      if (documentation) {
        tokens.push({
          kind: 'documentation',
          value: sourceText.slice(contentStart, offset).replace(/^\s?/u, ''),
          raw: sourceText.slice(start, offset),
          start,
          end: offset,
          contentStart,
          contentEnd: offset,
        });
      }
      continue;
    }
    if (
      sourceText.startsWith('>>', offset) ||
      sourceText.startsWith('|=', offset) ||
      sourceText.startsWith('&=', offset)
    ) {
      tokens.push({
        kind: 'punctuation',
        value: sourceText.slice(offset, offset + 2),
        raw: sourceText.slice(offset, offset + 2),
        start: offset,
        end: offset + 2,
        contentStart: offset,
        contentEnd: offset + 2,
      });
      offset += 2;
      continue;
    }
    if (character === "'" || character === '"') {
      const start = offset;
      const triple =
        sourceText.slice(offset, offset + 3) === character.repeat(3);
      const delimiter = triple ? character.repeat(3) : character;
      offset += delimiter.length;
      const contentStart = offset;
      let value = '';
      let terminated = false;
      while (offset < sourceText.length) {
        if (sourceText.startsWith(delimiter, offset)) {
          const contentEnd = offset;
          offset += delimiter.length;
          tokens.push({
            kind: 'string',
            value,
            raw: sourceText.slice(start, offset),
            start,
            end: offset,
            contentStart,
            contentEnd,
          });
          terminated = true;
          break;
        }
        const escape = decodedEscape(sourceText, offset);
        if (escape) {
          value += escape.value;
          offset = escape.end;
        } else {
          if (
            !triple &&
            (sourceText[offset] === '\r' || sourceText[offset] === '\n')
          )
            break;
          value += sourceText[offset]!;
          offset += 1;
        }
      }
      if (!terminated) {
        diagnostic(
          'rnc:unterminated-literal',
          'Compact Syntax literal is not terminated.',
          start,
          Math.max(offset, start + 1),
        );
      }
      continue;
    }
    if (punctuation.has(character)) {
      tokens.push({
        kind: 'punctuation',
        value: character,
        raw: character,
        start: offset,
        end: offset + 1,
        contentStart: offset,
        contentEnd: offset + 1,
      });
      offset += 1;
      continue;
    }
    const escaped = character === '\\';
    const start = offset;
    if (escaped) offset += 1;
    if (isIdentifierStart(sourceText[offset])) {
      offset += 1;
      while (isIdentifierContinue(sourceText[offset])) offset += 1;
      tokens.push({
        kind: 'identifier',
        value: sourceText.slice(start + (escaped ? 1 : 0), offset),
        raw: sourceText.slice(start, offset),
        start,
        end: offset,
        contentStart: start + (escaped ? 1 : 0),
        contentEnd: offset,
        escaped,
      });
      continue;
    }
    diagnostic(
      'rnc:unexpected-character',
      `Unexpected Compact Syntax character ${JSON.stringify(character)}.`,
      start,
      start + 1,
    );
    offset += 1;
  }
  tokens.push({
    kind: 'eof',
    value: '',
    raw: '',
    start: sourceText.length,
    end: sourceText.length,
    contentStart: sourceText.length,
    contentEnd: sourceText.length,
  });
  return { tokens, diagnostics };
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;');
}

class CompactParser {
  private index = 0;
  private patternDepth = 0;
  private readonly sourceMap;
  readonly diagnostics: RelaxNgCompactDiagnostic[];
  private readonly namespaceBindings: Record<string, string> = {
    a: relaxNgCompatibilityAnnotationsNamespace,
  };
  private readonly datatypeBindings: Record<string, string> = {};
  private defaultNamespace = '';

  constructor(
    private readonly sourceText: string,
    private readonly sourceFileId: string,
    private readonly tokens: readonly Token[],
    lexicalDiagnostics: readonly RelaxNgCompactDiagnostic[],
  ) {
    this.sourceMap = createXsdSourceMap(sourceText, sourceFileId);
    this.diagnostics = [...lexicalDiagnostics];
  }

  parse(): XsdXmlDocumentAst | undefined {
    this.parseDeclarations();
    const metadata = this.parseInitialAnnotations();
    let root: MutableElement | undefined;
    if (this.looksLikeGrammarComponent()) {
      const start = metadata.start ?? this.current().start;
      const children = this.parseGrammarComponents(undefined);
      root = this.element(
        'grammar',
        start,
        this.previousEnd(),
        [],
        [...metadata.nodes, ...children],
      );
    } else if (!this.at('eof')) {
      root = this.parsePattern(metadata);
    }
    if (!root) {
      this.syntax(
        'rnc:expected-pattern',
        'Expected a Compact Syntax pattern.',
        this.current(),
      );
      return undefined;
    }
    if (this.defaultNamespace.length > 0) {
      root.attributes.unshift(
        this.attributeAt('ns', this.defaultNamespace, root.start, root.start),
      );
    }
    if (!this.at('eof'))
      this.syntax(
        'rnc:unexpected-token',
        `Unexpected token ${JSON.stringify(this.current().raw)} after the root pattern.`,
        this.current(),
      );
    const namespaceBindings = { ...this.namespaceBindings };
    const projected = this.projectElement(root, namespaceBindings);
    return {
      kind: 'document',
      children: [projected],
      root: projected,
      range: this.sourceMap.range(0, this.sourceText.length),
    };
  }

  bindings(): Readonly<Record<string, string>> {
    return { ...this.namespaceBindings };
  }

  private current(offset = 0): Token {
    return this.tokens[Math.min(this.index + offset, this.tokens.length - 1)]!;
  }

  private at(value: string, offset = 0): boolean {
    const token = this.current(offset);
    return token.kind === value || (!token.escaped && token.value === value);
  }

  private take(): Token {
    const token = this.current();
    if (token.kind !== 'eof') this.index += 1;
    return token;
  }

  private takeIf(value: string): Token | undefined {
    return this.at(value) ? this.take() : undefined;
  }

  private previousEnd(): number {
    return this.tokens[Math.max(0, this.index - 1)]?.end ?? 0;
  }

  private syntax(code: string, message: string, token: Token): void {
    this.diagnostics.push({
      kind: 'syntax',
      code,
      message,
      range: this.sourceMap.range(token.start, token.end),
    });
  }

  private expect(value: string, message: string): Token {
    if (this.at(value)) return this.take();
    const token = this.current();
    this.syntax('rnc:expected-token', message, token);
    return token;
  }

  private identifier(message = 'Expected an identifier.'): Token {
    const token = this.current();
    if (token.kind === 'identifier') {
      this.take();
      return token;
    }
    this.syntax('rnc:expected-identifier', message, token);
    if (!this.at('eof')) this.take();
    return token;
  }

  private qName(): { value: string; start: number; end: number; token: Token } {
    const first = this.identifier();
    if (this.takeIf(':')) {
      const second = this.identifier(
        'Expected a local name after the namespace prefix.',
      );
      return {
        value: `${first.value}:${second.value}`,
        start: first.start,
        end: second.end,
        token: first,
      };
    }
    return {
      value: first.value,
      start: first.start,
      end: first.end,
      token: first,
    };
  }

  private literal(): Literal {
    const first = this.current();
    if (first.kind !== 'string') {
      this.syntax(
        'rnc:expected-literal',
        'Expected a Compact Syntax literal.',
        first,
      );
      if (!this.at('eof')) this.take();
      return {
        value: '',
        raw: '',
        range: this.sourceMap.range(first.start, first.end),
        contentRange: this.sourceMap.range(first.start, first.end),
        start: first.start,
        end: first.end,
      };
    }
    this.take();
    let value = first.value;
    let raw = first.raw;
    let end = first.end;
    while (this.takeIf('~')) {
      const segment = this.current();
      if (segment.kind !== 'string') {
        this.syntax(
          'rnc:expected-literal-segment',
          'Expected a literal segment after ~.',
          segment,
        );
        break;
      }
      this.take();
      value += segment.value;
      raw += this.sourceText.slice(end, segment.start) + segment.raw;
      end = segment.end;
    }
    return {
      value,
      raw,
      range: this.sourceMap.range(first.start, end),
      contentRange: this.sourceMap.range(
        first.contentStart,
        end === first.end ? first.contentEnd : end,
      ),
      start: first.start,
      end,
    };
  }

  private parseDeclarations(): void {
    while (true) {
      if (this.at('namespace')) {
        this.take();
        const prefix = this.identifier('Expected a namespace prefix.');
        this.expect('=', 'Expected = in namespace declaration.');
        const value = this.at('inherit')
          ? (this.take(), '')
          : this.literal().value;
        this.namespaceBindings[prefix.value] = value;
      } else if (this.at('default') && this.at('namespace', 1)) {
        this.take();
        this.take();
        if (!this.at('='))
          this.identifier(
            'Expected an optional default namespace prefix or =.',
          );
        this.expect('=', 'Expected = in default namespace declaration.');
        this.defaultNamespace = this.at('inherit')
          ? (this.take(), '')
          : this.literal().value;
      } else if (this.at('datatypes')) {
        this.take();
        const prefix = this.identifier('Expected a datatype prefix.');
        this.expect('=', 'Expected = in datatypes declaration.');
        this.datatypeBindings[prefix.value] = this.literal().value;
      } else {
        break;
      }
    }
  }

  private parseInitialAnnotations(): {
    nodes: MutableNode[];
    attributes: MutableAttribute[];
    start?: number;
  } {
    const nodes: MutableNode[] = [];
    const attributes: MutableAttribute[] = [];
    let start: number | undefined;
    while (this.at('documentation') || this.at('[')) {
      start ??= this.current().start;
      if (this.at('documentation')) {
        const token = this.take();
        const text: MutableText = {
          kind: 'text',
          value: token.value,
          raw: token.raw,
          range: this.sourceMap.range(token.contentStart, token.contentEnd),
          start: token.start,
        };
        nodes.push(
          this.element(
            'documentation',
            token.start,
            token.end,
            [],
            [text],
            'a',
            relaxNgCompatibilityAnnotationsNamespace,
          ),
        );
      } else {
        this.parseAnnotationBlock(nodes, attributes);
      }
    }
    return { nodes, attributes, ...(start === undefined ? {} : { start }) };
  }

  private parseAnnotationBlock(
    nodes: MutableNode[],
    attributes: MutableAttribute[],
  ): void {
    this.expect('[', 'Expected [ to begin an annotation.');
    while (!this.at(']') && !this.at('eof')) {
      if (this.current().kind === 'string') {
        nodes.push(this.text(this.literal()));
        continue;
      }
      const name = this.qName();
      if (this.takeIf('=')) {
        const value = this.literal();
        attributes.push(
          this.attribute(name.value, value.value, name.start, value.end, value),
        );
      } else if (this.at('[')) {
        const childNodes: MutableNode[] = [];
        const childAttributes: MutableAttribute[] = [];
        const start = name.start;
        this.parseAnnotationBlock(childNodes, childAttributes);
        const split = this.splitQName(name.value);
        nodes.push(
          this.element(
            split.localName,
            start,
            this.previousEnd(),
            childAttributes,
            childNodes,
            split.prefix,
            this.namespaceBindings[split.prefix ?? ''],
          ),
        );
      } else {
        this.syntax(
          'rnc:malformed-annotation',
          'Expected = or [ after an annotation name.',
          this.current(),
        );
        if (!this.at('eof')) this.take();
      }
    }
    this.expect(']', 'Expected ] to end the annotation.');
  }

  private applyFollowingAnnotations(owner: MutableElement): MutableElement {
    while (this.takeIf('>>')) {
      const name = this.qName();
      const children: MutableNode[] = [];
      const attributes: MutableAttribute[] = [];
      if (this.at('[')) this.parseAnnotationBlock(children, attributes);
      else
        this.syntax(
          'rnc:expected-following-annotation',
          'Expected an annotation element after >>.',
          this.current(),
        );
      const split = this.splitQName(name.value);
      owner.children.push(
        this.element(
          split.localName,
          name.start,
          this.previousEnd(),
          attributes,
          children,
          split.prefix,
          this.namespaceBindings[split.prefix ?? ''],
        ),
      );
    }
    return owner;
  }

  private looksLikeGrammarComponent(): boolean {
    if (this.at('start') || this.at('include') || this.at('div')) return true;
    if (this.current().kind !== 'identifier') return false;
    let offset = 1;
    if (this.at(':', offset)) offset += 2;
    return ['=', '|=', '&='].includes(this.current(offset).value);
  }

  private parseGrammarComponents(stop: '}' | undefined): MutableElement[] {
    const children: MutableElement[] = [];
    while (!this.at('eof') && (stop === undefined || !this.at(stop))) {
      const metadata = this.parseInitialAnnotations();
      const start = metadata.start ?? this.current().start;
      if (this.at('include')) {
        this.take();
        const href = this.literal();
        const attributes = [
          ...metadata.attributes,
          this.attribute('href', href.value, href.start, href.end, href),
        ];
        this.parseInherit(attributes);
        const overrideBlock = this.takeIf('{') !== undefined;
        const overrides = overrideBlock ? this.parseGrammarComponents('}') : [];
        if (overrideBlock)
          this.expect('}', 'Expected } after include overrides.');
        children.push(
          this.applyFollowingAnnotations(
            this.element('include', start, this.previousEnd(), attributes, [
              ...metadata.nodes,
              ...overrides,
            ]),
          ),
        );
      } else if (this.at('div')) {
        this.take();
        this.expect('{', 'Expected { after div.');
        const contents = this.parseGrammarComponents('}');
        this.expect('}', 'Expected } after div.');
        children.push(
          this.applyFollowingAnnotations(
            this.element(
              'div',
              start,
              this.previousEnd(),
              metadata.attributes,
              [...metadata.nodes, ...contents],
            ),
          ),
        );
      } else if (this.at('start') || this.current().kind === 'identifier') {
        const name = this.take();
        const operator = this.current();
        if (!['=', '|=', '&='].includes(operator.value)) {
          this.syntax(
            'rnc:expected-definition-operator',
            'Expected =, |=, or &= in a grammar definition.',
            operator,
          );
          if (!this.at('eof')) this.take();
          continue;
        }
        this.take();
        const pattern = this.parsePattern(this.parseInitialAnnotations());
        const attributes = [...metadata.attributes];
        if (name.value !== 'start')
          attributes.push(this.attributeFromToken('name', name.value, name));
        if (operator.value !== '=')
          attributes.push(
            this.attributeFromToken(
              'combine',
              operator.value === '|=' ? 'choice' : 'interleave',
              operator,
            ),
          );
        children.push(
          this.applyFollowingAnnotations(
            this.element(
              name.value === 'start' ? 'start' : 'define',
              start,
              pattern?.end ?? this.previousEnd(),
              attributes,
              [...metadata.nodes, ...(pattern ? [pattern] : [])],
            ),
          ),
        );
      } else {
        this.syntax(
          'rnc:expected-grammar-component',
          'Expected start, definition, include, or div.',
          this.current(),
        );
        if (!this.at('eof')) this.take();
      }
    }
    return children;
  }

  private parsePattern(
    metadata = this.parseInitialAnnotations(),
  ): MutableElement | undefined {
    if (this.patternDepth >= maxCompactPatternDepth) {
      this.syntax(
        'rnc:nesting-limit',
        `Compact Syntax exceeds the ${maxCompactPatternDepth} level pattern nesting limit.`,
        this.current(),
      );
      return undefined;
    }
    this.patternDepth += 1;
    try {
      return this.parsePatternInner(metadata);
    } finally {
      this.patternDepth -= 1;
    }
  }

  private parsePatternInner(
    metadata: ReturnType<CompactParser['parseInitialAnnotations']>,
  ): MutableElement | undefined {
    const first = this.parsePostfix(metadata);
    if (!first) return undefined;
    const operator = this.current().value;
    if (!['|', ',', '&'].includes(operator))
      return this.applyFollowingAnnotations(first);
    const localName =
      operator === '|' ? 'choice' : operator === ',' ? 'group' : 'interleave';
    const children = [first];
    const start = first.start;
    while (this.at(operator)) {
      this.take();
      const next = this.parsePostfix(this.parseInitialAnnotations());
      if (next) children.push(next);
    }
    if (
      ['|', ',', '&'].includes(this.current().value) &&
      this.current().value !== operator
    ) {
      this.syntax(
        'rnc:mixed-binary-operators',
        'Compact Syntax binary operators cannot be mixed without explicit parentheses.',
        this.current(),
      );
    }
    return this.applyFollowingAnnotations(
      this.element(
        localName,
        start,
        children[children.length - 1]?.end ?? first.end,
        [],
        children,
      ),
    );
  }

  private parsePostfix(
    metadata: ReturnType<CompactParser['parseInitialAnnotations']>,
  ): MutableElement | undefined {
    let pattern = this.parsePrimaryPattern(metadata);
    if (!pattern) return undefined;
    const postfix = this.current();
    const localName =
      postfix.value === '?'
        ? 'optional'
        : postfix.value === '*'
          ? 'zeroOrMore'
          : postfix.value === '+'
            ? 'oneOrMore'
            : undefined;
    if (localName) {
      this.take();
      pattern = this.element(
        localName,
        pattern.start,
        postfix.end,
        [],
        [pattern],
      );
    }
    return pattern;
  }

  private parsePrimaryPattern(
    metadata: ReturnType<CompactParser['parseInitialAnnotations']>,
  ): MutableElement | undefined {
    const token = this.current();
    const start = metadata.start ?? token.start;
    const wrap = (element: MutableElement) => {
      element.children.unshift(...metadata.nodes);
      element.attributes.unshift(...metadata.attributes);
      return element;
    };
    if (this.takeIf('(')) {
      const pattern = this.parsePattern(metadata);
      this.expect(')', 'Expected ) after the parenthesized pattern.');
      return pattern;
    }
    if (this.at('element') || this.at('attribute')) {
      const keyword = this.take();
      const nameClass = this.parseNameClass();
      this.expect('{', `Expected { after ${keyword.value} name class.`);
      const content = this.parsePattern(this.parseInitialAnnotations());
      this.expect('}', `Expected } after ${keyword.value} pattern.`);
      return wrap(
        this.element(
          keyword.value,
          start,
          this.previousEnd(),
          [],
          [nameClass, ...(content ? [content] : [])],
        ),
      );
    }
    if (this.at('list') || this.at('mixed')) {
      const keyword = this.take();
      this.expect('{', `Expected { after ${keyword.value}.`);
      const child = this.parsePattern(this.parseInitialAnnotations());
      this.expect('}', `Expected } after ${keyword.value}.`);
      return wrap(
        this.element(
          keyword.value,
          start,
          this.previousEnd(),
          [],
          child ? [child] : [],
        ),
      );
    }
    if (this.at('grammar')) {
      this.take();
      this.expect('{', 'Expected { after grammar.');
      const children = this.parseGrammarComponents('}');
      this.expect('}', 'Expected } after grammar.');
      return wrap(
        this.element('grammar', start, this.previousEnd(), [], children),
      );
    }
    if (this.at('external')) {
      this.take();
      const href = this.literal();
      const attributes = [
        this.attribute('href', href.value, href.start, href.end, href),
      ];
      this.parseInherit(attributes);
      return wrap(
        this.element('externalRef', start, this.previousEnd(), attributes, []),
      );
    }
    if (this.at('parent')) {
      this.take();
      const name = this.identifier('Expected a definition name after parent.');
      return wrap(
        this.element(
          'parentRef',
          start,
          name.end,
          [this.attributeFromToken('name', name.value, name)],
          [],
        ),
      );
    }
    if (['empty', 'text', 'notAllowed'].includes(token.value)) {
      this.take();
      return wrap(this.element(token.value, start, token.end, [], []));
    }
    if (token.kind === 'string') {
      const literal = this.literal();
      return wrap(this.valueElement(start, literal, 'token', ''));
    }
    if (token.kind === 'identifier') {
      const qname = this.qName();
      const datatypeLibrary = this.datatypeLibraryFor(qname.value);
      const datatypeType = this.localPart(qname.value);
      if (this.current().kind === 'string') {
        const literal = this.literal();
        return wrap(
          this.valueElement(start, literal, datatypeType, datatypeLibrary),
        );
      }
      if (
        qname.value === 'string' ||
        qname.value === 'token' ||
        qname.value.includes(':') ||
        this.at('{') ||
        this.at('-')
      ) {
        const attributes = [
          this.attributeAt('type', datatypeType, qname.start, qname.end),
        ];
        if (datatypeLibrary)
          attributes.push(
            this.attributeAt(
              'datatypeLibrary',
              datatypeLibrary,
              qname.start,
              qname.end,
            ),
          );
        const children: MutableNode[] = [];
        if (this.takeIf('{')) {
          while (!this.at('}') && !this.at('eof')) {
            const name = this.identifier('Expected a datatype parameter name.');
            this.expect('=', 'Expected = in datatype parameter.');
            const value = this.literal();
            children.push(
              this.element(
                'param',
                name.start,
                value.end,
                [this.attributeFromToken('name', name.value, name)],
                [this.text(value)],
              ),
            );
          }
          this.expect('}', 'Expected } after datatype parameters.');
        }
        if (this.takeIf('-')) {
          const except = this.parsePrimaryPattern(
            this.parseInitialAnnotations(),
          );
          if (except)
            children.push(
              this.element('except', except.start, except.end, [], [except]),
            );
        }
        return wrap(
          this.element('data', start, this.previousEnd(), attributes, children),
        );
      }
      return wrap(
        this.element(
          'ref',
          start,
          qname.end,
          [this.attributeAt('name', qname.value, qname.start, qname.end)],
          [],
        ),
      );
    }
    this.syntax(
      'rnc:expected-primary-pattern',
      'Expected a Compact Syntax primary pattern.',
      token,
    );
    if (!this.at('eof')) this.take();
    return undefined;
  }

  private parseNameClass(): MutableElement {
    const start = this.current().start;
    const children = [this.parseNameClassPrimary()];
    while (this.takeIf('|')) children.push(this.parseNameClassPrimary());
    return children.length === 1
      ? children[0]!
      : this.element(
          'choice',
          start,
          children[children.length - 1]!.end,
          [],
          children,
        );
  }

  private parseNameClassPrimary(): MutableElement {
    const start = this.current().start;
    let result: MutableElement;
    if (this.takeIf('(')) {
      result = this.parseNameClass();
      this.expect(')', 'Expected ) after the name class.');
    } else if (this.takeIf('*')) {
      result = this.element('anyName', start, this.previousEnd(), [], []);
    } else {
      const first = this.identifier('Expected a name class.');
      if (this.takeIf(':')) {
        if (this.takeIf('*')) {
          const ns = this.namespaceBindings[first.value] ?? '';
          result = this.element(
            'nsName',
            start,
            this.previousEnd(),
            [this.attributeAt('ns', ns, first.start, first.end)],
            [],
          );
        } else {
          const second = this.identifier(
            'Expected a local name after the namespace prefix.',
          );
          result = this.nameElement(
            `${first.value}:${second.value}`,
            start,
            second.end,
          );
        }
      } else {
        result = this.nameElement(first.value, start, first.end);
      }
    }
    if (this.takeIf('-')) {
      const except = this.parseNameClassPrimary();
      result.children.push(
        this.element('except', except.start, except.end, [], [except]),
      );
      return {
        ...result,
        end: except.end,
        range: this.sourceMap.range(start, except.end),
      };
    }
    return result;
  }

  private parseInherit(attributes: MutableAttribute[]): void {
    if (!this.takeIf('inherit')) return;
    this.expect('=', 'Expected = after inherit.');
    const prefix = this.identifier(
      'Expected a namespace prefix after inherit =.',
    );
    attributes.push(
      this.attributeFromToken(
        'ns',
        this.namespaceBindings[prefix.value] ?? '',
        prefix,
      ),
    );
  }

  private nameElement(
    value: string,
    start: number,
    end: number,
  ): MutableElement {
    const literal: Literal = {
      value,
      raw: this.sourceText.slice(start, end),
      range: this.sourceMap.range(start, end),
      contentRange: this.sourceMap.range(start, end),
      start,
      end,
    };
    return this.element('name', start, end, [], [this.text(literal)]);
  }

  private valueElement(
    start: number,
    literal: Literal,
    type: string,
    datatypeLibrary: string,
  ): MutableElement {
    const attributes = [this.attributeAt('type', type, start, literal.start)];
    if (datatypeLibrary)
      attributes.push(
        this.attributeAt(
          'datatypeLibrary',
          datatypeLibrary,
          start,
          literal.start,
        ),
      );
    return this.element('value', start, literal.end, attributes, [
      this.text(literal),
    ]);
  }

  private datatypeLibraryFor(qname: string): string {
    const separator = qname.indexOf(':');
    return separator < 0
      ? ''
      : (this.datatypeBindings[qname.slice(0, separator)] ?? '');
  }

  private localPart(qname: string): string {
    const separator = qname.indexOf(':');
    return separator < 0 ? qname : qname.slice(separator + 1);
  }

  private splitQName(qname: string): { prefix?: string; localName: string } {
    const separator = qname.indexOf(':');
    return separator < 0
      ? { localName: qname }
      : {
          prefix: qname.slice(0, separator),
          localName: qname.slice(separator + 1),
        };
  }

  private text(literal: Literal): MutableText {
    return {
      kind: 'text',
      value: literal.value,
      raw: literal.raw,
      range: literal.range,
      start: literal.start,
    };
  }

  private attributeFromToken(
    name: string,
    value: string,
    token: Token,
  ): MutableAttribute {
    return this.attributeAt(
      name,
      value,
      token.start,
      token.end,
      token.raw,
      this.sourceMap.range(token.contentStart, token.contentEnd),
    );
  }

  private attribute(
    name: string,
    value: string,
    start: number,
    end: number,
    literal: Literal,
  ): MutableAttribute {
    return this.attributeAt(
      name,
      value,
      start,
      end,
      literal.raw,
      literal.contentRange,
    );
  }

  private attributeAt(
    name: string,
    value: string,
    start: number,
    end: number,
    rawValue = this.sourceText.slice(start, end),
    valueContentRange = this.sourceMap.range(start, end),
  ): MutableAttribute {
    const split = this.splitQName(name);
    return {
      qualifiedName: name,
      localName: split.localName,
      ...(split.prefix === undefined
        ? {}
        : {
            prefix: split.prefix,
            namespaceUri:
              split.prefix === 'xml'
                ? xmlNamespaceUri
                : this.namespaceBindings[split.prefix],
          }),
      value,
      rawValue,
      range: this.sourceMap.range(start, end),
      nameRange: this.sourceMap.range(
        start,
        Math.min(end, start + name.length),
      ),
      valueRange: this.sourceMap.range(start, end),
      valueContentRange,
      start,
    };
  }

  private element(
    localName: string,
    start: number,
    end: number,
    attributes: MutableAttribute[],
    children: MutableNode[],
    prefix?: string,
    namespaceUri = relaxNgStructureNamespace,
  ): MutableElement {
    return {
      localName,
      qualifiedName: prefix ? `${prefix}:${localName}` : localName,
      namespaceUri,
      attributes,
      children,
      range: this.sourceMap.range(start, end),
      start,
      end,
    };
  }

  private projectElement(
    element: MutableElement,
    namespaceBindings: Readonly<Record<string, string>>,
  ): XsdXmlElementAst {
    const children: XsdXmlNodeAst[] = element.children.map((child) =>
      'kind' in child
        ? ({
            kind: 'text',
            raw: child.raw,
            value: child.value,
            range: child.range,
            sourceOrder: child.start * 10 + 2,
          } satisfies XsdXmlTextAst)
        : this.projectElement(child, namespaceBindings),
    );
    const attributes: XsdXmlAttributeAst[] = element.attributes.map(
      (attribute) => ({
        qualifiedName: attribute.qualifiedName,
        ...(attribute.prefix === undefined ? {} : { prefix: attribute.prefix }),
        localName: attribute.localName,
        ...(attribute.namespaceUri === undefined
          ? {}
          : { namespaceUri: attribute.namespaceUri }),
        value: attribute.value,
        rawValue: attribute.rawValue,
        quote: 'double',
        range: attribute.range,
        nameRange: attribute.nameRange,
        valueRange: attribute.valueRange,
        valueContentRange: attribute.valueContentRange,
        sourceOrder: attribute.start * 10 + 1,
      }),
    );
    return {
      kind: 'element',
      qualifiedName: element.qualifiedName,
      ...(element.qualifiedName.includes(':')
        ? {
            prefix: element.qualifiedName.slice(
              0,
              element.qualifiedName.indexOf(':'),
            ),
          }
        : {}),
      localName: element.localName,
      ...(element.namespaceUri === undefined
        ? {}
        : { namespaceUri: element.namespaceUri }),
      attributes,
      children,
      namespaceBindings,
      range: element.range,
      startTagRange: element.range,
      endTagRange: element.range,
      sourceOrder: element.start * 10,
    };
  }
}

function serializeCompactDocument(
  document: XsdXmlDocumentAst,
  namespaceBindings: Readonly<Record<string, string>>,
): RelaxNgCompactGeneratedSource | undefined {
  if (!document.root) return undefined;
  const lines: string[] = [];
  const lineRanges: Record<number, SchemaSourceRange> = {};
  const serialize = (
    element: XsdXmlElementAst,
    depth: number,
    root: boolean,
  ): void => {
    const prefix =
      element.namespaceUri === relaxNgStructureNamespace
        ? ''
        : element.prefix
          ? `${element.prefix}:`
          : '';
    const attributes = element.attributes
      .map(
        (attribute) =>
          ` ${attribute.qualifiedName}="${xmlEscape(attribute.value)}"`,
      )
      .join('');
    const declarations = root
      ? ` xmlns="${relaxNgStructureNamespace}"${Object.entries(
          namespaceBindings,
        )
          .filter(([name, uri]) => name.length > 0 && uri.length > 0)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([name, uri]) => ` xmlns:${name}="${xmlEscape(uri)}"`)
          .join('')}`
      : '';
    const elementChildren = element.children.filter(
      (child): child is XsdXmlElementAst => child.kind === 'element',
    );
    const text = element.children
      .filter((child): child is XsdXmlTextAst => child.kind === 'text')
      .map((child) => child.value)
      .join('');
    const indent = '  '.repeat(depth);
    const lineNumber = lines.length + 1;
    lineRanges[lineNumber] = element.range;
    if (elementChildren.length === 0) {
      lines.push(
        text.length === 0
          ? `${indent}<${prefix}${element.localName}${declarations}${attributes}/>`
          : `${indent}<${prefix}${element.localName}${declarations}${attributes}>${xmlEscape(text)}</${prefix}${element.localName}>`,
      );
      return;
    }
    lines.push(
      `${indent}<${prefix}${element.localName}${declarations}${attributes}>`,
    );
    for (const child of elementChildren) serialize(child, depth + 1, false);
    lines.push(`${indent}</${prefix}${element.localName}>`);
  };
  serialize(document.root, 0, true);
  return { xml: `${lines.join('\n')}\n`, lineRanges };
}

export function parseRelaxNgCompactSyntax(
  sourceText: string,
  sourceFileId: string,
): RelaxNgCompactParseResult {
  const lexical = lexCompactSyntax(sourceText, sourceFileId);
  const parser = new CompactParser(
    sourceText,
    sourceFileId,
    lexical.tokens,
    lexical.diagnostics,
  );
  const document = parser.parse();
  if (!document || parser.diagnostics.length > 0)
    return { diagnostics: parser.diagnostics };
  const generated = serializeCompactDocument(document, parser.bindings());
  return {
    document,
    diagnostics: parser.diagnostics,
    ...(generated === undefined ? {} : { generated }),
  };
}

export function isRelaxNgCompactPath(path: string): boolean {
  return /\.rnc$/iu.test(path);
}
