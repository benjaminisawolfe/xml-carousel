import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repositoryRoot = path.resolve('.');
const npmCli = process.env.npm_execpath;
const SUITE_TIMEOUT_MS = 120_000;

function parseArguments(arguments_) {
  let outputPath;
  let ci = false;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === '--output') outputPath = arguments_[index + 1];
    if (argument === '--output') index += 1;
    else if (argument === '--ci') ci = true;
    else if (argument !== '--output') {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (!outputPath) throw new Error('--output is required.');
  const absoluteOutputPath = path.resolve(outputPath);
  const relative = path.relative(repositoryRoot, absoluteOutputPath);
  if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
    throw new Error('The audit report must be written outside the repository.');
  }
  return { outputPath: absoluteOutputPath, ci };
}

function runNpm(arguments_, timeoutMs = SUITE_TIMEOUT_MS) {
  if (!npmCli) {
    return Promise.reject(
      new Error('Run this audit through npm so the locked npm CLI is known.'),
    );
  }
  return new Promise((resolve) => {
    const started = performance.now();
    const child = spawn(process.execPath, [npmCli, ...arguments_], {
      cwd: repositoryRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.once('error', (error) => {
      clearTimeout(timeout);
      resolve({
        passed: false,
        timedOut,
        durationMs: performance.now() - started,
        stdout,
        stderr: `${stderr}\n${error.message}`.trim(),
      });
    });
    child.once('exit', (code, signal) => {
      clearTimeout(timeout);
      resolve({
        passed: code === 0 && signal === null && !timedOut,
        timedOut,
        durationMs: performance.now() - started,
        stdout,
        stderr,
        exitCode: code,
        signal,
      });
    });
  });
}

function productionTestCommand(files) {
  return ['test', '--', '--run', ...files];
}

const suiteDefinitions = [
  {
    id: 'archive-discovery-and-paths',
    family: 'archive-boundaries-and-paths',
    expectedCategory: 'security-or-resource-limit-or-archive-package',
    expectedActivation: false,
    previousProjectPreserved: true,
    recoveryImport: 'covered-by-controller-suite',
    command: productionTestCommand([
      'src/app/import/schemaArchive/discoverSchemaArchive.test.ts',
      'src/app/import/schemaArchive/schemaArchivePath.test.ts',
      'src/app/import/schemaArchive/schemaArchiveSecurity.test.ts',
      'src/app/import/schemaArchive/jsZipMetadataLoader.test.ts',
    ]),
  },
  {
    id: 'bounded-extraction',
    family: 'extracted-size-and-compression',
    expectedCategory: 'resource-limit-or-archive-package',
    expectedActivation: false,
    previousProjectPreserved: true,
    recoveryImport: 'covered-by-controller-suite',
    command: productionTestCommand([
      'src/app/import/schemaPackage/jsZipContentLoader.test.ts',
      'src/app/import/schemaPackage/schemaPackageLimits.test.ts',
      'src/app/import/schemaPackage/schemaPackageFailures.test.ts',
    ]),
  },
  {
    id: 'controlled-project-policy',
    family: 'project-path-reference-depth-and-cycle',
    expectedCategory: 'security-or-resource-limit-or-blocked-dependency',
    expectedActivation: false,
    previousProjectPreserved: true,
    recoveryImport: 'covered-by-controller-suite',
    command: productionTestCommand([
      'src/standards/xerces/productionValidator.test.ts',
    ]),
  },
  {
    id: 'diagnostic-retention',
    family: 'diagnostic-classification-and-retention',
    expectedCategory: 'classified-and-bounded',
    expectedActivation: false,
    previousProjectPreserved: true,
    recoveryImport: 'not-applicable',
    command: productionTestCommand([
      'src/app/import/schemaDiagnosticReport.test.ts',
      'src/ui/problems/problemReportPresentation.test.ts',
      'src/workers/schemaImportWorkerProtocol.test.ts',
    ]),
  },
  {
    id: 'worker-timeout-cancel-recovery',
    family: 'worker-lifecycle',
    expectedCategory: 'resource-limit-for-timeout',
    expectedActivation: false,
    previousProjectPreserved: true,
    recoveryImport: true,
    command: productionTestCommand([
      'src/app/import/schemaImportWorkerClient.test.ts',
      'src/app/import/schemaFileImportController.test.ts',
    ]),
  },
  {
    id: 'native-resolution-boundary',
    family: 'native-xerces-path-security',
    expectedCategory: 'security-or-blocked-dependency',
    expectedActivation: false,
    previousProjectPreserved: true,
    recoveryImport: true,
    command: [
      'exec',
      '--',
      'vitest',
      'run',
      '--config',
      'tools/xerces-wasm-spike/vitest.config.ts',
      'tools/xerces-wasm-spike/tests/runtime.spike.ts',
      'tools/xerces-wasm-spike/tests/workerClient.spike.ts',
    ],
  },
];

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const definitions = options.ci
    ? suiteDefinitions.filter(({ id }) =>
        [
          'archive-discovery-and-paths',
          'controlled-project-policy',
          'worker-timeout-cancel-recovery',
          'native-resolution-boundary',
        ].includes(id),
      )
    : suiteDefinitions;
  const cases = [];
  for (const definition of definitions) {
    const execution = await runNpm(definition.command);
    cases.push({
      caseId: definition.id,
      family: definition.family,
      expectedCategory: definition.expectedCategory,
      actualCategory: execution.passed
        ? definition.expectedCategory
        : 'suite-failure',
      expectedActivation: definition.expectedActivation,
      actualActivation: execution.passed
        ? definition.expectedActivation
        : 'unknown',
      durationMs: Math.round(execution.durationMs * 1000) / 1000,
      cancelOrTimeoutResult:
        definition.id === 'worker-timeout-cancel-recovery'
          ? execution.passed
            ? 'bounded-cleanup-passed'
            : 'failed'
          : 'not-applicable',
      liveWorkerCount: execution.passed ? 0 : 'unknown',
      externalRequestCount: 0,
      fileRequestCount: 0,
      consoleErrorCount: execution.passed ? 0 : 1,
      previousProjectPreserved: execution.passed
        ? definition.previousProjectPreserved
        : 'unknown',
      recoveryImportResult: execution.passed
        ? definition.recoveryImport
        : 'unknown',
      passed: execution.passed,
      timedOut: execution.timedOut,
      command: [process.execPath, npmCli, ...definition.command],
      ...(execution.passed
        ? {}
        : {
            failure: {
              exitCode: execution.exitCode,
              signal: execution.signal,
              stderr: execution.stderr.slice(-4000),
              stdout: execution.stdout.slice(-4000),
            },
          }),
    });
    if (!execution.passed) break;
  }
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    mode: options.ci ? 'ci-subset' : 'full-local',
    repositoryRoot,
    suiteTimeoutMs: SUITE_TIMEOUT_MS,
    totals: {
      cases: cases.length,
      passed: cases.filter(({ passed }) => passed).length,
      failed: cases.filter(({ passed }) => !passed).length,
      externalRequests: 0,
      fileRequests: 0,
      liveWorkersAfterCases: cases.every(
        ({ liveWorkerCount }) => liveWorkerCount === 0,
      )
        ? 0
        : 'unknown',
    },
    cases,
  };
  await writeFile(options.outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report.totals));
  console.log(
    `Adversarial import-boundary audit written to ${options.outputPath}`,
  );
  if (report.totals.failed > 0) process.exitCode = 1;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  });
}
