import { derived, type Readable } from 'svelte/store';
import {
  importDtdSource,
  type DtdImportOptions,
  type DtdImportResult,
} from '../../schema/dtd';
import { importXsdSource } from '../../schema/xsd';
import {
  activateImportedProject,
  activateImportedSchemaPackage,
  activateImportedXsdProject,
  type ProjectSessionReplacementResult,
} from '../stores/projectSession';
import { importSchemaArchivePackage } from './schemaPackage';
import {
  startSchemaImportWorkerTask,
  type StartSchemaImportWorkerTask,
} from './schemaImportWorkerClient';
import {
  createSchemaWorkerFailureDiagnostic,
  type SchemaImportWorkerTask,
  type SchemaWorkerImportResult,
} from '../../workers/schemaImportWorkerProtocol';
import {
  createSchemaFileImportController,
  deriveDtdImportOptions,
  isSchemaFilename,
  normalizeSchemaFilename,
  type SchemaFileDiagnostic,
  type SchemaFileImportDependencies,
  type SchemaFileImportOutcome,
  type SchemaFileImportState,
  type SchemaReadableFile,
} from './schemaFileImportController';
import type {
  DtdFileDiagnostic,
  DtdImportFailurePresentation,
} from './dtdImportFailureFormatter';
import { normalizeSchemaDiagnostics } from './schemaDiagnosticReport';

export type DtdReadableFile = SchemaReadableFile;

export type DtdFileImportState =
  | { readonly status: 'idle' }
  | { readonly status: 'reading'; readonly filename: string }
  | {
      readonly status: 'failure';
      readonly filename: string;
      readonly diagnostics: readonly DtdFileDiagnostic[];
      readonly presentation: DtdImportFailurePresentation;
    };

export type DtdFileImportOutcome =
  | { readonly status: 'success'; readonly filename: string }
  | {
      readonly status: 'failure';
      readonly filename: string;
      readonly diagnostics: readonly DtdFileDiagnostic[];
    }
  | { readonly status: 'stale' };

export interface DtdFileImportDependencies {
  readonly readText: (file: DtdReadableFile) => Promise<string>;
  readonly importSource: (
    sourceText: string,
    options: DtdImportOptions,
  ) => DtdImportResult;
  readonly activate: (
    result: DtdImportResult,
  ) => ProjectSessionReplacementResult;
  readonly startWorkerImport?: StartSchemaImportWorkerTask;
}

export interface DtdFileImportController {
  readonly state: Readable<DtdFileImportState>;
  open(file: DtdReadableFile): Promise<DtdFileImportOutcome>;
  dismissFailure(): void;
  destroy(): void;
}

export function normalizeDtdFilename(filename: string): string {
  return normalizeSchemaFilename(filename);
}

export function isDtdFilename(filename: string): boolean {
  return isSchemaFilename('dtd', filename);
}

export { deriveDtdImportOptions };

function defaultReadText(file: DtdReadableFile): Promise<string> {
  return file.text();
}

const productionDependencies: DtdFileImportDependencies = {
  readText: defaultReadText,
  importSource: importDtdSource,
  activate: activateImportedProject,
  startWorkerImport: startSchemaImportWorkerTask,
};

function toDtdDiagnostic(diagnostic: SchemaFileDiagnostic): DtdFileDiagnostic {
  if (diagnostic.stage !== 'file') {
    return diagnostic as DtdFileDiagnostic;
  }
  const { code, severity, message } = diagnostic;
  return { stage: 'file', code, severity, message };
}

function toDtdState(state: SchemaFileImportState): DtdFileImportState {
  if (state.status === 'idle') return state;
  if (state.status === 'reading') {
    return { status: 'reading', filename: state.filename };
  }
  if (state.status === 'processing') {
    return { status: 'reading', filename: state.filename };
  }
  if (state.status === 'warning') return { status: 'idle' };
  return {
    status: 'failure',
    filename: state.filename,
    diagnostics: state.diagnostics.map(toDtdDiagnostic),
    presentation: state.presentation,
  };
}

function toDtdOutcome(outcome: SchemaFileImportOutcome): DtdFileImportOutcome {
  if (outcome.status === 'stale') return outcome;
  if (outcome.status === 'success') {
    return { status: 'success', filename: outcome.filename };
  }
  return {
    status: 'failure',
    filename: outcome.filename,
    diagnostics: outcome.diagnostics.map(toDtdDiagnostic),
  };
}

export function createDtdFileImportController(
  dependencies: DtdFileImportDependencies = productionDependencies,
): DtdFileImportController {
  const compatibilityWorkerStart: StartSchemaImportWorkerTask = (
    request,
    onProgress,
  ): SchemaImportWorkerTask => {
    let cancelled = false;
    const result = Promise.resolve().then(async () => {
      if (cancelled) return { status: 'cancelled' } as const;
      try {
        onProgress({
          phase: 'preparing',
          format: request.format,
          filename: request.filename,
        });
        let workerResult: SchemaWorkerImportResult;
        if (request.format === 'dtd') {
          const importResult = dependencies.importSource(
            request.sourceText,
            request.options,
          );
          workerResult = {
            format: 'dtd',
            importResult,
            diagnostics: normalizeSchemaDiagnostics(importResult.diagnostics, {
              attemptId: request.requestId,
              format: request.format,
              attemptedFileName: request.filename,
            }),
          };
        } else if (request.format === 'xsd') {
          const importResult = importXsdSource(
            request.sourceText,
            request.options,
          );
          workerResult = {
            format: 'xsd',
            importResult,
            diagnostics: normalizeSchemaDiagnostics(importResult.diagnostics, {
              attemptId: request.requestId,
              format: request.format,
              attemptedFileName: request.filename,
            }),
          };
        } else {
          const importResult = await importSchemaArchivePackage({
            filename: request.filename,
            data: request.data,
          });
          workerResult = {
            format: 'zip',
            importResult,
            diagnostics: normalizeSchemaDiagnostics(importResult.diagnostics, {
              attemptId: request.requestId,
              format: request.format,
              attemptedFileName: request.filename,
            }),
          };
        }
        return cancelled
          ? ({ status: 'cancelled' } as const)
          : ({ status: 'success', result: workerResult } as const);
      } catch {
        return {
          status: 'failure',
          diagnostic: createSchemaWorkerFailureDiagnostic(
            'worker-runtime-failure',
          ),
        } as const;
      }
    });
    return {
      result,
      cancel() {
        cancelled = true;
      },
    };
  };
  const unifiedDependencies: SchemaFileImportDependencies = {
    readText: dependencies.readText,
    readArchive: (file) => file.arrayBuffer(),
    startWorkerImport:
      dependencies.startWorkerImport ?? compatibilityWorkerStart,
    activateDtd: dependencies.activate,
    activateXsd: activateImportedXsdProject,
    activatePackage: activateImportedSchemaPackage,
  };
  const controller = createSchemaFileImportController(unifiedDependencies);

  return {
    state: derived(controller.state, toDtdState),
    async open(file) {
      return toDtdOutcome(await controller.openDtd(file));
    },
    dismissFailure: controller.dismissFailure,
    destroy: controller.destroy,
  };
}
