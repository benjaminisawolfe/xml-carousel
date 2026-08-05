import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  inventoryArchive,
  readInventoryEntryText,
} from './hermetic-foundry-inventory.mjs';
import { createServer } from 'vite';
import JSZip from 'jszip';

const args = process.argv.slice(2);
function argument(name) {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}

const suppliedPath = argument('--path');
if (!suppliedPath) {
  throw new Error(
    'Usage: npm run audit:hermetic-foundry -- --path <CORPUS_PATH> [--expect <EXPECTATION_JSON>] [--permutations] [--output <JSON_PATH>]',
  );
}
const expectationPath = argument('--expect');
const verifyPermutations = args.includes('--permutations');

const corpusPath = path.resolve(suppliedPath);
const corpusStat = await stat(corpusPath).catch(() => undefined);
if (!corpusStat) throw new Error(`Corpus path does not exist: ${corpusPath}`);
const outputPath = path.resolve(
  argument('--output') ??
    path.join(os.tmpdir(), 'xml-carousel-hermetic-foundry-audit.json'),
);
const corpusDirectory = corpusStat.isDirectory()
  ? corpusPath
  : path.dirname(corpusPath);
const relativeOutput = path.relative(corpusDirectory, outputPath);
if (
  path.parse(corpusDirectory).root === path.parse(outputPath).root &&
  (relativeOutput === '' ||
    (!relativeOutput.startsWith(`..${path.sep}`) && relativeOutput !== '..'))
) {
  throw new Error(
    'Audit output must be outside the supplied corpus directory.',
  );
}

async function discover(currentPath) {
  const currentStat = await stat(currentPath);
  if (currentStat.isFile()) {
    return /\.(?:dtd|xsd|zip)$/iu.test(currentPath) ? [currentPath] : [];
  }
  if (!currentStat.isDirectory()) return [];
  const entries = await readdir(currentPath, { withFileTypes: true });
  const nested = [];
  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    const entryPath = path.join(currentPath, entry.name);
    if (entry.isDirectory()) nested.push(...(await discover(entryPath)));
    else if (entry.isFile() && /\.(?:dtd|xsd|zip)$/iu.test(entry.name))
      nested.push(entryPath);
  }
  return nested;
}

function formatFor(filePath) {
  const extension = path.extname(filePath).toLocaleLowerCase();
  return extension === '.dtd' ? 'dtd' : extension === '.xsd' ? 'xsd' : 'zip';
}

function resultClassification(result) {
  if (result.importResult.status === 'success') {
    return result.visualization?.summary.completeness === 'partial'
      ? 'valid and partial'
      : 'valid and complete';
  }
  if (
    result.diagnostics.some(
      ({ category }) => category === 'unsupported-standard',
    )
  ) {
    return 'unsupported standard';
  }
  if (
    result.diagnostics.some(({ category }) =>
      ['standards-invalid', 'blocked-dependency'].includes(category),
    )
  ) {
    return 'standards invalid';
  }
  return 'internal failure';
}

function countCodes(items) {
  const counts = {};
  for (const item of items) {
    const code = item.code ?? 'unknown';
    counts[code] = (counts[code] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function sortedObject(value) {
  if (Array.isArray(value)) return value.map(sortedObject);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, sortedObject(nested)]),
  );
}

function stableSha256(value) {
  return createHash('sha256')
    .update(JSON.stringify(sortedObject(value)))
    .digest('hex');
}

