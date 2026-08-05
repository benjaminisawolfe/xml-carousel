import type {
  SchemaEdge,
  SchemaEdgeKind,
  SchemaNode,
  SchemaNodeId,
  SchemaProject,
} from '../../../schema/model';
import type {
  XsdMetadataByNodeId,
  XsdNodeMetadata,
  XsdNormalizedReference,
} from '../../../schema/xsd';
import type {
  SchemaPackageDiagnostic,
  SchemaPackageReferenceIssueReason,
  SchemaPackageUnresolvedReference,
} from './schemaPackageTypes';
import {
  clonePlainValue,
  compareUnicodeCodePoints,
  resolveControlledProjectPath,
} from './schemaPackageUtilities';

interface TypeSymbol {
  readonly node: SchemaNode;
  readonly kind: 'complexType' | 'simpleType';
}

interface SymbolIndex {
  readonly elements: ReadonlyMap<string, readonly SchemaNode[]>;
  readonly attributes: ReadonlyMap<string, readonly SchemaNode[]>;
  readonly types: ReadonlyMap<string, readonly TypeSymbol[]>;
  readonly groups: ReadonlyMap<string, readonly SchemaNode[]>;
  readonly attributeGroups: ReadonlyMap<string, readonly SchemaNode[]>;
  readonly notations: ReadonlyMap<string, readonly SchemaNode[]>;
  readonly identities: ReadonlyMap<string, readonly SchemaNode[]>;
}

interface PendingReference {
  readonly node: SchemaNode;
  readonly metadata: XsdNodeMetadata;
  readonly reference: XsdNormalizedReference;
  readonly field:
    | 'typeReference'
    | 'elementReference'
    | 'attributeReference'
    | 'groupReference'
    | 'attributeGroupReference'
    | 'substitutionGroupReference'
    | 'restrictionBaseReference'
    | 'complexTypeBaseReference'
    | 'listItemTypeReference'
    | 'unionMemberTypeReference'
    | 'notationReference'
    | 'keyrefTargetReference';
  readonly referenceIndex?: number;
}

export interface SchemaPackageReferenceResolutionResult {
  readonly project: SchemaProject;
  readonly xsdMetadataByNodeId: XsdMetadataByNodeId;
  readonly unresolvedReferences: readonly SchemaPackageUnresolvedReference[];
  readonly diagnostics: readonly SchemaPackageDiagnostic[];
}

function expandedName(
  namespaceUri: string | undefined,
  localName: string,
): string {
  const namespace = namespaceUri ?? '';
  return `${namespace.length}:${namespace}${localName.length}:${localName}`;
}

function appendSymbol<T>(
  index: Map<string, T[]>,
  key: string,
  symbol: T,
): void {
  const symbols = index.get(key);
  if (symbols) symbols.push(symbol);
  else index.set(key, [symbol]);
}

function buildSymbolIndex(
  project: SchemaProject,
  metadataByNodeId: XsdMetadataByNodeId,
  effectiveNamespacesBySourceFileId: ReadonlyMap<string, readonly string[]>,
): SymbolIndex {
  const elements = new Map<string, SchemaNode[]>();
  const attributes = new Map<string, SchemaNode[]>();
  const types = new Map<string, TypeSymbol[]>();
  const groups = new Map<string, SchemaNode[]>();
  const attributeGroups = new Map<string, SchemaNode[]>();
  const notations = new Map<string, SchemaNode[]>();
  const identities = new Map<string, SchemaNode[]>();

  for (const node of project.nodes) {
    const metadata = metadataByNodeId[node.id];
    if (!metadata) continue;
    if (node.kind === 'identityConstraint') {
      const identityName = metadata.identityConstraint?.name;
      if (identityName) {
        appendSymbol(
          identities,
          expandedName(metadata.targetNamespace, identityName),
          node,
        );
      }
      continue;
    }
    if (metadata.scope !== 'global') continue;
    const namespaces = new Set<string | undefined>([
      metadata.targetNamespace,
      ...(node.sourceFileId
        ? (effectiveNamespacesBySourceFileId.get(node.sourceFileId) ?? [])
        : []),
    ]);
    for (const namespace of namespaces) {
      const key = expandedName(namespace, node.name);
      if (node.kind === 'globalElement') {
        appendSymbol(elements, key, node);
      } else if (node.kind === 'attribute') {
        appendSymbol(attributes, key, node);
      } else if (node.kind === 'complexType' || node.kind === 'simpleType') {
        appendSymbol(types, key, { node, kind: node.kind });
      } else if (node.kind === 'group') {
        appendSymbol(groups, key, node);
      } else if (node.kind === 'attributeGroup') {
        appendSymbol(attributeGroups, key, node);
      } else if (node.kind === 'xsdNotation') {
        appendSymbol(notations, key, node);
      }
    }
  }
  return {
    elements,
    attributes,
    types,
    groups,
    attributeGroups,
    notations,
    identities,
  };
}

