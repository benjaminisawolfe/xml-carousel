import {
  getSchemaNode,
  type SchemaNode,
  type SchemaNodeId,
  type SchemaNodeKind,
  type SchemaProject,
} from '../../schema/model';
import type { XsdMetadataByNodeId } from '../../schema/xsd';
import { selectLikelyDocumentElementIds } from '../../schema/xsd/xsdQueries';
import type {
  SchemaPackageEntrySummary,
  SchemaPackageSummary,
  SchemaPackageSourceSummary,
  SchemaPackageUnresolvedReference,
} from '../../app/import/schemaPackage';
import type { SchemaArchiveManifest } from '../../app/import/schemaArchive';
import { formatSchemaNodeKind } from '../carousel/nodePresentation';
import { getSchemaNodeDisplayName } from './xsdMetadataPresentation';

export interface SchemaSetOutlineInput {
  readonly archiveFilename: string;
  readonly manifest: SchemaArchiveManifest;
  readonly project: SchemaProject;
  readonly sources: readonly SchemaPackageSourceSummary[];
  readonly entries: readonly SchemaPackageEntrySummary[];
  readonly summary: SchemaPackageSummary;
  readonly unresolvedReferences: readonly SchemaPackageUnresolvedReference[];
  readonly xsdMetadataByNodeId?: XsdMetadataByNodeId;
}

export interface SchemaSetNodePresentation {
  readonly nodeId: SchemaNodeId;
  readonly displayName: string;
  readonly kind: SchemaNodeKind;
  readonly kindLabel: string;
  readonly sourceFileId: string;
  readonly groupId: string;
  readonly beginNewJourney: boolean;
}

export interface SchemaSetNodeGroupPresentation {
  readonly id: string;
  readonly label: string;
  readonly nodes: readonly SchemaSetNodePresentation[];
}

export interface SchemaSetUnresolvedReferencePresentation {
  readonly id: string;
  readonly sourceNodeId: SchemaNodeId;
  readonly raw: string;
  readonly kindLabel: string;
  readonly reasonLabel: string;
  readonly explanation: string;
  readonly ownerDisplayName: string;
  readonly candidateCount: number;
  readonly candidateSummary?: string;
  readonly line: number;
  readonly column: number;
}

export interface SchemaSetSourcePresentation {
  readonly sourceFileId: string;
  readonly filename: string;
  readonly format: 'xsd' | 'dtd' | 'rng';
  readonly formatLabel: 'XSD' | 'DTD' | 'RELAX NG';
  readonly sourceOrder: number;
  readonly nodeCount: number;
  readonly rootCount: number;
  readonly unresolvedReferenceCount: number;
  readonly groups: readonly SchemaSetNodeGroupPresentation[];
  readonly unresolvedReferences: readonly SchemaSetUnresolvedReferencePresentation[];
}

export interface SchemaSetOutlinePresentation {
  readonly packageId: string;
  readonly archiveFilename: string;
  readonly packageType: 'ZIP archive';
  readonly packageRoot: string;
  readonly commonRoot: string;
  readonly summary: SchemaPackageSummary;
  readonly entryGroups: readonly SchemaPackageEntryGroupPresentation[];
  readonly rootCandidates: readonly SchemaPackageEntrySummary[];
  readonly sourceCount: number;
  readonly unresolvedReferenceCount: number;
  readonly statusText: string;
  readonly sources: readonly SchemaSetSourcePresentation[];
}

export interface SchemaPackageEntryGroupPresentation {
  readonly id:
    'schema-sources' | 'auxiliary-files' | 'ignored-entries' | 'directories';
  readonly label: string;
  readonly entries: readonly SchemaPackageEntrySummary[];
}

export function formatPackageEntryKind(
  kind: SchemaPackageEntrySummary['kind'],
): string {
  switch (kind) {
    case 'xsd-source':
      return 'XSD source';
    case 'dtd-source':
      return 'DTD source';
    case 'rng-source':
      return 'RELAX NG source';
    case 'auxiliary':
      return 'Auxiliary file';
    case 'ignored':
      return 'Ignored entry';
    case 'directory':
      return 'Directory';
  }
}

