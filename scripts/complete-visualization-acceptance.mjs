import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { buildCoverageMatrix } from './visualization-coverage-catalogue.mjs';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const execFileAsync = promisify(execFile);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function countBy(values, keyOf) {
  const counts = {};
  for (const value of values) {
    const key = keyOf(value);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)),
  );
}

async function validateDocbookEvidence(
  acceptance,
  dtd,
  search,
  model,
  blockingCodes,
) {
  const expected = acceptance.completeVisualizationExpectations.docbook;
  const fixturePath = path.join(
    repositoryRoot,
    'tests/fixtures/dtd/sdocbook/sdocbook.dtd',
  );
  const bytes = await readFile(fixturePath);
  const errors = [];
  if (bytes.byteLength !== expected.byteLength) {
    errors.push(
      `Simplified DocBook: expected ${expected.byteLength} bytes, received ${bytes.byteLength}`,
    );
  }
  const digest = sha256(bytes);
  if (digest !== expected.sha256) {
    errors.push(`Simplified DocBook: SHA-256 mismatch ${digest}`);
  }
  const imported = dtd.importDtdSource(bytes.toString('utf8'), {
    projectId: 'complete-visualization-acceptance-sdocbook',
    displayName: 'Simplified DocBook',
    sourceFileId: 'sdocbook/sdocbook.dtd',
    sourceFilename: 'sdocbook/sdocbook.dtd',
    standardsAccepted: true,
  });
  if (imported.status !== 'success') {
    return [
      ...errors,
      'Simplified DocBook: accepted DTD presentation import failed',
    ];
  }
  errors.push(
    ...acceptance.validateVisualizationAcceptance(
      imported.visualization,
      'Simplified DocBook',
      blockingCodes,
    ),
  );
  const declarations = imported.project.nodes.filter(
    ({ kind }) => kind === 'dtdElement',
  );
  if (declarations.length !== expected.elementCount) {
    errors.push(
      `Simplified DocBook: Navigation expected 106 element records, received ${declarations.length}`,
    );
  }
  const index = search.buildProjectSearchIndex({
    project: imported.project,
    sourceFilename: 'sdocbook.dtd',
    commentsByNodeId: imported.commentsByNodeId,
    dtdAttributesByNodeId: imported.dtdAttributesByNodeId,
  });
  const searchRecords = index.documents.filter(
    ({ nodeKind }) => nodeKind === 'dtdElement',
  );
  if (searchRecords.length !== expected.elementCount) {
    errors.push(
      `Simplified DocBook: Search expected 106 element records, received ${searchRecords.length}`,
    );
  }
  const revision = declarations.find(({ name }) => name === 'revision');
  const descendants = new Set();
  const pending = revision ? [revision.id] : [];
  while (pending.length > 0) {
    const ownerId = pending.shift();
    for (const edge of model.getOutgoingEdges(imported.project, ownerId)) {
      if (
        edge.kind !== 'contentModelMember' ||
        descendants.has(edge.targetNodeId)
      ) {
        continue;
      }
      descendants.add(edge.targetNodeId);
      pending.push(edge.targetNodeId);
    }
  }
  const revisionReferences = imported.project.nodes
    .filter(
      ({ id, kind }) => kind === 'dtdElementReference' && descendants.has(id),
    )
    .map(({ id, name }) => ({
      name,
      resolved: model
        .getOutgoingEdges(imported.project, id)
        .some(({ kind }) => kind === 'referencesElementName'),
    }));
  const expectedNames = [
    'revnumber',
    'date',
    'authorinitials',
    'revremark',
    'revdescription',
  ];
  if (
    JSON.stringify(revisionReferences.map(({ name }) => name)) !==
    JSON.stringify(expectedNames)
  ) {
    errors.push(
      `Simplified DocBook revision: expected resolved references ${expectedNames.join(', ')}`,
    );
  }
  for (const reference of revisionReferences) {
    if (!reference.resolved) {
      errors.push(
        `Simplified DocBook revision: ${reference.name} is unresolved`,
      );
    }
  }
  return errors;
}

