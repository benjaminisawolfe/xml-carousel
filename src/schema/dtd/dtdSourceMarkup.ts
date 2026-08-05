import type {
  SchemaNodeId,
  SchemaNodeSourceMarkup,
  SchemaSourceMarkupByNodeId,
  SchemaSourceMarkupFragment,
  SchemaSourcePosition,
  SchemaSourceRange,
} from '../model';
import type { DtdDeclarationAst, DtdSourceRange } from './dtdAst';
import type { DtdNormalizedComment } from './dtdCommentMetadata';

interface SourceInterval {
  readonly sourceFileId: string;
  readonly start: SchemaSourcePosition;
  readonly end: SchemaSourcePosition;
}

function nodeIdForDeclaration(
  declaration: DtdDeclarationAst,
  declaredElementNames: ReadonlySet<string>,
): SchemaNodeId {
  const elementName =
    declaration.kind === 'elementDeclaration'
      ? declaration.name
      : declaration.elementName;
  return declaration.kind === 'attributeListDeclaration' &&
    !declaredElementNames.has(elementName)
    ? `dtd:attribute-list:${encodeURIComponent(elementName)}`
    : `dtd:element:${encodeURIComponent(elementName)}`;
}

function declarationKind(
  declaration: DtdDeclarationAst,
): DtdNormalizedComment['declarationKind'] {
  return declaration.kind === 'elementDeclaration'
    ? 'element'
    : 'attributeList';
}

function hasExpectedProvenance(
  range: Pick<DtdSourceRange, 'sourceId'>,
  sourceFileId: string,
): boolean {
  return range.sourceId === undefined || range.sourceId === sourceFileId;
}

function isValidRange(
  range: DtdSourceRange,
  sourceText: string,
  sourceFileId: string,
): boolean {
  return (
    hasExpectedProvenance(range, sourceFileId) &&
    Number.isInteger(range.start.offset) &&
    Number.isInteger(range.end.offset) &&
    Number.isInteger(range.start.line) &&
    Number.isInteger(range.start.column) &&
    Number.isInteger(range.end.line) &&
    Number.isInteger(range.end.column) &&
    range.start.offset >= 0 &&
    range.end.offset >= range.start.offset &&
    range.end.offset <= sourceText.length &&
    range.start.line >= 1 &&
    range.start.column >= 1 &&
    range.end.line >= 1 &&
    range.end.column >= 1
  );
}

function rangesMatch(
  left: SchemaSourceRange,
  right: DtdSourceRange,
  sourceFileId: string,
): boolean {
  return (
    hasExpectedProvenance(left, sourceFileId) &&
    hasExpectedProvenance(right, sourceFileId) &&
    left.start.offset === right.start.offset &&
    left.end.offset === right.end.offset
  );
}

function attachedCommentsForDeclaration(
  declaration: DtdDeclarationAst,
  nodeId: SchemaNodeId,
  comments: readonly DtdNormalizedComment[],
  sourceText: string,
  sourceFileId: string,
): readonly DtdNormalizedComment[] {
  return comments.filter(
    (comment) =>
      comment.sourceFileId === sourceFileId &&
      comment.attachedNodeId === nodeId &&
      comment.declarationKind === declarationKind(declaration) &&
      comment.declarationRange !== undefined &&
      rangesMatch(
        comment.declarationRange,
        declaration.rawDeclarationRange,
        sourceFileId,
      ) &&
      isValidRange(comment.sourceRange, sourceText, sourceFileId),
  );
}

function intervalForDeclaration(
  declaration: DtdDeclarationAst,
  nodeId: SchemaNodeId,
  comments: readonly DtdNormalizedComment[],
  sourceText: string,
  sourceFileId: string,
): SourceInterval | undefined {
  const range = declaration.rawDeclarationRange;
  if (!isValidRange(range, sourceText, sourceFileId)) return undefined;

  const attachedComments = attachedCommentsForDeclaration(
    declaration,
    nodeId,
    comments,
    sourceText,
    sourceFileId,
  );
  let start = range.start;
  let end = range.end;

  const precedingComments = attachedComments
    .filter(({ attachmentKind }) => attachmentKind === 'preceding')
    .sort(
      (left, right) =>
        right.sourceRange.start.offset - left.sourceRange.start.offset,
    );
  for (const comment of precedingComments) {
    if (
      comment.sourceRange.end.offset <= start.offset &&
      /^[\t\r\n ]*$/.test(
        sourceText.slice(comment.sourceRange.end.offset, start.offset),
      )
    ) {
      start = comment.sourceRange.start;
    }
  }

  const trailingComments = attachedComments
    .filter(({ attachmentKind }) => attachmentKind === 'trailing')
    .sort(
      (left, right) =>
        left.sourceRange.start.offset - right.sourceRange.start.offset,
    );
  for (const comment of trailingComments) {
    if (
      comment.sourceRange.start.offset >= end.offset &&
      comment.sourceRange.start.line === range.end.line &&
      /^[\t ]*$/.test(
        sourceText.slice(end.offset, comment.sourceRange.start.offset),
      )
    ) {
      end = comment.sourceRange.end;
    }
  }

  return {
    sourceFileId,
    start: { ...start },
    end: { ...end },
  };
}

