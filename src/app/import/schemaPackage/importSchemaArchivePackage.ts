import {
  schemaNodeKinds,
  validateSchemaProject,
  type SchemaNode,
  type SchemaNodeId,
  type SchemaNodeKind,
  type SchemaProject,
  type SchemaSourceMarkupByNodeId,
} from '../../../schema/model';
import {
  importDtdSource,
  reconcileProjectDtdElementReferences,
  type DtdAttributesByNodeId,
  type DtdCommentsByNodeId,
  type DtdNormalizedComment,
  type DtdNormalizedContentKind,
} from '../../../schema/dtd';
import { importXsdSource, type XsdMetadataByNodeId } from '../../../schema/xsd';
import { buildStandaloneRelaxNgProject } from '../../../schema/relaxng';
import {
  discoverSchemaArchive,
  type SchemaArchiveBinary,
  type SchemaArchiveDiscoveryInput,
  type SchemaArchiveManifest,
  type SchemaArchiveSchemaEntry,
} from '../schemaArchive';
import {
  MAX_SCHEMA_PACKAGE_ENTRY_BYTES,
  MAX_SCHEMA_PACKAGE_TOTAL_BYTES,
} from './schemaPackageConstants';
import {
  decodeSchemaPackageSource,
  type SchemaPackageSourceText,
} from './schemaPackageDecoding';
import {
  loadJsZipSchemaContents,
  SchemaArchiveContentLoadError,
} from './jsZipContentLoader';
import {
  deriveSchemaPackageSourceFileId,
  remapSchemaPackageFile,
  sortSchemaPackageFileNodes,
  type SchemaPackageRemappedFile,
} from './schemaPackageRemapping';
import type {
  LoadedSchemaArchiveEntryContent,
  SchemaPackageDiagnostic,
  SchemaPackageImportDependencies,
  SchemaPackageImportDiagnostic,
  SchemaPackageImportExecution,
  SchemaPackageImportProgress,
  SchemaPackageImportResult,
  SchemaPackageEntrySummary,
  SchemaPackageFileRelationship,
  SchemaPackageSourceSummary,
  SchemaPackageStandardsStatus,
  SchemaPackageSummary,
} from './schemaPackageTypes';
import type { RelaxNgValidationResult } from '../../../standards/relaxng';
import {
  clonePlainValue,
  compareUnicodeCodePoints,
  deepFreezePlain,
  resolveControlledProjectPath,
} from './schemaPackageUtilities';
import { selectSchemaPackageEntryRoots } from './schemaPackageEntryRoots';
import {
  buildRelaxNgPackageRelationships,
  relaxNgRelationshipDiagnostics,
} from './relaxNgPackageReferences';
import { resolveSchemaPackageXsdReferences } from './xsdPackageReferenceResolver';
import { createVisualizationFailureDiagnostic } from '../../../standards/xerces';
import {
  createVisualizationResult,
  type VisualizationResult,
} from '../../../schema/visualization';

const deferredXsdDiagnosticCodes = new Set([
  'external-type-reference-deferred',
  'external-element-reference-deferred',
  'external-attribute-reference-deferred',
  'external-restriction-base-deferred',
  'external-complex-type-base-deferred',
]);

const productionDependencies: SchemaPackageImportDependencies = {
  discoverArchive: discoverSchemaArchive,
  loadContents: loadJsZipSchemaContents,
  importDtd: importDtdSource,
  importXsd: importXsdSource,
};

function cloneBinary(data: SchemaArchiveBinary): SchemaArchiveBinary {
  return data instanceof Uint8Array ? data.slice() : data.slice(0);
}

function cloneInput(
  input: SchemaArchiveDiscoveryInput,
): SchemaArchiveDiscoveryInput {
  return { filename: input.filename, data: cloneBinary(input.data) };
}

function reportPackageProgress(
  execution: SchemaPackageImportExecution | undefined,
  progress: SchemaPackageImportProgress,
): void {
  try {
    execution?.onProgress?.(progress);
  } catch {
    // Progress observers are informational and cannot change import semantics.
  }
}

function packageDiagnostic(
  code: SchemaPackageDiagnostic['code'],
  severity: SchemaPackageDiagnostic['severity'],
  message: string,
  details: Omit<
    SchemaPackageDiagnostic,
    'stage' | 'code' | 'severity' | 'message'
  > = {},
): SchemaPackageDiagnostic {
  return { stage: 'package', code, severity, message, ...details };
}

function entryDetails(
  entry: SchemaArchiveSchemaEntry,
  sourceFileId?: string,
): Pick<SchemaPackageDiagnostic, 'sourceFileId' | 'entryPath'> {
  return {
    ...(sourceFileId === undefined ? {} : { sourceFileId }),
    entryPath: entry.archivePath,
  };
}

function contentLoadDiagnostic(error: unknown): SchemaPackageDiagnostic {
  if (error instanceof SchemaArchiveContentLoadError) {
    if (error.reason === 'missing') {
      return packageDiagnostic(
        'archive-entry-missing',
        'error',
        'A schema entry listed in the archive manifest is missing.',
        error.entryPath === undefined ? {} : { entryPath: error.entryPath },
      );
    }
    if (error.reason === 'entry-too-large') {
      return packageDiagnostic(
        'schema-entry-too-large',
        'error',
        'A schema entry exceeds the 5 MiB extracted-size limit.',
        error.entryPath === undefined ? {} : { entryPath: error.entryPath },
      );
    }
    if (error.reason === 'package-too-large') {
      return packageDiagnostic(
        'schema-package-too-large',
        'error',
        'The selected schema entries exceed the 20 MiB extracted-size limit.',
        error.entryPath === undefined ? {} : { entryPath: error.entryPath },
      );
    }
  }
  return packageDiagnostic(
    'archive-entry-read-failure',
    'error',
    'The schema entries could not be read consistently from the ZIP archive.',
    error instanceof SchemaArchiveContentLoadError &&
      error.entryPath !== undefined
      ? { entryPath: error.entryPath }
      : {},
  );
}

function validateLoadedContents(
  manifest: SchemaArchiveManifest,
  contents: readonly LoadedSchemaArchiveEntryContent[],
): SchemaPackageDiagnostic | undefined {
  const acceptedEntries =
    manifest.acceptedFileEntries ??
    manifest.schemaEntries.map((entry) => ({
      archivePath: entry.archivePath,
      packageRelativePath: entry.packageRelativePath,
    }));
  if (contents.length !== acceptedEntries.length) {
    return packageDiagnostic(
      'archive-entry-missing',
      'error',
      'The extracted schema-entry set does not match the archive manifest.',
    );
  }
  for (let index = 0; index < acceptedEntries.length; index += 1) {
    const expected = acceptedEntries[index];
    const actual = contents[index];
    if (
      actual?.archivePath !== expected?.archivePath ||
      !(actual.bytes instanceof Uint8Array)
    ) {
      return packageDiagnostic(
        actual === undefined
          ? 'archive-entry-missing'
          : 'archive-entry-read-failure',
        'error',
        'The extracted schema-entry set does not match the archive manifest.',
        expected === undefined ? {} : { entryPath: expected.archivePath },
      );
    }
  }
  return undefined;
}

