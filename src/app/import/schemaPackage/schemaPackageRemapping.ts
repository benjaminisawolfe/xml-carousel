import {
  schemaNodeKinds,
  type SchemaEdge,
  type SchemaNode,
  type SchemaNodeId,
  type SchemaNodeKind,
  type SchemaProject,
  type SchemaSourceMarkupByNodeId,
} from '../../../schema/model';
import type {
  DtdAttributesByNodeId,
  DtdCommentsByNodeId,
  DtdImportDiagnostic,
  DtdImportResult,
  DtdNormalizedComment,
  DtdNormalizedContentKind,
} from '../../../schema/dtd';
import type {
  XsdImportDiagnostic,
  XsdImportResult,
  XsdMetadataByNodeId,
  XsdNodeMetadata,
  XsdNormalizedReference,
} from '../../../schema/xsd';
import type { SchemaArchiveSchemaEntry } from '../schemaArchive';
import type {
  SchemaPackageDiagnostic,
  SchemaPackageImportDiagnostic,
} from './schemaPackageTypes';
import {
  clonePlainValue,
  compareUnicodeCodePoints,
} from './schemaPackageUtilities';
import type { VisualizationResult } from '../../../schema/visualization';

type SuccessfulDtdImport = Extract<DtdImportResult, { status: 'success' }>;
type SuccessfulXsdImport = Extract<XsdImportResult, { status: 'success' }>;

export interface SchemaPackageRemapInput {
  readonly entry: SchemaArchiveSchemaEntry;
  readonly sourceFileId: string;
  readonly byteLength: number;
  readonly imported: SuccessfulDtdImport | SuccessfulXsdImport;
}

export interface SchemaPackageRemappedFile {
  readonly entry: SchemaArchiveSchemaEntry;
  readonly sourceFileId: string;
  readonly byteLength: number;
  readonly project: SchemaProject;
  readonly initialFocusNodeId: SchemaNodeId;
  readonly contentKindsByNodeId: Readonly<
    Record<SchemaNodeId, DtdNormalizedContentKind>
  >;
  readonly dtdAttributesByNodeId: DtdAttributesByNodeId;
  readonly comments: readonly DtdNormalizedComment[];
  readonly commentsByNodeId: DtdCommentsByNodeId;
  readonly schemaLevelComments: readonly DtdNormalizedComment[];
  readonly sourceMarkupByNodeId: SchemaSourceMarkupByNodeId;
  readonly xsdMetadataByNodeId: XsdMetadataByNodeId;
  readonly diagnostics: readonly SchemaPackageImportDiagnostic[];
  readonly visualization: VisualizationResult;
}

export type SchemaPackageRemapResult =
  | { readonly status: 'success'; readonly file: SchemaPackageRemappedFile }
  | {
      readonly status: 'failure';
      readonly diagnostics: readonly SchemaPackageDiagnostic[];
    };

export function deriveSchemaPackageSourceFileId(
  entry: SchemaArchiveSchemaEntry,
): string {
  return `schema-package-source:${encodeURIComponent(entry.archivePath)}`;
}

function packageNodeId(sourceFileId: string, originalId: string): string {
  return `schema-package-node:${encodeURIComponent(sourceFileId)}:${encodeURIComponent(originalId)}`;
}

function packageEdgeId(sourceFileId: string, originalId: string): string {
  return `schema-package-edge:${encodeURIComponent(sourceFileId)}:${encodeURIComponent(originalId)}`;
}

function packageCommentId(sourceFileId: string, originalId: string): string {
  return `schema-package-comment:${encodeURIComponent(sourceFileId)}:${encodeURIComponent(originalId)}`;
}

function packageMarkupId(sourceFileId: string, originalId: string): string {
  return `schema-package-markup:${encodeURIComponent(sourceFileId)}:${encodeURIComponent(originalId)}`;
}

function collisionDiagnostic(
  code: 'node-id-collision' | 'edge-id-collision',
  sourceFileId: string,
  entryPath: string,
): SchemaPackageDiagnostic {
  return {
    stage: 'package',
    code,
    severity: 'error',
    message:
      code === 'node-id-collision'
        ? 'A schema member contains duplicate node identifiers.'
        : 'A schema member contains duplicate edge identifiers.',
    sourceFileId,
    entryPath,
  };
}

