import {
  getNodesByKind,
  getSchemaNode,
  type SchemaNode,
  type SchemaNodeId,
  type SchemaOccurrence,
  type SchemaProject,
} from '../../schema/model';
import type {
  XsdMetadataByNodeId,
  XsdNodeMetadata,
  XsdNormalizedReference,
} from '../../schema/xsd/xsdProjectMetadata';
import { selectLikelyDocumentElementIds } from '../../schema/xsd/xsdQueries';
import { selectXsdRestrictionPresentation } from './xsdRestrictionPresentation';
import { selectXsdComplexTypeDerivationPresentation } from './xsdComplexTypeDerivationPresentation';

export interface XsdPresentationProperty {
  readonly id: string;
  readonly label: string;
  readonly value: string;
}

export interface XsdReferencePresentation {
  readonly text: string;
  readonly targetNodeId?: SchemaNodeId;
  readonly navigable: boolean;
}

export interface XsdNodePresentation {
  readonly properties: readonly XsdPresentationProperty[];
  readonly scope?: string;
  readonly occurrence?: string;
  readonly typeReference?: XsdReferencePresentation;
  readonly elementReference?: XsdReferencePresentation;
}

export interface XsdNavigationGroups {
  readonly schemaOverview?: SchemaNode;
  readonly documentElements: readonly SchemaNode[];
  readonly otherGlobalElements: readonly SchemaNode[];
  readonly globalElements: readonly SchemaNode[];
  readonly complexTypes: readonly SchemaNode[];
  readonly simpleTypes: readonly SchemaNode[];
  readonly globalAttributes: readonly SchemaNode[];
  readonly modelGroups: readonly SchemaNode[];
  readonly attributeGroups: readonly SchemaNode[];
  readonly identityConstraints: readonly SchemaNode[];
  readonly notations: readonly SchemaNode[];
  readonly builtInTypes: readonly SchemaNode[];
}

export function getSchemaNodeDisplayName(
  project: SchemaProject,
  node: SchemaNode,
  xsdMetadataByNodeId: XsdMetadataByNodeId = {},
): string {
  const metadata = xsdMetadataByNodeId[node.id];
  return node.kind === 'schema' &&
    metadata?.kind === 'schema' &&
    metadata.scope === 'schema' &&
    getSchemaNode(project, node.id)
    ? 'Schema overview'
    : node.name;
}

export function formatXsdOccurrence(
  occurrence: SchemaOccurrence | undefined,
): string | undefined {
  if (!occurrence) return undefined;
  if (occurrence.min === occurrence.max) return String(occurrence.min);
  return `${occurrence.min}..${occurrence.max}`;
}

export function formatXsdScope(
  metadata: Pick<XsdNodeMetadata, 'scope'>,
): string | undefined {
  switch (metadata.scope) {
    case 'global':
      return 'Global';
    case 'local':
      return 'Local';
    case 'anonymous':
      return 'Anonymous';
    case 'schema':
      return undefined;
    case 'standard':
      return 'Built-in standard reference';
  }
}

export function formatXsdLocalForm(
  metadata: Pick<XsdNodeMetadata, 'localForm'>,
): string | undefined {
  const localForm = metadata.localForm;
  if (!localForm) return undefined;
  if (localForm.resolution === 'inherited') {
    return `${localForm.value} (inherited)`;
  }
  return localForm.resolution === 'explicit'
    ? `${localForm.value} (explicit)`
    : `${localForm.lexicalValue} (explicit; deferred)`;
}

