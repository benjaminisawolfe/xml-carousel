import type {
  SchemaEdge,
  SchemaNode,
  SchemaNodeId,
  SchemaProject,
} from '../model';

function property(node: SchemaNode, label: string): string | undefined {
  return node.properties?.find((value) => value.label === label)?.value;
}

function compareNodes(left: SchemaNode, right: SchemaNode): number {
  return (
    (left.sourceOrder ?? Number.MAX_SAFE_INTEGER) -
      (right.sourceOrder ?? Number.MAX_SAFE_INTEGER) ||
    left.id.localeCompare(right.id)
  );
}

/**
 * Reconciles provisional DTD name-reference nodes after every supplied source
 * has been assembled. Resolution is confined to the undirected component
 * formed by controlled, already-resolved project-local DTD dependencies, so
 * unrelated DTD roots in one archive never cross-resolve by name or basename.
 */
export function reconcileProjectDtdElementReferences(
  project: SchemaProject,
): SchemaProject {
  const dtdSourceIds = new Set(
    project.nodes
      .filter(({ kind, sourceFileId }) => kind === 'dtdElement' && sourceFileId)
      .map(({ sourceFileId }) => sourceFileId!),
  );
  const sourceIdByPath = new Map(
    (project.sourceFiles ?? [])
      .filter(({ id }) => dtdSourceIds.has(id))
      .map(({ id, filename }) => [filename.replace(/\\/g, '/'), id] as const),
  );
  const adjacent = new Map<string, Set<string>>(
    [...dtdSourceIds].map((sourceId) => [sourceId, new Set<string>()]),
  );
  for (const dependency of project.nodes) {
    if (dependency.kind !== 'dtdDependency' || !dependency.sourceFileId)
      continue;
    const resolvedPath = property(dependency, 'Resolved path');
    const targetSourceId = resolvedPath
      ? sourceIdByPath.get(resolvedPath.replace(/\\/g, '/'))
      : undefined;
    if (!targetSourceId || targetSourceId === dependency.sourceFileId) continue;
    adjacent.get(dependency.sourceFileId)?.add(targetSourceId);
    adjacent.get(targetSourceId)?.add(dependency.sourceFileId);
  }

  const componentBySourceId = new Map<string, ReadonlySet<string>>();
  for (const sourceId of dtdSourceIds) {
    if (componentBySourceId.has(sourceId)) continue;
    const component = new Set<string>();
    const pending = [sourceId];
    while (pending.length > 0) {
      const current = pending.shift()!;
      if (component.has(current)) continue;
      component.add(current);
      pending.push(...(adjacent.get(current) ?? []));
    }
    for (const member of component) componentBySourceId.set(member, component);
  }

  const declarations = project.nodes.filter(
    ({ kind, sourceFileId }) => kind === 'dtdElement' && sourceFileId,
  );
  const sourceFilenameById = new Map(
    (project.sourceFiles ?? []).map(
      ({ id, filename }) => [id, filename] as const,
    ),
  );
  const nodes: SchemaNode[] = [];
  const reconciledReferenceIds = new Set<SchemaNodeId>();
  const addedEdges: SchemaEdge[] = [];

  for (const node of project.nodes) {
    if (node.kind !== 'dtdElementReference' || !node.sourceFileId) {
      nodes.push(node);
      continue;
    }
    const component =
      componentBySourceId.get(node.sourceFileId) ??
      new Set([node.sourceFileId]);
    const candidates = declarations
      .filter(
        (declaration) =>
          declaration.name === node.name &&
          declaration.sourceFileId !== undefined &&
          component.has(declaration.sourceFileId),
      )
      .sort(compareNodes);
    if (candidates.length === 0) {
      nodes.push(node);
      continue;
    }

    reconciledReferenceIds.add(node.id);
    const status =
      candidates.length === 1
        ? 'Declared element reference'
        : `Ambiguous element-name reference (${candidates.length} declarations)`;
    const targets = candidates.map((candidate) => {
      const filename = candidate.sourceFileId
        ? sourceFilenameById.get(candidate.sourceFileId)
        : undefined;
      return filename ? `${candidate.name} · ${filename}` : candidate.name;
    });
    nodes.push({
      ...node,
      properties: [
        ...(node.properties ?? []).filter(
          ({ label }) =>
            label !== 'Reference status' && label !== 'Target declaration',
        ),
        { label: 'Reference status', value: status },
        { label: 'Target declaration', value: targets.join('; ') },
      ],
      searchTerms: [
        ...(node.searchTerms ?? []).filter(
          (term) => term !== 'undeclared reference',
        ),
        candidates.length === 1 ? 'declared' : 'ambiguous reference',
        ...targets,
      ],
    });
    candidates.forEach((candidate, order) => {
      addedEdges.push({
        id: `dtd:referencesElementName:${encodeURIComponent(node.id)}:${order}:${encodeURIComponent(candidate.id)}`,
        kind: 'referencesElementName',
        sourceNodeId: node.id,
        targetNodeId: candidate.id,
        order,
      });
    });
  }

  const existingReferencePairs = new Set(
    project.edges
      .filter(({ kind }) => kind === 'referencesElementName')
      .map(
        ({ sourceNodeId, targetNodeId }) => `${sourceNodeId}\0${targetNodeId}`,
      ),
  );
  const edges = [
    ...project.edges.filter(
      ({ kind, targetNodeId }) =>
        kind !== 'referencesUndeclaredElementName' ||
        !reconciledReferenceIds.has(targetNodeId),
    ),
    ...addedEdges.filter(
      ({ sourceNodeId, targetNodeId }) =>
        !existingReferencePairs.has(`${sourceNodeId}\0${targetNodeId}`),
    ),
  ];
  const dtdElementIds = new Set(
    nodes.filter(({ kind }) => kind === 'dtdElement').map(({ id }) => id),
  );
  const referencedDeclarationIds = new Set(
    edges
      .filter(
        ({ kind, targetNodeId }) =>
          (kind === 'referencesElementName' || kind === 'contains') &&
          dtdElementIds.has(targetNodeId),
      )
      .map(({ targetNodeId }) => targetNodeId),
  );
  const nonDtdRoots = project.rootNodeIds.filter(
    (id) => project.nodes.find((node) => node.id === id)?.kind !== 'dtdElement',
  );
  const dtdRoots = nodes
    .filter(
      ({ id, kind }) =>
        kind === 'dtdElement' && !referencedDeclarationIds.has(id),
    )
    .sort(compareNodes)
    .map(({ id }) => id);

  return {
    ...project,
    nodes,
    edges,
    rootNodeIds: [...nonDtdRoots, ...dtdRoots],
  };
}