function normalizeSuccessResult(result) {
  if (result.importResult.status !== 'success') return null;
  const project = result.importResult.project;
  const packageEntries = (result.importResult.entries ?? []).map((entry) =>
    Object.fromEntries(
      Object.entries(entry).filter(
        ([key]) =>
          !['originalOrder', 'compressedByteLength', 'sourceText'].includes(
            key,
          ),
      ),
    ),
  );
  return {
    standardsResult: 'valid',
    sourceFiles: project.sourceFiles ?? [],
    initialFocusNodeId: result.importResult.initialFocusNodeId,
    nodes: project.nodes,
    edges: project.edges,
    rootNodeIds: project.rootNodeIds,
    searchIndex: result.searchIndex ?? null,
    visualization: result.visualization ?? null,
    unresolvedReferences: result.importResult.unresolvedReferences ?? [],
    package: {
      id: result.importResult.manifest?.id ?? null,
      packageRoot: result.importResult.manifest?.packageRoot ?? null,
      commonRootDirectory:
        result.importResult.manifest?.commonRootDirectory ?? null,
      entries: packageEntries,
      summary: result.importResult.summary ?? null,
    },
    sourceMarkupNodeIds: Object.keys(
      result.importResult.sourceMarkupByNodeId ?? {},
    ).sort((left, right) => left.localeCompare(right)),
  };
}

function deterministicShuffle(entries) {
  return [...entries].sort((left, right) => {
    const leftHash = createHash('sha256')
      .update(`xml-carousel-task-13.9\0${left.name}`)
      .digest('hex');
    const rightHash = createHash('sha256')
      .update(`xml-carousel-task-13.9\0${right.name}`)
      .digest('hex');
    return (
      leftHash.localeCompare(rightHash) || left.name.localeCompare(right.name)
    );
  });
}

async function reorderArchive(bytes, order) {
  const source = await JSZip.loadAsync(bytes);
  const entries = Object.values(source.files);
  const ordered =
    order === 'reversed'
      ? [...entries].reverse()
      : deterministicShuffle(entries);
  const archive = new JSZip();
  const fixedDate = new Date('2000-01-01T00:00:00.000Z');
  for (const entry of ordered) {
    if (entry.dir) {
      archive.folder(entry.name, { createFolders: false, date: fixedDate });
      continue;
    }
    archive.file(entry.name, await entry.async('uint8array'), {
      binary: true,
      createFolders: false,
      date: fixedDate,
      compression: 'DEFLATE',
      compressionOptions: { level: 9 },
    });
  }
  return archive.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });
}

function collectDifferences(expected, actual, field = '$', differences = []) {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) {
      differences.push({ field, expected, actual });
      return differences;
    }
    const length = Math.max(expected.length, actual.length);
    for (let index = 0; index < length; index += 1) {
      collectDifferences(
        expected[index],
        actual[index],
        `${field}[${index}]`,
        differences,
      );
    }
    return differences;
  }
  if (expected !== null && typeof expected === 'object') {
    if (
      actual === null ||
      typeof actual !== 'object' ||
      Array.isArray(actual)
    ) {
      differences.push({ field, expected, actual });
      return differences;
    }
    for (const key of Object.keys(expected).sort()) {
      collectDifferences(
        expected[key],
        actual[key],
        `${field}.${key}`,
        differences,
      );
    }
    return differences;
  }
  if (!Object.is(expected, actual))
    differences.push({ field, expected, actual });
  return differences;
}

