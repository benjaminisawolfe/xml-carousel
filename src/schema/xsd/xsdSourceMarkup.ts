import type {
  SchemaNodeId,
  SchemaNodeSourceMarkup,
  SchemaProject,
  SchemaSourceMarkupByNodeId,
  SchemaSourceRange,
} from '../model';
import type { XsdMetadataByNodeId } from './xsdProjectMetadata';

function cloneRange(range: SchemaSourceRange): SchemaSourceRange {
  return {
    start: { ...range.start },
    end: { ...range.end },
    ...(range.sourceId === undefined ? {} : { sourceId: range.sourceId }),
  };
}

function isValidPosition(
  position: SchemaSourceRange['start'],
  sourceLength: number,
): boolean {
  return (
    Number.isInteger(position.offset) &&
    Number.isInteger(position.line) &&
    Number.isInteger(position.column) &&
    position.offset >= 0 &&
    position.offset <= sourceLength &&
    position.line > 0 &&
    position.column > 0
  );
}

function isValidSourceRange(
  range: SchemaSourceRange,
  sourceText: string,
  sourceFileId: string,
): boolean {
  return (
    (range.sourceId === undefined || range.sourceId === sourceFileId) &&
    isValidPosition(range.start, sourceText.length) &&
    isValidPosition(range.end, sourceText.length) &&
    range.start.offset <= range.end.offset
  );
}

function fragmentId(sourceFileId: string, range: SchemaSourceRange): string {
  return `xsd:source-markup:${encodeURIComponent(sourceFileId)}:${range.start.offset}-${range.end.offset}`;
}

export function buildXsdSourceMarkupByNodeId(
  project: SchemaProject,
  metadataByNodeId: XsdMetadataByNodeId,
  sourceText: string,
  sourceFileId: string,
): SchemaSourceMarkupByNodeId {
  const sourceMarkupByNodeId: Record<SchemaNodeId, SchemaNodeSourceMarkup> = {};

  for (const node of project.nodes) {
    const metadata = metadataByNodeId[node.id];
    if (
      !metadata ||
      metadata.kind !== node.kind ||
      metadata.sourceFileId !== sourceFileId ||
      node.sourceFileId !== sourceFileId ||
      !isValidSourceRange(metadata.sourceRange, sourceText, sourceFileId)
    ) {
      continue;
    }

    const range = cloneRange(metadata.sourceRange);
    sourceMarkupByNodeId[node.id] = {
      syntax: 'xsd',
      fragments: [
        {
          id: fragmentId(sourceFileId, range),
          sourceFileId,
          range,
          text: sourceText.slice(range.start.offset, range.end.offset),
        },
      ],
    };
  }

  return sourceMarkupByNodeId;
}