function hasDuplicates(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}

function remapReference(
  reference: XsdNormalizedReference | undefined,
  nodeIds: ReadonlyMap<string, string>,
): XsdNormalizedReference | undefined {
  if (!reference) return undefined;
  return {
    ...clonePlainValue(reference),
    ...(reference.targetNodeId === undefined
      ? {}
      : {
          targetNodeId:
            nodeIds.get(reference.targetNodeId) ??
            packageNodeId('unknown-source', reference.targetNodeId),
        }),
  };
}

function remapXsdMetadata(
  metadata: XsdMetadataByNodeId,
  nodeIds: ReadonlyMap<string, string>,
): XsdMetadataByNodeId {
  const remapped: Record<string, XsdNodeMetadata> = {};
  for (const [originalNodeId, originalMetadata] of Object.entries(metadata)) {
    const nodeId = nodeIds.get(originalNodeId);
    if (!nodeId) continue;
    const cloned = clonePlainValue(originalMetadata);
    remapped[nodeId] = {
      ...cloned,
      ...(cloned.ownerNodeId === undefined
        ? {}
        : {
            ownerNodeId:
              nodeIds.get(cloned.ownerNodeId) ??
              packageNodeId('unknown-source', cloned.ownerNodeId),
          }),
      ...(cloned.typeReference === undefined
        ? {}
        : { typeReference: remapReference(cloned.typeReference, nodeIds) }),
      ...(cloned.elementReference === undefined
        ? {}
        : {
            elementReference: remapReference(cloned.elementReference, nodeIds),
          }),
      ...(cloned.attributeReference === undefined
        ? {}
        : {
            attributeReference: remapReference(
              cloned.attributeReference,
              nodeIds,
            ),
          }),
      ...(cloned.groupReference === undefined
        ? {}
        : { groupReference: remapReference(cloned.groupReference, nodeIds) }),
      ...(cloned.attributeGroupReference === undefined
        ? {}
        : {
            attributeGroupReference: remapReference(
              cloned.attributeGroupReference,
              nodeIds,
            ),
          }),
      ...(cloned.substitutionGroupReference === undefined
        ? {}
        : {
            substitutionGroupReference: remapReference(
              cloned.substitutionGroupReference,
              nodeIds,
            ),
          }),
      ...(cloned.restrictionBaseReference === undefined
        ? {}
        : {
            restrictionBaseReference: remapReference(
              cloned.restrictionBaseReference,
              nodeIds,
            ),
          }),
      ...(cloned.complexTypeDerivation === undefined
        ? {}
        : {
            complexTypeDerivation: {
              ...cloned.complexTypeDerivation,
              ...(cloned.complexTypeDerivation.baseReference === undefined
                ? {}
                : {
                    baseReference: remapReference(
                      cloned.complexTypeDerivation.baseReference,
                      nodeIds,
                    ),
                  }),
            },
          }),
      ...(cloned.typeDerivation === undefined
        ? {}
        : {
            typeDerivation: {
              ...cloned.typeDerivation,
              ...(cloned.typeDerivation.ownerTypeNodeId === undefined
                ? {}
                : {
                    ownerTypeNodeId:
                      nodeIds.get(cloned.typeDerivation.ownerTypeNodeId) ??
                      packageNodeId(
                        'unknown-source',
                        cloned.typeDerivation.ownerTypeNodeId,
                      ),
                  }),
              ...(cloned.typeDerivation.baseReference === undefined
                ? {}
                : {
                    baseReference: remapReference(
                      cloned.typeDerivation.baseReference,
                      nodeIds,
                    ),
                  }),
            },
          }),
      ...(cloned.listItemTypeReference === undefined
        ? {}
        : {
            listItemTypeReference: remapReference(
              cloned.listItemTypeReference,
              nodeIds,
            ),
          }),
      ...(cloned.unionMemberTypeReferences === undefined
        ? {}
        : {
            unionMemberTypeReferences: cloned.unionMemberTypeReferences.map(
              (reference) => remapReference(reference, nodeIds)!,
            ),
          }),
      ...(cloned.identityConstraint === undefined
        ? {}
        : {
            identityConstraint: {
              ...cloned.identityConstraint,
              ...(cloned.identityConstraint.referReference === undefined
                ? {}
                : {
                    referReference: remapReference(
                      cloned.identityConstraint.referReference,
                      nodeIds,
                    ),
                  }),
            },
          }),
      ...(cloned.notationReference === undefined
        ? {}
        : {
            notationReference: remapReference(
              cloned.notationReference,
              nodeIds,
            ),
          }),
    };
  }
  return remapped;
}