function expectationSchemaErrors(expectation) {
  const errors = [];
  const summary = expectation?.regressionSummary;
  if (expectation?.schemaVersion !== 1) {
    errors.push('$.schemaVersion must equal 1');
  }
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) {
    return [...errors, '$.regressionSummary must be an object'];
  }
  const stringFields = [
    'archiveFilename',
    'archiveSha256',
    'commonRootDirectory',
    'packageRoot',
    'packageInventorySha256',
    'visualizationCompleteness',
    'normalizedResultSha256',
  ];
  const numberFields = [
    'archiveByteLength',
    'fileEntryCount',
    'packageEntryCount',
    'packageFileCount',
    'packageDirectoryCount',
    'packageSchemaSourceCount',
    'packageXsdSourceCount',
    'packageDtdSourceCount',
    'packageAuxiliaryCount',
    'packageIgnoredCount',
    'packageBlockedCount',
    'packageRootCandidateCount',
    'packageCompleteFileCount',
    'packageZeroNodeSourceCount',
    'packageUnresolvedRelationshipCount',
    'packageSourceViewCount',
    'packageBinaryEntryCount',
    'packageUnavailableEntryCount',
    'xsdSourceCount',
    'schemaLocationReferenceCount',
    'externalReferenceCount',
    'missingArchiveReferenceCount',
    'supportedNodeCount',
    'visualizationTotalFindingCount',
    'retainedFindingCount',
    'unresolvedReferenceCount',
    'searchIndexDocumentCount',
    'sourceMarkupNodeCount',
  ];
  for (const field of stringFields) {
    if (typeof summary[field] !== 'string' || summary[field].length === 0) {
      errors.push(`$.regressionSummary.${field} must be a nonempty string`);
    }
  }
  for (const field of numberFields) {
    if (!Number.isSafeInteger(summary[field]) || summary[field] < 0) {
      errors.push(`$.regressionSummary.${field} must be a nonnegative integer`);
    }
  }
  if (
    !Array.isArray(summary.sourceFiles) ||
    summary.sourceFiles.some((value) => typeof value !== 'string') ||
    summary.sourceFiles.join('\0') !==
      [...summary.sourceFiles]
        .sort((left, right) => left.localeCompare(right))
        .join('\0')
  ) {
    errors.push(
      '$.regressionSummary.sourceFiles must be a sorted string array',
    );
  }
  if (
    !Array.isArray(summary.perSource) ||
    summary.perSource.some(
      (row) =>
        !Array.isArray(row) ||
        row.length !== 8 ||
        typeof row[0] !== 'string' ||
        typeof row[1] !== 'string' ||
        row.slice(2).some((value) => !Number.isSafeInteger(value) || value < 0),
    )
  ) {
    errors.push(
      '$.regressionSummary.perSource must contain eight-field localization rows',
    );
  }
  if (
    !summary.productionXerces ||
    typeof summary.productionXerces.name !== 'string' ||
    typeof summary.productionXerces.version !== 'string'
  ) {
    errors.push(
      '$.regressionSummary.productionXerces must name the engine and version',
    );
  }
  if (
    !summary.standaloneDependencyProbe ||
    summary.standaloneDependencyProbe.blockedDependency !== true
  ) {
    errors.push(
      '$.regressionSummary.standaloneDependencyProbe must require a blocked dependency',
    );
  }
  return errors;
}

const server = await createServer({
  appType: 'custom',
  server: { middlewareMode: true },
  logLevel: 'error',
});