function sourceNodeCompare(left: SchemaNode, right: SchemaNode): number {
  return (
    (left.sourceOrder ?? Number.MAX_SAFE_INTEGER) -
      (right.sourceOrder ?? Number.MAX_SAFE_INTEGER) ||
    compareUnicodeCodePoints(left.id, right.id)
  );
}

function pendingReferences(
  project: SchemaProject,
  metadataByNodeId: XsdMetadataByNodeId,
): readonly PendingReference[] {
  const pending: PendingReference[] = [];
  for (const node of [...project.nodes].sort(sourceNodeCompare)) {
    const metadata = metadataByNodeId[node.id];
    if (!metadata) continue;
    for (const field of [
      'typeReference',
      'elementReference',
      'attributeReference',
      'groupReference',
      'attributeGroupReference',
      'substitutionGroupReference',
    ] as const) {
      const reference = metadata[field];
      if (reference?.resolution === 'externalDeferred') {
        pending.push({ node, metadata, reference, field });
      }
    }
    if (
      node.kind === 'restriction' &&
      metadata.restrictionBaseReference?.resolution === 'externalDeferred'
    ) {
      pending.push({
        node,
        metadata,
        reference: metadata.restrictionBaseReference,
        field: 'restrictionBaseReference',
      });
    }
    if (metadata.listItemTypeReference?.resolution === 'externalDeferred') {
      pending.push({
        node,
        metadata,
        reference: metadata.listItemTypeReference,
        field: 'listItemTypeReference',
      });
    }
    for (const [referenceIndex, reference] of (
      metadata.unionMemberTypeReferences ?? []
    ).entries()) {
      if (reference.resolution === 'externalDeferred') {
        pending.push({
          node,
          metadata,
          reference,
          field: 'unionMemberTypeReference',
          referenceIndex,
        });
      }
    }
    if (metadata.notationReference?.resolution === 'externalDeferred') {
      pending.push({
        node,
        metadata,
        reference: metadata.notationReference,
        field: 'notationReference',
      });
    }
    if (
      metadata.identityConstraint?.kind === 'keyref' &&
      metadata.identityConstraint.referReference?.resolution ===
        'externalDeferred'
    ) {
      pending.push({
        node,
        metadata,
        reference: metadata.identityConstraint.referReference,
        field: 'keyrefTargetReference',
      });
    }
    if (
      (node.kind === 'extension' || node.kind === 'restriction') &&
      metadata.complexTypeDerivation?.baseReference?.resolution ===
        'externalDeferred'
    ) {
      pending.push({
        node,
        metadata,
        reference: metadata.complexTypeDerivation.baseReference,
        field: 'complexTypeBaseReference',
      });
    }
  }
  return pending;
}

