import { get } from 'svelte/store';
import { describe, expect, it, vi } from 'vitest';
import { importDtdSource } from '../../schema/dtd';
import { importXsdSource } from '../../schema/xsd';
import type {
  RelaxNgValidationRequest,
  RelaxNgValidationResult,
} from '../../standards/relaxng/types';
import type {
  RelaxNgAttemptOutcome,
  RelaxNgValidationAttempt,
} from '../../standards/relaxng/workerClient';
import type { SchemaImportWorkerTask } from '../../workers/schemaImportWorkerProtocol';
import {
  createSchemaFileImportController,
  type SchemaFileImportDependencies,
  type SchemaReadableFile,
} from './schemaFileImportController';

const validSource =
  '<element xmlns="http://relaxng.org/ns/structure/1.0" name="book"><text/></element>\n';

function readableFile(
  name: string,
  sourceText = validSource,
): SchemaReadableFile {
  const bytes = new TextEncoder().encode(sourceText);
  return {
    name,
    text: () => Promise.resolve(sourceText),
    arrayBuffer: () =>
      Promise.resolve(
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ) as ArrayBuffer,
      ),
  };
}

function validationResult(
  attemptId: string,
  overrides: Partial<RelaxNgValidationResult> = {},
): RelaxNgValidationResult {
  return {
    attemptId,
    engine: { name: 'libxml2 RELAX NG', version: '2.15.3' },
    status: 'valid',
    diagnostics: [],
    dependencyRequests: [],
    metrics: { elapsedMs: 1, fileCount: 1, inputBytes: 1 },
    ...overrides,
  };
}

function completedAttempt(
  request: RelaxNgValidationRequest,
  result = validationResult(request.attemptId),
): RelaxNgValidationAttempt {
  return {
    attemptId: request.attemptId,
    result: Promise.resolve({ status: 'completed', result }),
    cancel: vi.fn(),
  };
}

function dependencies(
  overrides: Partial<SchemaFileImportDependencies> = {},
): SchemaFileImportDependencies {
  return {
    readText: (file) => file.text(),
    readArchive: (file) => file.arrayBuffer(),
    startWorkerImport: vi.fn(() => {
      throw new Error('Unexpected Xerces worker request.');
    }),
    startRelaxNgValidation: vi.fn((request) => completedAttempt(request)),
    activateDtd: vi.fn(() => {
      throw new Error('Unexpected DTD activation.');
    }),
    activateXsd: vi.fn(() => {
      throw new Error('Unexpected XSD activation.');
    }),
    activatePackage: vi.fn(() => {
      throw new Error('Unexpected ZIP activation.');
    }),
    activateRelaxNg: vi.fn((result) => ({
      applied: true as const,
      state: {
        project: result.project,
        origin: 'imported' as const,
        sourceFilename: result.project.sourceFiles![0]!.filename,
      },
    })),
    ...overrides,
  };
}

