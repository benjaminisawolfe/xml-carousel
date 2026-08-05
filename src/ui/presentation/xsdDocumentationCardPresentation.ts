import type { SchemaNodeId } from '../../schema/model';
import type { XsdMetadataByNodeId } from '../../schema/xsd';
import { selectXsdAnnotationPresentation } from './xsdAnnotationPresentation';

export const XSD_DOCUMENTATION_CARD_EXCERPT_LENGTH = 160;

export interface XsdDocumentationCardPresentation {
  readonly excerpt: string;
  readonly language?: string;
  readonly documentationCount: number;
  readonly additionalDocumentationCount: number;
}

export function buildXsdDocumentationCardExcerpt(
  text: string,
  maximumLength = XSD_DOCUMENTATION_CARD_EXCERPT_LENGTH,
): string {
  if (maximumLength <= 0) return '';
  if (text.length <= maximumLength) return text;
  if (maximumLength === 1) return '…';

  const hardBoundary = maximumLength - 1;
  const candidate = text.slice(0, hardBoundary);
  const lastWhitespace = candidate.search(/\s+\S*$/);
  const boundaryText =
    lastWhitespace > 0 ? candidate.slice(0, lastWhitespace) : candidate;
  const excerpt =
    boundaryText.replace(/\s+$/, '') || candidate.replace(/\s+$/, '');

  return `${excerpt}…`;
}

export function selectXsdDocumentationCardPresentation(
  nodeId: SchemaNodeId,
  xsdMetadataByNodeId: XsdMetadataByNodeId = {},
): XsdDocumentationCardPresentation | undefined {
  const documentation = selectXsdAnnotationPresentation(
    nodeId,
    xsdMetadataByNodeId,
  ).documentation.filter(({ isEmpty }) => !isEmpty);
  const selected = documentation[0];
  if (!selected) return undefined;

  return {
    excerpt: buildXsdDocumentationCardExcerpt(selected.text),
    ...(selected.language?.value ? { language: selected.language.value } : {}),
    documentationCount: documentation.length,
    additionalDocumentationCount: documentation.length - 1,
  };
}
