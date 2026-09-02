import { derived, get, writable, type Readable } from 'svelte/store';
import type {
  DtdAttributesByNodeId,
  DtdCommentsByNodeId,
  DtdNormalizedAttributeDefinition,
  DtdNormalizedComment,
  DtdNormalizedContentKind,
} from '../../schema/dtd';
import type {
  XsdAnnotationEntryMetadata,
  XsdAnnotationMetadata,
  XsdLocalFormMetadata,
  XsdMetadataByNodeId,
  XsdNodeMetadata,
  XsdNormalizedReference,
  XsdSchemaValueMetadata,
} from '../../schema/xsd';
import {
  validateSchemaProject,
  type SchemaNodeId,
  type SchemaNodeSourceMarkup,
  type SchemaProject,
  type SchemaSourceRange,
  type SchemaSourceMarkupByNodeId,
  type SchemaValidationFinding,
} from '../../schema/model';
import { bookDtdSample } from '../../schema/samples/sampleCatalog';
import type { ProjectSearchIndex } from '../search';
import type { SchemaArchiveManifest } from '../import/schemaArchive';
import type {
  SchemaPackageEntrySummary,
  SchemaPackageSourceSummary,
  SchemaPackageSummary,
  SchemaPackageUnresolvedReference,
} from '../import/schemaPackage';
import { freezeOwnedPlainGraph } from './freezeOwnedPlainGraph';
import type {
  VisualizationCompleteness,
  VisualizationFinding,
  VisualizationSummary,
} from '../../schema/visualization';

export type ActiveProjectOrigin = 'sample' | 'imported' | 'package';
export type ActiveProjectOwnership = 'worker';

export interface ActiveProjectMetadata {
  readonly origin: ActiveProjectOrigin;
  readonly sourceFilename: string;
  readonly contentKindsByNodeId?: Readonly<
    Record<SchemaNodeId, DtdNormalizedContentKind>
  >;
  readonly dtdAttributesByNodeId?: DtdAttributesByNodeId;
  readonly comments?: readonly DtdNormalizedComment[];
  readonly commentsByNodeId?: DtdCommentsByNodeId;
  readonly schemaLevelComments?: readonly DtdNormalizedComment[];
  readonly sourceMarkupByNodeId?: SchemaSourceMarkupByNodeId;
  readonly xsdMetadataByNodeId?: XsdMetadataByNodeId;
  readonly schemaPackageManifest?: SchemaArchiveManifest;
  readonly schemaPackageSources?: readonly SchemaPackageSourceSummary[];
  readonly schemaPackageEntries?: readonly SchemaPackageEntrySummary[];
  readonly schemaPackageSummary?: SchemaPackageSummary;
  readonly unresolvedReferences?: readonly SchemaPackageUnresolvedReference[];
  readonly preparedSearchIndex?: ProjectSearchIndex;
  readonly visualizationCompleteness?: VisualizationCompleteness;
  readonly visualizationSummary?: VisualizationSummary;
  readonly visualizationFindings?: readonly VisualizationFinding[];
}

export interface ActiveProjectState extends ActiveProjectMetadata {
  readonly project: SchemaProject;
}

export type ActiveProjectReplacementResult =
  | {
      readonly applied: true;
      readonly state: ActiveProjectState;
    }
  | {
      readonly applied: false;
      readonly reason: 'invalidProject';
      readonly findings: readonly SchemaValidationFinding[];
      readonly state: ActiveProjectState;
    };

export interface ActiveProjectStore extends Readable<ActiveProjectState> {
  replace(
    project: SchemaProject,
    metadata: ActiveProjectMetadata,
  ): ActiveProjectReplacementResult;
  replaceValidated(
    project: SchemaProject,
    metadata: ActiveProjectMetadata,
    ownership?: ActiveProjectOwnership,
  ): ActiveProjectReplacementResult;
}

export function sourceFilenameForProject(project: SchemaProject): string {
  return (
    project.sourceFiles?.[0]?.filename ??
    project.nodes.find((node) => node.sourceFileId)?.sourceFileId ??
    project.displayName
  );
}

