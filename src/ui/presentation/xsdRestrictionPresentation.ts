import {
  getSchemaNode,
  type SchemaNodeId,
  type SchemaProject,
} from '../../schema/model';
import type {
  XsdEnumerationValueMetadata,
  XsdMetadataByNodeId,
  XsdNormalizedReference,
} from '../../schema/xsd';

export interface XsdRestrictionBasePresentation {
  readonly text: string;
  readonly targetNodeId?: SchemaNodeId;
  readonly navigable: boolean;
}

export interface XsdEnumerationValuePresentation {
  readonly value: string;
  readonly displayValue: string;
  readonly accessibleLabel: string;
  readonly order: number;
}

export interface XsdRestrictionPresentation {
  readonly base?: XsdRestrictionBasePresentation;
  readonly enumerationValues: readonly XsdEnumerationValuePresentation[];
  readonly enumerationCount: number;
}

export function formatXsdRestrictionBase(
  project: SchemaProject,
  reference: XsdNormalizedReference | undefined,
): XsdRestrictionBasePresentation | undefined {
  if (!reference || reference.kind !== 'restrictionBase') return undefined;
  if (reference.resolution === 'resolved' && reference.targetNodeId) {
    const target = getSchemaNode(project, reference.targetNodeId);
    if (target?.kind === 'simpleType') {
      return {
        text: target.name,
        targetNodeId: target.id,
        navigable: true,
      };
    }
  }
  return {
    text:
      reference.resolution === 'externalDeferred'
        ? `${reference.raw} (external)`
        : reference.raw,
    navigable: false,
  };
}

function presentEnumeration(
  value: XsdEnumerationValueMetadata,
  order: number,
): XsdEnumerationValuePresentation {
  return {
    value: value.value,
    displayValue: value.value === '' ? '(empty string)' : value.value,
    accessibleLabel:
      value.value === '' ? 'Empty string allowed value' : value.value,
    order,
  };
}

export function selectXsdRestrictionPresentation(
  project: SchemaProject,
  nodeId: SchemaNodeId,
  xsdMetadataByNodeId: XsdMetadataByNodeId = {},
): XsdRestrictionPresentation | undefined {
  const node = getSchemaNode(project, nodeId);
  const metadata = xsdMetadataByNodeId[nodeId];
  if (
    !node ||
    (node.kind !== 'simpleType' && node.kind !== 'restriction') ||
    metadata?.kind !== node.kind ||
    metadata.complexTypeDerivation !== undefined
  ) {
    return undefined;
  }
  const values = [...(metadata.enumerationValues ?? [])]
    .sort(
      (left, right) =>
        left.sourceOrder - right.sourceOrder ||
        left.sourceRange.start.offset - right.sourceRange.start.offset,
    )
    .map(presentEnumeration);
  const base = formatXsdRestrictionBase(
    project,
    metadata.restrictionBaseReference,
  );
  return {
    ...(base === undefined ? {} : { base }),
    enumerationValues: values,
    enumerationCount: metadata.enumerationCount ?? values.length,
  };
}