function candidateNodes(
  pending: PendingReference,
  index: SymbolIndex,
): {
  readonly all: readonly SchemaNode[];
  readonly valid: readonly SchemaNode[];
} {
  const key = expandedName(
    pending.reference.namespaceUri,
    pending.reference.localName,
  );
  if (pending.field === 'elementReference') {
    const nodes = index.elements.get(key) ?? [];
    return { all: nodes, valid: nodes };
  }
  if (pending.field === 'attributeReference') {
    const nodes = index.attributes.get(key) ?? [];
    return { all: nodes, valid: nodes };
  }
  if (pending.field === 'groupReference') {
    const nodes = index.groups.get(key) ?? [];
    return { all: nodes, valid: nodes };
  }
  if (pending.field === 'attributeGroupReference') {
    const nodes = index.attributeGroups.get(key) ?? [];
    return { all: nodes, valid: nodes };
  }
  if (pending.field === 'substitutionGroupReference') {
    const nodes = index.elements.get(key) ?? [];
    return { all: nodes, valid: nodes };
  }
  if (pending.field === 'keyrefTargetReference') {
    const nodes = index.identities.get(key) ?? [];
    return { all: nodes, valid: nodes };
  }
  if (pending.field === 'notationReference') {
    const nodes = index.notations.get(key) ?? [];
    return { all: nodes, valid: nodes };
  }

  const symbols = index.types.get(key) ?? [];
  let valid = symbols;
  if (
    pending.field === 'restrictionBaseReference' ||
    (pending.field === 'typeReference' &&
      (pending.node.kind === 'attribute' ||
        pending.node.kind === 'attributeReference'))
  ) {
    valid = symbols.filter((symbol) => symbol.kind === 'simpleType');
  } else if (pending.field === 'complexTypeBaseReference') {
    valid = symbols.filter((symbol) => symbol.kind === 'complexType');
  }
  return {
    all: symbols.map(({ node }) => node),
    valid: valid.map(({ node }) => node),
  };
}

function issueReason(
  all: readonly SchemaNode[],
  valid: readonly SchemaNode[],
): SchemaPackageReferenceIssueReason | undefined {
  if (all.length === 0) return 'notFound';
  if (valid.length === 0) return 'invalidTargetKind';
  if (valid.length > 1) return 'ambiguous';
  return undefined;
}

function crossFileEdgeKind(pending: PendingReference): SchemaEdgeKind {
  if (pending.field === 'typeReference') return 'typeOf';
  if (
    pending.field === 'elementReference' ||
    pending.field === 'attributeReference'
  ) {
    return 'referencesDeclaration';
  }
  if (pending.field === 'groupReference') return 'usesGroup';
  if (pending.field === 'attributeGroupReference') return 'usesAttributeGroup';
  if (pending.field === 'restrictionBaseReference') return 'restricts';
  if (pending.field === 'listItemTypeReference') return 'listItemType';
  if (pending.field === 'unionMemberTypeReference') return 'unionMemberType';
  if (pending.field === 'notationReference') return 'notationConstraint';
  if (pending.field === 'substitutionGroupReference')
    return 'substitutionGroupMember';
  if (pending.field === 'keyrefTargetReference') return 'keyrefTargets';
  return pending.metadata.complexTypeDerivation?.kind === 'extension'
    ? 'extends'
    : 'restricts';
}

function crossFileEdgeId(
  pending: PendingReference,
  targetNodeId: SchemaNodeId,
): string {
  return [
    'schema-package-reference-edge',
    encodeURIComponent(pending.node.id),
    encodeURIComponent(pending.reference.kind),
    String(pending.referenceIndex ?? 0),
    `${pending.reference.range.start.offset}-${pending.reference.range.end.offset}`,
    encodeURIComponent(targetNodeId),
  ].join(':');
}

function resolvedReference(
  reference: XsdNormalizedReference,
  targetNodeId: SchemaNodeId,
): XsdNormalizedReference {
  return {
    ...clonePlainValue(reference),
    resolution: 'resolved',
    targetNodeId,
  };
}

function sameReference(
  left: XsdNormalizedReference | undefined,
  right: XsdNormalizedReference,
): boolean {
  return (
    left?.raw === right.raw &&
    left.range.start.offset === right.range.start.offset &&
    left.range.end.offset === right.range.end.offset
  );
}