export function formatPackageStandardsStatus(
  status: SchemaPackageEntrySummary['standardsStatus'],
): string {
  switch (status) {
    case 'accepted-schema-source':
      return 'Accepted schema source';
    case 'accepted-auxiliary-dependency':
      return 'Accepted auxiliary dependency';
    case 'not-a-schema-source':
      return 'Not a schema source';
    case 'not-independently-validated':
      return 'Not independently validated';
    case 'blocked-dependency':
      return 'Validation blocked by dependency';
    case 'standards-invalid':
      return 'Standards-invalid';
    case 'engine-internal':
      return 'Standards engine unavailable';
    case 'resource-limit':
      return 'Standards resource limit';
  }
}

export function formatPackageVisualizationStatus(
  status: SchemaPackageEntrySummary['visualizationStatus'],
): string {
  switch (status) {
    case 'complete':
      return 'Complete';
    case 'no-navigable-declarations':
      return 'No navigable declarations';
    case 'auxiliary':
      return 'Auxiliary';
    case 'source-only':
      return 'Source-only';
    case 'ignored':
      return 'Ignored';
    case 'not-applicable':
      return 'Not applicable';
  }
}

export function formatPackageRelationshipKind(
  kind: SchemaPackageEntrySummary['dependencies'][number]['kind'],
): string {
  switch (kind) {
    case 'rng-include':
      return 'RELAX NG include';
    case 'rng-external-ref':
      return 'RELAX NG externalRef';
    case 'external-entity':
      return 'DTD external entity';
    case 'include':
      return 'XSD include';
    case 'import':
      return 'XSD import';
    case 'redefine':
      return 'XSD redefine';
  }
}

export function formatPackageRelationshipStatus(
  relationship: SchemaPackageEntrySummary['dependencies'][number],
): string {
  if (relationship.status !== 'blocked') return relationship.status;
  switch (relationship.blockedReason) {
    case 'external-uri':
      return 'Blocked external URI';
    case 'filesystem':
      return 'Blocked filesystem path';
    case 'traversal':
      return 'Blocked traversal';
    default:
      return 'Blocked';
  }
}

export function formatPackageEntryBytes(
  byteLength: number | undefined,
): string {
  if (byteLength === undefined) return 'Size unavailable';
  return `${byteLength.toLocaleString('en-CA')} ${byteLength === 1 ? 'byte' : 'bytes'}`;
}

export function formatSchemaPackageSourceCount(count: number): string {
  return `${count} schema ${count === 1 ? 'file' : 'files'}`;
}

export function formatSchemaPackageUnresolvedCount(count: number): string {
  return `${count} unresolved ${count === 1 ? 'reference' : 'references'}`;
}

export function formatSchemaPackageStatus(
  sourceCount: number,
  unresolvedReferenceCount: number,
): string {
  const sourceText = formatSchemaPackageSourceCount(sourceCount);
  return unresolvedReferenceCount === 0
    ? sourceText
    : `${sourceText} · ${formatSchemaPackageUnresolvedCount(
        unresolvedReferenceCount,
      )}`;
}

export function formatUnresolvedReason(
  reason: SchemaPackageUnresolvedReference['reason'],
): { readonly label: string; readonly explanation: string } {
  switch (reason) {
    case 'notFound':
      return {
        label: 'Not found',
        explanation: 'No matching declaration was found in this ZIP package.',
      };
    case 'ambiguous':
      return {
        label: 'Ambiguous',
        explanation:
          'More than one matching declaration was found in this ZIP package.',
      };
    case 'invalidTargetKind':
      return {
        label: 'Wrong component kind',
        explanation:
          'Matching declarations exist, but none has the XSD component kind required by this reference.',
      };
  }
}