export function validateActiveProjectCandidate(
  project: SchemaProject,
): readonly SchemaValidationFinding[] {
  return validateSchemaProject(project);
}

function createState(
  project: SchemaProject,
  metadata: ActiveProjectMetadata,
): ActiveProjectState {
  return {
    project,
    origin: metadata.origin,
    sourceFilename: metadata.sourceFilename,
    ...(metadata.visualizationCompleteness === undefined
      ? {}
      : { visualizationCompleteness: metadata.visualizationCompleteness }),
    ...(metadata.visualizationSummary === undefined
      ? {}
      : { visualizationSummary: { ...metadata.visualizationSummary } }),
    ...(metadata.visualizationFindings === undefined
      ? {}
      : {
          visualizationFindings: metadata.visualizationFindings.map(
            (finding) => ({
              ...finding,
              ...(finding.range === undefined
                ? {}
                : { range: cloneSourceRange(finding.range) }),
            }),
          ),
        }),
    ...(metadata.contentKindsByNodeId
      ? { contentKindsByNodeId: { ...metadata.contentKindsByNodeId } }
      : {}),
    ...(metadata.dtdAttributesByNodeId
      ? {
          dtdAttributesByNodeId: cloneDtdAttributes(
            metadata.dtdAttributesByNodeId,
          ),
        }
      : {}),
    ...(metadata.comments
      ? { comments: metadata.comments.map(cloneDtdComment) }
      : {}),
    ...(metadata.commentsByNodeId
      ? {
          commentsByNodeId: cloneDtdCommentsByNodeId(metadata.commentsByNodeId),
        }
      : {}),
    ...(metadata.schemaLevelComments
      ? {
          schemaLevelComments:
            metadata.schemaLevelComments.map(cloneDtdComment),
        }
      : {}),
    ...(metadata.sourceMarkupByNodeId
      ? {
          sourceMarkupByNodeId: cloneSourceMarkupByNodeId(
            metadata.sourceMarkupByNodeId,
          ),
        }
      : {}),
    ...(metadata.xsdMetadataByNodeId
      ? {
          xsdMetadataByNodeId: cloneXsdMetadataByNodeId(
            metadata.xsdMetadataByNodeId,
          ),
        }
      : {}),
    ...(metadata.schemaPackageManifest
      ? {
          schemaPackageManifest: cloneSchemaPackageManifest(
            metadata.schemaPackageManifest,
          ),
        }
      : {}),
    ...(metadata.schemaPackageSources
      ? {
          schemaPackageSources: metadata.schemaPackageSources.map(
            cloneSchemaPackageSource,
          ),
        }
      : {}),
    ...(metadata.schemaPackageEntries
      ? {
          schemaPackageEntries: metadata.schemaPackageEntries.map(
            cloneSchemaPackageEntry,
          ),
        }
      : {}),
    ...(metadata.schemaPackageSummary
      ? { schemaPackageSummary: { ...metadata.schemaPackageSummary } }
      : {}),
    ...(metadata.unresolvedReferences
      ? {
          unresolvedReferences: metadata.unresolvedReferences.map(
            cloneSchemaPackageUnresolvedReference,
          ),
        }
      : {}),
    ...(metadata.preparedSearchIndex
      ? {
          preparedSearchIndex: {
            projectId: metadata.preparedSearchIndex.projectId,
            documents: metadata.preparedSearchIndex.documents.map(
              (document) => ({
                ...document,
                fields: document.fields.map((field) => ({ ...field })),
              }),
            ),
          },
        }
      : {}),
  };
}

function createOwnedState(
  project: SchemaProject,
  metadata: ActiveProjectMetadata,
): ActiveProjectState {
  const state: ActiveProjectState = {
    project,
    ...metadata,
  };
  return freezeOwnedPlainGraph(state);
}