function updateCopiedOwnerMetadata(
  project: SchemaProject,
  metadataByNodeId: Record<SchemaNodeId, XsdNodeMetadata>,
  pending: PendingReference,
  resolved: XsdNormalizedReference,
): void {
  const ownerIds = project.edges
    .filter(
      (edge) =>
        (edge.kind === 'contains' || edge.kind === 'ownsTypeVariety') &&
        edge.targetNodeId === pending.node.id,
    )
    .map((edge) => edge.sourceNodeId);
  for (const ownerId of ownerIds) {
    const owner = metadataByNodeId[ownerId];
    if (!owner) continue;
    if (
      pending.field === 'restrictionBaseReference' &&
      sameReference(owner.restrictionBaseReference, pending.reference)
    ) {
      metadataByNodeId[ownerId] = {
        ...owner,
        restrictionBaseReference: clonePlainValue(resolved),
      };
    }
    if (
      owner.typeDerivation?.baseReference &&
      sameReference(owner.typeDerivation.baseReference, pending.reference)
    ) {
      metadataByNodeId[ownerId] = {
        ...metadataByNodeId[ownerId]!,
        typeDerivation: {
          ...owner.typeDerivation,
          baseReference: clonePlainValue(resolved),
        },
      };
    }
    if (
      pending.field === 'complexTypeBaseReference' &&
      owner.complexTypeDerivation &&
      sameReference(
        owner.complexTypeDerivation.baseReference,
        pending.reference,
      )
    ) {
      metadataByNodeId[ownerId] = {
        ...owner,
        complexTypeDerivation: {
          ...owner.complexTypeDerivation,
          baseReference: clonePlainValue(resolved),
        },
      };
    }
  }
}

function updateResolvedMetadata(
  project: SchemaProject,
  metadataByNodeId: Record<SchemaNodeId, XsdNodeMetadata>,
  pending: PendingReference,
  targetNodeId: SchemaNodeId,
): void {
  const current = metadataByNodeId[pending.node.id];
  if (!current) return;
  const resolved = resolvedReference(pending.reference, targetNodeId);
  if (pending.field === 'keyrefTargetReference') {
    if (!current.identityConstraint) return;
    metadataByNodeId[pending.node.id] = {
      ...current,
      identityConstraint: {
        ...current.identityConstraint,
        referReference: resolved,
      },
    };
  } else if (pending.field === 'complexTypeBaseReference') {
    if (!current.complexTypeDerivation) return;
    metadataByNodeId[pending.node.id] = {
      ...current,
      complexTypeDerivation: {
        ...current.complexTypeDerivation,
        baseReference: resolved,
      },
    };
  } else if (pending.field === 'unionMemberTypeReference') {
    if (pending.referenceIndex === undefined) return;
    const references = [...(current.unionMemberTypeReferences ?? [])];
    references[pending.referenceIndex] = resolved;
    metadataByNodeId[pending.node.id] = {
      ...current,
      unionMemberTypeReferences: references,
    };
  } else if (pending.field === 'listItemTypeReference') {
    metadataByNodeId[pending.node.id] = {
      ...current,
      listItemTypeReference: resolved,
      ...(current.typeDerivation === undefined
        ? {}
        : {
            typeDerivation: {
              ...current.typeDerivation,
              baseReference: resolved,
            },
          }),
    };
  } else {
    metadataByNodeId[pending.node.id] = {
      ...current,
      [pending.field]: resolved,
      ...(current.typeDerivation?.baseReference &&
      sameReference(current.typeDerivation.baseReference, pending.reference)
        ? {
            typeDerivation: {
              ...current.typeDerivation,
              baseReference: resolved,
            },
          }
        : {}),
    };
  }
  updateCopiedOwnerMetadata(project, metadataByNodeId, pending, resolved);
}

interface SchemaRelationshipResolution {
  readonly project: SchemaProject;
  readonly effectiveNamespacesBySourceFileId: ReadonlyMap<
    string,
    readonly string[]
  >;
  readonly diagnostics: readonly SchemaPackageDiagnostic[];
}

function replaceProperties(
  node: SchemaNode,
  values: readonly (readonly [label: string, value: string | undefined])[],
): SchemaNode {
  const labels = new Set(values.map(([label]) => label));
  return {
    ...node,
    properties: [
      ...(node.properties ?? []).filter(({ label }) => !labels.has(label)),
      ...values.flatMap(([label, value]) =>
        value === undefined ? [] : [{ label, value }],
      ),
    ],
    searchTerms: [
      ...(node.searchTerms ?? []),
      ...values.flatMap(([label, value]) =>
        value === undefined ? [] : [label, value],
      ),
    ],
  };
}

function relationshipEdgeId(
  kind: SchemaEdgeKind,
  sourceNodeId: SchemaNodeId,
  targetNodeId: SchemaNodeId,
): string {
  return [
    'schema-package-relationship-edge',
    kind,
    encodeURIComponent(sourceNodeId),
    encodeURIComponent(targetNodeId),
  ].join(':');
}