export function formatUnresolvedReferenceKind(
  kind: SchemaPackageUnresolvedReference['referenceKind'],
): string {
  switch (kind) {
    case 'type':
      return 'Type reference';
    case 'element':
      return 'Element reference';
    case 'attribute':
      return 'Attribute reference';
    case 'group':
      return 'Model-group reference';
    case 'attributeGroup':
      return 'Attribute-group reference';
    case 'substitutionGroup':
      return 'Substitution-group reference';
    case 'restrictionBase':
      return 'Restriction base';
    case 'complexTypeBase':
      return 'Complex type base';
    case 'listItemType':
      return 'List item type';
    case 'unionMemberType':
      return 'Union member type';
    case 'keyrefTarget':
      return 'Key-reference target';
    case 'notation':
      return 'Notation reference';
  }
}

function compareCodePoints(left: string, right: string): number {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0)!);
  const rightPoints = Array.from(right, (character) =>
    character.codePointAt(0)!,
  );
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    const difference = leftPoints[index] - rightPoints[index];
    if (difference !== 0) return difference;
  }
  return leftPoints.length - rightPoints.length;
}

function nodeCompare(left: SchemaNode, right: SchemaNode): number {
  return (
    (left.sourceOrder ?? Number.MAX_SAFE_INTEGER) -
      (right.sourceOrder ?? Number.MAX_SAFE_INTEGER) ||
    compareCodePoints(left.name, right.name) ||
    compareCodePoints(left.id, right.id)
  );
}

function row(
  input: SchemaSetOutlineInput,
  node: SchemaNode,
  groupId: string,
  beginNewJourney: boolean,
): SchemaSetNodePresentation {
  return {
    nodeId: node.id,
    displayName: getSchemaNodeDisplayName(
      input.project,
      node,
      input.xsdMetadataByNodeId,
    ),
    kind: node.kind,
    kindLabel: formatSchemaNodeKind(node.kind),
    sourceFileId: node.sourceFileId!,
    groupId,
    beginNewJourney,
  };
}

function group(
  input: SchemaSetOutlineInput,
  sourceFileId: string,
  key: string,
  label: string,
  nodes: readonly SchemaNode[],
  beginNewJourney: boolean,
): SchemaSetNodeGroupPresentation | undefined {
  if (nodes.length === 0) return undefined;
  const id = `schema-set-group:${encodeURIComponent(sourceFileId)}:${key}`;
  return {
    id,
    label,
    nodes: [...nodes]
      .sort(nodeCompare)
      .map((node) => row(input, node, id, beginNewJourney)),
  };
}