try {
  const [
    { executeSchemaImportWorkerRequest },
    dtd,
    xsd,
    packageImport,
    search,
    validator,
    adapterModule,
  ] = await Promise.all([
    server.ssrLoadModule('/src/workers/schemaImportWorkerRuntime.ts'),
    server.ssrLoadModule('/src/schema/dtd/index.ts'),
    server.ssrLoadModule('/src/schema/xsd/index.ts'),
    server.ssrLoadModule('/src/app/import/schemaPackage/index.ts'),
    server.ssrLoadModule('/src/app/search/index.ts'),
    server.ssrLoadModule('/src/standards/xerces/productionValidator.ts'),
    server.ssrLoadModule('/src/standards/xerces/adapter.ts'),
  ]);
  const runtimeRoot = path.resolve('src/standards/xerces/runtime');
  const moduleUrl = pathToFileURL(path.join(runtimeRoot, 'xerces-runtime.js'));
  const wasmUrl = pathToFileURL(path.join(runtimeRoot, 'xerces-runtime.wasm'));
  const runtimeModule = await import(moduleUrl.href);
  const adapter = await adapterModule.createXercesAdapter(
    runtimeModule.default,
    moduleUrl,
    wasmUrl,
  );
  const standardsEntryPaths = [];
  let productionEngine = null;
  const validateStandards = async (request) => {
    standardsEntryPaths.push(request.entryPath);
    const validated = await validator.validateWithProductionXerces(
      request,
      async () => adapter,
    );
    productionEngine = validated.engine;
    return validated;
  };
  const dependencies = {
    importDtd: dtd.importDtdSource,
    importXsd: xsd.importXsdSource,
    importPackage: (input, execution) =>
      packageImport.importSchemaArchivePackage(input, undefined, execution),
    buildSearchIndex: search.buildProjectSearchIndex,
    validateStandards,
  };

  const files = (await discover(corpusPath)).sort((left, right) =>
    left.localeCompare(right),
  );
  const records = [];
  for (let index = 0; index < files.length; index += 1) {
    const filePath = files[index];
    const format = formatFor(filePath);
    const relativePath = corpusStat.isDirectory()
      ? path.relative(corpusPath, filePath).split(path.sep).join('/')
      : path.basename(filePath);
    try {
      const bytes = new Uint8Array(await readFile(filePath));
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      const archiveInventory =
        format === 'zip' ? await inventoryArchive(bytes) : null;
      const request =
        format === 'zip'
          ? {
              type: 'import',
              requestId: `hermetic-foundry:${index + 1}`,
              format,
              filename: relativePath,
              data: Uint8Array.from(bytes).buffer,
            }
          : {
              type: 'import',
              requestId: `hermetic-foundry:${index + 1}`,
              format,
              filename: relativePath,
              sourceText: new TextDecoder('utf-8', { fatal: true }).decode(
                bytes,
              ),
              options: {
                projectId: `hermetic-foundry:${index + 1}`,
                displayName: relativePath,
                sourceFileId: `hermetic-foundry-source:${index + 1}`,
                sourceFilename: relativePath,
              },
            };
      standardsEntryPaths.length = 0;
      const result = await executeSchemaImportWorkerRequest(
        request,
        () => undefined,
        dependencies,
      );
      const packageStandardsEntryPaths = [...standardsEntryPaths];
      let standaloneDependencyProbe = null;
      if (format === 'zip') {
        const standalonePath = 'foundry-common.xsd';
        const standaloneSource = await readInventoryEntryText(
          bytes,
          standalonePath,
        );
        if (standaloneSource !== undefined) {
          standardsEntryPaths.length = 0;
          const standaloneResult = await executeSchemaImportWorkerRequest(
            {
              type: 'import',
              requestId: `hermetic-foundry:${index + 1}:standalone-common`,
              format: 'xsd',
              filename: standalonePath,
              sourceText: standaloneSource,
              options: {
                projectId: `hermetic-foundry:${index + 1}:standalone-common`,
                displayName: standalonePath,
                sourceFileId: `hermetic-foundry-source:${index + 1}:standalone-common`,
                sourceFilename: standalonePath,
              },
            },
            () => undefined,
            dependencies,
          );
          standaloneDependencyProbe = {
            entryPath: standalonePath,
            classification: resultClassification(standaloneResult),
            importStatus: standaloneResult.importResult.status,
            standardsEntryPaths: [...standardsEntryPaths],
            diagnosticCountsByCode: countCodes(standaloneResult.diagnostics),
            fatalDiagnosticCountsByCode: countCodes(
              standaloneResult.diagnostics.filter(
                ({ severity }) => severity === 'error',
              ),
            ),
            blockedDependency: standaloneResult.diagnostics.some(
              ({ category }) => category === 'blocked-dependency',
            ),
            fatalDiagnostics: standaloneResult.diagnostics
              .filter(({ severity }) => severity === 'error')
              .slice(0, 10)
              .map(({ code, category, message, fileName }) => ({
                code: code ?? 'unknown',
                category,
                message,
                ...(fileName === undefined ? {} : { fileName }),
              })),
          };
        }
      }
      const success = result.importResult.status === 'success';
      const fatalDiagnostics = success
        ? []
        : result.diagnostics.filter(({ severity }) => severity === 'error');
      const normalizedResult = normalizeSuccessResult(result);
      const normalizedResultSha256 = normalizedResult
        ? stableSha256(normalizedResult)
        : null;
      let perSource = [];
      if (format === 'zip' && success && archiveInventory) {
        const archive = await JSZip.loadAsync(bytes);
        const markupNodeIds = new Set(
          Object.keys(result.importResult.sourceMarkupByNodeId),
        );
        perSource = await Promise.all(
          result.importResult.sources.map(async (source) => {
            const archivePath = `${archiveInventory.commonRootDirectory ?? ''}${source.packageRelativePath}`;
            const entryBytes = await archive
              .file(archivePath)
              .async('uint8array');
            const sourceText = new TextDecoder('utf-8', { fatal: true }).decode(
              entryBytes,
            );
            const extracted = xsd.importXsdSource(sourceText, {
              projectId: `hermetic-source:${source.sourceFileId}`,
              displayName: source.packageRelativePath,
              sourceFileId: source.sourceFileId,
              sourceFilename: source.packageRelativePath,
              unresolvedReferencePolicy: 'deferForPackage',
              standardsAccepted: true,
            });
            const sourceNodeIds = new Set(
              result.importResult.project.nodes
                .filter(
                  ({ sourceFileId }) => sourceFileId === source.sourceFileId,
                )
                .map(({ id }) => id),
            );
            return {
              sourcePath: source.packageRelativePath,
              sha256: createHash('sha256').update(entryBytes).digest('hex'),
              nodeCount: source.nodeCount,
              rootNodeCount: source.rootNodeIds.length,
              findingCountsByCode:
                extracted.status === 'success'
                  ? extracted.visualization.summary.findingCountsByCode
                  : countCodes(extracted.diagnostics),
              sourceMarkupNodeCount: [...sourceNodeIds].filter((nodeId) =>
                markupNodeIds.has(nodeId),
              ).length,
            };
          }),
        );
        perSource.sort((left, right) =>
          left.sourcePath.localeCompare(right.sourcePath),
        );
      }
      const permutationResults = [
        {
          order: 'original',
          classification: resultClassification(result),
          normalizedResultSha256,
        },
      ];
      const permutationDifferences = [];
      if (format === 'zip' && (verifyPermutations || expectationPath)) {
        for (const order of ['reversed', 'deterministic-shuffled']) {
          const reorderedBytes = await reorderArchive(bytes, order);
          standardsEntryPaths.length = 0;
          const reorderedResult = await executeSchemaImportWorkerRequest(
            {
              type: 'import',
              requestId: `hermetic-foundry:${index + 1}:${order}`,
              format: 'zip',
              filename: relativePath,
              data: Uint8Array.from(reorderedBytes).buffer,
            },
            () => undefined,
            dependencies,
          );
          const reorderedNormalized = normalizeSuccessResult(reorderedResult);
          const reorderedSha256 = reorderedNormalized
            ? stableSha256(reorderedNormalized)
            : null;
          permutationResults.push({
            order,
            classification: resultClassification(reorderedResult),
            normalizedResultSha256: reorderedSha256,
          });
          if (reorderedSha256 !== normalizedResultSha256) {
            permutationDifferences.push({
              order,
              differences: collectDifferences(
                normalizedResult,
                reorderedNormalized,
              ).slice(0, 100),
            });
          }
        }
      }
      const regressionSummary = {
        archiveFilename: relativePath,
        archiveByteLength: bytes.byteLength,
        archiveSha256: sha256,
        fileEntryCount: archiveInventory?.fileEntryCount ?? null,
        xsdSourceCount: archiveInventory?.xsdEntryCount ?? null,
        commonRootDirectory: archiveInventory?.commonRootDirectory ?? null,
        packageRoot: success ? result.importResult.manifest.packageRoot : null,
        packageEntryCount: success
          ? result.importResult.summary.entryCount
          : null,
        packageFileCount: success
          ? result.importResult.summary.fileCount
          : null,
        packageDirectoryCount: success
          ? result.importResult.summary.directoryCount
          : null,
        packageSchemaSourceCount: success
          ? result.importResult.summary.schemaSourceCount
          : null,
        packageXsdSourceCount: success
          ? result.importResult.summary.xsdSourceCount
          : null,
        packageDtdSourceCount: success
          ? result.importResult.summary.dtdSourceCount
          : null,
        packageAuxiliaryCount: success
          ? result.importResult.summary.auxiliaryCount
          : null,
        packageIgnoredCount: success
          ? result.importResult.summary.ignoredCount
          : null,
        packageBlockedCount: success
          ? result.importResult.summary.blockedCount
          : null,
        packageRootCandidateCount: success
          ? result.importResult.summary.rootCandidateCount
          : null,
        packageCompleteFileCount: success
          ? result.importResult.summary.completeFileCount
          : null,
        packageZeroNodeSourceCount: success
          ? result.importResult.summary.zeroNodeSourceCount
          : null,
        packageUnresolvedRelationshipCount: success
          ? result.importResult.summary.unresolvedRelationshipCount
          : null,
        packageSourceViewCount: success
          ? result.importResult.entries.filter(
              ({ sourceViewAvailable }) => sourceViewAvailable,
            ).length
          : null,
        packageBinaryEntryCount: success
          ? result.importResult.entries.filter(
              ({ textStatus }) => textStatus === 'binary',
            ).length
          : null,
        packageUnavailableEntryCount: success
          ? result.importResult.entries.filter(
              ({ textStatus }) => textStatus === 'unavailable',
            ).length
          : null,
        packageInventorySha256: success
          ? stableSha256(normalizedResult.package)
          : null,
        sourceFiles: success
          ? result.importResult.project.sourceFiles.map(
              ({ filename }) => filename,
            )
          : [],
        schemaLocationReferenceCount:
          archiveInventory?.schemaLocationCount ?? null,
        externalReferenceCount:
          archiveInventory?.externalOrAbsoluteReferenceCount ?? null,
        missingArchiveReferenceCount:
          archiveInventory?.missingReferenceCount ?? null,
        supportedNodeCount: success
          ? result.importResult.project.nodes.length
          : 0,
        visualizationCompleteness:
          result.visualization?.summary.completeness ?? null,
        visualizationTotalFindingCount:
          result.visualization?.summary.totalFindingCount ?? null,
        visualizationFindingCountsByCode:
          result.visualization?.summary.findingCountsByCode ?? {},
        retainedFindingCount:
          result.visualization?.summary.retainedFindingCount ?? null,
        unresolvedReferenceCount: success
          ? result.importResult.unresolvedReferences.length
          : null,
        searchIndexDocumentCount: result.searchIndex?.documents.length ?? null,
        sourceMarkupNodeCount: success
          ? Object.keys(result.importResult.sourceMarkupByNodeId).length
          : null,
        standaloneDependencyProbe: standaloneDependencyProbe
          ? {
              entryPath: standaloneDependencyProbe.entryPath,
              classification: standaloneDependencyProbe.classification,
              importStatus: standaloneDependencyProbe.importStatus,
              blockedDependency: standaloneDependencyProbe.blockedDependency,
              fatalDiagnosticCountsByCode:
                standaloneDependencyProbe.fatalDiagnosticCountsByCode,
            }
          : null,
        productionXerces: productionEngine,
        normalizedResultSha256,
        perSource: perSource.map((source) => [
          source.sourcePath,
          source.sha256,
          source.nodeCount,
          source.rootNodeCount,
          source.findingCountsByCode['xsd:invalid-annotation-placement'] ?? 0,
          source.findingCountsByCode['xsd:multiple-annotations'] ?? 0,
          source.findingCountsByCode['xsd:unsupported-xsd-component'] ?? 0,
          source.sourceMarkupNodeCount,
        ]),
      };
      records.push({
        path: relativePath,
        format,
        byteLength: bytes.byteLength,
        sha256,
        archiveInventory,
        standardsEntryPaths: packageStandardsEntryPaths,
        standaloneDependencyProbe,
        classification: resultClassification(result),
        retainedSupportedNodeCount: success
          ? result.importResult.project.nodes.length
          : 0,
        sourceFiles: success
          ? result.importResult.project.sourceFiles.map(
              ({ filename }) => filename,
            )
          : [],
        visualization: result.visualization?.summary ?? null,
        visualizationFindingCounts:
          result.visualization?.summary.findingCountsByCode ??
          countCodes(result.visualization?.findings ?? []),
        diagnosticCountsByCode: countCodes(result.diagnostics),
        fatalDiagnosticCountsByCode: countCodes(fatalDiagnostics),
        fatalDiagnosticCodes: Object.keys(countCodes(fatalDiagnostics)),
        regressionSummary,
        perSourceLocalization: perSource,
        permutations: {
          equal: permutationDifferences.length === 0,
          results: permutationResults,
          differences: permutationDifferences,
        },
      });
    } catch (error) {
      records.push({
        path: relativePath,
        format,
        classification: 'internal failure',
        retainedSupportedNodeCount: 0,
        sourceFiles: [],
        visualization: null,
        visualizationFindingCounts: {},
        fatalDiagnosticCodes: ['audit:execution-failure'],
        auditMessage:
          error instanceof Error ? error.message : 'Unknown audit failure.',
      });
    }
  }

  const classifications = [
    'valid and complete',
    'valid and partial',
    'standards invalid',
    'unsupported standard',
    'internal failure',
  ];
  const totals = Object.fromEntries(
    classifications.map((classification) => [
      classification,
      records.filter((record) => record.classification === classification)
        .length,
    ]),
  );
  let expectationVerification = null;
  if (expectationPath) {
    const expectation = JSON.parse(
      await readFile(path.resolve(expectationPath), 'utf8'),
    );
    const schemaErrors = expectationSchemaErrors(expectation);
    if (schemaErrors.length > 0) {
      throw new Error(
        `Hermetic expectation schema validation failed:\n${schemaErrors.map((error) => `- ${error}`).join('\n')}`,
      );
    }
    if (records.length !== 1) {
      throw new Error(
        '--expect requires --path to identify exactly one archive.',
      );
    }
    const differences = collectDifferences(
      expectation.regressionSummary,
      records[0].regressionSummary,
    );
    if (!records[0].permutations?.equal) {
      differences.push({
        field: '$.permutations',
        expected: 'identical normalized results',
        actual: records[0].permutations?.differences,
      });
    }
    expectationVerification = {
      expectationPath: path.resolve(expectationPath),
      matched: differences.length === 0,
      differences,
    };
  }
  const report = {
    schemaVersion: 3,
    corpusPath,
    networkAccess: false,
    productionXerces: productionEngine,
    scannedFileCount: records.length,
    totals,
    records,
    expectationVerification,
  };
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(
    `Hermetic Foundry audit: ${records.length} schema/package files\n`,
  );
  for (const classification of classifications) {
    process.stdout.write(`  ${classification}: ${totals[classification]}\n`);
  }
  for (const record of records) {
    process.stdout.write(
      `  ${record.classification.padEnd(20)} ${record.path} (${record.retainedSupportedNodeCount} nodes)\n`,
    );
  }
  process.stdout.write(`Machine-readable report: ${outputPath}\n`);
  if (expectationVerification) {
    process.stdout.write(
      `Expectation verification: ${expectationVerification.matched ? 'matched' : 'FAILED'}\n`,
    );
    for (const difference of expectationVerification.differences.slice(0, 50)) {
      process.stdout.write(
        `  ${difference.field}: expected ${JSON.stringify(difference.expected)}, actual ${JSON.stringify(difference.actual)}\n`,
      );
    }
  }
  if (
    records.some(
      ({ classification }) => classification === 'internal failure',
    ) ||
    expectationVerification?.matched === false ||
    records.some(({ permutations }) => permutations?.equal === false)
  ) {
    process.exitCode = 2;
  }
} finally {
  await server.close();
}
