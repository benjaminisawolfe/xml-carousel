import type { SchemaNodeId } from '../model';
import type {
  DtdCommentAst,
  DtdDeclarationAst,
  DtdSourceRange,
} from './dtdAst';
import type {
  DtdCommentAttachmentKind,
  DtdCommentAttachmentResult,
  DtdCommentDeclarationKind,
  DtdNormalizedComment,
} from './dtdCommentMetadata';
import type { DtdNormalizedSourceRange } from './dtdAttributeMetadata';

interface DeclarationTarget {
  readonly range: DtdSourceRange;
  readonly declarationKind: DtdCommentDeclarationKind;
  readonly nodeId: SchemaNodeId;
}

interface Attachment {
  readonly attachmentKind: Exclude<DtdCommentAttachmentKind, 'schema'>;
  readonly target: DeclarationTarget;
}

function cloneRange(range: DtdSourceRange): DtdNormalizedSourceRange {
  return {
    start: { ...range.start },
    end: { ...range.end },
    ...(range.sourceId === undefined ? {} : { sourceId: range.sourceId }),
  };
}

function declarationTarget(
  declaration: DtdDeclarationAst,
  declaredElementNames: ReadonlySet<string>,
): DeclarationTarget {
  const name =
    declaration.kind === 'elementDeclaration'
      ? declaration.name
      : declaration.elementName;
  return {
    range: declaration.rawDeclarationRange,
    declarationKind:
      declaration.kind === 'elementDeclaration' ? 'element' : 'attributeList',
    nodeId:
      declaration.kind === 'attributeListDeclaration' &&
      !declaredElementNames.has(name)
        ? `dtd:attribute-list:${encodeURIComponent(name)}`
        : `dtd:element:${encodeURIComponent(name)}`,
  };
}

function isContainedBy(
  comment: DtdCommentAst,
  declaration: DeclarationTarget,
): boolean {
  return (
    comment.range.start.offset >= declaration.range.start.offset &&
    comment.range.end.offset <= declaration.range.end.offset
  );
}

function isHorizontalWhitespace(value: string): boolean {
  return /^[\t ]*$/.test(value);
}

function isWhitespace(value: string): boolean {
  return /^[\t\r\n ]*$/.test(value);
}

function commentId(sourceFileId: string, comment: DtdCommentAst): string {
  return `dtd:comment:${encodeURIComponent(sourceFileId)}:${comment.range.start.offset}-${comment.range.end.offset}`;
}

/**
 * Attaches comments without mutating parser output or the normalized project.
 * Precedence is contained, same-line trailing, consecutive preceding, then
 * schema-level. The returned metadata is plain JSON-serializable data.
 */
export function attachDtdComments(
  comments: readonly DtdCommentAst[],
  declarations: readonly DtdDeclarationAst[],
  sourceText: string,
  sourceFileId: string,
): DtdCommentAttachmentResult {
  const declaredElementNames = new Set(
    declarations
      .filter((declaration) => declaration.kind === 'elementDeclaration')
      .map((declaration) => declaration.name),
  );
  const orderedTargets = declarations
    .map((declaration) => declarationTarget(declaration, declaredElementNames))
    .sort(
      (left, right) =>
        left.range.start.offset - right.range.start.offset ||
        left.range.end.offset - right.range.end.offset,
    );
  const orderedComments = comments
    .map((comment, inputIndex) => ({ comment, inputIndex }))
    .sort(
      (left, right) =>
        left.comment.range.start.offset - right.comment.range.start.offset ||
        left.comment.range.end.offset - right.comment.range.end.offset ||
        left.comment.order - right.comment.order,
    );
  const attachments: Array<Attachment | undefined> = comments.map(
    () => undefined,
  );

  for (const { comment, inputIndex } of orderedComments) {
    const target = orderedTargets.find((candidate) =>
      isContainedBy(comment, candidate),
    );
    if (target) {
      attachments[inputIndex] = { attachmentKind: 'contained', target };
    }
  }

  for (const { comment, inputIndex } of orderedComments) {
    if (attachments[inputIndex]) continue;
    const target = [...orderedTargets]
      .reverse()
      .find(
        (candidate) =>
          candidate.range.end.offset <= comment.range.start.offset &&
          candidate.range.end.line === comment.range.start.line &&
          isHorizontalWhitespace(
            sourceText.slice(
              candidate.range.end.offset,
              comment.range.start.offset,
            ),
          ),
      );
    if (target) {
      attachments[inputIndex] = { attachmentKind: 'trailing', target };
    }
  }

  for (const target of orderedTargets) {
    let cursor = target.range.start.offset;
    for (let index = orderedComments.length - 1; index >= 0; index -= 1) {
      const entry = orderedComments[index];
      if (!entry || entry.comment.range.end.offset > cursor) continue;
      if (attachments[entry.inputIndex]) break;
      if (
        !isWhitespace(sourceText.slice(entry.comment.range.end.offset, cursor))
      ) {
        break;
      }

      attachments[entry.inputIndex] = {
        attachmentKind: 'preceding',
        target,
      };
      cursor = entry.comment.range.start.offset;
    }
  }

  const normalized = comments.map(
    (comment, inputIndex): DtdNormalizedComment => {
      const attachment = attachments[inputIndex];
      return {
        commentId: commentId(sourceFileId, comment),
        sourceFileId,
        raw: comment.raw,
        text: comment.text,
        sourceRange: cloneRange(comment.range),
        contentRange: cloneRange(comment.contentRange),
        order: comment.order,
        attachmentKind: attachment?.attachmentKind ?? 'schema',
        ...(attachment
          ? {
              declarationKind: attachment.target.declarationKind,
              declarationRange: cloneRange(attachment.target.range),
              attachedNodeId: attachment.target.nodeId,
            }
          : {}),
      };
    },
  );
  const commentsByNodeId: Record<SchemaNodeId, DtdNormalizedComment[]> = {};
  const schemaLevelComments: DtdNormalizedComment[] = [];

  for (const comment of normalized) {
    if (comment.attachedNodeId) {
      (commentsByNodeId[comment.attachedNodeId] ??= []).push(comment);
    } else {
      schemaLevelComments.push(comment);
    }
  }

  return {
    comments: normalized,
    commentsByNodeId,
    schemaLevelComments,
  };
}