async function runCompleteVisualizationAcceptance() {
  const matrixPath = path.join(
    repositoryRoot,
    'docs/technical/visualization-coverage-matrix.json',
  );
  const localizationPath = path.join(
    repositoryRoot,
    'tests/fixtures/visualization-coverage/hermetic-finding-localization.json',
  );
  const expectationPath = path.join(
    repositoryRoot,
    'tests/fixtures/hermetic-foundry/expected-audit.json',
  );
  const [matrixText, localizationText, expectationText] = await Promise.all([
    readFile(matrixPath, 'utf8'),
    readFile(localizationPath, 'utf8'),
    readFile(expectationPath, 'utf8'),
  ]);
  await execFileAsync(
    process.execPath,
    [
      path.join(repositoryRoot, 'scripts/audit-visualization-coverage.mjs'),
      '--matrix',
      matrixPath,
      '--localization',
      localizationPath,
    ],
    { cwd: repositoryRoot, windowsHide: true },
  );

  const server = await createServer({
    root: repositoryRoot,
    configFile: false,
    appType: 'custom',
    logLevel: 'error',
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true },
  });
  const errors = [];
  let report;
  try {
    const [
      acceptance,
      model,
      schemaPackage,
      reachability,
      diagnosticPolicy,
      dtd,
      search,
    ] = await Promise.all([
      server.ssrLoadModule(
        '/src/acceptance/completeVisualizationAcceptance.ts',
      ),
      server.ssrLoadModule('/src/schema/model/index.ts'),
      server.ssrLoadModule(
        '/src/app/import/schemaPackage/schemaPackageTypes.ts',
      ),
      server.ssrLoadModule('/src/ui/presentation/schemaReachability.ts'),
      server.ssrLoadModule('/src/schema/visualization/diagnosticPolicy.ts'),
      server.ssrLoadModule('/src/schema/dtd/index.ts'),
      server.ssrLoadModule('/src/app/search/index.ts'),
    ]);
    const matrix = JSON.parse(matrixText);
    const generatedText = `${JSON.stringify(buildCoverageMatrix(), null, 2)}\n`;
    const releaseBlockingCodes =
      acceptance.deriveReleaseBlockingVisualizationFindingCodes({
        dtdParse: diagnosticPolicy.dtdParseDiagnosticPolicy,
        dtdBuild: diagnosticPolicy.dtdBuildDiagnosticPolicy,
        xsdParse: diagnosticPolicy.xsdDiagnosticPolicy,
        xsdBuild: diagnosticPolicy.xsdBuildDiagnosticPolicy,
      });
    errors.push(
      ...acceptance.validateCompleteVisualizationMatrix(matrix),
      ...acceptance.validateGeneratedMatrixText(matrixText, generatedText),
      ...acceptance.validateAcceptedProjectEvidence(
        JSON.parse(expectationText),
        JSON.parse(localizationText),
      ),
      ...acceptance.validateReachabilityRegistry({
        nodeKinds: model.schemaNodeKinds,
        edgeKinds: model.schemaEdgeKinds,
        packageEntryKinds: schemaPackage.schemaPackageEntryKinds,
        nodeContracts: reachability.schemaNodeReachabilityContracts,
        edgeContracts: reachability.schemaEdgeReachabilityContracts,
        packageEntryContracts: reachability.packageEntryReachabilityContracts,
        activationHandlers: reachability.reachabilityActivationActions,
        formatActionLabel: reachability.formatReachabilityActionLabel,
      }),
      ...(await validateDocbookEvidence(
        acceptance,
        dtd,
        search,
        model,
        releaseBlockingCodes,
      )),
    );
    report = {
      matrixEntryCount: matrix.entries.length,
      matrixSha256: sha256(matrixText),
      ownership: countBy(
        matrix.entries,
        ({ owningFutureTask }) => owningFutureTask,
      ),
      normalizedNodeKindCount: model.schemaNodeKinds.length,
      normalizedEdgeKindCount: model.schemaEdgeKinds.length,
      packageEntryKindCount: schemaPackage.schemaPackageEntryKinds.length,
      releaseBlockingVisualizationFindingCodes: [...releaseBlockingCodes],
      docbook: acceptance.completeVisualizationExpectations.docbook,
      hermetic: acceptance.completeVisualizationExpectations.hermetic,
    };
  } finally {
    await server.close();
  }
  if (errors.length > 0) {
    throw new Error(
      `Complete-visualization acceptance failed:\n${[...new Set(errors)]
        .map((error) => `- ${error}`)
        .join('\n')}`,
    );
  }
  return report;
}

function humanSummary(report) {
  return [
    '# Complete-visualization acceptance',
    '',
    `Matrix: ${report.matrixEntryCount}/221 complete (${report.matrixSha256})`,
    `Reachability: ${report.normalizedNodeKindCount} node kinds, ${report.normalizedEdgeKindCount} edge kinds, ${report.packageEntryKindCount} package-entry kinds`,
    `Release-blocking visualization codes: ${report.releaseBlockingVisualizationFindingCodes.length}`,
    `Simplified DocBook: ${report.docbook.elementCount} Navigation and Search records, 0 findings`,
    `Hermetic Foundry baseline: ${report.hermetic.supportedNodeCount} nodes, ${report.hermetic.sourceMarkupNodeCount} source-markup records, 0 findings`,
    '',
    'Acceptance result: PASS',
    '',
  ].join('\n');
}

try {
  process.stdout.write(
    humanSummary(await runCompleteVisualizationAcceptance()),
  );
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
}