function cloneSchemaPackageManifest(
  manifest: SchemaArchiveManifest,
): SchemaArchiveManifest {
  return {
    id: manifest.id,
    archiveFilename: manifest.archiveFilename,
    archiveByteLength: manifest.archiveByteLength,
    packageRoot: manifest.packageRoot,
    ...(manifest.commonRootDirectory === undefined
      ? {}
      : { commonRootDirectory: manifest.commonRootDirectory }),
    entries: manifest.entries.map((entry) => ({ ...entry })),
    schemaEntries: manifest.schemaEntries.map((entry) => ({
      id: entry.id,
      archivePath: entry.archivePath,
      packageRelativePath: entry.packageRelativePath,
      ...(entry.directoryPath === undefined
        ? {}
        : { directoryPath: entry.directoryPath }),
      basename: entry.basename,
      format: entry.format,
      sourceOrder: entry.sourceOrder,
    })),
    ...(manifest.acceptedFileEntries === undefined
      ? {}
      : {
          acceptedFileEntries: manifest.acceptedFileEntries.map((entry) => ({
            archivePath: entry.archivePath,
            packageRelativePath: entry.packageRelativePath,
          })),
        }),
    xsdCount: manifest.xsdCount,
    dtdCount: manifest.dtdCount,
    rngCount: manifest.rngCount,
    ignoredFileCount: manifest.ignoredFileCount,
    totalFileEntryCount: manifest.totalFileEntryCount,
  };
}

function cloneSchemaPackageEntry(
  entry: SchemaPackageEntrySummary,
): SchemaPackageEntrySummary {
  const cloneRelationship = (
    relationship: SchemaPackageEntrySummary['dependencies'][number],
  ) => ({
    ...relationship,
    ...(relationship.candidatePaths === undefined
      ? {}
      : { candidatePaths: [...relationship.candidatePaths] }),
    ...(relationship.range === undefined
      ? {}
      : { range: cloneSourceRange(relationship.range) }),
  });
  return {
    ...entry,
    dependencies: entry.dependencies.map(cloneRelationship),
    dependents: entry.dependents.map(cloneRelationship),
  };
}

function cloneSchemaPackageSource(
  source: SchemaPackageSourceSummary,
): SchemaPackageSourceSummary {
  return {
    sourceFileId: source.sourceFileId,
    archiveEntryId: source.archiveEntryId,
    archivePath: source.archivePath,
    packageRelativePath: source.packageRelativePath,
    format: source.format,
    sourceOrder: source.sourceOrder,
    byteLength: source.byteLength,
    nodeCount: source.nodeCount,
    rootNodeIds: [...source.rootNodeIds],
    initialFocusNodeId: source.initialFocusNodeId,
  };
}

function cloneSchemaPackageUnresolvedReference(
  reference: SchemaPackageUnresolvedReference,
): SchemaPackageUnresolvedReference {
  return {
    id: reference.id,
    sourceNodeId: reference.sourceNodeId,
    sourceFileId: reference.sourceFileId,
    referenceKind: reference.referenceKind,
    raw: reference.raw,
    localName: reference.localName,
    ...(reference.namespaceUri === undefined
      ? {}
      : { namespaceUri: reference.namespaceUri }),
    reason: reference.reason,
    candidateNodeIds: [...reference.candidateNodeIds],
    range: cloneSourceRange(reference.range),
  };
}

function cloneSourceRange(range: SchemaSourceRange): SchemaSourceRange {
  return {
    start: { ...range.start },
    end: { ...range.end },
    ...(range.sourceId === undefined ? {} : { sourceId: range.sourceId }),
  };
}

function cloneXsdReference(
  reference: XsdNormalizedReference,
): XsdNormalizedReference {
  return {
    kind: reference.kind,
    raw: reference.raw,
    ...(reference.prefix === undefined ? {} : { prefix: reference.prefix }),
    localName: reference.localName,
    ...(reference.namespaceUri === undefined
      ? {}
      : { namespaceUri: reference.namespaceUri }),
    range: cloneSourceRange(reference.range),
    resolution: reference.resolution,
    ...(reference.targetNodeId === undefined
      ? {}
      : { targetNodeId: reference.targetNodeId }),
  };
}

function cloneXsdSchemaValue(
  value: XsdSchemaValueMetadata<string>,
): XsdSchemaValueMetadata<string> {
  return {
    value: value.value,
    lexicalValue: value.lexicalValue,
    ...(value.range === undefined
      ? {}
      : { range: cloneSourceRange(value.range) }),
  };
}