function remapSourceMarkup(
  sourceMarkup: SchemaSourceMarkupByNodeId,
  sourceFileId: string,
  nodeIds: ReadonlyMap<string, string>,
): SchemaSourceMarkupByNodeId {
  const remapped: Record<string, SchemaSourceMarkupByNodeId[string]> = {};
  for (const [originalNodeId, markup] of Object.entries(sourceMarkup)) {
    const nodeId = nodeIds.get(originalNodeId);
    if (!nodeId) continue;
    remapped[nodeId] = {
      syntax: markup.syntax,
      fragments: markup.fragments.map((fragment) => ({
        ...clonePlainValue(fragment),
        id: packageMarkupId(sourceFileId, fragment.id),
        sourceFileId,
      })),
    };
  }
  return remapped;
}

function remapDiagnostics(
  diagnostics: readonly (DtdImportDiagnostic | XsdImportDiagnostic)[],
  nodeIds: ReadonlyMap<string, string>,
): readonly SchemaPackageImportDiagnostic[] {
  return diagnostics.map((diagnostic) => {
    const cloned = clonePlainValue(diagnostic) as SchemaPackageImportDiagnostic;
    if (
      'nodeId' in cloned &&
      typeof cloned.nodeId === 'string' &&
      nodeIds.has(cloned.nodeId)
    ) {
      return {
        ...cloned,
        nodeId: nodeIds.get(cloned.nodeId)!,
      };
    }
    return cloned;
  });
}

function nodeKindOrder(node: SchemaNode): number {
  const index = (schemaNodeKinds as readonly SchemaNodeKind[]).indexOf(
    node.kind,
  );
  return index < 0 ? schemaNodeKinds.length : index;
}

export function sortSchemaPackageFileNodes(
  nodes: readonly SchemaNode[],
): readonly SchemaNode[] {
  return [...nodes].sort(
    (left, right) =>
      Number(right.kind === 'schema') - Number(left.kind === 'schema') ||
      (left.sourceOrder ?? Number.MAX_SAFE_INTEGER) -
        (right.sourceOrder ?? Number.MAX_SAFE_INTEGER) ||
      nodeKindOrder(left) - nodeKindOrder(right) ||
      compareUnicodeCodePoints(left.id, right.id),
  );
}