describe('standalone RNG import controller', () => {
  it('sends exact original bytes to libxml2 and activates retained source text', async () => {
    const sourceText = validSource.replace('book', 'bøøk');
    let request: RelaxNgValidationRequest | undefined;
    const activateRelaxNg = vi.fn((result) => ({
      applied: true as const,
      state: {
        project: result.project,
        origin: 'imported' as const,
        sourceFilename: 'bøøk.RNG',
      },
    }));
    const controller = createSchemaFileImportController(
      dependencies({
        startRelaxNgValidation: (current) => {
          request = current;
          return completedAttempt(current);
        },
        activateRelaxNg,
      }),
    );

    await expect(
      controller.openRng(readableFile('bøøk.RNG', sourceText)),
    ).resolves.toEqual({
      status: 'success',
      format: 'rng',
      filename: 'bøøk.RNG',
    });
    expect(Array.from(request!.files[0]!.bytes)).toEqual(
      Array.from(new TextEncoder().encode(sourceText)),
    );
    const activated = activateRelaxNg.mock.calls[0]![0];
    expect(activated.project.nodes).toHaveLength(1);
    expect(
      activated.sourceMarkupByNodeId[activated.initialFocusNodeId]!
        .fragments[0]!.text,
    ).toBe(sourceText);
    expect(get(controller.state)).toMatchObject({
      status: 'warning',
      format: 'rng',
      totalWarningCount: 1,
      visualizationSummary: { completeness: 'partial' },
    });
  });

  it('rejects Compact Syntax and other extensions before reading or starting a worker', async () => {
    const readRelaxNg = vi.fn();
    const startRelaxNgValidation = vi.fn();
    const controller = createSchemaFileImportController(
      dependencies({ readRelaxNg, startRelaxNgValidation }),
    );

    await controller.openRng(readableFile('schema.rnc'));
    expect(get(controller.state)).toMatchObject({
      status: 'failure',
      format: 'rng',
      presentation: {
        message:
          'RELAX NG Compact Syntax (.rnc) is not supported yet. Choose a .rng file.',
      },
    });
    await controller.openRng(readableFile('schema.xml'));
    expect(get(controller.state)).toMatchObject({
      status: 'failure',
      presentation: { message: 'Choose a file with a .rng extension.' },
    });
    expect(readRelaxNg).not.toHaveBeenCalled();
    expect(startRelaxNgValidation).not.toHaveBeenCalled();
  });

  it.each([
    ['invalid', 'standards-invalid', 'rng'],
    ['blocked', 'blocked-dependency', 'project'],
    ['internal-error', 'engine-internal', 'project'],
  ] as const)(
    'preserves the active project when libxml2 returns %s',
    async (status, category, source) => {
      const activateRelaxNg = vi.fn();
      const controller = createSchemaFileImportController(
        dependencies({
          activateRelaxNg,
          startRelaxNgValidation: (request) =>
            completedAttempt(
              request,
              validationResult(request.attemptId, {
                status,
                diagnostics: [
                  {
                    stage: 'standards',
                    code: `relaxng:${status}`,
                    severity: 'error',
                    message: `RELAX NG ${status}.`,
                    category,
                    source,
                    ...(status === 'invalid'
                      ? { fileName: 'broken.rng', line: 2 }
                      : {}),
                  },
                ],
              }),
            ),
        }),
      );

      await controller.openRng(readableFile('broken.rng'));
      expect(activateRelaxNg).not.toHaveBeenCalled();
      expect(get(controller.state)).toMatchObject({
        status: 'failure',
        format: 'rng',
        report: {
          diagnostics: [
            {
              category,
              source,
              ...(status === 'invalid'
                ? { fileName: 'broken.rng', line: 2 }
                : {}),
            },
          ],
        },
      });
      expect(JSON.stringify(get(controller.state))).not.toContain(
        'project:///',
      );
      expect(JSON.stringify(get(controller.state))).not.toContain('"column"');
    },
  );

  it('treats read, worker, and activation failures as ordinary retained import failures', async () => {
    const readFailure = createSchemaFileImportController(
      dependencies({ readRelaxNg: () => Promise.reject(new Error('private')) }),
    );
    await readFailure.openRng(readableFile('read.rng'));
    expect(get(readFailure.state)).toMatchObject({
      status: 'failure',
      diagnostics: [{ code: 'read-failure' }],
    });

    const workerFailure = createSchemaFileImportController(
      dependencies({
        startRelaxNgValidation: (request) => ({
          attemptId: request.attemptId,
          result: Promise.resolve({
            status: 'failed',
            code: 'protocol-failure',
          }),
          cancel: vi.fn(),
        }),
      }),
    );
    await workerFailure.openRng(readableFile('worker.rng'));
    expect(get(workerFailure.state)).toMatchObject({
      status: 'failure',
      diagnostics: [{ code: 'worker-protocol-failure' }],
    });

    const activationFailure = createSchemaFileImportController(
      dependencies({
        activateRelaxNg: vi.fn(() => ({
          applied: false as const,
          reason: 'invalidProject' as const,
          findings: [],
        })),
      }),
    );
    await activationFailure.openRng(readableFile('activation.rng'));
    expect(get(activationFailure.state)).toMatchObject({
      status: 'failure',
      diagnostics: [{ code: 'activation-failure' }],
    });
  });

  it('hard-cancels a running RNG worker and rejects its later result', async () => {
    let settle!: (outcome: RelaxNgAttemptOutcome) => void;
    const cancel = vi.fn(() =>
      settle({ status: 'cancelled', reason: 'cancelled' }),
    );
    const controller = createSchemaFileImportController(
      dependencies({
        startRelaxNgValidation: (request) => ({
          attemptId: request.attemptId,
          result: new Promise((resolve) => {
            settle = resolve;
          }),
          cancel,
        }),
      }),
    );
    const opening = controller.openRng(readableFile('cancel.rng'));
    await vi.waitFor(() => {
      expect(get(controller.state).status).toBe('processing');
    });
    expect(controller.cancel()).toBe(true);
    await expect(opening).resolves.toEqual({ status: 'stale' });
    expect(cancel).toHaveBeenCalledOnce();
    expect(get(controller.state)).toEqual({ status: 'idle' });
  });

  it('lets a newer DTD win while an older RNG read is pending', async () => {
    let resolveRng!: (value: { bytes: Uint8Array; sourceText: string }) => void;
    const dtd = importDtdSource('<!ELEMENT current EMPTY>', {
      projectId: 'current-dtd',
      displayName: 'current.dtd',
      sourceFileId: 'current-dtd-source',
      sourceFilename: 'current.dtd',
    });
    if (dtd.status === 'failure') throw new Error('Expected valid test DTD.');
    const startWorkerImport = vi.fn(
      () =>
        ({
          result: Promise.resolve({
            status: 'success',
            result: { format: 'dtd', importResult: dtd, diagnostics: [] },
          }),
          cancel: vi.fn(),
        }) satisfies SchemaImportWorkerTask,
    );
    const activateDtd = vi.fn(() => ({
      applied: true as const,
      state: {
        project: dtd.project,
        origin: 'imported' as const,
        sourceFilename: 'current.dtd',
      },
    }));
    const startRelaxNgValidation = vi.fn();
    const controller = createSchemaFileImportController(
      dependencies({
        readRelaxNg: () =>
          new Promise((resolve) => {
            resolveRng = resolve;
          }),
        startWorkerImport,
        activateDtd,
        startRelaxNgValidation,
      }),
    );

    const oldRng = controller.openRng(readableFile('old.rng'));
    const newDtd = controller.openDtd(
      readableFile('current.dtd', '<!ELEMENT current EMPTY>'),
    );
    await expect(newDtd).resolves.toMatchObject({
      status: 'success',
      format: 'dtd',
    });
    resolveRng({
      bytes: new TextEncoder().encode(validSource),
      sourceText: validSource,
    });
    await expect(oldRng).resolves.toEqual({ status: 'stale' });
    expect(startRelaxNgValidation).not.toHaveBeenCalled();
    expect(activateDtd).toHaveBeenCalledOnce();
  });

  it('lets a newer XSD cancel and supersede a running RNG worker', async () => {
    let settleRng!: (outcome: RelaxNgAttemptOutcome) => void;
    const cancelRng = vi.fn(() =>
      settleRng({ status: 'cancelled', reason: 'superseded' }),
    );
    const xsd = importXsdSource(
      '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:element name="current" type="xs:string"/></xs:schema>',
      {
        projectId: 'current-xsd',
        displayName: 'current.xsd',
        sourceFileId: 'current-xsd-source',
        sourceFilename: 'current.xsd',
      },
    );
    if (xsd.status === 'failure') throw new Error('Expected valid test XSD.');
    const activateXsd = vi.fn(() => ({
      applied: true as const,
      state: {
        project: xsd.project,
        origin: 'imported' as const,
        sourceFilename: 'current.xsd',
      },
    }));
    const controller = createSchemaFileImportController(
      dependencies({
        startRelaxNgValidation: (request) => ({
          attemptId: request.attemptId,
          result: new Promise((resolve) => {
            settleRng = resolve;
          }),
          cancel: cancelRng,
        }),
        startWorkerImport: () => ({
          result: Promise.resolve({
            status: 'success',
            result: { format: 'xsd', importResult: xsd, diagnostics: [] },
          }),
          cancel: vi.fn(),
        }),
        activateXsd,
      }),
    );

    const oldRng = controller.openRng(readableFile('old.rng'));
    await vi.waitFor(() =>
      expect(get(controller.state).status).toBe('processing'),
    );
    const newXsd = controller.openXsd(
      readableFile(
        'current.xsd',
        '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"/>',
      ),
    );
    await expect(newXsd).resolves.toMatchObject({
      status: 'success',
      format: 'xsd',
    });
    await expect(oldRng).resolves.toEqual({ status: 'stale' });
    expect(cancelRng).toHaveBeenCalledOnce();
    expect(activateXsd).toHaveBeenCalledOnce();
  });

  it.each(['dtd', 'xsd'] as const)(
    'lets a newer RNG cancel and supersede a running %s worker',
    async (format) => {
      let settleLegacy!: (
        result: SchemaImportWorkerTask['result'] extends Promise<infer T>
          ? T
          : never,
      ) => void;
      const cancelLegacy = vi.fn(() => settleLegacy({ status: 'cancelled' }));
      const activateRelaxNg = vi.fn((result) => ({
        applied: true as const,
        state: {
          project: result.project,
          origin: 'imported' as const,
          sourceFilename: 'new.rng',
        },
      }));
      const controller = createSchemaFileImportController(
        dependencies({
          startWorkerImport: () => ({
            result: new Promise((resolve) => {
              settleLegacy = resolve;
            }),
            cancel: cancelLegacy,
          }),
          activateRelaxNg,
        }),
      );

      const older =
        format === 'dtd'
          ? controller.openDtd(readableFile('old.dtd', '<!ELEMENT old EMPTY>'))
          : controller.openXsd(
              readableFile(
                'old.xsd',
                '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"/>',
              ),
            );
      await vi.waitFor(() =>
        expect(get(controller.state).status).toBe('processing'),
      );
      const newer = controller.openRng(readableFile('new.rng'));

      await expect(newer).resolves.toMatchObject({
        status: 'success',
        format: 'rng',
      });
      await expect(older).resolves.toEqual({ status: 'stale' });
      expect(cancelLegacy).toHaveBeenCalledOnce();
      expect(activateRelaxNg).toHaveBeenCalledOnce();
    },
  );

  it('lets a newer RNG supersede an older RNG attempt', async () => {
    let settleFirst!: (outcome: RelaxNgAttemptOutcome) => void;
    const cancelFirst = vi.fn(() =>
      settleFirst({ status: 'cancelled', reason: 'superseded' }),
    );
    let callCount = 0;
    const activateRelaxNg = vi.fn((result) => ({
      applied: true as const,
      state: {
        project: result.project,
        origin: 'imported' as const,
        sourceFilename: result.project.sourceFiles![0]!.filename,
      },
    }));
    const controller = createSchemaFileImportController(
      dependencies({
        startRelaxNgValidation: (request) => {
          callCount += 1;
          return callCount === 1
            ? {
                attemptId: request.attemptId,
                result: new Promise((resolve) => {
                  settleFirst = resolve;
                }),
                cancel: cancelFirst,
              }
            : completedAttempt(request);
        },
        activateRelaxNg,
      }),
    );

    const older = controller.openRng(readableFile('old.rng'));
    await vi.waitFor(() =>
      expect(get(controller.state).status).toBe('processing'),
    );
    const newer = controller.openRng(readableFile('new.rng'));
    await expect(newer).resolves.toMatchObject({ filename: 'new.rng' });
    await expect(older).resolves.toEqual({ status: 'stale' });
    expect(cancelFirst).toHaveBeenCalledOnce();
    expect(activateRelaxNg).toHaveBeenCalledOnce();
    expect(activateRelaxNg.mock.calls[0]![0].project.displayName).toBe(
      'new.rng',
    );
  });

  it('never lets a failed cross-format replacement displace the active project', async () => {
    const xsd = importXsdSource(
      '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"/>',
      {
        projectId: 'active-xsd',
        displayName: 'active.xsd',
        sourceFileId: 'active-xsd-source',
        sourceFilename: 'active.xsd',
      },
    );
    if (xsd.status === 'failure') throw new Error('Expected valid test XSD.');
    const activateXsd = vi.fn(() => ({
      applied: true as const,
      state: {
        project: xsd.project,
        origin: 'imported' as const,
        sourceFilename: 'active.xsd',
      },
    }));
    const activateRelaxNg = vi.fn((result) => ({
      applied: true as const,
      state: {
        project: result.project,
        origin: 'imported' as const,
        sourceFilename: 'active.rng',
      },
    }));
    let rngShouldFail = false;
    let xsdShouldFail = false;
    const controller = createSchemaFileImportController(
      dependencies({
        startWorkerImport: () =>
          xsdShouldFail
            ? {
                result: Promise.resolve({
                  status: 'failure',
                  diagnostic: {
                    stage: 'worker',
                    code: 'worker-runtime-failure',
                    severity: 'error',
                    message: 'XSD failed.',
                  },
                }),
                cancel: vi.fn(),
              }
            : {
                result: Promise.resolve({
                  status: 'success',
                  result: {
                    format: 'xsd',
                    importResult: xsd,
                    diagnostics: [],
                  },
                }),
                cancel: vi.fn(),
              },
        startRelaxNgValidation: (request) =>
          completedAttempt(
            request,
            validationResult(request.attemptId, {
              status: rngShouldFail ? 'invalid' : 'valid',
              diagnostics: rngShouldFail
                ? [
                    {
                      stage: 'standards',
                      code: 'relaxng:invalid',
                      severity: 'error',
                      message: 'RNG failed.',
                      category: 'standards-invalid',
                      source: 'rng',
                    },
                  ]
                : [],
            }),
          ),
        activateXsd,
        activateRelaxNg,
      }),
    );

    await expect(
      controller.openXsd(
        readableFile(
          'active.xsd',
          '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"/>',
        ),
      ),
    ).resolves.toMatchObject({ status: 'success' });
    rngShouldFail = true;
    await expect(
      controller.openRng(readableFile('failed.rng')),
    ).resolves.toMatchObject({ status: 'failure' });
    expect(activateXsd).toHaveBeenCalledOnce();
    expect(activateRelaxNg).not.toHaveBeenCalled();

    rngShouldFail = false;
    await expect(
      controller.openRng(readableFile('active.rng')),
    ).resolves.toMatchObject({ status: 'success' });
    xsdShouldFail = true;
    await expect(
      controller.openXsd(
        readableFile(
          'failed.xsd',
          '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"/>',
        ),
      ),
    ).resolves.toMatchObject({ status: 'failure' });
    expect(activateRelaxNg).toHaveBeenCalledOnce();
    expect(activateXsd).toHaveBeenCalledOnce();
  });
});
