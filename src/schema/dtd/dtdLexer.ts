import {
  createDtdSourceMap,
  type DtdCommentAst,
  type DtdSourceMap,
  type DtdSourceRange,
} from './dtdAst';
import {
  createDtdParseDiagnostic,
  type DtdParseDiagnostic,
} from './dtdDiagnostics';

export const dtdAsciiNameScannerLimitation =
  'DTD names are limited to an ASCII XML-name subset: start characters A-Z, a-z, underscore, or colon; later characters may also include digits, period, and hyphen.';

export const dtdAsciiNmtokenScannerLimitation =
  'DTD NMTOKEN values are limited to the same ASCII XML-name character subset, while permitting digits, periods, and hyphens as the first character.';

export type DtdTokenKind =
  | 'declarationOpen'
  | 'conditionalSectionOpen'
  | 'name'
  | 'parsedCharacterData'
  | 'leftParenthesis'
  | 'rightParenthesis'
  | 'comma'
  | 'pipe'
  | 'question'
  | 'star'
  | 'plus'
  | 'greaterThan'
  | 'quotedLiteral'
  | 'hashKeyword'
  | 'nmtoken'
  | 'parameterEntityReference'
  | 'unknown';

export interface DtdToken {
  readonly kind: DtdTokenKind;
  readonly value: string;
  readonly range: DtdSourceRange;
  readonly terminated?: boolean;
}

export interface DtdLexResult {
  readonly tokens: readonly DtdToken[];
  readonly comments: readonly DtdCommentAst[];
  readonly diagnostics: readonly DtdParseDiagnostic[];
  readonly sourceMap: DtdSourceMap;
}

function isAsciiNameStart(character: string | undefined): boolean {
  return (
    character !== undefined &&
    ((character >= 'A' && character <= 'Z') ||
      (character >= 'a' && character <= 'z') ||
      character === '_' ||
      character === ':')
  );
}

function isAsciiNameCharacter(character: string | undefined): boolean {
  return (
    isAsciiNameStart(character) ||
    (character !== undefined &&
      ((character >= '0' && character <= '9') ||
        character === '.' ||
        character === '-'))
  );
}

function isWhitespace(character: string | undefined): boolean {
  return (
    character === ' ' ||
    character === '\t' ||
    character === '\r' ||
    character === '\n'
  );
}

export function lexDtdElementDeclarations(
  sourceText: string,
  sourceId?: string,
): DtdLexResult {
  const sourceMap = createDtdSourceMap(sourceText, sourceId);
  const tokens: DtdToken[] = [];
  const comments: DtdCommentAst[] = [];
  const diagnostics: DtdParseDiagnostic[] = [];
  let offset = 0;

  function addToken(
    kind: DtdTokenKind,
    start: number,
    end: number,
    terminated?: boolean,
  ): void {
    tokens.push({
      kind,
      value: sourceText.slice(start, end),
      range: sourceMap.range(start, end),
      ...(terminated === undefined ? {} : { terminated }),
    });
  }

  while (offset < sourceText.length) {
    const character = sourceText[offset];

    if (isWhitespace(character)) {
      offset += 1;
      continue;
    }

    if (sourceText.startsWith('<!--', offset)) {
      const commentStart = offset;
      const commentEnd = sourceText.indexOf('-->', offset + 4);
      if (commentEnd < 0) {
        diagnostics.push(
          createDtdParseDiagnostic(
            'unterminated-comment',
            'Expected "-->" to close the XML comment',
            sourceMap.range(commentStart, sourceText.length),
          ),
        );
        offset = sourceText.length;
      } else {
        const endOffset = commentEnd + 3;
        comments.push({
          kind: 'comment',
          raw: sourceText.slice(commentStart, endOffset),
          text: sourceText.slice(commentStart + 4, commentEnd),
          range: sourceMap.range(commentStart, endOffset),
          contentRange: sourceMap.range(commentStart + 4, commentEnd),
          ...(sourceId === undefined ? {} : { sourceId }),
          order: comments.length,
        });
        offset = commentEnd + 3;
      }
      continue;
    }

    if (sourceText.startsWith('<![', offset)) {
      addToken('conditionalSectionOpen', offset, offset + 3);
      offset += 3;
      continue;
    }

    if (sourceText.startsWith('<!', offset)) {
      addToken('declarationOpen', offset, offset + 2);
      offset += 2;
      continue;
    }

    if (sourceText.startsWith('#PCDATA', offset)) {
      addToken('parsedCharacterData', offset, offset + 7);
      offset += 7;
      continue;
    }

    if (character === '#') {
      const start = offset;
      offset += 1;
      while (
        (sourceText[offset] !== undefined &&
          sourceText[offset] >= 'A' &&
          sourceText[offset] <= 'Z') ||
        (sourceText[offset] !== undefined &&
          sourceText[offset] >= 'a' &&
          sourceText[offset] <= 'z')
      ) {
        offset += 1;
      }
      addToken('hashKeyword', start, offset);
      continue;
    }

    if (character === '"' || character === "'") {
      const start = offset;
      const quote = character;
      offset += 1;
      while (offset < sourceText.length && sourceText[offset] !== quote) {
        offset += 1;
      }
      const terminated = sourceText[offset] === quote;
      if (terminated) offset += 1;
      addToken('quotedLiteral', start, offset, terminated);
      continue;
    }

    if (character === '%') {
      const start = offset;
      offset += 1;
      while (
        offset < sourceText.length &&
        !isWhitespace(sourceText[offset]) &&
        !['<', '>', '(', ')', ',', '|'].includes(sourceText[offset] ?? '')
      ) {
        offset += 1;
        if (sourceText[offset - 1] === ';') break;
      }
      addToken('parameterEntityReference', start, offset);
      continue;
    }

    if (isAsciiNameStart(character)) {
      const start = offset;
      offset += 1;
      while (isAsciiNameCharacter(sourceText[offset])) offset += 1;
      addToken('name', start, offset);
      continue;
    }

    if (isAsciiNameCharacter(character)) {
      const start = offset;
      offset += 1;
      while (isAsciiNameCharacter(sourceText[offset])) offset += 1;
      addToken('nmtoken', start, offset);
      continue;
    }

    const punctuationKinds: Readonly<Record<string, DtdTokenKind>> = {
      '(': 'leftParenthesis',
      ')': 'rightParenthesis',
      ',': 'comma',
      '|': 'pipe',
      '?': 'question',
      '*': 'star',
      '+': 'plus',
      '>': 'greaterThan',
    };
    const punctuationKind = punctuationKinds[character ?? ''];
    if (punctuationKind) {
      addToken(punctuationKind, offset, offset + 1);
      offset += 1;
      continue;
    }

    addToken('unknown', offset, offset + 1);
    offset += 1;
  }

  return { tokens, comments, diagnostics, sourceMap };
}