function decodeContents(
  manifest: SchemaArchiveManifest,
  contents: readonly LoadedSchemaArchiveEntryContent[],
): {
  readonly sources: readonly SchemaPackageSourceText[];
  readonly auxiliaryDtdSources: readonly SchemaPackageSourceText[];
  readonly diagnostics: readonly SchemaPackageDiagnostic[];
} {
  const sources: SchemaPackageSourceText[] = [];
  const auxiliaryDtdSources: SchemaPackageSourceText[] = [];
  const diagnostics: SchemaPackageDiagnostic[] = [];
  let totalBytes = 0;

  const contentsByArchivePath = new Map(
    contents.map((content) => [content.archivePath, content] as const),
  );
  for (let index = 0; index < manifest.schemaEntries.length; index += 1) {
    const entry = manifest.schemaEntries[index]!;
    const bytes = contentsByArchivePath.get(entry.archivePath)!.bytes;
    const sourceFileId = deriveSchemaPackageSourceFileId(entry);
    if (bytes.byteLength > MAX_SCHEMA_PACKAGE_ENTRY_BYTES) {
      diagnostics.push(
        packageDiagnostic(
          'schema-entry-too-large',
          'error',
          'A schema entry exceeds the 5 MiB extracted-size limit.',
          entryDetails(entry, sourceFileId),
        ),
      );
      continue;
    }
    totalBytes += bytes.byteLength;
    if (totalBytes > MAX_SCHEMA_PACKAGE_TOTAL_BYTES) {
      diagnostics.push(
        packageDiagnostic(
          'schema-package-too-large',
          'error',
          'The selected schema entries exceed the 20 MiB extracted-size limit.',
          entryDetails(entry, sourceFileId),
        ),
      );
      break;
    }
    const decoded = decodeSchemaPackageSource(entry, sourceFileId, bytes);
    if (decoded.status === 'failure') {
      diagnostics.push(decoded.diagnostic);
    } else {
      sources.push(decoded.source);
    }
  }

  const schemaPaths = new Set(
    manifest.schemaEntries.map(({ archivePath }) => archivePath),
  );
  const auxiliaryEntries = (manifest.acceptedFileEntries ?? [])
    .filter(
      ({ archivePath, packageRelativePath }) =>
        !schemaPaths.has(archivePath) && /\.ent$/iu.test(packageRelativePath),
    )
    .sort((left, right) =>
      compareUnicodeCodePoints(
        left.packageRelativePath,
        right.packageRelativePath,
      ),
    );
  for (const [auxiliaryIndex, accepted] of auxiliaryEntries.entries()) {
    const content = contentsByArchivePath.get(accepted.archivePath);
    if (!content) continue;
    let preview: string;
    try {
      preview = new TextDecoder('utf-8', { fatal: true }).decode(content.bytes);
    } catch {
      continue;
    }
    if (!/<!(?:ELEMENT|ATTLIST|ENTITY|NOTATION|\[)|<\?/iu.test(preview)) {
      continue;
    }
    const segments = accepted.packageRelativePath.split('/');
    const entry: SchemaArchiveSchemaEntry = {
      id: `schema-auxiliary:${encodeURIComponent(accepted.archivePath)}`,
      archivePath: accepted.archivePath,
      packageRelativePath: accepted.packageRelativePath,
      ...(segments.length <= 1
        ? {}
        : { directoryPath: segments.slice(0, -1).join('/') }),
      basename: segments[segments.length - 1] ?? accepted.packageRelativePath,
      format: 'dtd',
      sourceOrder: manifest.schemaEntries.length + auxiliaryIndex,
    };
    const decoded = decodeSchemaPackageSource(
      entry,
      deriveSchemaPackageSourceFileId(entry),
      content.bytes,
    );
    if (decoded.status === 'failure') diagnostics.push(decoded.diagnostic);
    else auxiliaryDtdSources.push(decoded.source);
  }
  return { sources, auxiliaryDtdSources, diagnostics };
}

function sourceImportFailure(
  source: SchemaPackageSourceText,
): SchemaPackageDiagnostic {
  return packageDiagnostic(
    'source-import-failed',
    'error',
    `The ${source.entry.format.toUpperCase()} schema entry could not be imported.`,
    entryDetails(source.entry, source.sourceFileId),
  );
}

function filterDeferredWarnings(
  diagnostics: readonly SchemaPackageImportDiagnostic[],
): readonly SchemaPackageImportDiagnostic[] {
  return diagnostics.filter(
    (diagnostic) => !deferredXsdDiagnosticCodes.has(diagnostic.code),
  );
}

function importSources(
  sources: readonly SchemaPackageSourceText[],
  dependencies: SchemaPackageImportDependencies,
  execution: SchemaPackageImportExecution | undefined,
): {
  readonly files: readonly SchemaPackageRemappedFile[];
  readonly diagnostics: readonly SchemaPackageImportDiagnostic[];
} {
  const files: SchemaPackageRemappedFile[] = [];
  const diagnostics: SchemaPackageImportDiagnostic[] = [];

  for (let index = 0; index < sources.length; index += 1) {
    const source = sources[index]!;
    reportPackageProgress(execution, {
      phase: 'importing-package-source',
      current: index + 1,
      total: sources.length,
      currentSourceFilename: source.entry.packageRelativePath,
    });
    const options = {
      projectId: `schema-package-file:${encodeURIComponent(source.entry.archivePath)}`,
      displayName: source.entry.packageRelativePath,
      sourceFileId: source.sourceFileId,
      sourceFilename: source.entry.packageRelativePath,
      standardsAccepted: execution?.validateStandards !== undefined,
    };
    let imported;
    try {
      imported =
        source.entry.format === 'dtd'
          ? dependencies.importDtd(source.sourceText, options)
          : source.entry.format === 'xsd'
            ? dependencies.importXsd(source.sourceText, {
                ...options,
                unresolvedReferencePolicy: 'deferForPackage',
              })
            : buildStandaloneRelaxNgProject({
                filename: source.entry.packageRelativePath,
                sourceText: source.sourceText,
                engine: {
                  name: 'libxml2 RELAX NG',
                  version: '2.15.3',
                },
              });
    } catch {
      diagnostics.push(sourceImportFailure(source));
      continue;
    }
    if (imported.status === 'failure') {
      diagnostics.push(
        ...filterDeferredWarnings(imported.diagnostics),
        sourceImportFailure(source),
      );
      continue;
    }
    const remapped = remapSchemaPackageFile({
      entry: source.entry,
      sourceFileId: source.sourceFileId,
      byteLength: source.byteLength,
      imported,
    });
    if (remapped.status === 'failure') {
      diagnostics.push(...remapped.diagnostics);
      continue;
    }
    files.push(remapped.file);
    diagnostics.push(...filterDeferredWarnings(remapped.file.diagnostics));
  }
  return { files, diagnostics };
}

function unionRecord<T>(
  target: Record<string, T>,
  source: Readonly<Record<string, T>>,
): boolean {
  for (const [key, value] of Object.entries(source)) {
    if (Object.prototype.hasOwnProperty.call(target, key)) return false;
    target[key] = clonePlainValue(value);
  }
  return true;
}

function nodeKindOrder(node: SchemaNode): number {
  const index = (schemaNodeKinds as readonly SchemaNodeKind[]).indexOf(
    node.kind,
  );
  return index < 0 ? schemaNodeKinds.length : index;
}

export function resolveDtdDependencyPath(
  referringPath: string,
  rawTarget: string,
): { readonly status: string; readonly path?: string } {
  const resolution = resolveControlledProjectPath(referringPath, rawTarget);
  return {
    status: resolution.detail,
    ...(resolution.path === undefined ? {} : { path: resolution.path }),
  };
}

function assembleFiles(
  manifest: SchemaArchiveManifest,
  files: readonly SchemaPackageRemappedFile[],
): {
  readonly project?: SchemaProject;
  readonly sources: readonly SchemaPackageSourceSummary[];
  readonly initialFocusNodeId?: SchemaNodeId;
  readonly contentKindsByNodeId: Readonly<
    Record<SchemaNodeId, DtdNormalizedContentKind>
  >;
  readonly dtdAttributesByNodeId: DtdAttributesByNodeId;
  readonly comments: readonly DtdNormalizedComment[];
  readonly commentsByNodeId: DtdCommentsByNodeId;
  readonly schemaLevelComments: readonly DtdNormalizedComment[];
  readonly sourceMarkupByNodeId: SchemaSourceMarkupByNodeId;
  readonly xsdMetadataByNodeId: XsdMetadataByNodeId;
  readonly diagnostics: readonly SchemaPackageDiagnostic[];
  readonly visualization: VisualizationResult;
} {
  const diagnostics: SchemaPackageDiagnostic[] = [];
  const sourceIds = new Set<string>();
  const nodes: SchemaNode[] = [];
  const edges = [];
  const rootNodeIds: SchemaNodeId[] = [];
  const sources: SchemaPackageSourceSummary[] = [];
  const contentKindsByNodeId: Record<string, DtdNormalizedContentKind> = {};
  const dtdAttributesByNodeId: Record<string, DtdAttributesByNodeId[string]> =
    {};
  const comments: DtdNormalizedComment[] = [];
  const commentsByNodeId: Record<string, readonly DtdNormalizedComment[]> = {};
  const schemaLevelComments: DtdNormalizedComment[] = [];
  const sourceMarkupByNodeId: Record<
    string,
    SchemaSourceMarkupByNodeId[string]
  > = {};
  const xsdMetadataByNodeId: Record<string, XsdMetadataByNodeId[string]> = {};
  const visualizationInputs = files.flatMap(
    (file) => file.visualization.findings,
  );
  const totalVisualizationFindingCount = files.reduce(
    (total, file) => total + file.visualization.summary.totalFindingCount,
    0,
  );
  const visualizationFindingCountsByCode = files.reduce<Record<string, number>>(
    (counts, file) => {
      const fileCounts =
        file.visualization.summary.findingCountsByCode ??
        file.visualization.findings.reduce<Record<string, number>>(
          (fallback, finding) => {
            fallback[finding.code] = (fallback[finding.code] ?? 0) + 1;
            return fallback;
          },
          {},
        );
      for (const [code, count] of Object.entries(fileCounts)) {
        counts[code] = (counts[code] ?? 0) + count;
      }
      return counts;
    },
    {},
  );

  let globalSourceOrder = 0;
  for (const file of files) {
    if (sourceIds.has(file.sourceFileId)) {
      diagnostics.push(
        packageDiagnostic(
          'source-id-collision',
          'error',
          'Two schema entries produced the same package source identifier.',
          entryDetails(file.entry, file.sourceFileId),
        ),
      );
      continue;
    }
    sourceIds.add(file.sourceFileId);
    const fileNodes = sortSchemaPackageFileNodes(file.project.nodes);
    for (const node of fileNodes) {
      nodes.push({
        ...clonePlainValue(node),
        sourceOrder: globalSourceOrder,
      });
      globalSourceOrder += 1;
    }
    edges.push(...file.project.edges.map(clonePlainValue));
    rootNodeIds.push(...file.project.rootNodeIds);
    sources.push({
      sourceFileId: file.sourceFileId,
      archiveEntryId: file.entry.id,
      archivePath: file.entry.archivePath,
      packageRelativePath: file.entry.packageRelativePath,
      format: file.entry.format,
      sourceOrder: file.entry.sourceOrder,
      byteLength: file.byteLength,
      nodeCount: file.project.nodes.length,
      rootNodeIds: [...file.project.rootNodeIds],
      initialFocusNodeId: file.initialFocusNodeId,
    });
    comments.push(...file.comments.map(clonePlainValue));
    schemaLevelComments.push(...file.schemaLevelComments.map(clonePlainValue));
    for (const [key, value] of Object.entries(file.commentsByNodeId)) {
      commentsByNodeId[key] = value.map(clonePlainValue);
    }
    const recordsRemainUnique =
      unionRecord(contentKindsByNodeId, file.contentKindsByNodeId) &&
      unionRecord(dtdAttributesByNodeId, file.dtdAttributesByNodeId) &&
      unionRecord(sourceMarkupByNodeId, file.sourceMarkupByNodeId) &&
      unionRecord(xsdMetadataByNodeId, file.xsdMetadataByNodeId);
    if (!recordsRemainUnique) {
      diagnostics.push(
        packageDiagnostic(
          'node-id-collision',
          'error',
          'Package metadata contains a duplicate remapped node identifier.',
          entryDetails(file.entry, file.sourceFileId),
        ),
      );
    }
  }

  const acceptedPaths = new Set(
    (manifest.acceptedFileEntries ?? manifest.schemaEntries).map(
      ({ packageRelativePath }) => packageRelativePath,
    ),
  );
  const sourcePathById = new Map(
    files.map(
      (file) => [file.sourceFileId, file.entry.packageRelativePath] as const,
    ),
  );
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]!;
    if (node.kind !== 'dtdDependency' || !node.sourceFileId) continue;
    const referringPath = sourcePathById.get(node.sourceFileId);
    if (!referringPath) continue;
    const resolved = resolveDtdDependencyPath(referringPath, node.name);
    const supplied =
      resolved.path !== undefined && acceptedPaths.has(resolved.path);
    nodes[index] = {
      ...node,
      properties: [
        ...(node.properties ?? []).filter(
          ({ label }) =>
            label !== 'Resolution status' && label !== 'Resolved path',
        ),
        {
          label: 'Resolution status',
          value: supplied
            ? 'Resolved to supplied project resource'
            : resolved.path
              ? 'Required resource is not supplied by this project'
              : resolved.status,
        },
        ...(resolved.path === undefined
          ? []
          : [{ label: 'Resolved path', value: resolved.path }]),
      ],
    };
  }

  const project = reconcileProjectDtdElementReferences({
    id: `schema-package:${encodeURIComponent(manifest.archiveFilename)}`,
    displayName: manifest.archiveFilename,
    sourceFiles: files.map((file) => ({
      id: file.sourceFileId,
      filename: file.entry.packageRelativePath,
    })),
    nodes: [...nodes].sort(
      (left, right) =>
        (left.sourceOrder ?? Number.MAX_SAFE_INTEGER) -
          (right.sourceOrder ?? Number.MAX_SAFE_INTEGER) ||
        nodeKindOrder(left) - nodeKindOrder(right) ||
        compareUnicodeCodePoints(left.id, right.id),
    ),
    edges,
    rootNodeIds,
  });
  return {
    project: diagnostics.some(({ severity }) => severity === 'error')
      ? undefined
      : project,
    sources,
    initialFocusNodeId: files[0]?.initialFocusNodeId,
    contentKindsByNodeId,
    dtdAttributesByNodeId,
    comments,
    commentsByNodeId,
    schemaLevelComments,
    sourceMarkupByNodeId,
    xsdMetadataByNodeId,
    diagnostics,
    visualization: createVisualizationResult(
      visualizationInputs,
      totalVisualizationFindingCount,
      visualizationFindingCountsByCode,
    ),
  };
}