function resolveSchemaRelationships(
  project: SchemaProject,
  metadataByNodeId: Record<SchemaNodeId, XsdNodeMetadata>,
): SchemaRelationshipResolution {
  const nodes = project.nodes.map(clonePlainValue);
  const nodeIndexById = new Map(nodes.map((node, index) => [node.id, index]));
  const edges = project.edges.map(clonePlainValue);
  const edgeIds = new Set(edges.map(({ id }) => id));
  const schemaBySourceFileId = new Map<string, SchemaNode>();
  const schemasByTargetNamespace = new Map<string, SchemaNode[]>();
  const sourcePathById = new Map(
    (project.sourceFiles ?? []).map(({ id, filename }) => [id, filename]),
  );
  const schemaByPath = new Map<string, SchemaNode>();
  for (const node of nodes) {
    if (node.kind !== 'schema' || !node.sourceFileId) continue;
    schemaBySourceFileId.set(node.sourceFileId, node);
    const path = sourcePathById.get(node.sourceFileId);
    if (path) schemaByPath.set(path, node);
    const namespace = metadataByNodeId[node.id]?.targetNamespace ?? '';
    const existing = schemasByTargetNamespace.get(namespace);
    if (existing) existing.push(node);
    else schemasByTargetNamespace.set(namespace, [node]);
  }

  const resolvedTargets = new Map<SchemaNodeId, SchemaNode>();
  const diagnostics: SchemaPackageDiagnostic[] = [];
  const effectiveNamespaces = new Map<string, Set<string>>();
  const relationshipNodes = nodes
    .filter((node) => metadataByNodeId[node.id]?.schemaRelationship)
    .sort(sourceNodeCompare);

  function addEdge(edge: SchemaEdge): void {
    if (edgeIds.has(edge.id)) return;
    edgeIds.add(edge.id);
    edges.push(edge);
  }

  for (const node of relationshipNodes) {
    const current = metadataByNodeId[node.id]!;
    const relationship = current.schemaRelationship!;
    const sourceSchema = node.sourceFileId
      ? schemaBySourceFileId.get(node.sourceFileId)
      : undefined;
    let normalizedPath: string | undefined;
    let target: SchemaNode | undefined;
    let status: NonNullable<
      XsdNodeMetadata['schemaRelationship']
    >['resolutionStatus'] = 'missing';
    let detail = 'Required schema is not supplied by this project';

    if (relationship.lexicalSchemaLocation !== undefined) {
      const path = resolveControlledProjectPath(
        relationship.sourcePath,
        relationship.lexicalSchemaLocation,
      );
      normalizedPath = path.path;
      if (path.status === 'blocked') {
        status = 'blocked';
        detail = path.detail;
      } else {
        target = path.path ? schemaByPath.get(path.path) : undefined;
        if (target) {
          status = 'resolved';
          detail = 'Resolved to supplied project schema';
        }
      }
    } else if (relationship.kind === 'import') {
      const candidates =
        schemasByTargetNamespace.get(relationship.importedNamespace ?? '') ??
        [];
      const filtered = candidates.filter(({ id }) => id !== sourceSchema?.id);
      if (filtered.length === 1) {
        target = filtered[0];
        status = 'resolved';
        detail = 'Resolved by unique supplied target namespace';
      } else if (filtered.length > 1) {
        status = 'ambiguous';
        detail = 'Multiple supplied schemas declare the imported namespace';
      }
    }

    const targetMetadata = target ? metadataByNodeId[target.id] : undefined;
    const sourceNamespace = sourceSchema
      ? metadataByNodeId[sourceSchema.id]?.targetNamespace
      : undefined;
    const chameleon =
      status === 'resolved' &&
      (relationship.kind === 'include' || relationship.kind === 'redefine') &&
      targetMetadata?.targetNamespace === undefined &&
      sourceNamespace !== undefined;
    const contextId = chameleon
      ? [
          'xsd-chameleon-context',
          encodeURIComponent(target!.sourceFileId ?? ''),
          encodeURIComponent(sourceNamespace!),
        ].join(':')
      : undefined;
    if (chameleon && target?.sourceFileId) {
      const namespaces = effectiveNamespaces.get(target.sourceFileId);
      if (namespaces) namespaces.add(sourceNamespace!);
      else
        effectiveNamespaces.set(
          target.sourceFileId,
          new Set([sourceNamespace!]),
        );
    }

    metadataByNodeId[node.id] = {
      ...current,
      schemaRelationship: {
        ...relationship,
        ...(normalizedPath === undefined
          ? {}
          : { normalizedProjectPath: normalizedPath }),
        ...(target === undefined
          ? {}
          : {
              targetPath: target.sourceFileId
                ? sourcePathById.get(target.sourceFileId)
                : undefined,
              targetSchemaNodeId: target.id,
            }),
        resolutionStatus: status,
        resolutionDetail: detail,
        ...(chameleon
          ? { effectiveNamespace: sourceNamespace, contextId }
          : {}),
      },
    };
    const nodeIndex = nodeIndexById.get(node.id);
    if (nodeIndex !== undefined) {
      nodes[nodeIndex] = replaceProperties(nodes[nodeIndex]!, [
        ['Normalized project path', normalizedPath],
        [
          'Target schema',
          target?.sourceFileId
            ? sourcePathById.get(target.sourceFileId)
            : undefined,
        ],
        ['Resolution status', status],
        ['Resolution detail', detail],
        ['Effective namespace', chameleon ? sourceNamespace : undefined],
        ['Chameleon context', contextId],
      ]);
    }
    if (!target) {
      diagnostics.push({
        stage: 'package',
        code:
          status === 'blocked'
            ? 'blocked-xsd-dependency'
            : status === 'ambiguous'
              ? 'ambiguous-xsd-dependency'
              : 'missing-xsd-dependency',
        severity: 'warning',
        message: `${relationship.kind} relationship is ${status}: ${detail}.`,
        sourceFileId: node.sourceFileId ?? current.sourceFileId,
        nodeId: node.id,
        reference:
          relationship.lexicalSchemaLocation ??
          relationship.importedNamespace ??
          relationship.kind,
        range: clonePlainValue(current.sourceRange),
      });
      continue;
    }
    resolvedTargets.set(node.id, target);
    const dependencyKind: SchemaEdgeKind =
      relationship.kind === 'redefine' ? 'redefinesSchema' : 'dependsOnSchema';
    addEdge({
      id: relationshipEdgeId(dependencyKind, node.id, target.id),
      kind: dependencyKind,
      sourceNodeId: node.id,
      targetNodeId: target.id,
    });
    if (chameleon) {
      addEdge({
        id: relationshipEdgeId('chameleonNamespaceContext', node.id, target.id),
        kind: 'chameleonNamespaceContext',
        sourceNodeId: node.id,
        targetNodeId: target.id,
      });
    }
    if (relationship.kind === 'redefine' && target.sourceFileId) {
      for (const redefined of nodes) {
        const redefinedMetadata = metadataByNodeId[redefined.id];
        if (
          redefined.sourceFileId !== node.sourceFileId ||
          !redefinedMetadata ||
          redefinedMetadata.scope !== 'global' ||
          redefinedMetadata.sourceRange.start.offset <=
            current.sourceRange.start.offset ||
          redefinedMetadata.sourceRange.end.offset >=
            current.sourceRange.end.offset
        ) {
          continue;
        }
        const original = nodes.find(
          (candidate) =>
            candidate.sourceFileId === target.sourceFileId &&
            candidate.kind === redefined.kind &&
            candidate.name === redefined.name &&
            metadataByNodeId[candidate.id]?.scope === 'global',
        );
        if (!original) continue;
        addEdge({
          id: relationshipEdgeId(
            'redefinesComponent',
            redefined.id,
            original.id,
          ),
          kind: 'redefinesComponent',
          sourceNodeId: redefined.id,
          targetNodeId: original.id,
        });
      }
    }
  }

  const incomingCount = new Map<SchemaNodeId, number>();
  for (const target of resolvedTargets.values()) {
    incomingCount.set(target.id, (incomingCount.get(target.id) ?? 0) + 1);
  }
  for (const [relationshipId, target] of resolvedTargets) {
    if ((incomingCount.get(target.id) ?? 0) < 2) continue;
    const current = metadataByNodeId[relationshipId]!;
    metadataByNodeId[relationshipId] = {
      ...current,
      schemaRelationship: {
        ...current.schemaRelationship!,
        sharedTarget: true,
      },
    };
    const index = nodeIndexById.get(relationshipId);
    if (index !== undefined) {
      nodes[index] = replaceProperties(nodes[index]!, [
        ['Shared dependency', 'yes'],
      ]);
    }
    addEdge({
      id: relationshipEdgeId('sharesDependency', relationshipId, target.id),
      kind: 'sharesDependency',
      sourceNodeId: relationshipId,
      targetNodeId: target.id,
    });
  }

  const adjacency = new Map<SchemaNodeId, SchemaNodeId[]>();
  for (const [relationshipId, target] of resolvedTargets) {
    const sourceSchemaId = metadataByNodeId[relationshipId]?.ownerNodeId;
    if (!sourceSchemaId) continue;
    const targets = adjacency.get(sourceSchemaId);
    if (targets) targets.push(target.id);
    else adjacency.set(sourceSchemaId, [target.id]);
  }
  function reaches(
    current: SchemaNodeId,
    goal: SchemaNodeId,
    seen = new Set<SchemaNodeId>(),
  ): boolean {
    if (current === goal) return true;
    if (seen.has(current) || seen.size >= project.nodes.length) return false;
    seen.add(current);
    return (adjacency.get(current) ?? []).some((next) =>
      reaches(next, goal, seen),
    );
  }
  for (const [relationshipId, target] of resolvedTargets) {
    const sourceSchemaId = metadataByNodeId[relationshipId]?.ownerNodeId;
    if (!sourceSchemaId || !reaches(target.id, sourceSchemaId)) continue;
    const current = metadataByNodeId[relationshipId]!;
    metadataByNodeId[relationshipId] = {
      ...current,
      schemaRelationship: {
        ...current.schemaRelationship!,
        cycleMember: true,
      },
    };
    const index = nodeIndexById.get(relationshipId);
    if (index !== undefined) {
      nodes[index] = replaceProperties(nodes[index]!, [
        ['Dependency cycle', 'yes (bounded)'],
      ]);
    }
    addEdge({
      id: relationshipEdgeId(
        'dependencyCycleMember',
        relationshipId,
        target.id,
      ),
      kind: 'dependencyCycleMember',
      sourceNodeId: relationshipId,
      targetNodeId: target.id,
    });
  }

  return {
    project: { ...clonePlainValue(project), nodes, edges },
    effectiveNamespacesBySourceFileId: new Map(
      [...effectiveNamespaces].map(([sourceFileId, namespaces]) => [
        sourceFileId,
        [...namespaces].sort(compareUnicodeCodePoints),
      ]),
    ),
    diagnostics,
  };
}