function xsdGroups(
  input: SchemaSetOutlineInput,
  sourceFileId: string,
  sourceNodes: readonly SchemaNode[],
  documentElementIds: ReadonlySet<SchemaNodeId>,
): readonly SchemaSetNodeGroupPresentation[] {
  const metadata = input.xsdMetadataByNodeId ?? {};
  const schemaOverview = sourceNodes.filter((node) => {
    const value = metadata[node.id];
    return (
      node.kind === 'schema' &&
      value?.kind === 'schema' &&
      value.scope === 'schema'
    );
  });
  const globalElements = sourceNodes.filter((node) => {
    const value = metadata[node.id];
    return (
      node.kind === 'globalElement' &&
      value?.kind === 'globalElement' &&
      value.scope === 'global'
    );
  });
  const documentElements = globalElements.filter(({ id }) =>
    documentElementIds.has(id),
  );
  const otherGlobalElements =
    documentElementIds.size === 0
      ? []
      : globalElements.filter(({ id }) => !documentElementIds.has(id));
  const fallbackGlobalElements =
    documentElementIds.size === 0 ? globalElements : [];
  const complexTypes = sourceNodes.filter((node) => {
    const value = metadata[node.id];
    return (
      node.kind === 'complexType' &&
      value?.kind === 'complexType' &&
      value.scope === 'global' &&
      value.anonymous !== true
    );
  });
  const simpleTypes = sourceNodes.filter((node) => {
    const value = metadata[node.id];
    return (
      node.kind === 'simpleType' &&
      value?.kind === 'simpleType' &&
      value.scope === 'global' &&
      value.anonymous !== true
    );
  });
  const globalAttributes = sourceNodes.filter((node) => {
    const value = metadata[node.id];
    return (
      node.kind === 'attribute' &&
      value?.kind === 'attribute' &&
      value.scope === 'global'
    );
  });
  const modelGroups = sourceNodes.filter((node) => {
    const value = metadata[node.id];
    return node.kind === 'group' && value?.scope === 'global';
  });
  const attributeGroups = sourceNodes.filter((node) => {
    const value = metadata[node.id];
    return node.kind === 'attributeGroup' && value?.scope === 'global';
  });
  const identityConstraints = sourceNodes.filter(
    ({ kind }) => kind === 'identityConstraint',
  );
  const notations = sourceNodes.filter(({ kind }) => kind === 'xsdNotation');
  const schemaRelationships = sourceNodes.filter(({ kind }) =>
    ['include', 'import', 'redefine'].includes(kind),
  );

  return [
    group(
      input,
      sourceFileId,
      'schema-overview',
      'Schema overview',
      schemaOverview,
      true,
    ),
    group(
      input,
      sourceFileId,
      'schema-relationships',
      'Schema relationships',
      schemaRelationships,
      true,
    ),
    group(
      input,
      sourceFileId,
      'identity-constraints',
      'Identity constraints',
      identityConstraints,
      true,
    ),
    group(
      input,
      sourceFileId,
      'xsd-notations',
      'XSD notations',
      notations,
      true,
    ),
    group(
      input,
      sourceFileId,
      'document-elements',
      'Document elements',
      documentElements,
      true,
    ),
    group(
      input,
      sourceFileId,
      'other-global-elements',
      'Other global elements',
      otherGlobalElements,
      true,
    ),
    group(
      input,
      sourceFileId,
      'global-elements',
      'Global elements',
      fallbackGlobalElements,
      true,
    ),
    group(
      input,
      sourceFileId,
      'complex-types',
      'Complex types',
      complexTypes,
      true,
    ),
    group(
      input,
      sourceFileId,
      'simple-types',
      'Simple types',
      simpleTypes,
      true,
    ),
    group(
      input,
      sourceFileId,
      'global-attributes',
      'Global attributes',
      globalAttributes,
      true,
    ),
    group(
      input,
      sourceFileId,
      'model-groups',
      'Model groups',
      modelGroups,
      true,
    ),
    group(
      input,
      sourceFileId,
      'attribute-groups',
      'Attribute groups',
      attributeGroups,
      true,
    ),
  ].filter(
    (value): value is SchemaSetNodeGroupPresentation => value !== undefined,
  );
}