function diagnosticSourceId(
  diagnostic: SchemaPackageImportDiagnostic,
): string | undefined {
  if ('sourceFileId' in diagnostic) return diagnostic.sourceFileId;
  if ('sourceId' in diagnostic) return diagnostic.sourceId;
  return undefined;
}

function diagnosticRangeOffset(
  diagnostic: SchemaPackageImportDiagnostic,
): number {
  return 'range' in diagnostic && diagnostic.range
    ? diagnostic.range.start.offset
    : Number.MAX_SAFE_INTEGER;
}

function diagnosticStage(diagnostic: SchemaPackageImportDiagnostic): string {
  return diagnostic.stage;
}

function sortDiagnostics(
  diagnostics: readonly SchemaPackageImportDiagnostic[],
  manifest?: SchemaArchiveManifest,
): readonly SchemaPackageImportDiagnostic[] {
  const sourceOrder = new Map(
    (manifest?.schemaEntries ?? []).map((entry) => [
      deriveSchemaPackageSourceFileId(entry),
      entry.sourceOrder,
    ]),
  );
  return [...diagnostics].sort((left, right) => {
    const leftSourceId = diagnosticSourceId(left);
    const rightSourceId = diagnosticSourceId(right);
    const leftOrder =
      leftSourceId === undefined
        ? -1
        : (sourceOrder.get(leftSourceId) ?? Number.MAX_SAFE_INTEGER);
    const rightOrder =
      rightSourceId === undefined
        ? -1
        : (sourceOrder.get(rightSourceId) ?? Number.MAX_SAFE_INTEGER);
    const leftPath =
      'entryPath' in left && left.entryPath ? left.entryPath : '';
    const rightPath =
      'entryPath' in right && right.entryPath ? right.entryPath : '';
    return (
      leftOrder - rightOrder ||
      compareUnicodeCodePoints(leftPath, rightPath) ||
      diagnosticRangeOffset(left) - diagnosticRangeOffset(right) ||
      (left.severity === right.severity
        ? 0
        : left.severity === 'error'
          ? -1
          : 1) ||
      compareUnicodeCodePoints(diagnosticStage(left), diagnosticStage(right)) ||
      compareUnicodeCodePoints(left.code, right.code) ||
      compareUnicodeCodePoints(left.message, right.message)
    );
  });
}