function canCoalesce(
  left: SourceInterval,
  right: SourceInterval,
  sourceText: string,
): boolean {
  if (left.sourceFileId !== right.sourceFileId) return false;
  if (right.start.offset <= left.end.offset) return true;
  return /^[\t\r\n ]*$/.test(
    sourceText.slice(left.end.offset, right.start.offset),
  );
}

function coalesceIntervals(
  intervals: readonly SourceInterval[],
  sourceText: string,
): readonly SourceInterval[] {
  const ordered = [...intervals].sort(
    (left, right) =>
      left.sourceFileId.localeCompare(right.sourceFileId) ||
      left.start.offset - right.start.offset ||
      left.end.offset - right.end.offset,
  );
  const coalesced: SourceInterval[] = [];

  for (const interval of ordered) {
    const previous = coalesced[coalesced.length - 1];
    if (!previous || !canCoalesce(previous, interval, sourceText)) {
      coalesced.push(interval);
      continue;
    }

    if (interval.end.offset > previous.end.offset) {
      coalesced[coalesced.length - 1] = {
        sourceFileId: previous.sourceFileId,
        start: previous.start,
        end: interval.end,
      };
    }
  }

  return coalesced;
}

function fragmentForInterval(
  interval: SourceInterval,
  sourceText: string,
): SchemaSourceMarkupFragment {
  const range: SchemaSourceRange = {
    start: { ...interval.start },
    end: { ...interval.end },
    sourceId: interval.sourceFileId,
  };
  return {
    id: [
      'dtd:source-markup',
      encodeURIComponent(interval.sourceFileId),
      `${interval.start.offset}-${interval.end.offset}`,
    ].join(':'),
    sourceFileId: interval.sourceFileId,
    range,
    text: sourceText.slice(interval.start.offset, interval.end.offset),
  };
}

/**
 * Builds exact, display-ready source slices while parser ASTs and source text
 * are still available. The returned metadata contains only plain,
 * JSON-serializable data and never exposes parser objects to application state.
 */
export function buildDtdSourceMarkupByNodeId(
  declarations: readonly DtdDeclarationAst[],
  sourceText: string,
  sourceFileId: string,
  comments: readonly DtdNormalizedComment[] = [],
): SchemaSourceMarkupByNodeId {
  if (sourceFileId.trim().length === 0) return {};

  const declaredElementNames = new Set(
    declarations
      .filter((declaration) => declaration.kind === 'elementDeclaration')
      .map((declaration) => declaration.name),
  );

  const intervalsByNodeId: Record<SchemaNodeId, SourceInterval[]> = {};

  for (const declaration of declarations) {
    const nodeId = nodeIdForDeclaration(declaration, declaredElementNames);
    const interval = intervalForDeclaration(
      declaration,
      nodeId,
      comments,
      sourceText,
      sourceFileId,
    );
    if (!interval) continue;

    (intervalsByNodeId[nodeId] ??= []).push(interval);
  }

  const sourceMarkupByNodeId: Record<SchemaNodeId, SchemaNodeSourceMarkup> = {};
  for (const nodeId of Object.keys(intervalsByNodeId).sort()) {
    const fragments = coalesceIntervals(
      intervalsByNodeId[nodeId] ?? [],
      sourceText,
    ).map((interval) => fragmentForInterval(interval, sourceText));
    if (fragments.length > 0) {
      sourceMarkupByNodeId[nodeId] = { syntax: 'dtd', fragments };
    }
  }

  return sourceMarkupByNodeId;
}