function cloneXsdAnnotationEntry(
  entry: XsdAnnotationEntryMetadata,
): XsdAnnotationEntryMetadata {
  return {
    kind: entry.kind,
    text: entry.text,
    rawXml: entry.rawXml,
    ...(entry.kind === 'documentation' && entry.xmlLang !== undefined
      ? { xmlLang: cloneXsdSchemaValue(entry.xmlLang) }
      : {}),
    ...(entry.source === undefined
      ? {}
      : { source: cloneXsdSchemaValue(entry.source) }),
    sourceRange: cloneSourceRange(entry.sourceRange),
    startTagRange: cloneSourceRange(entry.startTagRange),
    contentRange: cloneSourceRange(entry.contentRange),
    sourceOrder: entry.sourceOrder,
  };
}

function cloneXsdAnnotation(
  annotation: XsdAnnotationMetadata,
): XsdAnnotationMetadata {
  return {
    entries: annotation.entries.map(cloneXsdAnnotationEntry),
    rawXml: annotation.rawXml,
    sourceRange: cloneSourceRange(annotation.sourceRange),
    startTagRange: cloneSourceRange(annotation.startTagRange),
    sourceOrder: annotation.sourceOrder,
  };
}

function cloneXsdLocalForm(
  localForm: XsdLocalFormMetadata,
): XsdLocalFormMetadata {
  if (localForm.resolution === 'inherited') {
    return { resolution: 'inherited', value: localForm.value };
  }
  if (localForm.resolution === 'explicit') {
    return { resolution: 'explicit', value: localForm.value };
  }
  return {
    resolution: 'explicitDeferred',
    lexicalValue: localForm.lexicalValue,
  };
}

