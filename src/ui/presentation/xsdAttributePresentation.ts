import {
  getNodesByKind,
  getOutgoingEdges,
  getSchemaNode,
  type SchemaNodeId,
  type SchemaProject,
} from '../../schema/model';
import type {
  XsdMetadataByNodeId,
  XsdNodeMetadata,
  XsdNormalizedReference,
} from '../../schema/xsd';

export interface XsdAttributePresentationSummary {
  readonly nodeId: SchemaNodeId;
  readonly name: string;
  readonly detailLines: readonly string[];
  readonly order: number;
}

function resolvedTypeName(
  project: SchemaProject,
  reference: XsdNormalizedReference,
): string | undefined {
  return reference.targetNodeId
    ? getSchemaNode(project, reference.targetNodeId)?.name
    : undefined;
}

export function formatXsdAttributeType(
  project: SchemaProject,
  nodeId: SchemaNodeId,
  metadata: XsdNodeMetadata,
  xsdMetadataByNodeId: XsdMetadataByNodeId,
): string {
  if (metadata.implicitAttributeType) return metadata.implicitAttributeType;
  const reference = metadata.typeReference;
  if (reference) {
    if (reference.resolution === 'resolved') {
      return resolvedTypeName(project, reference) ?? reference.raw;
    }
    return reference.resolution === 'externalDeferred'
      ? `${reference.raw} · external`
      : reference.raw;
  }
  const anonymousType = getOutgoingEdges(project, nodeId)
    .filter(({ kind }) => kind === 'typeOf')
    .map(({ targetNodeId }) => ({
      node: getSchemaNode(project, targetNodeId),
      metadata: xsdMetadataByNodeId[targetNodeId],
    }))
    .find(
      ({ node, metadata: targetMetadata }) =>
        node?.kind === 'simpleType' &&
        targetMetadata?.kind === 'simpleType' &&
        targetMetadata.scope === 'anonymous',
    );
  return anonymousType ? 'Anonymous simple type' : 'xs:anySimpleType';
}

function formatReference(reference: XsdNormalizedReference): string {
  const external =
    reference.resolution === 'externalDeferred' ? ' · external' : '';
  return `Reference: ${reference.raw}${external}`;
}

function formatConstraint(
  valueConstraint: XsdNodeMetadata['valueConstraint'],
): string | undefined {
  return valueConstraint
    ? `${valueConstraint.kind} "${valueConstraint.value}"`
    : undefined;
}

function localAttributeSummary(
  project: SchemaProject,
  nodeId: SchemaNodeId,
  xsdMetadataByNodeId: XsdMetadataByNodeId,
  order: number,
): XsdAttributePresentationSummary | undefined {
  const node = getSchemaNode(project, nodeId);
  const metadata = xsdMetadataByNodeId[nodeId];
  if (
    (node?.kind !== 'attribute' && node?.kind !== 'attributeReference') ||
    metadata?.kind !== node.kind ||
    metadata.scope !== 'local'
  ) {
    return undefined;
  }
  const detailLines: string[] = [];
  if (metadata.attributeReference) {
    detailLines.push(formatReference(metadata.attributeReference));
  } else {
    detailLines.push(
      formatXsdAttributeType(project, nodeId, metadata, xsdMetadataByNodeId),
    );
  }
  const qualifiers = [
    metadata.attributeUse,
    metadata.attributeForm?.resolution === 'explicitDeferred'
      ? metadata.attributeForm.lexicalValue
      : metadata.attributeForm?.value,
    formatConstraint(metadata.valueConstraint),
  ].filter((value): value is string => Boolean(value));
  if (qualifiers.length > 0) detailLines.push(qualifiers.join(' · '));
  return {
    nodeId,
    name: node.name,
    detailLines,
    order,
  };
}

export function selectDirectXsdAttributes(
  project: SchemaProject,
  ownerNodeId: SchemaNodeId,
  xsdMetadataByNodeId: XsdMetadataByNodeId = {},
): readonly XsdAttributePresentationSummary[] {
  const owner = getSchemaNode(project, ownerNodeId);
  const ownerMetadata = xsdMetadataByNodeId[ownerNodeId];
  if (
    !owner ||
    (owner.kind !== 'complexType' &&
      owner.kind !== 'extension' &&
      !(
        owner.kind === 'restriction' &&
        ownerMetadata?.complexTypeDerivation !== undefined
      ))
  ) {
    return [];
  }
  return getOutgoingEdges(project, ownerNodeId)
    .filter(({ kind }) => kind === 'usesAttribute')
    .map(({ targetNodeId }, order) =>
      localAttributeSummary(project, targetNodeId, xsdMetadataByNodeId, order),
    )
    .filter(
      (summary): summary is XsdAttributePresentationSummary =>
        summary !== undefined,
    );
}

export function selectGlobalXsdAttributes(
  project: SchemaProject,
  xsdMetadataByNodeId: XsdMetadataByNodeId = {},
): readonly XsdAttributePresentationSummary[] {
  const summaries: XsdAttributePresentationSummary[] = [];
  for (const node of getNodesByKind(project, 'attribute')) {
    const metadata = xsdMetadataByNodeId[node.id];
    if (metadata?.kind !== 'attribute' || metadata.scope !== 'global') {
      continue;
    }
    const detailLines = [
      formatXsdAttributeType(project, node.id, metadata, xsdMetadataByNodeId),
      `Global · ${metadata.targetNamespace ?? 'No target namespace'}`,
      formatConstraint(metadata.valueConstraint),
    ].filter((value): value is string => Boolean(value));
    summaries.push({
      nodeId: node.id,
      name: node.name,
      detailLines,
      order: metadata.sourceOrder,
    });
  }
  return summaries.sort(
    (left, right) =>
      left.order - right.order || left.nodeId.localeCompare(right.nodeId),
  );
}
