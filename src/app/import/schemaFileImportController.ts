import { writable, type Readable } from 'svelte/store';
import type { DtdImportOptions, DtdImportResult } from '../../schema/dtd';
import type { XsdImportOptions, XsdImportResult } from '../../schema/xsd';
import {
  buildStandaloneRelaxNgProject,
  type StandaloneRelaxNgImportResult,
} from '../../schema/relaxng';
import {
  startRelaxNgValidation,
  type RelaxNgAttemptOutcome,
  type RelaxNgValidationAttempt,
} from '../../standards/relaxng/workerClient';
import type { RelaxNgValidationStatus } from '../../standards/relaxng/types';
import {
  activateImportedProject,
  activateImportedRelaxNgProject,
  activateImportedSchemaPackage,
  activateImportedXsdProject,
  type ProjectImportActivationOptions,
  type ProjectSessionReplacementResult,
} from '../stores/projectSession';
import type { SchemaPackageImportResult } from './schemaPackage';
import {
  startSchemaImportWorkerTask,
  type StartSchemaImportWorkerTask,
} from './schemaImportWorkerClient';
import {
  createSchemaWorkerFailureDiagnostic,
  type SchemaImportProgress,
  type SchemaImportWorkerRequest,
  type SchemaImportWorkerTask,
  type SchemaWorkerImportResult,
} from '../../workers/schemaImportWorkerProtocol';
import {
  formatSchemaDiagnosticReport,
  type SchemaFileDiagnostic,
  type SchemaFileFormat,
  type SchemaImportFailurePresentation,
} from './schemaImportFailureFormatter';
import { isWorkerOwnedImportResult } from './workerOwnedImportResult';
import {
  createSchemaDiagnosticReport,
  normalizeSchemaDiagnostics,
  type SchemaDiagnostic,
  type SchemaDiagnosticReport,
} from './schemaDiagnosticReport';
import type { VisualizationSummary } from '../../schema/visualization';

export type { SchemaFileDiagnostic, SchemaFileFormat };
export type SchemaTextFileFormat = Exclude<SchemaFileFormat, 'zip'>;
type XercesTextFileFormat = Exclude<SchemaTextFileFormat, 'rng'>;

export interface SchemaReadableFile {
  readonly name: string;
  text(): Promise<string>;
  arrayBuffer?(): Promise<ArrayBuffer>;
}