function cloneXsdNodeMetadata(metadata: XsdNodeMetadata): XsdNodeMetadata {
  return {
    kind: metadata.kind,
    scope: metadata.scope,
    sourceFileId: metadata.sourceFileId,
    sourceOrder: metadata.sourceOrder,
    sourceRange: cloneSourceRange(metadata.sourceRange),
    startTagRange: cloneSourceRange(metadata.startTagRange),
    ...(metadata.annotations === undefined
      ? {}
      : { annotations: metadata.annotations.map(cloneXsdAnnotation) }),
    ...(metadata.targetNamespace === undefined
      ? {}
      : { targetNamespace: metadata.targetNamespace }),
    ...(metadata.ownerNodeId === undefined
      ? {}
      : { ownerNodeId: metadata.ownerNodeId }),
    ...(metadata.anonymous === undefined
      ? {}
      : { anonymous: metadata.anonymous }),
    ...(metadata.declarationRole === undefined
      ? {}
      : { declarationRole: metadata.declarationRole }),
    simpleTypeVariety: metadata.simpleTypeVariety,
    ...(metadata.applicationOwned === undefined
      ? {}
      : { applicationOwned: metadata.applicationOwned }),
    ...(metadata.builtInType === undefined
      ? {}
      : {
          builtInType: {
            ...metadata.builtInType,
            ancestry: [...metadata.builtInType.ancestry],
          },
        }),
    ...(metadata.typeDerivation === undefined
      ? {}
      : {
          typeDerivation: {
            method: metadata.typeDerivation.method,
            ...(metadata.typeDerivation.baseReference === undefined
              ? {}
              : {
                  baseReference: cloneXsdReference(
                    metadata.typeDerivation.baseReference,
                  ),
                }),
            ...(metadata.typeDerivation.ownerTypeNodeId === undefined
              ? {}
              : { ownerTypeNodeId: metadata.typeDerivation.ownerTypeNodeId }),
          },
        }),
    ...(metadata.listItemTypeReference === undefined
      ? {}
      : {
          listItemTypeReference: cloneXsdReference(
            metadata.listItemTypeReference,
          ),
        }),
    ...(metadata.unionMemberTypeReferences === undefined
      ? {}
      : {
          unionMemberTypeReferences:
            metadata.unionMemberTypeReferences.map(cloneXsdReference),
        }),
    ...(metadata.facet === undefined
      ? {}
      : {
          facet: {
            ...metadata.facet,
            valueRange: cloneSourceRange(metadata.facet.valueRange),
          },
        }),
    ...(metadata.identityConstraint === undefined
      ? {}
      : {
          identityConstraint: {
            kind: metadata.identityConstraint.kind,
            name: metadata.identityConstraint.name,
            ...(metadata.identityConstraint.referReference === undefined
              ? {}
              : {
                  referReference: cloneXsdReference(
                    metadata.identityConstraint.referReference,
                  ),
                }),
          },
        }),
    ...(metadata.xpathConstraint === undefined
      ? {}
      : {
          xpathConstraint: {
            ...metadata.xpathConstraint,
            valueRange: cloneSourceRange(metadata.xpathConstraint.valueRange),
          },
        }),
    ...(metadata.notation === undefined
      ? {}
      : { notation: { ...metadata.notation } }),
    ...(metadata.notationReference === undefined
      ? {}
      : {
          notationReference: cloneXsdReference(metadata.notationReference),
        }),
    ...(metadata.effectiveBlock === undefined
      ? {}
      : {
          effectiveBlock: {
            ...metadata.effectiveBlock,
            tokens: [...metadata.effectiveBlock.tokens],
          },
        }),
    ...(metadata.effectiveFinal === undefined
      ? {}
      : {
          effectiveFinal: {
            ...metadata.effectiveFinal,
            tokens: [...metadata.effectiveFinal.tokens],
          },
        }),
    ...(metadata.contentKind === undefined
      ? {}
      : { contentKind: metadata.contentKind }),
    ...(metadata.mixed === undefined ? {} : { mixed: metadata.mixed }),
    ...(metadata.abstract === undefined ? {} : { abstract: metadata.abstract }),
    ...(metadata.nillable === undefined ? {} : { nillable: metadata.nillable }),
    ...(metadata.block === undefined ? {} : { block: [...metadata.block] }),
    ...(metadata.final === undefined ? {} : { final: [...metadata.final] }),
    ...(metadata.namespaceDeclarations === undefined
      ? {}
      : {
          namespaceDeclarations: metadata.namespaceDeclarations.map(
            (declaration) => ({ ...declaration }),
          ),
        }),
    ...(metadata.processContents === undefined
      ? {}
      : { processContents: metadata.processContents }),
    ...(metadata.wildcardNamespace === undefined
      ? {}
      : { wildcardNamespace: [...metadata.wildcardNamespace] }),
    ...(metadata.compositor === undefined
      ? {}
      : { compositor: metadata.compositor }),
    ...(metadata.occurrence === undefined
      ? {}
      : { occurrence: { ...metadata.occurrence } }),
    ...(metadata.typeReference === undefined
      ? {}
      : { typeReference: cloneXsdReference(metadata.typeReference) }),
    ...(metadata.elementReference === undefined
      ? {}
      : { elementReference: cloneXsdReference(metadata.elementReference) }),
    ...(metadata.attributeReference === undefined
      ? {}
      : {
          attributeReference: cloneXsdReference(metadata.attributeReference),
        }),
    ...(metadata.groupReference === undefined
      ? {}
      : { groupReference: cloneXsdReference(metadata.groupReference) }),
    ...(metadata.attributeGroupReference === undefined
      ? {}
      : {
          attributeGroupReference: cloneXsdReference(
            metadata.attributeGroupReference,
          ),
        }),
    ...(metadata.substitutionGroupReference === undefined
      ? {}
      : {
          substitutionGroupReference: cloneXsdReference(
            metadata.substitutionGroupReference,
          ),
        }),
    ...(metadata.attributeUse === undefined
      ? {}
      : { attributeUse: metadata.attributeUse }),
    ...(metadata.attributeForm === undefined
      ? {}
      : { attributeForm: cloneXsdLocalForm(metadata.attributeForm) }),
    ...(metadata.valueConstraint === undefined
      ? {}
      : {
          valueConstraint: {
            kind: metadata.valueConstraint.kind,
            value: metadata.valueConstraint.value,
            lexicalValue: metadata.valueConstraint.lexicalValue,
            range: cloneSourceRange(metadata.valueConstraint.range),
          },
        }),
    ...(metadata.implicitAttributeType === undefined
      ? {}
      : { implicitAttributeType: metadata.implicitAttributeType }),
    ...(metadata.restrictionBaseReference === undefined
      ? {}
      : {
          restrictionBaseReference: cloneXsdReference(
            metadata.restrictionBaseReference,
          ),
        }),
    ...(metadata.complexTypeDerivation === undefined
      ? {}
      : {
          complexTypeDerivation: {
            kind: metadata.complexTypeDerivation.kind,
            ...(metadata.complexTypeDerivation.baseReference === undefined
              ? {}
              : {
                  baseReference: cloneXsdReference(
                    metadata.complexTypeDerivation.baseReference,
                  ),
                }),
            ...(metadata.complexTypeDerivation.declaredCompositor === undefined
              ? {}
              : {
                  declaredCompositor:
                    metadata.complexTypeDerivation.declaredCompositor,
                }),
            declaredAttributeCount:
              metadata.complexTypeDerivation.declaredAttributeCount,
            sourceRange: cloneSourceRange(
              metadata.complexTypeDerivation.sourceRange,
            ),
            startTagRange: cloneSourceRange(
              metadata.complexTypeDerivation.startTagRange,
            ),
          },
        }),
    ...(metadata.enumerationValues === undefined
      ? {}
      : {
          enumerationValues: metadata.enumerationValues.map((value) => ({
            value: value.value,
            lexicalValue: value.lexicalValue,
            valueRange: cloneSourceRange(value.valueRange),
            sourceRange: cloneSourceRange(value.sourceRange),
            sourceOrder: value.sourceOrder,
          })),
        }),
    ...(metadata.enumerationCount === undefined
      ? {}
      : { enumerationCount: metadata.enumerationCount }),
    ...(metadata.localForm === undefined
      ? {}
      : { localForm: cloneXsdLocalForm(metadata.localForm) }),
    ...(metadata.elementFormDefault === undefined
      ? {}
      : { elementFormDefault: metadata.elementFormDefault }),
    ...(metadata.attributeFormDefault === undefined
      ? {}
      : { attributeFormDefault: metadata.attributeFormDefault }),
    ...(metadata.version === undefined ? {} : { version: metadata.version }),
  };
}

