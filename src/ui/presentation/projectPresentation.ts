import type {
  SchemaNode,
  SchemaNodeKind,
  SchemaProject,
} from '../../schema/model';

export interface ProjectPresentationContext {
  readonly sourceFilenames: readonly string[];
  readonly nodeKinds: readonly SchemaNodeKind[];
  readonly hasMultipleSourceFiles: boolean;
  readonly hasMultipleNodeKinds: boolean;
  readonly identityLabel: string;
}

export function buildProjectPresentationContext(
  project: SchemaProject,
): ProjectPresentationContext {
  const declaredSourceFilenames = [
    ...new Set(
      project.sourceFiles
        ?.map(({ filename }) => filename.trim())
        .filter(Boolean) ?? [],
    ),
  ];
  const referencedSourceFilenames = [
    ...new Set(
      project.nodes
        .map((node) => node.sourceFileId?.trim())
        .filter((filename): filename is string => Boolean(filename)),
    ),
  ];
  const sourceFilenames =
    declaredSourceFilenames.length > 0
      ? declaredSourceFilenames
      : referencedSourceFilenames;
  const nodeKinds = [
    ...new Set(
      project.nodes
        .filter(({ kind }) => kind !== 'dtdAttribute')
        .map((node) => node.kind),
    ),
  ];
  const projectName = project.displayName.trim();

  return {
    sourceFilenames,
    nodeKinds,
    hasMultipleSourceFiles: sourceFilenames.length > 1,
    hasMultipleNodeKinds: nodeKinds.length > 1,
    identityLabel:
      sourceFilenames.length === 1
        ? sourceFilenames[0]
        : projectName || sourceFilenames.join(', ') || 'Schema project',
  };
}

export function shouldShowContextNodeKinds(
  visibleNodes: readonly Pick<SchemaNode, 'kind'>[],
  focusedKind: SchemaNodeKind | undefined,
): boolean {
  const visibleKinds = new Set(visibleNodes.map((node) => node.kind));
  return (
    visibleKinds.size > 1 ||
    (focusedKind !== undefined &&
      visibleNodes.some((node) => node.kind !== focusedKind))
  );
}
