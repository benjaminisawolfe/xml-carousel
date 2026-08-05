import { writable, type Readable } from 'svelte/store';
import type { DtdImportOptions, DtdImportResult } from '../../schema/dtd';
import type { XsdImportOptions, XsdImportResult } from '../../schema/xsd';
import {
  activateImportedProject,
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

export interface SchemaReadableFile {
  readonly name: string;
  text(): Promise<string>;
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
  readonly activateDtd: (
    result: DtdImportResult,
    options?: ProjectImportActivationOptions,
  ) => ProjectSessionReplacementResult;
  readonly activateXsd: (
    result: XsdImportResult,
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
  const extension = format === 'dtd' ? 'dtd' : format === 'xsd' ? 'xsd' : 'zip';
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

const productionDependencies: SchemaFileImportDependencies = {
  readText: defaultReadText,
  readArchive: defaultReadArchive,
  startWorkerImport: startSchemaImportWorkerTask,
  activateDtd: activateImportedProject,
  activateXsd: activateImportedXsdProject,
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
  return 'Choose a file with a .zip extension.';
}

function activationFailureMessage(format: SchemaFileFormat): string {
  if (format === 'dtd') {
    return 'The imported DTD could not replace the current project.';
  }
  if (format === 'xsd') {
    return 'The imported XSD could not replace the current project.';
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
  let activeWorkerTask: SchemaImportWorkerTask | undefined;
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
    format: SchemaTextFileFormat,
    filename: string,
    sourceText: string,
  ): SchemaImportWorkerRequest;
  function createWorkerRequest(
    format: 'zip',
    filename: string,
    data: ArrayBuffer,
  ): SchemaImportWorkerRequest;
  function createWorkerRequest(
    format: SchemaFileFormat,
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

  async function settleTextRead(
    requestRevision: number,
    format: SchemaTextFileFormat,
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
