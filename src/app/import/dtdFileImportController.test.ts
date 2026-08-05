import { get } from 'svelte/store';
import { describe, expect, it, vi } from 'vitest';
import librarySource from '../../../tests/fixtures/dtd/library.dtd?raw';
import { importDtdSource, type DtdImportResult } from '../../schema/dtd';
import type { ProjectSessionReplacementResult } from '../stores/projectSession';
import {
  createDtdFileImportController,
  deriveDtdImportOptions,
  isDtdFilename,
  normalizeDtdFilename,
  type DtdFileImportDependencies,
  type DtdReadableFile,
} from './dtdFileImportController';

function readableFile(
  name: string,
  sourceText = librarySource,
): DtdReadableFile {
  return { name, text: () => Promise.resolve(sourceText) };
}

function successfulActivation(
  result: DtdImportResult,
): ProjectSessionReplacementResult {
  if (result.status === 'failure') {
    return {
      applied: false,
      reason: 'importFailure',
      importResult: result,
    };
  }

  return {
    applied: true,
    state: {
      project: result.project,
      origin: 'imported',
      sourceFilename: result.project.sourceFiles?.[0]?.filename ?? '',
      contentKindsByNodeId: result.contentKindsByNodeId,
    },
  };
}

function dependencies(
  overrides: Partial<DtdFileImportDependencies> = {},
): DtdFileImportDependencies {
  return {
    readText: (file) => file.text(),
    importSource: importDtdSource,
    activate: successfulActivation,
    ...overrides,
  };
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

describe('DTD filename and metadata helpers', () => {
  it('trims surrounding filename whitespace while preserving visible case', () => {
    expect(normalizeDtdFilename('  Library.DTD  ')).toBe('Library.DTD');
  });

  it.each([
    ['library.dtd', true],
    ['LIBRARY.DTD', true],
    ['library.DtD', true],
    ['library', false],
    ['library.xml', false],
    ['library.dtd.txt', false],
  ])('validates %s by extension as %s', (filename, expected) => {
    expect(isDtdFilename(filename)).toBe(expected);
  });

  it('derives the required deterministic metadata', () => {
    expect(deriveDtdImportOptions('library.dtd')).toEqual({
      projectId: 'imported-dtd:library.dtd',
      displayName: 'library.dtd',
      sourceFileId: 'imported-dtd-source:library.dtd',
      sourceFilename: 'library.dtd',
    });
  });

  it('keeps visible punctuation while encoding collision-resistant IDs', () => {
    expect(deriveDtdImportOptions(' A+B.dtd ')).toEqual({
      projectId: 'imported-dtd:A%2BB.dtd',
      displayName: 'A+B.dtd',
      sourceFileId: 'imported-dtd-source:A%2BB.dtd',
      sourceFilename: 'A+B.dtd',
    });
    expect(deriveDtdImportOptions('A+B.dtd').projectId).not.toBe(
      deriveDtdImportOptions('A B.dtd').projectId,
    );
  });
});

describe('browser-facing DTD file import controller', () => {
  it('reads a valid DTD, passes deterministic options, and activates it', async () => {
    const readText = vi.fn((file: DtdReadableFile) => file.text());
    const importSource = vi.fn(importDtdSource);
    const activate = vi.fn(successfulActivation);
    const controller = createDtdFileImportController(
      dependencies({ readText, importSource, activate }),
    );

    const outcome = await controller.open(readableFile(' library.dtd '));

    expect(outcome).toEqual({ status: 'success', filename: 'library.dtd' });
    expect(readText).toHaveBeenCalledOnce();
    expect(importSource).toHaveBeenCalledWith(
      librarySource,
      deriveDtdImportOptions('library.dtd'),
    );
    expect(activate).toHaveBeenCalledOnce();
    expect(get(controller.state)).toEqual({ status: 'idle' });
  });

  it('accepts an uppercase DTD extension', async () => {
    const controller = createDtdFileImportController();

    await expect(
      controller.open(readableFile('LIBRARY.DTD')),
    ).resolves.toMatchObject({ status: 'success', filename: 'LIBRARY.DTD' });
  });

  it.each(['library', 'library.xml', 'library.dtd.txt'])(
    'rejects unsupported filename %s without reading or parsing',
    async (filename) => {
      const readText = vi.fn((file: DtdReadableFile) => file.text());
      const importSource = vi.fn(importDtdSource);
      const controller = createDtdFileImportController(
        dependencies({ readText, importSource }),
      );

      const outcome = await controller.open(readableFile(filename));

      expect(outcome).toMatchObject({
        status: 'failure',
        diagnostics: [{ stage: 'file', code: 'unsupported-extension' }],
      });
      expect(readText).not.toHaveBeenCalled();
      expect(importSource).not.toHaveBeenCalled();
      expect(get(controller.state)).toMatchObject({ status: 'failure' });
    },
  );

  it('reports a rejected read without exposing its exception', async () => {
    const controller = createDtdFileImportController(
      dependencies({
        readText: () => Promise.reject(new Error('private browser detail')),
      }),
    );

    const outcome = await controller.open(readableFile('library.dtd'));

    expect(outcome).toMatchObject({
      status: 'failure',
      diagnostics: [
        {
          stage: 'file',
          code: 'read-failure',
          message: 'The selected file could not be read.',
        },
      ],
    });
    expect(JSON.stringify(outcome)).not.toContain('private browser detail');
  });

  it('reports a synchronous reader failure and returns to non-busy state', async () => {
    const controller = createDtdFileImportController(
      dependencies({
        readText: () => {
          throw new Error('reader failure');
        },
      }),
    );

    await controller.open(readableFile('library.dtd'));

    expect(get(controller.state)).toMatchObject({
      status: 'failure',
      diagnostics: [{ code: 'read-failure' }],
    });
  });

  it('preserves parser diagnostics and does not activate a malformed import', async () => {
    const activate = vi.fn(successfulActivation);
    const controller = createDtdFileImportController(
      dependencies({ activate }),
    );

    await controller.open(readableFile('broken.dtd', '<!ELEMENT broken (a,>'));

    expect(get(controller.state)).toMatchObject({
      status: 'failure',
      diagnostics: [{ stage: 'parse' }],
    });
    expect(activate).not.toHaveBeenCalled();
  });

  it('preserves builder diagnostics and does not activate an unresolved import', async () => {
    const activate = vi.fn(successfulActivation);
    const controller = createDtdFileImportController(
      dependencies({ activate }),
    );

    await controller.open(
      readableFile('unresolved.dtd', '<!ELEMENT root (missing)>'),
    );

    expect(get(controller.state)).toMatchObject({
      status: 'failure',
      diagnostics: [{ stage: 'build', code: 'unresolved-element-reference' }],
    });
    expect(activate).not.toHaveBeenCalled();
  });

  it('clears a failure when it is dismissed', async () => {
    const controller = createDtdFileImportController();
    await controller.open(readableFile('wrong.txt'));

    controller.dismissFailure();

    expect(get(controller.state)).toEqual({ status: 'idle' });
  });

  it('clears an old failure as soon as a new valid attempt begins', async () => {
    const pending = deferred<string>();
    const controller = createDtdFileImportController(
      dependencies({ readText: () => pending.promise }),
    );
    await controller.open(readableFile('wrong.txt'));

    const opening = controller.open(readableFile('library.dtd'));

    expect(get(controller.state)).toEqual({
      status: 'reading',
      filename: 'library.dtd',
    });
    pending.resolve(librarySource);
    await opening;
  });

  it('processes the same filename on consecutive selections', async () => {
    const readText = vi.fn((file: DtdReadableFile) => file.text());
    const activate = vi.fn(successfulActivation);
    const controller = createDtdFileImportController(
      dependencies({ readText, activate }),
    );
    const file = readableFile('library.dtd');

    await controller.open(file);
    await controller.open(file);

    expect(readText).toHaveBeenCalledTimes(2);
    expect(activate).toHaveBeenCalledTimes(2);
  });

  it('ignores a stale success after a newer success', async () => {
    const slow = deferred<string>();
    const fast = deferred<string>();
    const activate = vi.fn(successfulActivation);
    const readText = vi
      .fn<(file: DtdReadableFile) => Promise<string>>()
      .mockReturnValueOnce(slow.promise)
      .mockReturnValueOnce(fast.promise);
    const controller = createDtdFileImportController(
      dependencies({ readText, activate }),
    );

    const slowOpen = controller.open(readableFile('slow.dtd'));
    const fastOpen = controller.open(readableFile('fast.dtd'));
    fast.resolve(librarySource);
    await expect(fastOpen).resolves.toMatchObject({
      status: 'success',
      filename: 'fast.dtd',
    });
    slow.resolve(librarySource);
    await expect(slowOpen).resolves.toEqual({ status: 'stale' });

    expect(activate).toHaveBeenCalledOnce();
    expect(
      activate.mock.calls[0]?.[0].status === 'success'
        ? activate.mock.calls[0][0].project.displayName
        : undefined,
    ).toBe('fast.dtd');
    expect(get(controller.state)).toEqual({ status: 'idle' });
  });

  it('ignores a stale read failure after a newer success', async () => {
    const slow = deferred<string>();
    const fast = deferred<string>();
    const readText = vi
      .fn<(file: DtdReadableFile) => Promise<string>>()
      .mockReturnValueOnce(slow.promise)
      .mockReturnValueOnce(fast.promise);
    const controller = createDtdFileImportController(
      dependencies({ readText }),
    );

    const slowOpen = controller.open(readableFile('slow.dtd'));
    const fastOpen = controller.open(readableFile('fast.dtd'));
    fast.resolve(librarySource);
    await fastOpen;
    slow.reject(new Error('stale failure'));
    await expect(slowOpen).resolves.toEqual({ status: 'stale' });

    expect(get(controller.state)).toEqual({ status: 'idle' });
  });

  it('invalidates a pending completion when destroyed', async () => {
    const pending = deferred<string>();
    const activate = vi.fn(successfulActivation);
    const controller = createDtdFileImportController(
      dependencies({ readText: () => pending.promise, activate }),
    );
    const opening = controller.open(readableFile('library.dtd'));

    controller.destroy();
    pending.resolve(librarySource);

    await expect(opening).resolves.toEqual({ status: 'stale' });
    expect(activate).not.toHaveBeenCalled();
  });

  it('never retains the selected File-like object in public state', async () => {
    const file = readableFile('library.dtd');
    const controller = createDtdFileImportController();

    await controller.open(file);

    expect(get(controller.state)).toEqual({ status: 'idle' });
    expect(JSON.stringify(get(controller.state))).not.toContain('text');
    expect(Object.values(get(controller.state))).not.toContain(file);
  });

  it('turns an activation rejection into a bounded failure', async () => {
    const controller = createDtdFileImportController(
      dependencies({
        activate: () => ({
          applied: false,
          reason: 'invalidInitialFocus',
        }),
      }),
    );

    await controller.open(readableFile('library.dtd'));

    expect(get(controller.state)).toMatchObject({
      status: 'failure',
      diagnostics: [{ stage: 'file', code: 'activation-failure' }],
    });
  });

  it('converts an unexpected importer throw into safe UI information', async () => {
    const controller = createDtdFileImportController(
      dependencies({
        importSource: () => {
          throw new Error('private implementation detail');
        },
      }),
    );

    const outcome = await controller.open(readableFile('library.dtd'));

    expect(outcome).toMatchObject({
      status: 'failure',
      diagnostics: [{ code: 'worker-runtime-failure' }],
    });
    expect(JSON.stringify(outcome)).not.toContain(
      'private implementation detail',
    );
  });
});
