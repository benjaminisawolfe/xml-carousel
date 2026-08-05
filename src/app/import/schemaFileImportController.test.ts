import { get } from 'svelte/store';
import { describe, expect, it, vi } from 'vitest';
import librarySource from '../../../tests/fixtures/dtd/library.dtd?raw';
import basicXsd from '../../../tests/fixtures/xsd/basic-structure.xsd?raw';
import partialXsdSource from '../../../tests/fixtures/xsd/visualization/mixed-supported-unsupported.xsd?raw';
import { importDtdSource, type DtdImportResult } from '../../schema/dtd';
import { importXsdSource, type XsdImportResult } from '../../schema/xsd';
import { completeVisualizationResult } from '../../schema/visualization';
import {
  bookDtdNodeIds,
  bookDtdProject,
} from '../../schema/samples/bookDtdProject';
import type { ProjectSessionReplacementResult } from '../stores/projectSession';
import type { SchemaPackageImportResult } from './schemaPackage';
import {
  createSchemaWorkerFailureDiagnostic,
  type SchemaImportProgress,
  type SchemaImportWorkerRequest,
  type SchemaImportWorkerTask,
  type SchemaImportWorkerTaskResult,
  type SchemaWorkerFailureCode,
  type SchemaWorkerImportResult,
} from '../../workers/schemaImportWorkerProtocol';
import {
  createSchemaFileImportController,
  deriveDtdImportOptions,
  deriveXsdImportOptions,
  isSchemaFilename,
  normalizeSchemaFilename,
  type SchemaArchiveReadableFile,
  type SchemaFileFormat,
  type SchemaFileImportDependencies,
  type SchemaFileImportState,
  type SchemaReadableFile,
} from './schemaFileImportController';
import { normalizeSchemaDiagnostics } from './schemaDiagnosticReport';

const dtdSuccess = importDtdSource(
  librarySource,
  deriveDtdImportOptions('library.dtd'),
);
const xsdSuccess = importXsdSource(
  basicXsd,
  deriveXsdImportOptions('schema.xsd'),
);

if (dtdSuccess.status !== 'success' || xsdSuccess.status !== 'success') {
  throw new Error('Controller test fixtures must import successfully.');
}

const packageSuccess: Extract<
  SchemaPackageImportResult,
  { status: 'success' }
> = {
  status: 'success',
  manifest: {
    id: 'schema-package:schemas.zip',
    archiveFilename: 'schemas.zip',
    archiveByteLength: 4,
    packageRoot: '/',
    entries: [],
    schemaEntries: [
      {
        id: 'entry:book',
        archivePath: 'book.dtd',
        packageRelativePath: 'book.dtd',
        basename: 'book.dtd',
        format: 'dtd',
        sourceOrder: 0,
      },
    ],
    xsdCount: 0,
    dtdCount: 1,
    ignoredFileCount: 0,
    totalFileEntryCount: 1,
  },
  project: bookDtdProject,
  sources: [
    {
      sourceFileId: 'book-dtd-source',
      archiveEntryId: 'entry:book',
      archivePath: 'book.dtd',
      packageRelativePath: 'book.dtd',
      format: 'dtd',
      sourceOrder: 0,
      byteLength: 4,
      nodeCount: bookDtdProject.nodes.length,
      rootNodeIds: [...bookDtdProject.rootNodeIds],
      initialFocusNodeId: bookDtdNodeIds.book,
    },
  ],
  entries: [],
  summary: {
    entryCount: 0,
    fileCount: 0,
    directoryCount: 0,
    schemaSourceCount: 0,
    xsdSourceCount: 0,
    dtdSourceCount: 0,
    auxiliaryCount: 0,
    ignoredCount: 0,
    blockedCount: 0,
    rootCandidateCount: 0,
    completeFileCount: 0,
    zeroNodeSourceCount: 0,
    unresolvedRelationshipCount: 0,
  },
  initialFocusNodeId: bookDtdNodeIds.book,
  contentKindsByNodeId: {},
  dtdAttributesByNodeId: {},
  comments: [],
  commentsByNodeId: {},
  schemaLevelComments: [],
  sourceMarkupByNodeId: {},
  xsdMetadataByNodeId: {},
  unresolvedReferences: [],
  diagnostics: [],
  visualization: completeVisualizationResult,
};

function readableFile(name: string, sourceText = ''): SchemaReadableFile {
  return { name, text: () => Promise.resolve(sourceText) };
}