export interface SchemaArchiveReadableFile {
  readonly name: string;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export type SchemaFileImportState =
  | { readonly status: 'idle' }
  | {
      readonly status: 'reading';
      readonly format: SchemaFileFormat;
      readonly filename: string;
    }
  | {
      readonly status: 'processing';
      readonly format: SchemaFileFormat;
      readonly filename: string;
      readonly progress: SchemaImportProgress;
    }
  | {
      readonly status: 'warning';
      readonly format: SchemaFileFormat;
      readonly filename: string;
      readonly diagnostics: readonly SchemaDiagnostic[];
      readonly totalWarningCount: number;
      readonly visualizationSummary?: VisualizationSummary;
    }
  | {
      readonly status: 'failure';
      readonly format: SchemaFileFormat;
      readonly filename: string;
      readonly diagnostics: readonly SchemaFileDiagnostic[];
      readonly report: SchemaDiagnosticReport;
      readonly presentation: SchemaImportFailurePresentation;
    };

export type SchemaFileImportOutcome =
  | {
      readonly status: 'success';
      readonly format: SchemaFileFormat;
      readonly filename: string;
    }
  | {
      readonly status: 'failure';
      readonly format: SchemaFileFormat;
      readonly filename: string;
      readonly diagnostics: readonly SchemaFileDiagnostic[];
    }
  | { readonly status: 'stale' };

export interface SchemaFileImportDependencies {
  readonly readText: (file: SchemaReadableFile) => Promise<string>;
  readonly readArchive: (
    file: SchemaArchiveReadableFile,
  ) => Promise<ArrayBuffer>;
  readonly startWorkerImport: StartSchemaImportWorkerTask;
  readonly readRelaxNg?: (
    file: SchemaReadableFile,
  ) => Promise<{ readonly bytes: Uint8Array; readonly sourceText: string }>;
  readonly startRelaxNgValidation?: typeof startRelaxNgValidation;
  readonly activateDtd: (
    result: DtdImportResult,
    options?: ProjectImportActivationOptions,
  ) => ProjectSessionReplacementResult;
  readonly activateXsd: (
    result: XsdImportResult,
    options?: ProjectImportActivationOptions,
  ) => ProjectSessionReplacementResult;
  readonly activateRelaxNg?: (
    result: StandaloneRelaxNgImportResult,
    options?: ProjectImportActivationOptions,
  ) => ProjectSessionReplacementResult;
  readonly activatePackage: (
    result: SchemaPackageImportResult,
    options?: ProjectImportActivationOptions,
  ) => ProjectSessionReplacementResult;
  readonly yieldToBrowser?: () => Promise<void>;
}

export interface SchemaFileImportController {
  readonly state: Readable<SchemaFileImportState>;
  readonly diagnosticReport: Readable<SchemaDiagnosticReport | undefined>;
  open(
    format: SchemaTextFileFormat,
    file: SchemaReadableFile,
  ): Promise<SchemaFileImportOutcome>;
  openDtd(file: SchemaReadableFile): Promise<SchemaFileImportOutcome>;
  openXsd(file: SchemaReadableFile): Promise<SchemaFileImportOutcome>;
  openRng(file: SchemaReadableFile): Promise<SchemaFileImportOutcome>;
  openZip(file: SchemaArchiveReadableFile): Promise<SchemaFileImportOutcome>;
  invalidateForExternalActivation(): boolean;
  cancel(): boolean;
  dismissFailure(): void;
  dismissWarning(): void;
  clearDiagnosticReport(): void;
  destroy(): void;
}

const idleState: SchemaFileImportState = { status: 'idle' };

export function normalizeSchemaFilename(filename: string): string {
  return filename.trim();
}

export function isSchemaFilename(
  format: SchemaFileFormat,
  filename: string,
): boolean {
  const extension =
    format === 'dtd'
      ? 'dtd'
      : format === 'xsd'
        ? 'xsd'
        : format === 'rng'
          ? 'rng'
          : 'zip';
  return new RegExp(`\\.${extension}$`, 'i').test(
    normalizeSchemaFilename(filename),
  );
}

export function deriveDtdImportOptions(filename: string): DtdImportOptions {
  const visibleFilename = normalizeSchemaFilename(filename);
  const encodedFilename = encodeURIComponent(visibleFilename);

  return {
    projectId: `imported-dtd:${encodedFilename}`,
    displayName: visibleFilename,
    sourceFileId: `imported-dtd-source:${encodedFilename}`,
    sourceFilename: visibleFilename,
  };
}

export function deriveXsdImportOptions(filename: string): XsdImportOptions {
  const visibleFilename = normalizeSchemaFilename(filename);
  const encodedFilename = encodeURIComponent(visibleFilename);

  return {
    projectId: `imported-xsd:${encodedFilename}`,
    displayName: visibleFilename,
    sourceFileId: `imported-xsd-source:${encodedFilename}`,
    sourceFilename: visibleFilename,
  };
}

function defaultReadText(file: SchemaReadableFile): Promise<string> {
  return file.text();
}

function defaultReadArchive(
  file: SchemaArchiveReadableFile,
): Promise<ArrayBuffer> {
  return file.arrayBuffer();
}

async function defaultReadRelaxNg(file: SchemaReadableFile): Promise<{
  readonly bytes: Uint8Array;
  readonly sourceText: string;
}> {
  if (typeof file.arrayBuffer !== 'function') {
    throw new Error('RELAX NG byte reading is unavailable.');
  }
  const [data, sourceText] = await Promise.all([
    file.arrayBuffer(),
    file.text(),
  ]);
  return { bytes: new Uint8Array(data), sourceText };
}

const productionDependencies: SchemaFileImportDependencies = {
  readText: defaultReadText,
  readArchive: defaultReadArchive,
  readRelaxNg: defaultReadRelaxNg,
  startWorkerImport: startSchemaImportWorkerTask,
  startRelaxNgValidation,
  activateDtd: activateImportedProject,
  activateXsd: activateImportedXsdProject,
  activateRelaxNg: activateImportedRelaxNgProject,
  activatePackage: activateImportedSchemaPackage,
  ...(typeof navigator === 'undefined' ||
  !navigator.userAgent.toLocaleLowerCase().includes('jsdom')
    ? {
        yieldToBrowser: () =>
          new Promise<void>((resolve) => {
            if (typeof requestAnimationFrame === 'function') {
              requestAnimationFrame(() => resolve());
            } else {
              setTimeout(resolve, 0);
            }
          }),
      }
    : {}),
};

function fileDiagnostic(
  format: SchemaFileFormat,
  code: Extract<SchemaFileDiagnostic, { stage: 'file' }>['code'],
  message: string,
): SchemaFileDiagnostic {
  return { stage: 'file', format, code, severity: 'error', message };
}

function unsupportedExtensionMessage(format: SchemaFileFormat): string {
  if (format === 'dtd') return 'Choose a file with a .dtd extension.';
  if (format === 'xsd') return 'Choose a file with a .xsd extension.';
  if (format === 'rng') {
    return 'Choose a file with a .rng extension.';
  }
  return 'Choose a file with a .zip extension.';
}

function activationFailureMessage(format: SchemaFileFormat): string {
  if (format === 'dtd') {
    return 'The imported DTD could not replace the current project.';
  }
  if (format === 'xsd') {
    return 'The imported XSD could not replace the current project.';
  }
  if (format === 'rng') {
    return 'The imported RELAX NG schema could not replace the current project.';
  }
  return 'The imported ZIP schema package could not replace the current project.';
}

function readingFailureMessage(format: SchemaFileFormat): string {
  return format === 'zip'
    ? 'The selected ZIP file could not be read.'
    : 'The selected file could not be read.';
}

export function createSchemaFileImportController(
  dependencies: SchemaFileImportDependencies = productionDependencies,
): SchemaFileImportController {
  const stateStore = writable<SchemaFileImportState>(idleState);
  const diagnosticReportStore = writable<SchemaDiagnosticReport | undefined>(
    undefined,
  );
  let currentState: SchemaFileImportState = idleState;
  let revision = 0;
  let workerSequence = 0;
  let destroyed = false;
  let activeWorkerTask:
    SchemaImportWorkerTask | RelaxNgValidationAttempt | undefined;
  let activeWarningState:
    Extract<SchemaFileImportState, { status: 'warning' }> | undefined;

  function publish(nextState: SchemaFileImportState): void {
    if (destroyed) return;
    currentState = nextState;
    stateStore.set(nextState);
  }

  function publishActiveWarningOrIdle(): void {
    publish(activeWarningState ?? idleState);
  }

  function isCurrent(requestRevision: number): boolean {
    return !destroyed && revision === requestRevision;
  }

  function cancelActiveWorker(): void {
    const task = activeWorkerTask;
    activeWorkerTask = undefined;
    try {
      task?.cancel();
    } catch {
      // Cleanup is best-effort; revision ownership still blocks publication.
    }
  }

  function beginRequest(): number {
    revision += 1;
    cancelActiveWorker();
    return revision;
  }

  function failureOutcome(
    format: SchemaFileFormat,
    filename: string,
    diagnostics: readonly SchemaFileDiagnostic[],
    attemptId: string,
    normalizedDiagnostics?: readonly SchemaDiagnostic[],
  ): Extract<SchemaFileImportOutcome, { status: 'failure' }> {
    const context = { attemptId, format, attemptedFileName: filename };
    const report = createSchemaDiagnosticReport(
      normalizedDiagnostics ?? normalizeSchemaDiagnostics(diagnostics, context),
      context,
    );
    diagnosticReportStore.set(report);
    publish({
      status: 'failure',
      format,
      filename,
      diagnostics,
      report,
      presentation: formatSchemaDiagnosticReport(report),
    });
    return { status: 'failure', format, filename, diagnostics };
  }

  function initialProgress(
    format: SchemaFileFormat,
    filename: string,
  ): SchemaImportProgress {
    return { phase: 'preparing', format, filename };
  }

  function createWorkerRequest(
    format: XercesTextFileFormat,
    filename: string,
    sourceText: string,
  ): SchemaImportWorkerRequest;
  function createWorkerRequest(
    format: 'zip',
    filename: string,
    data: ArrayBuffer,
  ): SchemaImportWorkerRequest;
  function createWorkerRequest(
    format: XercesTextFileFormat | 'zip',
    filename: string,
    content: string | ArrayBuffer,
  ): SchemaImportWorkerRequest {
    workerSequence += 1;
    const requestId = `schema-import-${workerSequence}`;
    if (format === 'dtd') {
      return {
        type: 'import',
        requestId,
        format,
        filename,
        sourceText: content as string,
        options: deriveDtdImportOptions(filename),
      };
    }
    if (format === 'xsd') {
      return {
        type: 'import',
        requestId,
        format,
        filename,
        sourceText: content as string,
        options: deriveXsdImportOptions(filename),
      };
    }
    return {
      type: 'import',
      requestId,
      format,
      filename,
      data: content as ArrayBuffer,
    };
  }

  function activateWorkerResult(
    result: SchemaWorkerImportResult,
  ): ProjectSessionReplacementResult {
    const importResult = result.importResult;
    const options: ProjectImportActivationOptions = {
      ...(isWorkerOwnedImportResult(importResult)
        ? { ownership: 'worker' as const }
        : {}),
      ...(result.searchIndex &&
      importResult.status === 'success' &&
      result.searchIndex.projectId === importResult.project.id
        ? { preparedSearchIndex: result.searchIndex }
        : {}),
    };
    if (result.format === 'dtd') {
      return dependencies.activateDtd(result.importResult, options);
    }
    if (result.format === 'xsd') {
      return dependencies.activateXsd(result.importResult, options);
    }
    return dependencies.activatePackage(result.importResult, options);
  }

  async function processWorkerRequest(
    requestRevision: number,
    request: SchemaImportWorkerRequest,
  ): Promise<SchemaFileImportOutcome> {
    if (!isCurrent(requestRevision)) return { status: 'stale' };
    publish({
      status: 'processing',
      format: request.format,
      filename: request.filename,
      progress: initialProgress(request.format, request.filename),
    });

    let task: SchemaImportWorkerTask;
    try {
      task = dependencies.startWorkerImport(request, (progress) => {
        if (!isCurrent(requestRevision) || activeWorkerTask !== task) return;
        publish({
          status: 'processing',
          format: request.format,
          filename: request.filename,
          progress,
        });
      });
    } catch {
      if (!isCurrent(requestRevision)) return { status: 'stale' };
      return failureOutcome(
        request.format,
        request.filename,
        [createSchemaWorkerFailureDiagnostic('worker-start-failure')],
        request.requestId,
      );
    }
    if (!isCurrent(requestRevision)) {
      task.cancel();
      return { status: 'stale' };
    }
    activeWorkerTask = task;

    const workerResult = await task.result;
    if (!isCurrent(requestRevision) || activeWorkerTask !== task) {
      return { status: 'stale' };
    }
    activeWorkerTask = undefined;
    if (workerResult.status === 'cancelled') {
      publishActiveWarningOrIdle();
      return { status: 'stale' };
    }
    if (workerResult.status === 'failure') {
      return failureOutcome(
        request.format,
        request.filename,
        [workerResult.diagnostic],
        request.requestId,
      );
    }
    if (workerResult.result.format !== request.format) {
      return failureOutcome(
        request.format,
        request.filename,
        [createSchemaWorkerFailureDiagnostic('worker-protocol-failure')],
        request.requestId,
      );
    }

    const importResult = workerResult.result.importResult;
    if (importResult.status === 'failure') {
      return failureOutcome(
        request.format,
        request.filename,
        importResult.diagnostics,
        request.requestId,
        workerResult.result.diagnostics,
      );
    }

    publish({
      status: 'processing',
      format: request.format,
      filename: request.filename,
      progress: {
        phase: 'activating',
        format: request.format,
        filename: request.filename,
      },
    });
    if (dependencies.yieldToBrowser) {
      await dependencies.yieldToBrowser();
    }
    if (!isCurrent(requestRevision)) return { status: 'stale' };

    let activation: ProjectSessionReplacementResult;
    try {
      activation = activateWorkerResult(workerResult.result);
    } catch {
      if (!isCurrent(requestRevision)) return { status: 'stale' };
      return failureOutcome(
        request.format,
        request.filename,
        [
          fileDiagnostic(
            request.format,
            'activation-failure',
            activationFailureMessage(request.format),
          ),
        ],
        request.requestId,
      );
    }
    if (!isCurrent(requestRevision)) return { status: 'stale' };
    if (!activation.applied) {
      return failureOutcome(
        request.format,
        request.filename,
        [
          fileDiagnostic(
            request.format,
            'activation-failure',
            activationFailureMessage(request.format),
          ),
        ],
        request.requestId,
      );
    }

    const nonfatalWarnings = workerResult.result.diagnostics.filter(
      (diagnostic) =>
        diagnostic.severity === 'warning' &&
        ((diagnostic.source === 'dtd-lint' &&
          diagnostic.category === 'dtd-lint') ||
          (diagnostic.source === 'visualization' &&
            diagnostic.category === 'visualization')),
    );
    const visualizationSummary = importResult.visualization.summary;
    const lintWarningCount = nonfatalWarnings.filter(
      ({ source }) => source === 'dtd-lint',
    ).length;
    activeWarningState =
      nonfatalWarnings.length > 0 ||
      visualizationSummary.completeness === 'partial'
        ? {
            status: 'warning',
            format: request.format,
            filename: request.filename,
            diagnostics: nonfatalWarnings,
            totalWarningCount:
              visualizationSummary.totalFindingCount + lintWarningCount,
            ...(visualizationSummary.completeness === 'partial'
              ? { visualizationSummary }
              : {}),
          }
        : undefined;
    diagnosticReportStore.set(undefined);
    publishActiveWarningOrIdle();
    return {
      status: 'success',
      format: request.format,
      filename: request.filename,
    };
  }

  function relaxNgWorkerFailureDiagnostic(
    outcome: Extract<RelaxNgAttemptOutcome, { status: 'failed' }>,
  ): SchemaFileDiagnostic {
    return createSchemaWorkerFailureDiagnostic(
      outcome.code === 'worker-timeout'
        ? 'worker-timeout'
        : outcome.code === 'protocol-failure'
          ? 'worker-protocol-failure'
          : 'worker-runtime-failure',
    );
  }

  function relaxNgStatusFallback(
    status: RelaxNgValidationStatus,
  ): SchemaFileDiagnostic {
    return {
      stage: 'standards',
      code: `relaxng:${status}`,
      severity: 'error',
      message:
        status === 'invalid'
          ? 'The selected file is not a valid RELAX NG XML-syntax schema.'
          : status === 'blocked'
            ? 'The RELAX NG schema requires a dependency that is missing or blocked.'
            : "XML Carousel's RELAX NG standards checker could not complete the check.",
      category:
        status === 'invalid'
          ? 'standards-invalid'
          : status === 'blocked'
            ? 'blocked-dependency'
            : 'engine-internal',
      source: status === 'invalid' ? 'rng' : 'project',
    };
  }

  async function processRelaxNgRequest(
    requestRevision: number,
    filename: string,
    bytes: Uint8Array,
    sourceText: string,
  ): Promise<SchemaFileImportOutcome> {
    if (!isCurrent(requestRevision)) return { status: 'stale' };
    workerSequence += 1;
    const attemptId = `schema-import-${workerSequence}`;
    publish({
      status: 'processing',
      format: 'rng',
      filename,
      progress: { phase: 'validating-standards', format: 'rng', filename },
    });

    let attempt: RelaxNgValidationAttempt;
    try {
      attempt = (dependencies.startRelaxNgValidation ?? startRelaxNgValidation)(
        {
          attemptId,
          entryPath: filename,
          files: [{ path: filename, bytes }],
        },
      );
    } catch {
      if (!isCurrent(requestRevision)) return { status: 'stale' };
      return failureOutcome(
        'rng',
        filename,
        [createSchemaWorkerFailureDiagnostic('worker-start-failure')],
        attemptId,
      );
    }
    if (!isCurrent(requestRevision)) {
      attempt.cancel('superseded');
      return { status: 'stale' };
    }
    activeWorkerTask = attempt;

    const outcome = await attempt.result;
    if (!isCurrent(requestRevision) || activeWorkerTask !== attempt) {
      return { status: 'stale' };
    }
    activeWorkerTask = undefined;
    if (outcome.status === 'cancelled') {
      publishActiveWarningOrIdle();
      return { status: 'stale' };
    }
    if (outcome.status === 'failed') {
      return failureOutcome(
        'rng',
        filename,
        [relaxNgWorkerFailureDiagnostic(outcome)],
        attemptId,
      );
    }
    if (outcome.result.status !== 'valid') {
      const diagnostics =
        outcome.result.diagnostics.length > 0
          ? outcome.result.diagnostics
          : [relaxNgStatusFallback(outcome.result.status)];
      return failureOutcome(
        'rng',
        filename,
        diagnostics,
        attemptId,
        normalizeSchemaDiagnostics(diagnostics, {
          attemptId,
          format: 'rng',
          attemptedFileName: filename,
        }),
      );
    }

    const importResult = buildStandaloneRelaxNgProject({
      filename,
      sourceText,
      engine: outcome.result.engine,
      semanticModel: outcome.result.semanticModel,
      semanticFindings: outcome.result.semanticFindings,
    });
    publish({
      status: 'processing',
      format: 'rng',
      filename,
      progress: { phase: 'activating', format: 'rng', filename },
    });
    if (dependencies.yieldToBrowser) await dependencies.yieldToBrowser();
    if (!isCurrent(requestRevision)) return { status: 'stale' };

    let activation: ProjectSessionReplacementResult;
    try {
      activation = (
        dependencies.activateRelaxNg ?? activateImportedRelaxNgProject
      )(importResult);
    } catch {
      if (!isCurrent(requestRevision)) return { status: 'stale' };
      return failureOutcome(
        'rng',
        filename,
        [
          fileDiagnostic(
            'rng',
            'activation-failure',
            activationFailureMessage('rng'),
          ),
        ],
        attemptId,
      );
    }
    if (!isCurrent(requestRevision)) return { status: 'stale' };
    if (!activation.applied) {
      return failureOutcome(
        'rng',
        filename,
        [
          fileDiagnostic(
            'rng',
            'activation-failure',
            activationFailureMessage('rng'),
          ),
        ],
        attemptId,
      );
    }

    const visualizationDiagnostics = normalizeSchemaDiagnostics(
      importResult.visualization.findings,
      { attemptId, format: 'rng', attemptedFileName: filename },
    );
    activeWarningState = {
      status: 'warning',
      format: 'rng',
      filename,
      diagnostics: visualizationDiagnostics,
      totalWarningCount: importResult.visualization.summary.totalFindingCount,
      visualizationSummary: importResult.visualization.summary,
    };
    diagnosticReportStore.set(undefined);
    publishActiveWarningOrIdle();
    return { status: 'success', format: 'rng', filename };
  }

  async function settleRelaxNgRead(
    requestRevision: number,
    filename: string,
    read: Promise<{ readonly bytes: Uint8Array; readonly sourceText: string }>,
  ): Promise<SchemaFileImportOutcome> {
    let content: { readonly bytes: Uint8Array; readonly sourceText: string };
    try {
      content = await read;
    } catch {
      if (!isCurrent(requestRevision)) return { status: 'stale' };
      return failureOutcome(
        'rng',
        filename,
        [fileDiagnostic('rng', 'read-failure', readingFailureMessage('rng'))],
        `schema-import-attempt-${requestRevision}`,
      );
    }
    if (!isCurrent(requestRevision)) return { status: 'stale' };
    return processRelaxNgRequest(
      requestRevision,
      filename,
      content.bytes,
      content.sourceText,
    );
  }

  async function settleTextRead(
    requestRevision: number,
    format: XercesTextFileFormat,
    filename: string,
    read: Promise<string>,
  ): Promise<SchemaFileImportOutcome> {
    let sourceText: string;
    try {
      sourceText = await read;
    } catch {
      if (!isCurrent(requestRevision)) return { status: 'stale' };
      return failureOutcome(
        format,
        filename,
        [fileDiagnostic(format, 'read-failure', readingFailureMessage(format))],
        `schema-import-attempt-${requestRevision}`,
      );
    }
    if (!isCurrent(requestRevision)) return { status: 'stale' };
    return processWorkerRequest(
      requestRevision,
      createWorkerRequest(format, filename, sourceText),
    );
  }

  function open(
    format: SchemaTextFileFormat,
    file: SchemaReadableFile,
  ): Promise<SchemaFileImportOutcome> {
    if (format === 'rng') return openRng(file);
    const requestRevision = beginRequest();
    const filename = normalizeSchemaFilename(file.name);
    if (!isCurrent(requestRevision)) {
      return Promise.resolve({ status: 'stale' });
    }
    if (!isSchemaFilename(format, filename)) {
      return Promise.resolve(
        failureOutcome(
          format,
          filename,
          [
            fileDiagnostic(
              format,
              'unsupported-extension',
              unsupportedExtensionMessage(format),
            ),
          ],
          `schema-import-attempt-${requestRevision}`,
        ),
      );
    }

    publish({ status: 'reading', format, filename });
    let read: Promise<string>;
    try {
      read = dependencies.readText(file);
    } catch {
      if (!isCurrent(requestRevision)) {
        return Promise.resolve({ status: 'stale' });
      }
      return Promise.resolve(
        failureOutcome(
          format,
          filename,
          [
            fileDiagnostic(
              format,
              'read-failure',
              readingFailureMessage(format),
            ),
          ],
          `schema-import-attempt-${requestRevision}`,
        ),
      );
    }
    return settleTextRead(requestRevision, format, filename, read);
  }

  function openRng(file: SchemaReadableFile): Promise<SchemaFileImportOutcome> {
    const requestRevision = beginRequest();
    const filename = normalizeSchemaFilename(file.name);
    if (!isCurrent(requestRevision)) {
      return Promise.resolve({ status: 'stale' });
    }
    if (!isSchemaFilename('rng', filename)) {
      const message = filename.toLocaleLowerCase().endsWith('.rnc')
        ? 'RELAX NG Compact Syntax (.rnc) is not supported yet. Choose a .rng file.'
        : unsupportedExtensionMessage('rng');
      return Promise.resolve(
        failureOutcome(
          'rng',
          filename,
          [fileDiagnostic('rng', 'unsupported-extension', message)],
          `schema-import-attempt-${requestRevision}`,
        ),
      );
    }

    publish({ status: 'reading', format: 'rng', filename });
    let read: Promise<{
      readonly bytes: Uint8Array;
      readonly sourceText: string;
    }>;
    try {
      read = (dependencies.readRelaxNg ?? defaultReadRelaxNg)(file);
    } catch {
      if (!isCurrent(requestRevision)) {
        return Promise.resolve({ status: 'stale' });
      }
      return Promise.resolve(
        failureOutcome(
          'rng',
          filename,
          [fileDiagnostic('rng', 'read-failure', readingFailureMessage('rng'))],
          `schema-import-attempt-${requestRevision}`,
        ),
      );
    }
    return settleRelaxNgRead(requestRevision, filename, read);
  }

  async function settleArchiveRead(
    requestRevision: number,
    filename: string,
    read: Promise<ArrayBuffer>,
  ): Promise<SchemaFileImportOutcome> {
    let data: ArrayBuffer;
    try {
      data = await read;
    } catch {
      if (!isCurrent(requestRevision)) return { status: 'stale' };
      return failureOutcome(
        'zip',
        filename,
        [fileDiagnostic('zip', 'read-failure', readingFailureMessage('zip'))],
        `schema-import-attempt-${requestRevision}`,
      );
    }
    if (!isCurrent(requestRevision)) return { status: 'stale' };
    return processWorkerRequest(
      requestRevision,
      createWorkerRequest('zip', filename, data),
    );
  }

  function openZip(
    file: SchemaArchiveReadableFile,
  ): Promise<SchemaFileImportOutcome> {
    const requestRevision = beginRequest();
    const filename = normalizeSchemaFilename(file.name);
    if (!isCurrent(requestRevision)) {
      return Promise.resolve({ status: 'stale' });
    }
    if (!isSchemaFilename('zip', filename)) {
      return Promise.resolve(
        failureOutcome(
          'zip',
          filename,
          [
            fileDiagnostic(
              'zip',
              'unsupported-extension',
              unsupportedExtensionMessage('zip'),
            ),
          ],
          `schema-import-attempt-${requestRevision}`,
        ),
      );
    }

    publish({ status: 'reading', format: 'zip', filename });
    let read: Promise<ArrayBuffer>;
    try {
      read = dependencies.readArchive(file);
    } catch {
      if (!isCurrent(requestRevision)) {
        return Promise.resolve({ status: 'stale' });
      }
      return Promise.resolve(
        failureOutcome(
          'zip',
          filename,
          [fileDiagnostic('zip', 'read-failure', readingFailureMessage('zip'))],
          `schema-import-attempt-${requestRevision}`,
        ),
      );
    }
    return settleArchiveRead(requestRevision, filename, read);
  }

  return {
    state: { subscribe: stateStore.subscribe },
    diagnosticReport: { subscribe: diagnosticReportStore.subscribe },
    open,
    openDtd: (file) => open('dtd', file),
    openXsd: (file) => open('xsd', file),
    openRng,
    openZip,
    invalidateForExternalActivation() {
      if (
        destroyed ||
        currentState.status === 'reading' ||
        currentState.status === 'processing'
      ) {
        return false;
      }
      revision += 1;
      cancelActiveWorker();
      return true;
    },
    cancel() {
      if (
        destroyed ||
        (currentState.status !== 'reading' &&
          currentState.status !== 'processing')
      ) {
        return false;
      }
      revision += 1;
      cancelActiveWorker();
      publishActiveWarningOrIdle();
      return true;
    },
    dismissFailure() {
      if (destroyed || currentState.status !== 'failure') return;
      publishActiveWarningOrIdle();
    },
    dismissWarning() {
      if (destroyed || currentState.status !== 'warning') return;
      activeWarningState = undefined;
      publish(idleState);
    },
    clearDiagnosticReport() {
      if (destroyed) return;
      activeWarningState = undefined;
      diagnosticReportStore.set(undefined);
      if (
        currentState.status === 'failure' ||
        currentState.status === 'warning'
      ) {
        publish(idleState);
      }
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      revision += 1;
      cancelActiveWorker();
    },
  };
}