function cloneXsdMetadataByNodeId(
  metadataByNodeId: XsdMetadataByNodeId,
): XsdMetadataByNodeId {
  const cloned: Record<SchemaNodeId, XsdNodeMetadata> = {};
  for (const [nodeId, metadata] of Object.entries(metadataByNodeId)) {
    cloned[nodeId] = cloneXsdNodeMetadata(metadata);
  }
  return cloned;
}

function cloneNodeSourceMarkup(
  markup: SchemaNodeSourceMarkup,
): SchemaNodeSourceMarkup {
  return {
    syntax: markup.syntax,
    fragments: markup.fragments.map((fragment) => ({
      id: fragment.id,
      sourceFileId: fragment.sourceFileId,
      range: {
        start: { ...fragment.range.start },
        end: { ...fragment.range.end },
        ...(fragment.range.sourceId === undefined
          ? {}
          : { sourceId: fragment.range.sourceId }),
      },
      text: fragment.text,
    })),
  };
}

function cloneSourceMarkupByNodeId(
  sourceMarkupByNodeId: SchemaSourceMarkupByNodeId,
): SchemaSourceMarkupByNodeId {
  const cloned: Record<SchemaNodeId, SchemaNodeSourceMarkup> = {};
  for (const [nodeId, markup] of Object.entries(sourceMarkupByNodeId)) {
    cloned[nodeId] = cloneNodeSourceMarkup(markup);
  }
  return cloned;
}

function cloneDtdAttribute(
  attribute: DtdNormalizedAttributeDefinition,
): DtdNormalizedAttributeDefinition {
  const type =
    attribute.type.kind === 'tokenized'
      ? { ...attribute.type }
      : { ...attribute.type, values: [...attribute.type.values] };
  const defaultDeclaration =
    attribute.defaultDeclaration.kind === 'required' ||
    attribute.defaultDeclaration.kind === 'implied'
      ? { ...attribute.defaultDeclaration }
      : {
          ...attribute.defaultDeclaration,
          literal: { ...attribute.defaultDeclaration.literal },
        };

  return {
    ...attribute,
    type,
    defaultDeclaration,
    sourceRange: {
      start: { ...attribute.sourceRange.start },
      end: { ...attribute.sourceRange.end },
      ...(attribute.sourceRange.sourceId === undefined
        ? {}
        : { sourceId: attribute.sourceRange.sourceId }),
    },
  };
}