function archiveFile(
  name: string,
  data = new ArrayBuffer(4),
): SchemaArchiveReadableFile {
  return { name, arrayBuffer: () => Promise.resolve(data) };
}

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (reason?: unknown) => void;
} {
  let resolvePromise!: (value: T) => void;
  let rejectPromise!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

interface ControlledWorkerTask {
  readonly request: SchemaImportWorkerRequest;
  readonly cancel: ReturnType<typeof vi.fn>;
  progress(progress: SchemaImportProgress): void;
  settle(result: SchemaImportWorkerTaskResult): void;
}

function createWorkerHarness(): {
  readonly start: SchemaFileImportDependencies['startWorkerImport'];
  readonly tasks: ControlledWorkerTask[];
} {
  const tasks: ControlledWorkerTask[] = [];
  const start = vi.fn(
    (
      request: SchemaImportWorkerRequest,
      onProgress: (progress: SchemaImportProgress) => void,
    ): SchemaImportWorkerTask => {
      const pending = deferred<SchemaImportWorkerTaskResult>();
      let settled = false;
      const settle = (result: SchemaImportWorkerTaskResult): void => {
        if (settled) return;
        settled = true;
        pending.resolve(result);
      };
      const cancel = vi.fn(() => settle({ status: 'cancelled' }));
      tasks.push({
        request,
        cancel,
        progress(progress) {
          if (!settled) onProgress(progress);
        },
        settle,
      });
      return { result: pending.promise, cancel };
    },
  );
  return { start, tasks };
}

function applied(
  result: DtdImportResult | XsdImportResult | SchemaPackageImportResult,
): ProjectSessionReplacementResult {
  if (result.status === 'failure') {
    return { applied: false, reason: 'importFailure', importResult: result };
  }
  return {
    applied: true,
    state: {
      project: result.project,
      origin: 'imported',
      sourceFilename: result.project.sourceFiles?.[0]?.filename ?? '',
    },
  };
}

function dependencies(
  harness: ReturnType<typeof createWorkerHarness>,
  overrides: Partial<SchemaFileImportDependencies> = {},
): SchemaFileImportDependencies {
  return {
    readText: (file) => file.text(),
    readArchive: (file) => file.arrayBuffer(),
    startWorkerImport: harness.start,
    activateDtd: applied,
    activateXsd: applied,
    activatePackage: applied,
    ...overrides,
  };
}

function successFor(format: SchemaFileFormat): SchemaWorkerImportResult {
  if (format === 'dtd') {
    return { format, importResult: dtdSuccess, diagnostics: [] };
  }
  if (format === 'xsd') {
    return { format, importResult: xsdSuccess, diagnostics: [] };
  }
  return { format, importResult: packageSuccess, diagnostics: [] };
}

function openFormat(
  controller: ReturnType<typeof createSchemaFileImportController>,
  format: SchemaFileFormat,
  filename = `schema.${format}`,
) {
  return format === 'dtd'
    ? controller.openDtd(readableFile(filename, librarySource))
    : format === 'xsd'
      ? controller.openXsd(readableFile(filename, basicXsd))
      : controller.openZip(archiveFile(filename));
}

async function reachWorker(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('schema filename and option helpers', () => {
  it('normalizes and validates exact selected extensions', () => {
    expect(normalizeSchemaFilename('  Schema.XSD  ')).toBe('Schema.XSD');
    expect(isSchemaFilename('dtd', 'LIBRARY.DTD')).toBe(true);
    expect(isSchemaFilename('xsd', 'Schema.XsD')).toBe(true);
    expect(isSchemaFilename('zip', 'Schemas.ZIP')).toBe(true);
    expect(isSchemaFilename('xsd', 'schema.xsd.txt')).toBe(false);
    expect(isSchemaFilename('zip', 'schema.xsd')).toBe(false);
    expect(isSchemaFilename('dtd', '   ')).toBe(false);
  });

  it('derives deterministic format-separated source options', () => {
    expect(deriveDtdImportOptions(' A+B.dtd ')).toEqual({
      projectId: 'imported-dtd:A%2BB.dtd',
      displayName: 'A+B.dtd',
      sourceFileId: 'imported-dtd-source:A%2BB.dtd',
      sourceFilename: 'A+B.dtd',
    });
    expect(deriveXsdImportOptions(' A+B.xsd ')).toEqual({
      projectId: 'imported-xsd:A%2BB.xsd',
      displayName: 'A+B.xsd',
      sourceFileId: 'imported-xsd-source:A%2BB.xsd',
      sourceFilename: 'A+B.xsd',
    });
  });
});

describe('worker-based schema file import controller', () => {
  it('retains normalized DTD lint warnings after activation until dismissed', async () => {
    const harness = createWorkerHarness();
    const activateDtd = vi.fn(applied);
    const controller = createSchemaFileImportController(
      dependencies(harness, { activateDtd }),
    );
    const filename = 'attlist-only.dtd';
    const importResult = importDtdSource(
      '<!ATTLIST book id ID #IMPLIED>',
      deriveDtdImportOptions(filename),
    );
    expect(importResult.status).toBe('success');
    if (importResult.status !== 'success') return;
    const normalized = normalizeSchemaDiagnostics(importResult.diagnostics, {
      attemptId: 'schema-import-1',
      format: 'dtd',
      attemptedFileName: filename,
    });

    const opening = controller.openDtd(readableFile(filename));
    await reachWorker();
    harness.tasks[0]!.settle({
      status: 'success',
      result: { format: 'dtd', importResult, diagnostics: normalized },
    });

    await expect(opening).resolves.toEqual({
      status: 'success',
      format: 'dtd',
      filename,
    });
    expect(activateDtd).toHaveBeenCalledOnce();
    expect(get(controller.diagnosticReport)).toBeUndefined();
    expect(get(controller.state)).toEqual({
      status: 'warning',
      format: 'dtd',
      filename,
      diagnostics: normalized,
      totalWarningCount: normalized.length,
    });
    controller.dismissWarning();
    expect(get(controller.state)).toEqual({ status: 'idle' });
  });

  it('restores an active partial-project notice after failure or cancellation', async () => {
    const harness = createWorkerHarness();
    const controller = createSchemaFileImportController(dependencies(harness));
    const filename = 'partial.xsd';
    const importResult = importXsdSource(partialXsdSource, {
      ...deriveXsdImportOptions(filename),
      standardsAccepted: true,
    });
    expect(importResult.status).toBe('success');
    if (importResult.status !== 'success') return;
    const normalized = normalizeSchemaDiagnostics(importResult.diagnostics, {
      attemptId: 'schema-import-1',
      format: 'xsd',
      attemptedFileName: filename,
    });

    const opening = controller.openXsd(
      readableFile(filename, partialXsdSource),
    );
    await reachWorker();
    harness.tasks[0]!.settle({
      status: 'success',
      result: {
        format: 'xsd',
        importResult,
        diagnostics: normalized,
        visualization: importResult.visualization,
      },
    });
    await opening;
    const partialWarning = get(controller.state);
    expect(partialWarning).toMatchObject({
      status: 'warning',
      format: 'xsd',
      visualizationSummary: {
        completeness: 'partial',
        totalFindingCount: 1,
      },
    });

    await controller.openDtd(readableFile('not-a-dtd.txt'));
    expect(get(controller.state).status).toBe('failure');
    const retainedFailure = get(controller.diagnosticReport);
    expect(retainedFailure?.attemptedFileName).toBe('not-a-dtd.txt');
    controller.dismissFailure();
    expect(get(controller.state)).toEqual(partialWarning);
    expect(get(controller.diagnosticReport)).toBe(retainedFailure);

    const cancelled = controller.openDtd(
      readableFile('cancelled.dtd', librarySource),
    );
    await reachWorker();
    expect(controller.cancel()).toBe(true);
    await cancelled;
    expect(get(controller.state)).toEqual(partialWarning);
    expect(get(controller.diagnosticReport)).toBe(retainedFailure);

    controller.dismissWarning();
    expect(get(controller.state)).toEqual({ status: 'idle' });
    expect(get(controller.diagnosticReport)).toBe(retainedFailure);
    expect(importResult.visualization.summary.completeness).toBe('partial');
  });

  it('atomically clears an old partial notice on complete replacement and external activation', async () => {
    const harness = createWorkerHarness();
    const controller = createSchemaFileImportController(dependencies(harness));
    const partial = importXsdSource(partialXsdSource, {
      ...deriveXsdImportOptions('partial.xsd'),
      standardsAccepted: true,
    });
    expect(partial.status).toBe('success');
    if (partial.status !== 'success') return;

    const first = controller.openXsd(
      readableFile('partial.xsd', partialXsdSource),
    );
    await reachWorker();
    harness.tasks[0]!.settle({
      status: 'success',
      result: {
        format: 'xsd',
        importResult: partial,
        diagnostics: normalizeSchemaDiagnostics(partial.diagnostics, {
          attemptId: 'schema-import-1',
          format: 'xsd',
          attemptedFileName: 'partial.xsd',
        }),
      },
    });
    await first;
    expect(get(controller.state).status).toBe('warning');

    const second = controller.openXsd(readableFile('complete.xsd', basicXsd));
    await reachWorker();
    harness.tasks[1]!.settle({ status: 'success', result: successFor('xsd') });
    await second;
    expect(get(controller.state)).toEqual({ status: 'idle' });

    controller.clearDiagnosticReport();
    expect(get(controller.state)).toEqual({ status: 'idle' });
  });

  it('starts idle and cannot cancel without active work', () => {
    const harness = createWorkerHarness();
    const controller = createSchemaFileImportController(dependencies(harness));
    expect(get(controller.state)).toEqual({ status: 'idle' });
    expect(controller.cancel()).toBe(false);
  });

  it.each(['dtd', 'xsd', 'zip'] as const)(
    'reads before starting a %s worker and activates only its success result',
    async (format) => {
      const harness = createWorkerHarness();
      const activateDtd = vi.fn(applied);
      const activateXsd = vi.fn(applied);
      const activatePackage = vi.fn(applied);
      const controller = createSchemaFileImportController(
        dependencies(harness, {
          activateDtd,
          activateXsd,
          activatePackage,
        }),
      );
      const opening = openFormat(controller, format);
      expect(get(controller.state)).toEqual({
        status: 'reading',
        format,
        filename: `schema.${format}`,
      });
      expect(harness.tasks).toHaveLength(0);

      await reachWorker();
      expect(harness.tasks).toHaveLength(1);
      expect(get(controller.state)).toEqual({
        status: 'processing',
        format,
        filename: `schema.${format}`,
        progress: {
          phase: 'preparing',
          format,
          filename: `schema.${format}`,
        },
      });
      harness.tasks[0]!.settle({
        status: 'success',
        result: successFor(format),
      });

      await expect(opening).resolves.toEqual({
        status: 'success',
        format,
        filename: `schema.${format}`,
      });
      expect(get(controller.state)).toEqual({ status: 'idle' });
      expect(activateDtd).toHaveBeenCalledTimes(format === 'dtd' ? 1 : 0);
      expect(activateXsd).toHaveBeenCalledTimes(format === 'xsd' ? 1 : 0);
      expect(activatePackage).toHaveBeenCalledTimes(format === 'zip' ? 1 : 0);
    },
  );

  it('builds exact deterministic worker requests after reading', async () => {
    const harness = createWorkerHarness();
    const controller = createSchemaFileImportController(dependencies(harness));
    const first = controller.openDtd(readableFile(' A+B.dtd ', librarySource));
    await reachWorker();
    expect(harness.tasks[0]!.request).toEqual({
      type: 'import',
      requestId: 'schema-import-1',
      format: 'dtd',
      filename: 'A+B.dtd',
      sourceText: librarySource,
      options: deriveDtdImportOptions('A+B.dtd'),
    });
    harness.tasks[0]!.settle({
      status: 'success',
      result: successFor('dtd'),
    });
    await first;

    const second = controller.openXsd(readableFile('schema.xsd', basicXsd));
    await reachWorker();
    expect(harness.tasks[1]!.request.requestId).toBe('schema-import-2');
    harness.tasks[1]!.settle({
      status: 'success',
      result: successFor('xsd'),
    });
    await second;
  });

  it('publishes only current worker progress', async () => {
    const harness = createWorkerHarness();
    const controller = createSchemaFileImportController(dependencies(harness));
    const opening = controller.openZip(archiveFile('schemas.zip'));
    await reachWorker();
    const progress: SchemaImportProgress = {
      phase: 'importing-package-source',
      format: 'zip',
      filename: 'schemas.zip',
      current: 2,
      total: 4,
      currentSourceFilename: 'schemas/types.xsd',
    };
    harness.tasks[0]!.progress(progress);
    expect(get(controller.state)).toEqual({
      status: 'processing',
      format: 'zip',
      filename: 'schemas.zip',
      progress,
    });
    harness.tasks[0]!.settle({
      status: 'success',
      result: successFor('zip'),
    });
    await opening;
  });

  it.each([
    'worker-unavailable',
    'worker-start-failure',
    'worker-runtime-failure',
    'worker-protocol-failure',
    'worker-message-failure',
    'worker-timeout',
  ] as const)(
    'publishes private stable %s diagnostics through the existing failure state',
    async (code: SchemaWorkerFailureCode) => {
      const harness = createWorkerHarness();
      const controller = createSchemaFileImportController(
        dependencies(harness),
      );
      const opening = controller.openXsd(readableFile('private.xsd', basicXsd));
      await reachWorker();
      harness.tasks[0]!.settle({
        status: 'failure',
        diagnostic: createSchemaWorkerFailureDiagnostic(code),
      });
      const outcome = await opening;
      expect(outcome.status).toBe('failure');
      expect(get(controller.state)).toMatchObject({
        status: 'failure',
        format: 'xsd',
        filename: 'private.xsd',
        diagnostics: [{ stage: 'worker', code }],
        presentation: { heading: 'Could not open private.xsd' },
      });
    },
  );

  it('rejects a worker result whose format does not match the request', async () => {
    const harness = createWorkerHarness();
    const controller = createSchemaFileImportController(dependencies(harness));
    const opening = controller.openDtd(
      readableFile('library.dtd', librarySource),
    );
    await reachWorker();
    harness.tasks[0]!.settle({
      status: 'success',
      result: successFor('xsd'),
    });
    await opening;
    expect(get(controller.state)).toMatchObject({
      status: 'failure',
      diagnostics: [{ code: 'worker-protocol-failure' }],
    });
  });

  it('preserves existing import diagnostics returned by a worker', async () => {
    const harness = createWorkerHarness();
    const controller = createSchemaFileImportController(dependencies(harness));
    const failure = importXsdSource(
      '<xs:schema>',
      deriveXsdImportOptions('broken.xsd'),
    );
    expect(failure.status).toBe('failure');
    const opening = controller.openXsd(
      readableFile('broken.xsd', '<xs:schema>'),
    );
    await reachWorker();
    harness.tasks[0]!.settle({
      status: 'success',
      result: {
        format: 'xsd',
        importResult: failure,
        diagnostics: normalizeSchemaDiagnostics(failure.diagnostics, {
          attemptId: 'schema-import-1',
          format: 'xsd',
          attemptedFileName: 'broken.xsd',
        }),
      },
    });
    await expect(opening).resolves.toMatchObject({ status: 'failure' });
    expect(get(controller.state)).toMatchObject({
      status: 'failure',
      diagnostics: failure.diagnostics,
    });
  });

  it.each(['dtd', 'xsd', 'zip'] as const)(
    'reports stable %s activation failure without changing through the worker',
    async (format) => {
      const harness = createWorkerHarness();
      const rejected = (): ProjectSessionReplacementResult => ({
        applied: false,
        reason: 'invalidProject',
      });
      const controller = createSchemaFileImportController(
        dependencies(harness, {
          activateDtd: rejected,
          activateXsd: rejected,
          activatePackage: rejected,
        }),
      );
      const opening = openFormat(controller, format);
      await reachWorker();
      harness.tasks[0]!.settle({
        status: 'success',
        result: successFor(format),
      });
      await opening;
      expect(get(controller.state)).toMatchObject({
        status: 'failure',
        diagnostics: [{ stage: 'file', code: 'activation-failure' }],
      });
    },
  );

  it.each(['dtd', 'xsd', 'zip'] as const)(
    'rejects an unsupported %s extension before reading or worker creation',
    async (format) => {
      const harness = createWorkerHarness();
      const readText = vi.fn();
      const readArchive = vi.fn();
      const controller = createSchemaFileImportController(
        dependencies(harness, { readText, readArchive }),
      );
      const outcome =
        format === 'zip'
          ? await controller.openZip(archiveFile('wrong.txt'))
          : await controller.open(format, readableFile('wrong.txt', 'unused'));
      expect(outcome).toMatchObject({ status: 'failure', format });
      expect(readText).not.toHaveBeenCalled();
      expect(readArchive).not.toHaveBeenCalled();
      expect(harness.start).not.toHaveBeenCalled();
    },
  );

  it.each(['dtd', 'xsd', 'zip'] as const)(
    'keeps a %s read failure on the main thread and starts no worker',
    async (format) => {
      const harness = createWorkerHarness();
      const rejected = Promise.reject(new Error('private read detail'));
      const controller = createSchemaFileImportController(
        dependencies(harness, {
          readText: () => rejected,
          readArchive: () => rejected,
        }),
      );
      await expect(openFormat(controller, format)).resolves.toMatchObject({
        status: 'failure',
        format,
      });
      expect(harness.start).not.toHaveBeenCalled();
      expect(get(controller.state)).toMatchObject({
        status: 'failure',
        diagnostics: [{ stage: 'file', code: 'read-failure' }],
      });
    },
  );

  it('cancels a pending main-thread read immediately and ignores completion', async () => {
    const harness = createWorkerHarness();
    const read = deferred<string>();
    const controller = createSchemaFileImportController(
      dependencies(harness, { readText: () => read.promise }),
    );
    const opening = controller.openDtd(readableFile('slow.dtd'));
    expect(controller.cancel()).toBe(true);
    expect(get(controller.state)).toEqual({ status: 'idle' });
    expect(controller.cancel()).toBe(false);
    read.resolve(librarySource);
    await expect(opening).resolves.toEqual({ status: 'stale' });
    expect(harness.start).not.toHaveBeenCalled();
  });

  it('cancels a processing worker immediately and ignores late progress and success', async () => {
    const harness = createWorkerHarness();
    const activateDtd = vi.fn(applied);
    const controller = createSchemaFileImportController(
      dependencies(harness, { activateDtd }),
    );
    const opening = controller.openDtd(readableFile('slow.dtd', librarySource));
    await reachWorker();
    expect(controller.cancel()).toBe(true);
    expect(harness.tasks[0]!.cancel).toHaveBeenCalledOnce();
    expect(get(controller.state)).toEqual({ status: 'idle' });
    harness.tasks[0]!.progress({
      phase: 'building',
      format: 'dtd',
      filename: 'slow.dtd',
    });
    harness.tasks[0]!.settle({
      status: 'success',
      result: successFor('dtd'),
    });
    await expect(opening).resolves.toEqual({ status: 'stale' });
    expect(get(controller.state)).toEqual({ status: 'idle' });
    expect(activateDtd).not.toHaveBeenCalled();
  });

  it('publishes activating, yields for paint, then activates exactly once', async () => {
    const harness = createWorkerHarness();
    const painted = deferred<void>();
    const activateDtd = vi.fn(applied);
    const controller = createSchemaFileImportController(
      dependencies(harness, {
        activateDtd,
        yieldToBrowser: () => painted.promise,
      }),
    );
    const opening = controller.openDtd(
      readableFile('large.dtd', librarySource),
    );
    await reachWorker();
    harness.tasks[0]!.settle({
      status: 'success',
      result: successFor('dtd'),
    });
    await reachWorker();
    expect(get(controller.state)).toMatchObject({
      status: 'processing',
      progress: { phase: 'activating' },
    });
    expect(activateDtd).not.toHaveBeenCalled();
    painted.resolve();
    await expect(opening).resolves.toMatchObject({ status: 'success' });
    expect(activateDtd).toHaveBeenCalledOnce();
  });

  it('lets cancellation during activating prevent replacement', async () => {
    const harness = createWorkerHarness();
    const painted = deferred<void>();
    const activateDtd = vi.fn(applied);
    const controller = createSchemaFileImportController(
      dependencies(harness, {
        activateDtd,
        yieldToBrowser: () => painted.promise,
      }),
    );
    const opening = controller.openDtd(
      readableFile('large.dtd', librarySource),
    );
    await reachWorker();
    harness.tasks[0]!.settle({
      status: 'success',
      result: successFor('dtd'),
    });
    await reachWorker();
    expect(controller.cancel()).toBe(true);
    painted.resolve();
    await expect(opening).resolves.toEqual({ status: 'stale' });
    expect(activateDtd).not.toHaveBeenCalled();
  });

  it.each([
    ['dtd', 'xsd'],
    ['dtd', 'zip'],
    ['xsd', 'dtd'],
    ['xsd', 'zip'],
    ['zip', 'dtd'],
    ['zip', 'xsd'],
    ['zip', 'zip'],
    ['dtd', 'dtd'],
  ] as const)(
    'supersedes %s with %s through one cancellation path',
    async (olderFormat, newerFormat) => {
      const harness = createWorkerHarness();
      const controller = createSchemaFileImportController(
        dependencies(harness),
      );
      const older = openFormat(controller, olderFormat, `old.${olderFormat}`);
      await reachWorker();
      const newer = openFormat(controller, newerFormat, `new.${newerFormat}`);
      await reachWorker();
      expect(harness.tasks[0]!.cancel).toHaveBeenCalledOnce();
      expect(harness.tasks).toHaveLength(2);
      harness.tasks[1]!.settle({
        status: 'success',
        result: successFor(newerFormat),
      });
      await expect(older).resolves.toEqual({ status: 'stale' });
      await expect(newer).resolves.toEqual({
        status: 'success',
        format: newerFormat,
        filename: `new.${newerFormat}`,
      });
    },
  );

  it('ignores an older worker failure after supersession', async () => {
    const harness = createWorkerHarness();
    const controller = createSchemaFileImportController(dependencies(harness));
    const older = controller.openXsd(readableFile('old.xsd', basicXsd));
    await reachWorker();
    const newer = controller.openDtd(readableFile('new.dtd', librarySource));
    await reachWorker();
    harness.tasks[0]!.settle({
      status: 'failure',
      diagnostic: createSchemaWorkerFailureDiagnostic('worker-runtime-failure'),
    });
    harness.tasks[1]!.settle({
      status: 'success',
      result: successFor('dtd'),
    });
    await older;
    await newer;
    expect(get(controller.state)).toEqual({ status: 'idle' });
  });

  it('accepts only C after rapid A/B/C replacement and late A/B delivery', async () => {
    const tasks: Array<{
      readonly request: SchemaImportWorkerRequest;
      readonly pending: ReturnType<
        typeof deferred<SchemaImportWorkerTaskResult>
      >;
      readonly cancel: ReturnType<typeof vi.fn>;
      readonly progress: (progress: SchemaImportProgress) => void;
    }> = [];
    const startWorkerImport: SchemaFileImportDependencies['startWorkerImport'] =
      (request, onProgress) => {
        const pending = deferred<SchemaImportWorkerTaskResult>();
        const cancel = vi.fn();
        tasks.push({ request, pending, cancel, progress: onProgress });
        return { result: pending.promise, cancel };
      };
    const activateDtd = vi.fn(applied);
    const activateXsd = vi.fn(applied);
    const activatePackage = vi.fn(applied);
    const harness = createWorkerHarness();
    const controller = createSchemaFileImportController(
      dependencies(harness, {
        startWorkerImport,
        activateDtd,
        activateXsd,
        activatePackage,
      }),
    );

    const a = controller.openDtd(readableFile('a.dtd', librarySource));
    await reachWorker();
    const b = controller.openXsd(readableFile('b.xsd', basicXsd));
    await reachWorker();
    const c = controller.openZip(archiveFile('c.zip'));
    await reachWorker();
    expect(tasks[0]!.cancel).toHaveBeenCalledOnce();
    expect(tasks[1]!.cancel).toHaveBeenCalledOnce();

    tasks[2]!.pending.resolve({
      status: 'success',
      result: successFor('zip'),
    });
    await expect(c).resolves.toMatchObject({ status: 'success' });

    tasks[1]!.progress({
      phase: 'building',
      format: 'xsd',
      filename: 'b.xsd',
    });
    tasks[1]!.pending.resolve({
      status: 'failure',
      diagnostic: createSchemaWorkerFailureDiagnostic('worker-runtime-failure'),
    });
    tasks[0]!.progress({
      phase: 'building',
      format: 'dtd',
      filename: 'a.dtd',
    });
    tasks[0]!.pending.resolve({
      status: 'success',
      result: successFor('dtd'),
    });

    await expect(b).resolves.toEqual({ status: 'stale' });
    await expect(a).resolves.toEqual({ status: 'stale' });
    expect(activateDtd).not.toHaveBeenCalled();
    expect(activateXsd).not.toHaveBeenCalled();
    expect(activatePackage).toHaveBeenCalledOnce();
    expect(get(controller.diagnosticReport)).toBeUndefined();
    expect(get(controller.state)).toEqual({ status: 'idle' });
  });

  it('replaces repeatedly across DTD, XSD, and ZIP with one activation per success', async () => {
    const harness = createWorkerHarness();
    const activateDtd = vi.fn(applied);
    const activateXsd = vi.fn(applied);
    const activatePackage = vi.fn(applied);
    const controller = createSchemaFileImportController(
      dependencies(harness, { activateDtd, activateXsd, activatePackage }),
    );
    await controller.openDtd(readableFile('retained.txt'));
    controller.dismissFailure();

    const sequence = ['dtd', 'xsd', 'zip', 'dtd', 'zip', 'xsd'] as const;
    for (const [index, format] of sequence.entries()) {
      const opening = openFormat(
        controller,
        format,
        `replacement-${index + 1}.${format}`,
      );
      await reachWorker();
      harness.tasks[index]!.settle({
        status: 'success',
        result: successFor(format),
      });
      await expect(opening).resolves.toEqual({
        status: 'success',
        format,
        filename: `replacement-${index + 1}.${format}`,
      });
      expect(get(controller.state)).toEqual({ status: 'idle' });
      expect(get(controller.diagnosticReport)).toBeUndefined();
    }

    expect(activateDtd).toHaveBeenCalledTimes(2);
    expect(activateXsd).toHaveBeenCalledTimes(2);
    expect(activatePackage).toHaveBeenCalledTimes(2);
  });

  it('destroy cancels the worker and publishes no later state', async () => {
    const harness = createWorkerHarness();
    const states: unknown[] = [];
    const controller = createSchemaFileImportController(dependencies(harness));
    controller.state.subscribe((state) => states.push(state));
    const opening = controller.openZip(archiveFile('schemas.zip'));
    await reachWorker();
    const stateCount = states.length;
    controller.destroy();
    expect(harness.tasks[0]!.cancel).toHaveBeenCalledOnce();
    await expect(opening).resolves.toEqual({ status: 'stale' });
    expect(states).toHaveLength(stateCount);
    expect(controller.cancel()).toBe(false);
  });

  it('destroys idempotently when task cancellation cleanup throws', async () => {
    const pending = deferred<SchemaImportWorkerTaskResult>();
    const cancel = vi.fn(() => {
      throw new Error('worker cleanup detail');
    });
    const harness = createWorkerHarness();
    const controller = createSchemaFileImportController(
      dependencies(harness, {
        startWorkerImport: () => ({ result: pending.promise, cancel }),
      }),
    );
    const opening = controller.openDtd(
      readableFile('destroy.dtd', librarySource),
    );
    await reachWorker();

    expect(() => controller.destroy()).not.toThrow();
    expect(() => controller.destroy()).not.toThrow();
    expect(cancel).toHaveBeenCalledOnce();
    pending.resolve({
      status: 'success',
      result: successFor('dtd'),
    });
    await expect(opening).resolves.toEqual({ status: 'stale' });
  });

  it('preserves retained report and warning state after destruction', async () => {
    const harness = createWorkerHarness();
    const controller = createSchemaFileImportController(dependencies(harness));
    await controller.openXsd(readableFile('retained.txt'));
    controller.dismissFailure();
    const retained = get(controller.diagnosticReport);
    const states: SchemaFileImportState[] = [];
    controller.state.subscribe((state) => states.push(state));

    const opening = controller.openDtd(
      readableFile('destroy-late.dtd', librarySource),
    );
    await reachWorker();
    const stateCount = states.length;
    controller.destroy();
    harness.tasks[0]!.settle({
      status: 'failure',
      diagnostic: createSchemaWorkerFailureDiagnostic('worker-runtime-failure'),
    });

    await expect(opening).resolves.toEqual({ status: 'stale' });
    expect(states).toHaveLength(stateCount);
    expect(get(controller.diagnosticReport)).toBe(retained);
  });

  it('dismisses only a current failure', async () => {
    const harness = createWorkerHarness();
    const controller = createSchemaFileImportController(dependencies(harness));
    controller.dismissFailure();
    const opening = controller.openXsd(readableFile('schema.txt'));
    await opening;
    expect(get(controller.state).status).toBe('failure');
    controller.dismissFailure();
    expect(get(controller.state)).toEqual({ status: 'idle' });
  });

  it('refuses external activation while reading or processing', async () => {
    const read = deferred<string>();
    const harness = createWorkerHarness();
    const controller = createSchemaFileImportController(
      dependencies(harness, { readText: () => read.promise }),
    );
    const opening = controller.openDtd(readableFile('pending.dtd'));

    expect(get(controller.state).status).toBe('reading');
    expect(controller.invalidateForExternalActivation()).toBe(false);
    read.resolve(librarySource);
    await reachWorker();
    expect(get(controller.state).status).toBe('processing');
    expect(controller.invalidateForExternalActivation()).toBe(false);

    expect(controller.cancel()).toBe(true);
    await expect(opening).resolves.toEqual({ status: 'stale' });
  });

  it('allows external activation from idle or failure without clearing failure prematurely', async () => {
    const harness = createWorkerHarness();
    const controller = createSchemaFileImportController(dependencies(harness));
    expect(controller.invalidateForExternalActivation()).toBe(true);

    await controller.openDtd(readableFile('wrong.txt'));
    expect(get(controller.state).status).toBe('failure');
    expect(controller.invalidateForExternalActivation()).toBe(true);
    expect(get(controller.state).status).toBe('failure');
    controller.dismissFailure();
    expect(get(controller.state)).toEqual({ status: 'idle' });
  });

  it('retains the complete normalized report independently of banner dismissal', async () => {
    const harness = createWorkerHarness();
    const controller = createSchemaFileImportController(dependencies(harness));
    const importResult: XsdImportResult = {
      status: 'failure',
      diagnostics: [
        {
          stage: 'xml',
          code: 'missing-end-tag',
          severity: 'error',
          message: 'The first complete problem message.',
          sourceId: 'internal-source',
          range: {
            sourceId: 'internal-source',
            start: { offset: 12, line: 3, column: 5 },
            end: { offset: 13, line: 3, column: 6 },
          },
        },
        {
          stage: 'xsd',
          code: 'unsupported-xsd-component',
          severity: 'warning',
          message: 'The second complete problem message.',
          sourceId: 'internal-source',
          range: {
            sourceId: 'internal-source',
            start: { offset: 20, line: 4, column: 2 },
            end: { offset: 21, line: 4, column: 3 },
          },
        },
        {
          stage: 'xml',
          code: 'unexpected-end-of-input',
          severity: 'error',
          message: 'The third complete problem message.',
          sourceId: 'internal-source',
          range: {
            sourceId: 'internal-source',
            start: { offset: 30, line: 5, column: 1 },
            end: { offset: 30, line: 5, column: 1 },
          },
        },
      ],
    };
    const opening = controller.openXsd(
      readableFile('all-problems.xsd', '<xs:schema>'),
    );
    await reachWorker();
    const normalized = normalizeSchemaDiagnostics(importResult.diagnostics, {
      attemptId: 'schema-import-1',
      format: 'xsd',
      attemptedFileName: 'all-problems.xsd',
    });
    harness.tasks[0]!.settle({
      status: 'success',
      result: { format: 'xsd', importResult, diagnostics: normalized },
    });
    await opening;

    const report = get(controller.diagnosticReport);
    expect(report?.diagnostics).toEqual(normalized);
    expect(report?.totalCount).toBe(3);
    expect(get(controller.state)).toMatchObject({
      status: 'failure',
      report,
      presentation: {
        message: expect.stringContaining('The first complete problem message.'),
        additionalProblemCount: 2,
        additionalProblemsText: '2 more problems',
      },
    });

    controller.dismissFailure();
    expect(get(controller.state)).toEqual({ status: 'idle' });
    expect(get(controller.diagnosticReport)).toBe(report);

    controller.clearDiagnosticReport();
    expect(get(controller.diagnosticReport)).toBeUndefined();
    expect(get(controller.state)).toEqual({ status: 'idle' });
  });

  it('replaces retained diagnostics on failure and clears them only after success', async () => {
    const harness = createWorkerHarness();
    const controller = createSchemaFileImportController(dependencies(harness));

    await controller.openDtd(readableFile('first.txt'));
    const firstReport = get(controller.diagnosticReport);
    expect(firstReport?.attemptedFileName).toBe('first.txt');
    controller.dismissFailure();

    await controller.openXsd(readableFile('second.txt'));
    const secondReport = get(controller.diagnosticReport);
    expect(secondReport?.attemptedFileName).toBe('second.txt');
    expect(secondReport).not.toBe(firstReport);
    controller.dismissFailure();

    const successful = controller.openDtd(
      readableFile('library.dtd', librarySource),
    );
    await reachWorker();
    harness.tasks[0]!.settle({
      status: 'success',
      result: successFor('dtd'),
    });
    await successful;
    expect(get(controller.diagnosticReport)).toBeUndefined();
  });

  it.each(['dtd', 'xsd', 'zip'] as const)(
    'clears a retained failed-import report after successful %s activation',
    async (format) => {
      const harness = createWorkerHarness();
      const controller = createSchemaFileImportController(
        dependencies(harness),
      );
      await controller.openDtd(readableFile('retained.txt'));
      controller.dismissFailure();
      expect(get(controller.diagnosticReport)?.attemptedFileName).toBe(
        'retained.txt',
      );

      const successful = openFormat(controller, format);
      await reachWorker();
      harness.tasks[0]!.settle({
        status: 'success',
        result: successFor(format),
      });
      await successful;

      expect(get(controller.diagnosticReport)).toBeUndefined();
      expect(get(controller.state)).toEqual({ status: 'idle' });
    },
  );

  it('replaces a retained unsupported-extension report with a later read failure', async () => {
    const harness = createWorkerHarness();
    const controller = createSchemaFileImportController(
      dependencies(harness, {
        readText: () => Promise.reject(new Error('private read detail')),
      }),
    );
    await controller.openDtd(readableFile('first.txt'));
    const firstReport = get(controller.diagnosticReport);
    controller.dismissFailure();

    await controller.openDtd(readableFile('unreadable.dtd'));
    const replacement = get(controller.diagnosticReport);
    expect(replacement).not.toBe(firstReport);
    expect(replacement?.attemptedFileName).toBe('unreadable.dtd');
    expect(replacement?.diagnostics).toHaveLength(1);
    expect(get(controller.state)).toMatchObject({
      status: 'failure',
      diagnostics: [{ code: 'read-failure' }],
    });
  });

  it('preserves a retained report across cancellation and stale worker settlement', async () => {
    const harness = createWorkerHarness();
    const controller = createSchemaFileImportController(dependencies(harness));
    await controller.openXsd(readableFile('retained.txt'));
    controller.dismissFailure();
    const retained = get(controller.diagnosticReport);

    const cancelled = controller.openDtd(
      readableFile('cancelled.dtd', librarySource),
    );
    await reachWorker();
    expect(controller.cancel()).toBe(true);
    await cancelled;
    expect(get(controller.diagnosticReport)).toBe(retained);

    const stale = controller.openXsd(readableFile('stale.xsd', basicXsd));
    await reachWorker();
    const current = controller.openDtd(
      readableFile('current.dtd', librarySource),
    );
    await reachWorker();
    harness.tasks[1]!.settle({
      status: 'failure',
      diagnostic: createSchemaWorkerFailureDiagnostic('worker-runtime-failure'),
    });
    await stale;
    expect(get(controller.diagnosticReport)).toBe(retained);
    expect(controller.cancel()).toBe(true);
    await current;
    expect(get(controller.diagnosticReport)).toBe(retained);
  });
});