function unresolvedId(
  pending: PendingReference,
  reason: SchemaPackageReferenceIssueReason,
): string {
  return [
    'schema-package-unresolved',
    encodeURIComponent(pending.node.id),
    encodeURIComponent(pending.reference.kind),
    `${pending.reference.range.start.offset}-${pending.reference.range.end.offset}`,
    reason,
  ].join(':');
}

function warningFor(
  unresolved: SchemaPackageUnresolvedReference,
): SchemaPackageDiagnostic {
  const code =
    unresolved.reason === 'notFound'
      ? 'unresolved-xsd-reference'
      : unresolved.reason === 'ambiguous'
        ? 'ambiguous-xsd-reference'
        : 'invalid-xsd-reference-target';
  const message =
    unresolved.reason === 'notFound'
      ? `XSD reference "${unresolved.raw}" has no matching declaration in this package.`
      : unresolved.reason === 'ambiguous'
        ? `XSD reference "${unresolved.raw}" matches multiple declarations in this package.`
        : `XSD reference "${unresolved.raw}" has no declaration of the required kind in this package.`;
  return {
    stage: 'package',
    code,
    severity: 'warning',
    message,
    sourceFileId: unresolved.sourceFileId,
    nodeId: unresolved.sourceNodeId,
    reference: unresolved.raw,
    range: clonePlainValue(unresolved.range),
  };
}