function dtdGroups(
  input: SchemaSetOutlineInput,
  sourceFileId: string,
  sourceNodes: readonly SchemaNode[],
  rootIds: ReadonlySet<SchemaNodeId>,
): readonly SchemaSetNodeGroupPresentation[] {
  const roots = sourceNodes.filter(
    (node) => node.kind === 'dtdElement' && rootIds.has(node.id),
  );
  const otherElements = sourceNodes.filter(
    (node) => node.kind === 'dtdElement' && !rootIds.has(node.id),
  );

  return [
    group(input, sourceFileId, 'root-elements', 'Root elements', roots, false),
    group(
      input,
      sourceFileId,
      'other-elements',
      'Other elements',
      otherElements,
      false,
    ),
    group(
      input,
      sourceFileId,
      'attribute-lists',
      'DTD attribute lists',
      sourceNodes.filter(({ kind }) => kind === 'dtdAttributeList'),
      false,
    ),
    group(
      input,
      sourceFileId,
      'attributes',
      'Attributes',
      sourceNodes.filter(({ kind }) => kind === 'dtdAttribute'),
      false,
    ),
    group(
      input,
      sourceFileId,
      'entities',
      'General entities',
      sourceNodes.filter(({ kind }) => kind === 'dtdEntity'),
      false,
    ),
    group(
      input,
      sourceFileId,
      'parameter-entities',
      'Parameter entities',
      sourceNodes.filter(({ kind }) => kind === 'dtdParameterEntity'),
      false,
    ),
    group(
      input,
      sourceFileId,
      'notations',
      'Notations',
      sourceNodes.filter(({ kind }) => kind === 'dtdNotation'),
      false,
    ),
    group(
      input,
      sourceFileId,
      'content-models',
      'Content-model structures',
      sourceNodes.filter(({ kind }) => kind === 'dtdContentModel'),
      false,
    ),
    group(
      input,
      sourceFileId,
      'name-references',
      'DTD element references',
      sourceNodes.filter(({ kind }) => kind === 'dtdElementReference'),
      false,
    ),
    group(
      input,
      sourceFileId,
      'conditional-sections',
      'Conditional sections',
      sourceNodes.filter(({ kind }) => kind === 'dtdConditionalSection'),
      false,
    ),
    group(
      input,
      sourceFileId,
      'comments',
      'Comments and source notes',
      sourceNodes.filter(({ kind }) => kind === 'dtdComment'),
      false,
    ),
    group(
      input,
      sourceFileId,
      'processing-instructions',
      'Processing instructions',
      sourceNodes.filter(({ kind }) => kind === 'dtdProcessingInstruction'),
      false,
    ),
    group(
      input,
      sourceFileId,
      'dependencies',
      'External sources and dependencies',
      sourceNodes.filter(({ kind }) => kind === 'dtdDependency'),
      false,
    ),
  ].filter(
    (value): value is SchemaSetNodeGroupPresentation => value !== undefined,
  );
}

function sourceFilename(
  project: SchemaProject,
  sourceFileId: string | undefined,
): string | undefined {
  if (!sourceFileId) return undefined;
  return project.sourceFiles?.find(({ id }) => id === sourceFileId)?.filename;
}

export function buildUnresolvedReferencePresentation(
  project: SchemaProject,
  xsdMetadataByNodeId: XsdMetadataByNodeId,
  reference: SchemaPackageUnresolvedReference,
): SchemaSetUnresolvedReferencePresentation {
  const reason = formatUnresolvedReason(reference.reason);
  const owner = getSchemaNode(project, reference.sourceNodeId);
  const candidates = reference.candidateNodeIds
    .map((nodeId) => getSchemaNode(project, nodeId))
    .filter((node): node is SchemaNode => node !== undefined)
    .map((node) => {
      const filename = sourceFilename(project, node.sourceFileId);
      return filename ? `${node.name} · ${filename}` : node.name;
    });
  const candidateSummary =
    candidates.length === 0
      ? undefined
      : `${candidates.length === 1 ? 'Candidate' : 'Candidates'}: ${candidates.join('; ')}`;

  return {
    id: reference.id,
    sourceNodeId: reference.sourceNodeId,
    raw: reference.raw,
    kindLabel: formatUnresolvedReferenceKind(reference.referenceKind),
    reasonLabel: reason.label,
    explanation: reason.explanation,
    ownerDisplayName: owner
      ? getSchemaNodeDisplayName(project, owner, xsdMetadataByNodeId)
      : 'Unknown owner',
    candidateCount: candidates.length,
    ...(candidateSummary ? { candidateSummary } : {}),
    line: reference.range.start.line,
    column: reference.range.start.column,
  };
}

