import {
  getSchemaNode,
  type SchemaNodeId,
  type SchemaProject,
} from '../../schema/model';
import type {
  XsdComplexTypeDerivationKind,
  XsdMetadataByNodeId,
  XsdNormalizedReference,
} from '../../schema/xsd';

export interface XsdComplexTypeBasePresentation {
  readonly text: string;
  readonly targetNodeId?: SchemaNodeId;
  readonly navigable: boolean;
}

export interface XsdComplexTypeDerivationPresentation {
  readonly kind: XsdComplexTypeDerivationKind;
  readonly kindLabel: 'Extension' | 'Restriction';
  readonly base?: XsdComplexTypeBasePresentation;
  readonly declaredAttributeCount: number;
  readonly declaredCompositor?: 'sequence' | 'choice' | 'all';
}

export function formatXsdComplexTypeBase(
  project: SchemaProject,
  reference: XsdNormalizedReference | undefined,
): XsdComplexTypeBasePresentation | undefined {
  if (!reference || reference.kind !== 'complexTypeBase') return undefined;
  if (reference.resolution === 'resolved' && reference.targetNodeId) {
    const target = getSchemaNode(project, reference.targetNodeId);
    if (target?.kind === 'complexType') {
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

export function selectXsdComplexTypeDerivationPresentation(
  project: SchemaProject,
  nodeId: SchemaNodeId,
  xsdMetadataByNodeId: XsdMetadataByNodeId = {},
): XsdComplexTypeDerivationPresentation | undefined {
  const node = getSchemaNode(project, nodeId);
  const metadata = xsdMetadataByNodeId[nodeId];
  if (
    !node ||
    !metadata ||
    metadata.kind !== node.kind ||
    (node.kind !== 'complexType' &&
      node.kind !== 'extension' &&
      node.kind !== 'restriction') ||
    !metadata.complexTypeDerivation
  ) {
    return undefined;
  }
  const derivation = metadata.complexTypeDerivation;
  const base = formatXsdComplexTypeBase(project, derivation.baseReference);
  return {
    kind: derivation.kind,
    kindLabel: derivation.kind === 'extension' ? 'Extension' : 'Restriction',
    ...(base === undefined ? {} : { base }),
    declaredAttributeCount: derivation.declaredAttributeCount,
    ...(derivation.declaredCompositor === undefined
      ? {}
      : { declaredCompositor: derivation.declaredCompositor }),
  };
}