export function formatXsdReference(
  project: SchemaProject,
  reference: XsdNormalizedReference | undefined,
): XsdReferencePresentation | undefined {
  if (!reference) return undefined;

  if (reference.resolution === 'resolved' && reference.targetNodeId) {
    const target = getSchemaNode(project, reference.targetNodeId);
    if (target) {
      const lexicalSuffix =
        reference.raw === target.name ? '' : ` (${reference.raw})`;
      return {
        text: `${target.name}${lexicalSuffix}`,
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

function property(
  id: string,
  label: string,
  value: string | undefined,
): XsdPresentationProperty[] {
  return value ? [{ id, label, value }] : [];
}

function getSourceFilename(
  project: SchemaProject,
  sourceFileId: string,
): string | undefined {
  return project.sourceFiles?.find(({ id }) => id === sourceFileId)?.filename;
}

export function selectXsdNodePresentation(
  project: SchemaProject,
  nodeId: SchemaNodeId,
  xsdMetadataByNodeId: XsdMetadataByNodeId = {},
): XsdNodePresentation | undefined {
  const node = getSchemaNode(project, nodeId);
  const metadata = xsdMetadataByNodeId[nodeId];
  if (!node || !metadata || metadata.kind !== node.kind) return undefined;

  const scope = formatXsdScope(metadata);
  const occurrence = formatXsdOccurrence(metadata.occurrence);
  const typeReference = formatXsdReference(project, metadata.typeReference);
  const elementReference = formatXsdReference(
    project,
    metadata.elementReference,
  );
  const localForm = formatXsdLocalForm(metadata);
  const restriction = selectXsdRestrictionPresentation(
    project,
    nodeId,
    xsdMetadataByNodeId,
  );
  const complexDerivation = selectXsdComplexTypeDerivationPresentation(
    project,
    nodeId,
    xsdMetadataByNodeId,
  );
  const properties: XsdPresentationProperty[] = [];

  if (node.kind === 'schema') {
    properties.push(
      ...property(
        'source-file',
        'Source file',
        getSourceFilename(project, metadata.sourceFileId),
      ),
      ...property(
        'target-namespace',
        'Target namespace',
        metadata.targetNamespace ?? 'No target namespace',
      ),
      ...property(
        'element-form-default',
        'Element form default',
        metadata.elementFormDefault,
      ),
      ...property(
        'attribute-form-default',
        'Attribute form default',
        metadata.attributeFormDefault,
      ),
      ...property('version', 'Version', metadata.version),
      ...property(
        'namespace-declarations',
        'Namespace declarations',
        metadata.namespaceDeclarations
          ?.map(
            ({ prefix, namespaceUri }) =>
              `${prefix.length === 0 ? 'default' : prefix}=${namespaceUri}`,
          )
          .join(', '),
      ),
      ...property('block-default', 'Block default', metadata.block?.join(' ')),
      ...property('final-default', 'Final default', metadata.final?.join(' ')),
    );
  } else if (node.kind === 'globalElement') {
    properties.push(
      ...property('scope', 'Scope', scope),
      ...property('namespace', 'Namespace', metadata.targetNamespace),
      ...property('type', 'Type', typeReference?.text),
    );
  } else if (node.kind === 'localElement' || node.kind === 'elementReference') {
    properties.push(
      ...property('scope', 'Scope', scope),
      ...property('occurs', 'Occurs', occurrence),
      ...property('element-form', 'Element form', localForm),
      ...property('type', 'Type', typeReference?.text),
      ...property('references', 'References', elementReference?.text),
    );
  } else if (node.kind === 'attribute' || node.kind === 'attributeReference') {
    properties.push(
      ...property('scope', 'Scope', scope),
      ...property('type', 'Type', typeReference?.text),
      ...property(
        'role',
        'Role',
        metadata.declarationRole === 'reference'
          ? 'Attribute reference'
          : metadata.scope === 'global'
            ? 'Global declaration'
            : 'Local declaration',
      ),
    );
  } else if (node.kind === 'complexType') {
    properties.push(
      ...property('scope', 'Scope', scope),
      ...(metadata.scope === 'global'
        ? property('namespace', 'Namespace', metadata.targetNamespace)
        : []),
      ...property('derivation', 'Derivation', complexDerivation?.kindLabel),
      ...property('base-type', 'Base type', complexDerivation?.base?.text),
    );
  } else if (node.kind === 'simpleType') {
    properties.push(
      ...property('scope', 'Scope', scope),
      ...(metadata.scope === 'global'
        ? property('namespace', 'Namespace', metadata.targetNamespace)
        : []),
      ...property('base-type', 'Base type', restriction?.base?.text),
      ...(restriction && restriction.enumerationCount > 0
        ? property(
            'allowed-values',
            'Allowed values',
            String(restriction.enumerationCount),
          )
        : []),
    );
  } else if (node.kind === 'restriction') {
    properties.push(
      ...(complexDerivation
        ? [
            ...property(
              'derivation',
              'Derivation',
              complexDerivation.kindLabel,
            ),
            ...property('base-type', 'Base type', complexDerivation.base?.text),
          ]
        : [
            ...property('base-type', 'Base type', restriction?.base?.text),
            ...(restriction && restriction.enumerationCount > 0
              ? property(
                  'allowed-values',
                  'Allowed values',
                  String(restriction.enumerationCount),
                )
              : []),
          ]),
    );
  } else if (node.kind === 'extension') {
    properties.push(
      ...property('derivation', 'Derivation', complexDerivation?.kindLabel),
      ...property('base-type', 'Base type', complexDerivation?.base?.text),
    );
  } else if (
    node.kind === 'sequence' ||
    node.kind === 'choice' ||
    node.kind === 'all'
  ) {
    properties.push(...property('occurs', 'Occurs', occurrence));
  } else if (
    node.kind === 'group' ||
    node.kind === 'attributeGroup' ||
    node.kind === 'groupReference' ||
    node.kind === 'attributeGroupReference'
  ) {
    properties.push(
      ...property('scope', 'Scope', scope),
      ...property(
        'role',
        'Role',
        metadata.declarationRole === 'reference' ? 'Reference' : 'Definition',
      ),
      ...property('occurs', 'Occurs', occurrence),
    );
  } else if (node.kind === 'simpleContent' || node.kind === 'complexContent') {
    properties.push(
      ...property('content-kind', 'Content kind', metadata.contentKind),
      ...property(
        'mixed',
        'Mixed',
        metadata.mixed === undefined ? undefined : String(metadata.mixed),
      ),
    );
  } else if (
    node.kind === 'elementWildcard' ||
    node.kind === 'attributeWildcard'
  ) {
    properties.push(
      ...property(
        'namespace-constraint',
        'Namespace constraint',
        metadata.wildcardNamespace?.join(' '),
      ),
      ...property(
        'process-contents',
        'Process contents',
        metadata.processContents,
      ),
      ...property('occurs', 'Occurs', occurrence),
    );
  }

  return {
    properties,
    scope,
    occurrence,
    typeReference,
    elementReference,
  };
}

function isGlobalNamedType(
  node: SchemaNode,
  xsdMetadataByNodeId: XsdMetadataByNodeId,
): boolean {
  const metadata = xsdMetadataByNodeId[node.id];
  return Boolean(
    metadata &&
    metadata.kind === node.kind &&
    metadata.scope === 'global' &&
    metadata.anonymous !== true &&
    node.name.trim(),
  );
}

export function selectXsdNavigationGroups(
  project: SchemaProject,
  xsdMetadataByNodeId: XsdMetadataByNodeId = {},
): XsdNavigationGroups {
  const schemaOverview = getNodesByKind(project, 'schema').find((node) => {
    const metadata = xsdMetadataByNodeId[node.id];
    return metadata?.kind === 'schema' && metadata.scope === 'schema';
  });
  const globalElements = getNodesByKind(project, 'globalElement').filter(
    (node) => {
      const metadata = xsdMetadataByNodeId[node.id];
      return metadata?.kind === 'globalElement' && metadata.scope === 'global';
    },
  );
  const candidateIds = selectLikelyDocumentElementIds(
    project,
    xsdMetadataByNodeId,
  );
  const candidateIdSet = new Set(candidateIds);

  return {
    schemaOverview,
    documentElements:
      candidateIds.length > 0
        ? globalElements.filter(({ id }) => candidateIdSet.has(id))
        : [],
    otherGlobalElements:
      candidateIds.length > 0
        ? globalElements.filter(({ id }) => !candidateIdSet.has(id))
        : [],
    globalElements: candidateIds.length === 0 ? globalElements : [],
    complexTypes: getNodesByKind(project, 'complexType').filter((node) =>
      isGlobalNamedType(node, xsdMetadataByNodeId),
    ),
    simpleTypes: getNodesByKind(project, 'simpleType').filter((node) =>
      isGlobalNamedType(node, xsdMetadataByNodeId),
    ),
    globalAttributes: getNodesByKind(project, 'attribute').filter((node) => {
      const metadata = xsdMetadataByNodeId[node.id];
      return metadata?.kind === 'attribute' && metadata.scope === 'global';
    }),
    modelGroups: getNodesByKind(project, 'group').filter((node) => {
      const metadata = xsdMetadataByNodeId[node.id];
      return metadata?.kind === 'group' && metadata.scope === 'global';
    }),
    attributeGroups: getNodesByKind(project, 'attributeGroup').filter(
      (node) => {
        const metadata = xsdMetadataByNodeId[node.id];
        return (
          metadata?.kind === 'attributeGroup' && metadata.scope === 'global'
        );
      },
    ),
    identityConstraints: getNodesByKind(project, 'identityConstraint'),
    notations: getNodesByKind(project, 'xsdNotation'),
    builtInTypes: getNodesByKind(project, 'builtInType'),
  };
}