export function buildSchemaSetOutlinePresentation(
  input: SchemaSetOutlineInput,
): SchemaSetOutlinePresentation {
  const nodesBySource = new Map<string, SchemaNode[]>();
  for (const node of input.project.nodes) {
    if (!node.sourceFileId) continue;
    const nodes = nodesBySource.get(node.sourceFileId);
    if (nodes) nodes.push(node);
    else nodesBySource.set(node.sourceFileId, [node]);
  }
  const rootIds = new Set(input.project.rootNodeIds);
  const documentElementIds = new Set(
    selectLikelyDocumentElementIds(
      input.project,
      input.xsdMetadataByNodeId ?? {},
    ),
  );
  const unresolvedBySource = new Map<
    string,
    SchemaPackageUnresolvedReference[]
  >();
  for (const reference of input.unresolvedReferences) {
    const references = unresolvedBySource.get(reference.sourceFileId);
    if (references) references.push(reference);
    else unresolvedBySource.set(reference.sourceFileId, [reference]);
  }
  const sortedSources = [...input.sources].sort(
    (left, right) =>
      left.sourceOrder - right.sourceOrder ||
      compareCodePoints(left.sourceFileId, right.sourceFileId),
  );
  const sources = sortedSources.map((source) => {
    const sourceNodes = nodesBySource.get(source.sourceFileId) ?? [];
    const unresolvedReferences = (
      unresolvedBySource.get(source.sourceFileId) ?? []
    ).map((reference) =>
      buildUnresolvedReferencePresentation(
        input.project,
        input.xsdMetadataByNodeId ?? {},
        reference,
      ),
    );
    return {
      sourceFileId: source.sourceFileId,
      filename: source.packageRelativePath,
      format: source.format,
      formatLabel:
        source.format === 'xsd'
          ? 'XSD'
          : source.format === 'dtd'
            ? 'DTD'
            : 'RELAX NG',
      sourceOrder: source.sourceOrder,
      nodeCount: source.nodeCount,
      rootCount: source.rootNodeIds.length,
      unresolvedReferenceCount: unresolvedReferences.length,
      groups:
        source.format === 'xsd'
          ? xsdGroups(
              input,
              source.sourceFileId,
              sourceNodes,
              documentElementIds,
            )
          : source.format === 'dtd'
            ? dtdGroups(input, source.sourceFileId, sourceNodes, rootIds)
            : [
                group(
                  input,
                  source.sourceFileId,
                  'relax-ng-source',
                  'RELAX NG source document',
                  sourceNodes.filter(({ kind }) => kind === 'relaxNgSchema'),
                  true,
                ),
              ].filter(
                (value): value is SchemaSetNodeGroupPresentation =>
                  value !== undefined,
              ),
      unresolvedReferences,
    } satisfies SchemaSetSourcePresentation;
  });

  const entryGroups = [
    {
      id: 'schema-sources',
      label: 'Schema sources',
      entries: input.entries.filter(
        ({ kind }) =>
          kind === 'xsd-source' ||
          kind === 'dtd-source' ||
          kind === 'rng-source',
      ),
    },
    {
      id: 'auxiliary-files',
      label: 'Auxiliary files',
      entries: input.entries.filter(({ kind }) => kind === 'auxiliary'),
    },
    {
      id: 'ignored-entries',
      label: 'Ignored entries',
      entries: input.entries.filter(({ kind }) => kind === 'ignored'),
    },
    {
      id: 'directories',
      label: 'Directories',
      entries: input.entries.filter(({ kind }) => kind === 'directory'),
    },
  ].filter(
    ({ entries }) => entries.length > 0,
  ) as SchemaPackageEntryGroupPresentation[];

  return {
    packageId: input.manifest.id,
    archiveFilename: input.archiveFilename,
    packageType: 'ZIP archive',
    packageRoot: input.manifest.packageRoot,
    commonRoot: input.manifest.commonRootDirectory ?? 'No single common root',
    summary: input.summary,
    entryGroups,
    rootCandidates: input.entries.filter(({ rootCandidate }) => rootCandidate),
    sourceCount: sources.length,
    unresolvedReferenceCount: input.unresolvedReferences.length,
    statusText: formatSchemaPackageStatus(
      sources.length,
      input.unresolvedReferences.length,
    ),
    sources,
  };
}