function cloneDtdAttributes(
  attributes: DtdAttributesByNodeId,
): DtdAttributesByNodeId {
  const cloned: Record<SchemaNodeId, DtdNormalizedAttributeDefinition> = {};
  for (const [nodeId, attribute] of Object.entries(attributes)) {
    cloned[nodeId] = cloneDtdAttribute(attribute);
  }
  return cloned;
}

function cloneDtdComment(comment: DtdNormalizedComment): DtdNormalizedComment {
  return {
    ...comment,
    sourceRange: {
      start: { ...comment.sourceRange.start },
      end: { ...comment.sourceRange.end },
      ...(comment.sourceRange.sourceId === undefined
        ? {}
        : { sourceId: comment.sourceRange.sourceId }),
    },
    contentRange: {
      start: { ...comment.contentRange.start },
      end: { ...comment.contentRange.end },
      ...(comment.contentRange.sourceId === undefined
        ? {}
        : { sourceId: comment.contentRange.sourceId }),
    },
    ...(comment.declarationRange
      ? {
          declarationRange: {
            start: { ...comment.declarationRange.start },
            end: { ...comment.declarationRange.end },
            ...(comment.declarationRange.sourceId === undefined
              ? {}
              : { sourceId: comment.declarationRange.sourceId }),
          },
        }
      : {}),
  };
}

function cloneDtdCommentsByNodeId(
  commentsByNodeId: DtdCommentsByNodeId,
): DtdCommentsByNodeId {
  const cloned: Record<SchemaNodeId, DtdNormalizedComment[]> = {};
  for (const [nodeId, comments] of Object.entries(commentsByNodeId)) {
    cloned[nodeId] = comments.map(cloneDtdComment);
  }
  return cloned;
}

export function createActiveProjectStore(
  initialState: ActiveProjectState,
): ActiveProjectStore {
  const state = writable(createState(initialState.project, initialState));

  return {
    subscribe: state.subscribe,
    replace(project, metadata) {
      const findings = validateActiveProjectCandidate(project);
      if (findings.length > 0) {
        return {
          applied: false,
          reason: 'invalidProject',
          findings,
          state: get(state),
        };
      }

      return replaceValidated(project, metadata);
    },
    replaceValidated,
  };

  function replaceValidated(
    project: SchemaProject,
    metadata: ActiveProjectMetadata,
    ownership?: ActiveProjectOwnership,
  ): ActiveProjectReplacementResult {
    const nextState =
      ownership === 'worker'
        ? createOwnedState(project, metadata)
        : createState(project, metadata);
    state.set(nextState);
    return { applied: true, state: nextState };
  }
}

export const activeProjectStore = createActiveProjectStore({
  project: bookDtdSample.importResult.project,
  origin: 'sample',
  sourceFilename: bookDtdSample.filename,
  contentKindsByNodeId: bookDtdSample.importResult.contentKindsByNodeId,
  dtdAttributesByNodeId: bookDtdSample.importResult.dtdAttributesByNodeId,
  comments: bookDtdSample.importResult.comments,
  commentsByNodeId: bookDtdSample.importResult.commentsByNodeId,
  schemaLevelComments: bookDtdSample.importResult.schemaLevelComments,
  sourceMarkupByNodeId: bookDtdSample.importResult.sourceMarkupByNodeId,
  preparedSearchIndex: bookDtdSample.searchIndex,
  visualizationCompleteness:
    bookDtdSample.importResult.visualization.summary.completeness,
  visualizationSummary: bookDtdSample.importResult.visualization.summary,
  visualizationFindings: bookDtdSample.importResult.visualization.findings,
});

export const activeProject = derived(
  activeProjectStore,
  ({ project }) => project,
);