const xsdFileRelationshipPattern =
  /<(?:[\w.-]+:)?(include|import|redefine)\b[^>]*\bschemaLocation\s*=\s*(['"])(.*?)\2[^>]*>/giu;

const declarationNodeKinds = new Set<SchemaNode['kind']>([
  'globalElement',
  'complexType',
  'simpleType',
  'attribute',
  'group',
  'attributeGroup',
  'identityConstraint',
  'xsdNotation',
  'dtdElement',
  'dtdAttributeList',
  'dtdAttribute',
  'dtdEntity',
  'dtdParameterEntity',
  'dtdNotation',
]);

function safeUtf8Text(bytes: Uint8Array): string | undefined {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  }
  if (/\0/u.test(text)) return undefined;
  const unsafeControls = Array.from(text).filter((character) => {
    const point = character.codePointAt(0)!;
    return point < 0x20 && point !== 0x09 && point !== 0x0a && point !== 0x0d;
  });
  return unsafeControls.length === 0 ? text : undefined;
}

function classificationReason(
  reason: SchemaArchiveManifest['entries'][number]['reason'],
): string {
  switch (reason) {
    case 'schema-source':
      return 'Supported schema source';
    case 'potential-resolution-resource':
      return 'Potential controlled resolution resource';
    case 'directory-entry':
      return 'Directory entry';
    case 'operating-system-metadata':
      return 'Operating-system metadata';
    case 'unsupported-file-type':
      return 'Unsupported file type; retained in package inventory';
  }
}

function buildFileRelationships(
  sources: readonly SchemaPackageSourceText[],
  project: SchemaProject,
  sourceSummaries: readonly SchemaPackageSourceSummary[],
  suppliedPaths: ReadonlySet<string>,
): readonly SchemaPackageFileRelationship[] {
  const rngPaths = new Set(
    sources
      .filter(({ entry }) => entry.format === 'rng')
      .map(({ entry }) => entry.packageRelativePath),
  );
  const relationships: SchemaPackageFileRelationship[] = [
    ...buildRelaxNgPackageRelationships(sources, rngPaths),
  ];
  for (const source of sources) {
    if (source.entry.format !== 'xsd') continue;
    const markup = source.sourceText
      .replace(/<!--[\s\S]*?-->/gu, '')
      .replace(/<!\[CDATA\[[\s\S]*?\]\]>/gu, '');
    let index = 0;
    for (const match of markup.matchAll(xsdFileRelationshipPattern)) {
      const kind = match[1] as 'include' | 'import' | 'redefine';
      const rawTarget = match[3]!;
      const resolution = resolveControlledProjectPath(
        source.entry.packageRelativePath,
        rawTarget,
      );
      const status =
        resolution.status === 'blocked'
          ? 'blocked'
          : resolution.path !== undefined && suppliedPaths.has(resolution.path)
            ? 'resolved'
            : 'missing';
      relationships.push({
        id: `schema-package-file-relationship:${encodeURIComponent(source.entry.packageRelativePath)}:${kind}:${index}`,
        kind,
        rawTarget,
        sourcePath: source.entry.packageRelativePath,
        ...(resolution.path === undefined
          ? {}
          : { targetPath: resolution.path }),
        status,
        ...(resolution.blockedReason === undefined
          ? {}
          : { blockedReason: resolution.blockedReason }),
      });
      index += 1;
    }
  }

  const sourcePathById = new Map(
    sourceSummaries.map(({ sourceFileId, packageRelativePath }) => [
      sourceFileId,
      packageRelativePath,
    ]),
  );
  for (const node of project.nodes) {
    if (node.kind !== 'dtdDependency' || !node.sourceFileId) continue;
    const sourcePath = sourcePathById.get(node.sourceFileId);
    if (!sourcePath) continue;
    const resolution = resolveControlledProjectPath(sourcePath, node.name);
    const status =
      resolution.status === 'blocked'
        ? 'blocked'
        : resolution.path !== undefined && suppliedPaths.has(resolution.path)
          ? 'resolved'
          : 'missing';
    relationships.push({
      id: `schema-package-file-relationship:${encodeURIComponent(sourcePath)}:external-entity:${encodeURIComponent(node.id)}`,
      kind: 'external-entity',
      rawTarget: node.name,
      sourcePath,
      ...(resolution.path === undefined ? {} : { targetPath: resolution.path }),
      status,
      ...(resolution.blockedReason === undefined
        ? {}
        : { blockedReason: resolution.blockedReason }),
    });
  }
  return relationships.sort(
    (left, right) =>
      compareUnicodeCodePoints(left.sourcePath, right.sourcePath) ||
      (left.range?.start.offset ?? Number.MAX_SAFE_INTEGER) -
        (right.range?.start.offset ?? Number.MAX_SAFE_INTEGER) ||
      compareUnicodeCodePoints(left.kind, right.kind) ||
      compareUnicodeCodePoints(left.rawTarget, right.rawTarget) ||
      compareUnicodeCodePoints(left.id, right.id),
  );
}

function buildPackagePresentationMetadata(input: {
  readonly manifest: SchemaArchiveManifest;
  readonly contents: readonly LoadedSchemaArchiveEntryContent[];
  readonly decodedSources: readonly SchemaPackageSourceText[];
  readonly auxiliaryDtdSources: readonly SchemaPackageSourceText[];
  readonly project: SchemaProject;
  readonly sources: readonly SchemaPackageSourceSummary[];
  readonly initialFocusNodeId: SchemaNodeId;
  readonly sourceMarkupByNodeId: SchemaSourceMarkupByNodeId;
  readonly standardsApplied: boolean;
  readonly rngStandardsStatusByPath: ReadonlyMap<
    string,
    SchemaPackageStandardsStatus
  >;
}): {
  readonly entries: readonly SchemaPackageEntrySummary[];
  readonly summary: SchemaPackageSummary;
} {
  const contentByPath = new Map(
    input.contents.map((content) => [content.archivePath, content.bytes]),
  );
  const decodedByPath = new Map(
    [...input.decodedSources, ...input.auxiliaryDtdSources].map((source) => [
      source.entry.archivePath,
      source,
    ]),
  );
  const sourceByArchivePath = new Map(
    input.sources.map((source) => [source.archivePath, source]),
  );
  const sourceIdByNodeId = new Map(
    input.project.nodes.map((node) => [node.id, node.sourceFileId]),
  );
  const sourceMarkupCounts = new Map<string, number>();
  for (const nodeId of Object.keys(input.sourceMarkupByNodeId)) {
    const sourceFileId = sourceIdByNodeId.get(nodeId);
    if (sourceFileId) {
      sourceMarkupCounts.set(
        sourceFileId,
        (sourceMarkupCounts.get(sourceFileId) ?? 0) + 1,
      );
    }
  }
  const suppliedPaths = new Set(
    (input.manifest.acceptedFileEntries ?? []).map(
      ({ packageRelativePath }) => packageRelativePath,
    ),
  );
  const relationships = buildFileRelationships(
    input.decodedSources,
    input.project,
    input.sources,
    suppliedPaths,
  );
  const dependenciesByPath = new Map<string, SchemaPackageFileRelationship[]>();
  const dependentsByPath = new Map<string, SchemaPackageFileRelationship[]>();
  for (const relationship of relationships) {
    const dependencies = dependenciesByPath.get(relationship.sourcePath) ?? [];
    dependencies.push(relationship);
    dependenciesByPath.set(relationship.sourcePath, dependencies);
    if (relationship.targetPath && relationship.status === 'resolved') {
      const dependents = dependentsByPath.get(relationship.targetPath) ?? [];
      dependents.push(relationship);
      dependentsByPath.set(relationship.targetPath, dependents);
    }
  }
  const roots = new Map(
    selectSchemaPackageEntryRoots(input.decodedSources).map((root) => [
      root.entryPath,
      root.format === 'dtd'
        ? 'Independent supplied DTD validation root'
        : root.format === 'rng'
          ? 'Unreferenced RELAX NG root or deterministic cycle representative'
          : 'Unreferenced schema root or deterministic cycle representative',
    ]),
  );
  const selectedSource = input.sources.find(
    ({ initialFocusNodeId }) => initialFocusNodeId === input.initialFocusNodeId,
  );

  const entries = input.manifest.entries.map((entry) => {
    const source = sourceByArchivePath.get(entry.archivePath);
    const decoded = decodedByPath.get(entry.archivePath);
    const bytes = contentByPath.get(entry.archivePath);
    const safeText =
      decoded?.sourceText ?? (bytes ? safeUtf8Text(bytes) : undefined);
    const kind =
      entry.kind === 'xsd'
        ? 'xsd-source'
        : entry.kind === 'dtd'
          ? 'dtd-source'
          : entry.kind === 'rng'
            ? 'rng-source'
            : entry.kind;
    const dependencies =
      dependenciesByPath.get(entry.packageRelativePath) ?? [];
    const dependents = dependentsByPath.get(entry.packageRelativePath) ?? [];
    const unresolvedRelationshipCount = dependencies.filter(
      ({ status }) => status === 'missing',
    ).length;
    const blockedRelationshipCount = dependencies.filter(
      ({ status }) => status === 'blocked',
    ).length;
    const schemaSource =
      kind === 'xsd-source' || kind === 'dtd-source' || kind === 'rng-source';
    const auxiliary = kind === 'auxiliary';
    const nodeCount = source?.nodeCount ?? 0;
    const declarationNodeCount = source
      ? input.project.nodes.filter(
          (node) =>
            node.sourceFileId === source.sourceFileId &&
            declarationNodeKinds.has(node.kind),
        ).length
      : 0;
    const rootCandidateReason = roots.get(entry.packageRelativePath);
    return {
      id: entry.id,
      archivePath: entry.archivePath,
      normalizedPath: entry.normalizedPath,
      packageRelativePath: entry.packageRelativePath,
      basename: entry.basename,
      kind,
      classificationReason: classificationReason(entry.reason),
      originalOrder: entry.originalOrder,
      deterministicOrder: entry.deterministicOrder,
      ...(bytes === undefined && entry.uncompressedByteLength === undefined
        ? {}
        : {
            byteLength:
              bytes?.byteLength ?? entry.uncompressedByteLength ?? undefined,
          }),
      ...(entry.compressedByteLength === undefined
        ? {}
        : { compressedByteLength: entry.compressedByteLength }),
      textStatus:
        entry.directory || bytes === undefined
          ? 'unavailable'
          : safeText === undefined
            ? 'binary'
            : 'text',
      sourceViewAvailable: safeText !== undefined,
      ...(safeText === undefined
        ? {}
        : { sourceText: safeText, encoding: 'UTF-8' }),
      ...(source === undefined ? {} : { sourceFileId: source.sourceFileId }),
      standardsStatus:
        kind === 'rng-source'
          ? (input.rngStandardsStatusByPath.get(entry.packageRelativePath) ??
            'not-independently-validated')
          : schemaSource
            ? input.standardsApplied
              ? 'accepted-schema-source'
              : 'not-independently-validated'
            : auxiliary
              ? 'accepted-auxiliary-dependency'
              : 'not-a-schema-source',
      visualizationStatus:
        kind === 'rng-source'
          ? 'source-only'
          : schemaSource
            ? declarationNodeCount === 0
              ? 'no-navigable-declarations'
              : 'complete'
            : auxiliary
              ? 'auxiliary'
              : entry.directory
                ? 'not-applicable'
                : 'ignored',
      nodeCount,
      searchDocumentCount: nodeCount,
      sourceMarkupCount:
        source === undefined
          ? 0
          : (sourceMarkupCounts.get(source.sourceFileId) ?? 0),
      dependencyCount: dependencies.length,
      dependentCount: dependents.length,
      unresolvedRelationshipCount,
      blockedRelationshipCount,
      dependencies,
      dependents,
      rootCandidate: rootCandidateReason !== undefined,
      ...(rootCandidateReason === undefined ? {} : { rootCandidateReason }),
      selectedEntry: source?.sourceFileId === selectedSource?.sourceFileId,
      sharedDependency: dependents.length > 1,
    } satisfies SchemaPackageEntrySummary;
  });

  return {
    entries,
    summary: {
      entryCount: entries.length,
      fileCount: entries.filter(({ kind }) => kind !== 'directory').length,
      directoryCount: entries.filter(({ kind }) => kind === 'directory').length,
      schemaSourceCount: entries.filter(
        ({ kind }) =>
          kind === 'xsd-source' ||
          kind === 'dtd-source' ||
          kind === 'rng-source',
      ).length,
      xsdSourceCount: entries.filter(({ kind }) => kind === 'xsd-source')
        .length,
      dtdSourceCount: entries.filter(({ kind }) => kind === 'dtd-source')
        .length,
      rngSourceCount: entries.filter(({ kind }) => kind === 'rng-source')
        .length,
      auxiliaryCount: entries.filter(({ kind }) => kind === 'auxiliary').length,
      ignoredCount: entries.filter(({ kind }) => kind === 'ignored').length,
      blockedCount: entries.reduce(
        (total, entry) => total + entry.blockedRelationshipCount,
        0,
      ),
      rootCandidateCount: entries.filter(({ rootCandidate }) => rootCandidate)
        .length,
      completeFileCount: entries.filter(
        ({ visualizationStatus }) => visualizationStatus === 'complete',
      ).length,
      zeroNodeSourceCount: entries.filter(
        ({ visualizationStatus }) =>
          visualizationStatus === 'no-navigable-declarations',
      ).length,
      unresolvedRelationshipCount: entries.reduce(
        (total, entry) => total + entry.unresolvedRelationshipCount,
        0,
      ),
    },
  };
}

function failure(
  diagnostics: readonly SchemaPackageImportDiagnostic[],
  manifest?: SchemaArchiveManifest,
): SchemaPackageImportResult {
  return deepFreezePlain({
    status: 'failure',
    diagnostics: sortDiagnostics(diagnostics, manifest).map(clonePlainValue),
  });
}

function rngStandardsStatus(
  result: RelaxNgValidationResult,
): SchemaPackageStandardsStatus {
  if (
    result.diagnostics.some(
      (diagnostic) => diagnostic.category === 'resource-limit',
    )
  ) {
    return 'resource-limit';
  }
  switch (result.status) {
    case 'valid':
      return 'accepted-schema-source';
    case 'invalid':
      return 'standards-invalid';
    case 'blocked':
      return 'blocked-dependency';
    case 'internal-error':
      return 'engine-internal';
  }
}

function deriveRngStandardsStatuses(
  rngPaths: readonly string[],
  roots: readonly { readonly entryPath: string }[],
  validations: readonly RelaxNgValidationResult[],
  relationships: readonly SchemaPackageFileRelationship[],
): ReadonlyMap<string, SchemaPackageStandardsStatus> {
  const statuses = new Map<string, SchemaPackageStandardsStatus>(
    rngPaths.map((path) => [path, 'not-independently-validated']),
  );
  const dependencies = new Map<string, string[]>();
  for (const relationship of relationships) {
    if (
      relationship.status !== 'resolved' ||
      !relationship.targetPath ||
      (relationship.kind !== 'rng-include' &&
        relationship.kind !== 'rng-external-ref')
    ) {
      continue;
    }
    const targets = dependencies.get(relationship.sourcePath) ?? [];
    targets.push(relationship.targetPath);
    dependencies.set(relationship.sourcePath, targets);
  }
  for (const [index, root] of roots.entries()) {
    const result = validations[index];
    if (!result) continue;
    const status = rngStandardsStatus(result);
    statuses.set(root.entryPath, status);
    if (status !== 'accepted-schema-source') continue;
    const pending = [root.entryPath];
    const visited = new Set<string>();
    while (pending.length > 0) {
      const current = pending.pop()!;
      if (visited.has(current)) continue;
      visited.add(current);
      statuses.set(current, 'accepted-schema-source');
      const targets = [...(dependencies.get(current) ?? [])].sort(
        compareUnicodeCodePoints,
      );
      for (
        let targetIndex = targets.length - 1;
        targetIndex >= 0;
        targetIndex -= 1
      ) {
        pending.push(targets[targetIndex]!);
      }
    }
  }
  return statuses;
}

function addRngDocumentRelationships(
  project: SchemaProject,
  sources: readonly SchemaPackageSourceSummary[],
  relationships: readonly SchemaPackageFileRelationship[],
  selectedRootPaths: ReadonlySet<string>,
  standardsStatusByPath: ReadonlyMap<string, SchemaPackageStandardsStatus>,
): SchemaProject {
  const sourceByPath = new Map(
    sources
      .filter(({ format }) => format === 'rng')
      .map((source) => [source.packageRelativePath, source] as const),
  );
  const nodeBySourceId = new Map(
    project.nodes
      .filter(({ kind }) => kind === 'relaxNgSchema')
      .map((node) => [node.sourceFileId!, node] as const),
  );
  const rngNodeIds = new Set([...nodeBySourceId.values()].map(({ id }) => id));
  const relationshipEdges = relationships.flatMap((relationship) => {
    if (
      relationship.status !== 'resolved' ||
      !relationship.targetPath ||
      (relationship.kind !== 'rng-include' &&
        relationship.kind !== 'rng-external-ref')
    ) {
      return [];
    }
    const source = sourceByPath.get(relationship.sourcePath);
    const target = sourceByPath.get(relationship.targetPath);
    const sourceNode = source && nodeBySourceId.get(source.sourceFileId);
    const targetNode = target && nodeBySourceId.get(target.sourceFileId);
    if (!sourceNode || !targetNode) return [];
    return [
      {
        id: `schema-package-rng-edge:${encodeURIComponent(relationship.id)}`,
        kind: 'dependsOnSchema' as const,
        sourceNodeId: sourceNode.id,
        targetNodeId: targetNode.id,
      },
    ];
  });
  return {
    ...project,
    nodes: project.nodes.map((node) => {
      if (node.kind !== 'relaxNgSchema' || !node.sourceFileId) return node;
      const source = sources.find(
        ({ sourceFileId }) => sourceFileId === node.sourceFileId,
      );
      const status = source
        ? standardsStatusByPath.get(source.packageRelativePath)
        : undefined;
      return {
        ...node,
        properties: [
          ...(node.properties ?? []).filter(
            ({ label }) => label !== 'Standards status',
          ),
          ...(status === undefined
            ? []
            : [{ label: 'Standards status', value: status }]),
        ],
      };
    }),
    edges: [...project.edges, ...relationshipEdges],
    rootNodeIds: project.rootNodeIds.filter((nodeId) => {
      if (!rngNodeIds.has(nodeId)) return true;
      const source = sources.find(({ rootNodeIds }) =>
        rootNodeIds.includes(nodeId),
      );
      return source ? selectedRootPaths.has(source.packageRelativePath) : false;
    }),
  };
}

export async function importSchemaArchivePackage(
  input: SchemaArchiveDiscoveryInput,
  dependencies: SchemaPackageImportDependencies = productionDependencies,
  execution?: SchemaPackageImportExecution,
): Promise<SchemaPackageImportResult> {
  reportPackageProgress(execution, { phase: 'discovering-package' });
  let discovered;
  try {
    discovered = await dependencies.discoverArchive(cloneInput(input));
  } catch {
    return failure([
      packageDiagnostic(
        'archive-entry-read-failure',
        'error',
        'The ZIP archive could not be inspected for package import.',
      ),
    ]);
  }
  if (discovered.status === 'failure') {
    return failure(discovered.diagnostics);
  }
  const manifest = clonePlainValue(discovered.manifest);

  reportPackageProgress(execution, { phase: 'reading-package' });
  let contents: readonly LoadedSchemaArchiveEntryContent[];
  try {
    contents = await dependencies.loadContents(
      cloneBinary(input.data),
      clonePlainValue(manifest),
    );
  } catch (error) {
    return failure([contentLoadDiagnostic(error)], manifest);
  }
  const consistencyFailure = validateLoadedContents(manifest, contents);
  if (consistencyFailure) return failure([consistencyFailure], manifest);

  const decoded = decodeContents(manifest, contents);
  if (
    decoded.diagnostics.some((diagnostic) => diagnostic.severity === 'error') ||
    decoded.sources.length !== manifest.schemaEntries.length
  ) {
    return failure(decoded.diagnostics, manifest);
  }
  const allRoots = selectSchemaPackageEntryRoots(decoded.sources);
  const xercesRoots = allRoots.filter(
    (
      root,
    ): root is { readonly format: 'dtd' | 'xsd'; readonly entryPath: string } =>
      root.format !== 'rng',
  );
  const rngRoots = allRoots.filter(
    (root): root is { readonly format: 'rng'; readonly entryPath: string } =>
      root.format === 'rng',
  );
  const rngSources = decoded.sources.filter(
    ({ entry }) => entry.format === 'rng',
  );
  const rngPaths = new Set(
    rngSources.map(({ entry }) => entry.packageRelativePath),
  );
  const rngRelationships = buildRelaxNgPackageRelationships(
    decoded.sources,
    rngPaths,
  );
  const sourceFileIdByPath = new Map(
    decoded.sources.map((source) => [
      source.entry.packageRelativePath,
      source.sourceFileId,
    ]),
  );
  let standardsDiagnostics: readonly SchemaPackageImportDiagnostic[] = [];
  let rngStandardsDiagnostics: readonly SchemaPackageImportDiagnostic[] = [];
  let rngValidations: readonly RelaxNgValidationResult[] = [];
  const standardsApplied =
    execution?.validateStandards !== undefined && xercesRoots.length > 0;
  if (execution?.validateStandards && xercesRoots.length > 0) {
    reportPackageProgress(execution, { phase: 'validating-standards' });
    let validations;
    try {
      validations = await execution.validateStandards({
        files: (
          manifest.acceptedFileEntries ??
          manifest.schemaEntries.map((entry) => ({
            archivePath: entry.archivePath,
            packageRelativePath: entry.packageRelativePath,
          }))
        )
          .filter((entry) => !rngPaths.has(entry.packageRelativePath))
          .map((entry) => ({
            path: entry.packageRelativePath,
            bytes: contents
              .find((content) => content.archivePath === entry.archivePath)!
              .bytes.slice(),
          })),
        roots: xercesRoots,
      });
    } catch {
      return failure(
        [
          {
            stage: 'standards',
            code: 'xerces:initialization-failure',
            severity: 'error',
            message:
              "XML Carousel's standards checker could not start, so this package was not checked.",
            category: 'engine-internal',
            source: 'project',
          },
        ],
        manifest,
      );
    }
    standardsDiagnostics = validations.flatMap(
      (validation) => validation.diagnostics,
    );
    if (validations.some((validation) => validation.status !== 'valid')) {
      return failure(standardsDiagnostics, manifest);
    }
  }
  if (execution?.validateRelaxNg && rngRoots.length > 0) {
    reportPackageProgress(execution, { phase: 'validating-standards' });
    try {
      rngValidations = await execution.validateRelaxNg({
        files: rngSources.map((source) => ({
          path: source.entry.packageRelativePath,
          bytes: contents
            .find(
              (content) => content.archivePath === source.entry.archivePath,
            )!
            .bytes.slice(),
        })),
        roots: rngRoots,
      });
      rngStandardsDiagnostics = rngValidations.flatMap(
        (validation) => validation.diagnostics,
      );
    } catch {
      rngStandardsDiagnostics = [
        {
          stage: 'standards',
          code: 'relaxng:initialization-failure',
          severity: 'error',
          message:
            "XML Carousel's RELAX NG standards checker could not start; package sources remain available for inspection.",
          category: 'engine-internal',
          source: 'project',
        },
      ];
    }
  }
  const rngStandardsStatusByPath = deriveRngStandardsStatuses(
    [...rngPaths],
    rngRoots,
    rngValidations,
    rngRelationships,
  );
  if (
    rngRoots.length > 0 &&
    execution?.validateRelaxNg !== undefined &&
    rngValidations.length === 0
  ) {
    for (const root of rngRoots) {
      (
        rngStandardsStatusByPath as Map<string, SchemaPackageStandardsStatus>
      ).set(root.entryPath, 'engine-internal');
    }
  }
  const relationshipDiagnostics = relaxNgRelationshipDiagnostics(
    rngRelationships,
    sourceFileIdByPath,
  );
  const imported = importSources(
    [...decoded.sources, ...decoded.auxiliaryDtdSources],
    dependencies,
    execution,
  );
  const preAssemblyDiagnostics: SchemaPackageImportDiagnostic[] = [
    ...decoded.diagnostics,
    ...standardsDiagnostics,
    ...rngStandardsDiagnostics,
    ...relationshipDiagnostics,
    ...imported.diagnostics,
  ];
  if (
    [
      ...decoded.diagnostics,
      ...standardsDiagnostics,
      ...imported.diagnostics,
    ].some((diagnostic) => diagnostic.severity === 'error') ||
    imported.files.length !==
      manifest.schemaEntries.length + decoded.auxiliaryDtdSources.length
  ) {
    if (standardsApplied) {
      return failure(
        [
          ...preAssemblyDiagnostics,
          createVisualizationFailureDiagnostic('zip', manifest.archiveFilename),
        ],
        manifest,
      );
    }
    return failure(preAssemblyDiagnostics, manifest);
  }

  const assembled = assembleFiles(manifest, imported.files);
  if (!assembled.project || !assembled.initialFocusNodeId) {
    if (standardsApplied) {
      return failure(
        [
          ...standardsDiagnostics,
          ...assembled.diagnostics,
          createVisualizationFailureDiagnostic('zip', manifest.archiveFilename),
        ],
        manifest,
      );
    }
    return failure(
      [...preAssemblyDiagnostics, ...assembled.diagnostics],
      manifest,
    );
  }
  reportPackageProgress(execution, { phase: 'resolving-package' });
  const resolution = resolveSchemaPackageXsdReferences(
    assembled.project,
    assembled.xsdMetadataByNodeId,
  );
  const resolutionErrors = resolution.diagnostics.filter(
    ({ severity }) => severity === 'error',
  );
  if (resolutionErrors.length > 0) {
    return failure(
      [
        ...preAssemblyDiagnostics,
        ...assembled.diagnostics,
        ...resolution.diagnostics,
      ],
      manifest,
    );
  }

  const resolvedProject = addRngDocumentRelationships(
    resolution.project,
    assembled.sources,
    rngRelationships,
    new Set(rngRoots.map(({ entryPath }) => entryPath)),
    rngStandardsStatusByPath,
  );

  reportPackageProgress(execution, { phase: 'finalizing' });
  const validation = validateSchemaProject(resolvedProject);
  if (validation.length > 0) {
    if (standardsApplied) {
      return failure(
        [
          ...standardsDiagnostics,
          createVisualizationFailureDiagnostic('zip', manifest.archiveFilename),
        ],
        manifest,
      );
    }
    return failure(
      [
        ...preAssemblyDiagnostics,
        ...assembled.diagnostics,
        ...resolution.diagnostics,
        ...validation.map((finding) =>
          packageDiagnostic(
            'package-project-validation-failed',
            'error',
            `The assembled schema package graph is invalid (${finding.code}).`,
            {
              ...(finding.nodeId === undefined
                ? {}
                : { nodeId: finding.nodeId }),
              ...(finding.edgeId === undefined
                ? {}
                : { edgeId: finding.edgeId }),
            },
          ),
        ),
      ],
      manifest,
    );
  }

  const packagePresentation = buildPackagePresentationMetadata({
    manifest,
    contents,
    decodedSources: decoded.sources,
    auxiliaryDtdSources: decoded.auxiliaryDtdSources,
    project: resolvedProject,
    sources: assembled.sources,
    initialFocusNodeId: assembled.initialFocusNodeId,
    sourceMarkupByNodeId: assembled.sourceMarkupByNodeId,
    standardsApplied,
    rngStandardsStatusByPath,
  });

  return deepFreezePlain({
    status: 'success',
    manifest: clonePlainValue(manifest),
    project: clonePlainValue(resolvedProject),
    sources: assembled.sources.map(clonePlainValue),
    entries: packagePresentation.entries.map(clonePlainValue),
    summary: clonePlainValue(packagePresentation.summary),
    initialFocusNodeId: assembled.initialFocusNodeId,
    contentKindsByNodeId: clonePlainValue(assembled.contentKindsByNodeId),
    dtdAttributesByNodeId: clonePlainValue(assembled.dtdAttributesByNodeId),
    comments: assembled.comments.map(clonePlainValue),
    commentsByNodeId: clonePlainValue(assembled.commentsByNodeId),
    schemaLevelComments: assembled.schemaLevelComments.map(clonePlainValue),
    sourceMarkupByNodeId: clonePlainValue(assembled.sourceMarkupByNodeId),
    xsdMetadataByNodeId: clonePlainValue(resolution.xsdMetadataByNodeId),
    unresolvedReferences: resolution.unresolvedReferences.map(clonePlainValue),
    diagnostics: sortDiagnostics(
      [
        ...preAssemblyDiagnostics,
        ...assembled.diagnostics,
        ...resolution.diagnostics,
      ],
      manifest,
    ).map(clonePlainValue),
    visualization: clonePlainValue(assembled.visualization),
  });
}
