import type {
  XsdAnnotationEntryMetadata,
  XsdAppInfoMetadata,
  XsdDocumentationMetadata,
  XsdMetadataByNodeId,
  OrderedXsdAnnotationEntry,
} from '../../schema/xsd';
import { selectOrderedXsdAnnotationEntries } from '../../schema/xsd';

export interface XsdAnnotationValuePresentation {
  readonly value: string;
  readonly displayValue: string;
}

export interface XsdDocumentationPresentation {
  readonly id: string;
  readonly text: string;
  readonly displayText: string;
  readonly isEmpty: boolean;
  readonly language?: XsdAnnotationValuePresentation;
  readonly source?: XsdAnnotationValuePresentation;
  readonly order: number;
}

export interface XsdAppInfoPresentation {
  readonly id: string;
  readonly text: string;
  readonly displayText: string;
  readonly isEmpty: boolean;
  readonly source?: XsdAnnotationValuePresentation;
  readonly order: number;
}

export interface XsdAnnotationPresentation {
  readonly documentation: readonly XsdDocumentationPresentation[];
  readonly appInfo: readonly XsdAppInfoPresentation[];
}

const emptyPresentation: XsdAnnotationPresentation = {
  documentation: [],
  appInfo: [],
};

export function formatExplicitXsdAnnotationValue(
  value: string,
): XsdAnnotationValuePresentation {
  return {
    value,
    displayValue: value.length === 0 ? '(empty)' : value,
  };
}

export function selectXsdAnnotationPresentation(
  nodeId: string,
  xsdMetadataByNodeId: XsdMetadataByNodeId = {},
): XsdAnnotationPresentation {
  const metadata = xsdMetadataByNodeId[nodeId];
  if (!metadata || typeof metadata.sourceFileId !== 'string') {
    return emptyPresentation;
  }

  const orderedEntries = selectOrderedXsdAnnotationEntries(metadata);
  const documentationEntries = orderedEntries.filter(
    (
      ordered,
    ): ordered is OrderedXsdAnnotationEntry & {
      readonly entry: XsdDocumentationMetadata;
    } => ordered.entry.kind === 'documentation',
  );
  const appInfoEntries = orderedEntries.filter(
    (
      ordered,
    ): ordered is OrderedXsdAnnotationEntry & {
      readonly entry: XsdAppInfoMetadata;
    } => ordered.entry.kind === 'appInfo',
  );

  return {
    documentation: documentationEntries.map(({ entry }, order) => {
      const isEmpty = entry.text.length === 0;
      return {
        id: entryId('documentation', metadata.sourceFileId, entry),
        text: entry.text,
        displayText: isEmpty ? 'No text content.' : entry.text,
        isEmpty,
        ...(entry.xmlLang
          ? {
              language: formatExplicitXsdAnnotationValue(entry.xmlLang.value),
            }
          : {}),
        ...(entry.source
          ? {
              source: formatExplicitXsdAnnotationValue(entry.source.value),
            }
          : {}),
        order,
      };
    }),
    appInfo: appInfoEntries.map(({ entry }, order) => {
      const isEmpty = entry.text.length === 0;
      return {
        id: entryId('appinfo', metadata.sourceFileId, entry),
        text: entry.text,
        displayText: isEmpty ? 'No extracted text content.' : entry.text,
        isEmpty,
        ...(entry.source
          ? {
              source: formatExplicitXsdAnnotationValue(entry.source.value),
            }
          : {}),
        order,
      };
    }),
  };
}

function entryId(
  kind: 'documentation' | 'appinfo',
  sourceFileId: string,
  entry: XsdAnnotationEntryMetadata,
): string {
  const sourceId = entry.sourceRange.sourceId ?? sourceFileId;
  return `${kind}:${sourceId}:${entry.sourceRange.start.offset}-${entry.sourceRange.end.offset}`;
}