export function remapSchemaPackageFile(
  input: SchemaPackageRemapInput,
): SchemaPackageRemapResult {
  const { entry, sourceFileId, imported } = input;
  if (hasDuplicates(imported.project.nodes.map((node) => node.id))) {
    return {
      status: 'failure',
      diagnostics: [
        collisionDiagnostic(
          'node-id-collision',
          sourceFileId,
          entry.archivePath,
        ),
      ],
    };
  }
  if (hasDuplicates(imported.project.edges.map((edge) => edge.id))) {
    return {
      status: 'failure',
      diagnostics: [
        collisionDiagnostic(
          'edge-id-collision',
          sourceFileId,
          entry.archivePath,
        ),
      ],
    };
  }

  const nodeIds = new Map(
    imported.project.nodes.map((node) => [
      node.id,
      packageNodeId(sourceFileId, node.id),
    ]),
  );
  const edgeIds = new Map(
    imported.project.edges.map((edge) => [
      edge.id,
      packageEdgeId(sourceFileId, edge.id),
    ]),
  );
  const nodes = imported.project.nodes.map((node): SchemaNode => ({
    ...clonePlainValue(node),
    id: nodeIds.get(node.id)!,
    ...(node.kind === 'builtInType' ? {} : { sourceFileId }),
  }));
  const edges = imported.project.edges.map((edge): SchemaEdge => ({
    ...clonePlainValue(edge),
    id: edgeIds.get(edge.id)!,
    sourceNodeId:
      nodeIds.get(edge.sourceNodeId) ??
      packageNodeId(sourceFileId, edge.sourceNodeId),
    targetNodeId:
      nodeIds.get(edge.targetNodeId) ??
      packageNodeId(sourceFileId, edge.targetNodeId),
  }));
  const project: SchemaProject = {
    id: `schema-package-file:${encodeURIComponent(entry.archivePath)}`,
    displayName: entry.packageRelativePath,
    sourceFiles: [{ id: sourceFileId, filename: entry.packageRelativePath }],
    nodes,
    edges,
    rootNodeIds: imported.project.rootNodeIds.map(
      (rootNodeId) =>
        nodeIds.get(rootNodeId) ?? packageNodeId(sourceFileId, rootNodeId),
    ),
  };

  const contentKindsByNodeId: Record<SchemaNodeId, DtdNormalizedContentKind> =
    {};
  const dtdAttributesByNodeId: Record<string, DtdAttributesByNodeId[string]> =
    {};
  let comments: readonly DtdNormalizedComment[] = [];
  let commentsByNodeId: DtdCommentsByNodeId = {};
  let schemaLevelComments: readonly DtdNormalizedComment[] = [];
  let xsdMetadataByNodeId: XsdMetadataByNodeId = {};

  if ('contentKindsByNodeId' in imported) {
    for (const [originalNodeId, kind] of Object.entries(
      imported.contentKindsByNodeId,
    )) {
      const nodeId = nodeIds.get(originalNodeId);
      if (nodeId) contentKindsByNodeId[nodeId] = kind;
    }
    for (const [originalNodeId, attribute] of Object.entries(
      imported.dtdAttributesByNodeId,
    )) {
      const nodeId = nodeIds.get(originalNodeId);
      if (!nodeId) continue;
      dtdAttributesByNodeId[nodeId] = {
        ...clonePlainValue(attribute),
        attributeNodeId: nodeId,
        ownerElementNodeId:
          nodeIds.get(attribute.ownerElementNodeId) ??
          packageNodeId(sourceFileId, attribute.ownerElementNodeId),
        sourceFileId,
      };
    }
    const commentsByOriginalId = new Map<string, DtdNormalizedComment>();
    comments = imported.comments.map((comment) => {
      const remapped = {
        ...clonePlainValue(comment),
        commentId: packageCommentId(sourceFileId, comment.commentId),
        sourceFileId,
        ...(comment.attachedNodeId === undefined
          ? {}
          : {
              attachedNodeId:
                nodeIds.get(comment.attachedNodeId) ??
                packageNodeId(sourceFileId, comment.attachedNodeId),
            }),
      };
      commentsByOriginalId.set(comment.commentId, remapped);
      return remapped;
    });
    const remappedCommentsByNodeId: Record<
      SchemaNodeId,
      readonly DtdNormalizedComment[]
    > = {};
    for (const [originalNodeId, nodeComments] of Object.entries(
      imported.commentsByNodeId,
    )) {
      const nodeId = nodeIds.get(originalNodeId);
      if (!nodeId) continue;
      remappedCommentsByNodeId[nodeId] = nodeComments.map((comment) =>
        commentsByOriginalId.get(comment.commentId)!,
      );
    }
    commentsByNodeId = remappedCommentsByNodeId;
    schemaLevelComments = imported.schemaLevelComments.map((comment) =>
      commentsByOriginalId.get(comment.commentId)!,
    );
  } else {
    xsdMetadataByNodeId = remapXsdMetadata(
      imported.xsdMetadataByNodeId,
      nodeIds,
    );
  }

  return {
    status: 'success',
    file: {
      entry,
      sourceFileId,
      byteLength: input.byteLength,
      project,
      initialFocusNodeId:
        nodeIds.get(imported.initialFocusNodeId) ??
        packageNodeId(sourceFileId, imported.initialFocusNodeId),
      contentKindsByNodeId,
      dtdAttributesByNodeId,
      comments,
      commentsByNodeId,
      schemaLevelComments,
      sourceMarkupByNodeId: remapSourceMarkup(
        imported.sourceMarkupByNodeId,
        sourceFileId,
        nodeIds,
      ),
      xsdMetadataByNodeId,
      diagnostics: remapDiagnostics(imported.diagnostics, nodeIds),
      visualization: clonePlainValue(imported.visualization),
    },
  };
}