export function resolveSchemaPackageXsdReferences(
  project: SchemaProject,
  xsdMetadataByNodeId: XsdMetadataByNodeId,
): SchemaPackageReferenceResolutionResult {
  const metadata = clonePlainValue(xsdMetadataByNodeId) as Record<
    SchemaNodeId,
    XsdNodeMetadata
  >;
  const relationships = resolveSchemaRelationships(project, metadata);
  const resolvedProject = relationships.project;
  const index = buildSymbolIndex(
    resolvedProject,
    metadata,
    relationships.effectiveNamespacesBySourceFileId,
  );
  const edges: SchemaEdge[] = resolvedProject.edges.map(clonePlainValue);
  const edgeIds = new Set(edges.map((edge) => edge.id));
  const unresolvedReferences: SchemaPackageUnresolvedReference[] = [];
  const diagnostics: SchemaPackageDiagnostic[] = [...relationships.diagnostics];

  for (const pending of pendingReferences(resolvedProject, metadata)) {
    const candidates = candidateNodes(pending, index);
    const reason = issueReason(candidates.all, candidates.valid);
    if (reason) {
      const candidateNodeIds = [
        ...(reason === 'invalidTargetKind' ? candidates.all : candidates.valid),
      ]
        .map((node) => node.id)
        .sort(compareUnicodeCodePoints);
      const unresolved: SchemaPackageUnresolvedReference = {
        id: unresolvedId(pending, reason),
        sourceNodeId: pending.node.id,
        sourceFileId:
          pending.node.sourceFileId ?? pending.metadata.sourceFileId,
        referenceKind: pending.reference.kind,
        raw: pending.reference.raw,
        localName: pending.reference.localName,
        ...(pending.reference.namespaceUri === undefined
          ? {}
          : { namespaceUri: pending.reference.namespaceUri }),
        reason,
        candidateNodeIds,
        range: clonePlainValue(pending.reference.range),
      };
      unresolvedReferences.push(unresolved);
      diagnostics.push(warningFor(unresolved));
      continue;
    }

    const targetNodeId = candidates.valid[0]!.id;
    const edge: SchemaEdge = {
      id: crossFileEdgeId(pending, targetNodeId),
      kind: crossFileEdgeKind(pending),
      sourceNodeId: pending.node.id,
      targetNodeId,
      ...(pending.field === 'unionMemberTypeReference' &&
      pending.referenceIndex !== undefined
        ? { order: pending.referenceIndex }
        : {}),
    };
    if (edgeIds.has(edge.id)) {
      diagnostics.push({
        stage: 'package',
        code: 'edge-id-collision',
        severity: 'error',
        message: 'A cross-file reference edge identifier is duplicated.',
        sourceFileId:
          pending.node.sourceFileId ?? pending.metadata.sourceFileId,
        nodeId: pending.node.id,
        edgeId: edge.id,
        reference: pending.reference.raw,
        range: clonePlainValue(pending.reference.range),
      });
      continue;
    }
    edgeIds.add(edge.id);
    edges.push(edge);
    if (
      pending.field === 'restrictionBaseReference' ||
      pending.field === 'complexTypeBaseReference'
    ) {
      for (const ownerId of resolvedProject.edges
        .filter(
          ({ kind, targetNodeId: candidate }) =>
            (kind === 'contains' || kind === 'ownsTypeVariety') &&
            candidate === pending.node.id,
        )
        .map(({ sourceNodeId }) => sourceNodeId)) {
        const owner = resolvedProject.nodes.find(({ id }) => id === ownerId);
        if (owner?.kind !== 'simpleType' && owner?.kind !== 'complexType') {
          continue;
        }
        const ownerEdge: SchemaEdge = {
          id: [
            'schema-package-derived-type-edge',
            encodeURIComponent(ownerId),
            encodeURIComponent(targetNodeId),
          ].join(':'),
          kind: 'derivesFrom',
          sourceNodeId: ownerId,
          targetNodeId,
        };
        if (!edgeIds.has(ownerEdge.id)) {
          edgeIds.add(ownerEdge.id);
          edges.push(ownerEdge);
        }
      }
    }
    updateResolvedMetadata(resolvedProject, metadata, pending, targetNodeId);
  }

  return {
    project: {
      ...clonePlainValue(resolvedProject),
      edges,
    },
    xsdMetadataByNodeId: metadata,
    unresolvedReferences,
    diagnostics,
  };
}
