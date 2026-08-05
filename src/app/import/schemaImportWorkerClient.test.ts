import { describe, expect, it, vi } from 'vitest';
import {
  createSchemaWorkerFailureDiagnostic,
  type SchemaImportWorkerRequest,
  type SchemaImportWorkerResponse,
} from '../../workers/schemaImportWorkerProtocol';
import {
  createSchemaImportWorkerTaskStarter,
  type SchemaImportWorkerFactory,
  type SchemaImportWorkerLike,
} from './schemaImportWorkerClient';
import { importDtdSource } from '../../schema/dtd';
import { isWorkerOwnedImportResult } from './workerOwnedImportResult';
import { XERCES_WORKER_LIFETIME_MS } from '../../standards/xerces';

const dtdRequest: SchemaImportWorkerRequest = {
  type: 'import',
  requestId: 'request-dtd',
  format: 'dtd',
  filename: 'schema.dtd',
  sourceText: '<!ELEMENT schema EMPTY>',
  options: {
    projectId: 'project',
    displayName: 'Schema',
    sourceFileId: 'source',
    sourceFilename: 'schema.dtd',
  },
};

class FakeWorker implements SchemaImportWorkerLike {
  throwOnRemove = false;
  throwOnTerminate = false;
  readonly postMessage = vi.fn();
  readonly terminate = vi.fn(() => {
    if (this.throwOnTerminate) throw new Error('termination detail');
  });
  readonly addEventListener = vi.fn(
    (type: 'message' | 'error' | 'messageerror', listener: EventListener) => {
      this.listeners[type].add(listener);
    },
  );
  readonly removeEventListener = vi.fn(
    (type: 'message' | 'error' | 'messageerror', listener: EventListener) => {
      this.listeners[type].delete(listener);
      if (this.throwOnRemove) throw new Error('listener removal detail');
    },
  );
  private readonly listeners = {
    message: new Set<EventListener>(),
    error: new Set<EventListener>(),
    messageerror: new Set<EventListener>(),
  };

  emitMessage(data: unknown): void {
    const event = new MessageEvent('message', { data });
    for (const listener of this.listeners.message) listener(event);
  }

  emit(type: 'error' | 'messageerror'): void {
    const event = new Event(type);
    for (const listener of this.listeners[type]) listener(event);
  }

  listenerCount(type: keyof FakeWorker['listeners']): number {
    return this.listeners[type].size;
  }
}

function harness(worker = new FakeWorker()): {
  readonly worker: FakeWorker;
  readonly factory: SchemaImportWorkerFactory;
  readonly calls: { url?: URL; options?: WorkerOptions };
} {
  const calls: { url?: URL; options?: WorkerOptions } = {};
  const factory: SchemaImportWorkerFactory = (url, options) => {
    calls.url = url;
    calls.options = options;
    return worker;
  };
  return { worker, factory, calls };
}

function expectExactCleanup(worker: FakeWorker): void {
  expect(worker.removeEventListener).toHaveBeenCalledTimes(3);
  expect(worker.removeEventListener).toHaveBeenCalledWith(
    'message',
    expect.any(Function),
  );
  expect(worker.removeEventListener).toHaveBeenCalledWith(
    'error',
    expect.any(Function),
  );
  expect(worker.removeEventListener).toHaveBeenCalledWith(
    'messageerror',
    expect.any(Function),
  );
  expect(worker.listenerCount('message')).toBe(0);
  expect(worker.listenerCount('error')).toBe(0);
  expect(worker.listenerCount('messageerror')).toBe(0);
  expect(worker.terminate).toHaveBeenCalledOnce();
}

function success(
  requestId = dtdRequest.requestId,
  format: 'dtd' | 'xsd' | 'zip' = 'dtd',
): SchemaImportWorkerResponse {
  if (format === 'dtd') {
    return {
      type: 'success',
      requestId,
      result: {
        format,
        importResult: { status: 'failure', diagnostics: [] },
        diagnostics: [],
      },
    };
  }
  if (format === 'xsd') {
    return {
      type: 'success',
      requestId,
      result: {
        format,
        importResult: { status: 'failure', diagnostics: [] },
        diagnostics: [],
      },
    };
  }
  return {
    type: 'success',
    requestId,
    result: {
      format,
      importResult: { status: 'failure', diagnostics: [] },
      diagnostics: [],
    },
  };
}

describe('schema import worker client', () => {
  it('constructs the exact deterministic module worker and posts text without a transfer list', () => {
    const { worker, factory, calls } = harness();
    createSchemaImportWorkerTaskStarter(factory)(dtdRequest, vi.fn());
    expect(calls.url?.pathname).toContain('/workers/schemaImportWorker.ts');
    expect(calls.options).toEqual({
      type: 'module',
      name: 'xml-carousel-schema-import',
    });
    expect(worker.postMessage).toHaveBeenCalledWith(dtdRequest);
    expect(worker.listenerCount('message')).toBe(1);
    expect(worker.listenerCount('error')).toBe(1);
    expect(worker.listenerCount('messageerror')).toBe(1);
  });

  it('copies and transfers exactly one ZIP buffer while preserving the original', () => {
    const { worker, factory } = harness();
    const original = new Uint8Array([1, 2, 3, 4]).buffer;
    const before = new Uint8Array(original).slice();
    const request: SchemaImportWorkerRequest = {
      type: 'import',
      requestId: 'zip',
      format: 'zip',
      filename: 'schemas.zip',
      data: original,
    };
    createSchemaImportWorkerTaskStarter(factory)(request, vi.fn());
    const [posted, transfer] = worker.postMessage.mock.calls[0] as [
      SchemaImportWorkerRequest,
      Transferable[],
    ];
    expect(posted).not.toBe(request);
    expect(posted.format).toBe('zip');
    if (posted.format !== 'zip') throw new Error('Expected ZIP request.');
    expect(posted.data).not.toBe(original);
    expect(new Uint8Array(posted.data)).toEqual(before);
    expect(transfer).toEqual([posted.data]);
    expect(new Uint8Array(original)).toEqual(before);
  });

  it('transfers only the copied ZIP buffer when structured clone detaches it', () => {
    const worker = new FakeWorker();
    let received: SchemaImportWorkerRequest | undefined;
    worker.postMessage.mockImplementation((message, transfer) => {
      received = structuredClone(message, { transfer }) as
        SchemaImportWorkerRequest | undefined;
    });
    const { factory } = harness(worker);
    const original = new Uint8Array([5, 6, 7, 8]).buffer;
    const task = createSchemaImportWorkerTaskStarter(factory)(
      {
        type: 'import',
        requestId: 'zip-detach',
        format: 'zip',
        filename: 'schemas.zip',
        data: original,
      },
      vi.fn(),
    );
    const [posted] = worker.postMessage.mock.calls[0] as [
      SchemaImportWorkerRequest,
      Transferable[],
    ];

    expect(posted.format).toBe('zip');
    if (posted.format !== 'zip') throw new Error('Expected ZIP request.');
    expect(posted.data.byteLength).toBe(0);
    expect(original.byteLength).toBe(4);
    expect(new Uint8Array(original)).toEqual(new Uint8Array([5, 6, 7, 8]));
    expect(received?.format).toBe('zip');
    if (received?.format !== 'zip') throw new Error('Expected ZIP clone.');
    expect(new Uint8Array(received.data)).toEqual(new Uint8Array([5, 6, 7, 8]));
    task.cancel();
    expectExactCleanup(worker);
  });

  it('forwards matching progress then settles success and terminates once', async () => {
    const { worker, factory } = harness();
    const onProgress = vi.fn();
    const task = createSchemaImportWorkerTaskStarter(factory)(
      dtdRequest,
      onProgress,
    );
    worker.emitMessage({
      type: 'progress',
      requestId: dtdRequest.requestId,
      progress: {
        phase: 'parsing',
        format: 'dtd',
        filename: 'schema.dtd',
      },
    });
    expect(onProgress).toHaveBeenCalledWith({
      phase: 'parsing',
      format: 'dtd',
      filename: 'schema.dtd',
    });
    worker.emitMessage(success());
    await expect(task.result).resolves.toEqual({
      status: 'success',
      result: {
        format: 'dtd',
        importResult: { status: 'failure', diagnostics: [] },
        diagnostics: [],
      },
    });
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(worker.listenerCount('message')).toBe(0);
    expect(worker.listenerCount('error')).toBe(0);
    expect(worker.listenerCount('messageerror')).toBe(0);
  });

  it('brands only a protocol-valid successful import result as worker owned', async () => {
    const { worker, factory } = harness();
    const task = createSchemaImportWorkerTaskStarter(factory)(
      dtdRequest,
      vi.fn(),
    );
    const importResult = importDtdSource(
      '<!ELEMENT schema EMPTY>',
      dtdRequest.options,
    );
    expect(importResult.status).toBe('success');
    if (importResult.status !== 'success') return;
    worker.emitMessage({
      type: 'success',
      requestId: dtdRequest.requestId,
      result: {
        format: 'dtd',
        importResult,
        diagnostics: [],
        visualization: importResult.visualization,
      },
    });
    await expect(task.result).resolves.toMatchObject({ status: 'success' });
    expect(isWorkerOwnedImportResult(importResult)).toBe(true);

    const malformed = {};
    const second = harness();
    const malformedTask = createSchemaImportWorkerTaskStarter(second.factory)(
      dtdRequest,
      vi.fn(),
    );
    second.worker.emitMessage({
      type: 'success',
      requestId: dtdRequest.requestId,
      result: { format: 'dtd', importResult: malformed },
    });
    await expect(malformedTask.result).resolves.toMatchObject({
      status: 'failure',
    });
    expect(isWorkerOwnedImportResult(malformed)).toBe(false);
  });

  it('settles stable worker failure responses without exposing events', async () => {
    const { worker, factory } = harness();
    const task = createSchemaImportWorkerTaskStarter(factory)(
      dtdRequest,
      vi.fn(),
    );
    const diagnostic = createSchemaWorkerFailureDiagnostic(
      'worker-runtime-failure',
    );
    worker.emitMessage({
      type: 'failure',
      requestId: dtdRequest.requestId,
      diagnostic,
    });
    await expect(task.result).resolves.toEqual({
      status: 'failure',
      diagnostic,
    });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it.each([
    ['error', 'worker-runtime-failure'],
    ['messageerror', 'worker-message-failure'],
  ] as const)(
    'maps browser %s events to stable %s diagnostics',
    async (eventType, code) => {
      const { worker, factory } = harness();
      const task = createSchemaImportWorkerTaskStarter(factory)(
        dtdRequest,
        vi.fn(),
      );
      worker.emit(eventType);
      await expect(task.result).resolves.toEqual({
        status: 'failure',
        diagnostic: createSchemaWorkerFailureDiagnostic(code),
      });
      expect(worker.terminate).toHaveBeenCalledOnce();
    },
  );

  it('terminates an unresponsive worker at the fixed lifetime limit', async () => {
    vi.useFakeTimers();
    try {
      const { worker, factory } = harness();
      const task = createSchemaImportWorkerTaskStarter(factory)(
        dtdRequest,
        vi.fn(),
      );
      await vi.advanceTimersByTimeAsync(XERCES_WORKER_LIFETIME_MS);
      await expect(task.result).resolves.toEqual({
        status: 'failure',
        diagnostic: createSchemaWorkerFailureDiagnostic('worker-timeout'),
      });
      expect(worker.terminate).toHaveBeenCalledOnce();
      expect(worker.listenerCount('message')).toBe(0);
      expect(worker.listenerCount('error')).toBe(0);
      expect(worker.listenerCount('messageerror')).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    ['malformed response', { nope: true }],
    ['wrong request ID', success('other-request')],
    ['wrong result format', success(dtdRequest.requestId, 'xsd')],
    [
      'wrong progress format',
      {
        type: 'progress',
        requestId: dtdRequest.requestId,
        progress: {
          phase: 'parsing',
          format: 'xsd',
          filename: 'schema.dtd',
        },
      },
    ],
    [
      'wrong progress filename',
      {
        type: 'progress',
        requestId: dtdRequest.requestId,
        progress: {
          phase: 'parsing',
          format: 'dtd',
          filename: 'other.dtd',
        },
      },
    ],
  ])('maps %s to protocol failure', async (_label, response) => {
    const { worker, factory } = harness();
    const task = createSchemaImportWorkerTaskStarter(factory)(
      dtdRequest,
      vi.fn(),
    );
    worker.emitMessage(response);
    await expect(task.result).resolves.toEqual({
      status: 'failure',
      diagnostic: createSchemaWorkerFailureDiagnostic(
        'worker-protocol-failure',
      ),
    });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('cancels immediately, idempotently, and ignores late terminal messages', async () => {
    const { worker, factory } = harness();
    const onProgress = vi.fn();
    const task = createSchemaImportWorkerTaskStarter(factory)(
      dtdRequest,
      onProgress,
    );
    task.cancel();
    task.cancel();
    await expect(task.result).resolves.toEqual({ status: 'cancelled' });
    worker.emitMessage(success());
    worker.emit('error');
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(onProgress).not.toHaveBeenCalled();
  });

  it('settles and terminates when browser cleanup methods throw', async () => {
    const worker = new FakeWorker();
    worker.throwOnRemove = true;
    worker.throwOnTerminate = true;
    const { factory } = harness(worker);
    const task = createSchemaImportWorkerTaskStarter(factory)(
      dtdRequest,
      vi.fn(),
    );

    expect(() => task.cancel()).not.toThrow();
    await expect(task.result).resolves.toEqual({ status: 'cancelled' });
    expect(worker.removeEventListener).toHaveBeenCalledTimes(3);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('contains progress-observer and termination exceptions on success', async () => {
    const worker = new FakeWorker();
    worker.throwOnTerminate = true;
    const { factory } = harness(worker);
    const onProgress = vi.fn(() => {
      throw new Error('observer detail');
    });
    const task = createSchemaImportWorkerTaskStarter(factory)(
      dtdRequest,
      onProgress,
    );
    worker.emitMessage({
      type: 'progress',
      requestId: dtdRequest.requestId,
      progress: {
        phase: 'parsing',
        format: 'dtd',
        filename: 'schema.dtd',
      },
    });
    worker.emitMessage(success());

    await expect(task.result).resolves.toMatchObject({ status: 'success' });
    expect(onProgress).toHaveBeenCalledOnce();
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('ignores duplicate terminal messages after exact once settlement', async () => {
    const { worker, factory } = harness();
    const task = createSchemaImportWorkerTaskStarter(factory)(
      dtdRequest,
      vi.fn(),
    );
    worker.emitMessage(success());
    worker.emitMessage({
      type: 'failure',
      requestId: dtdRequest.requestId,
      diagnostic: createSchemaWorkerFailureDiagnostic('worker-runtime-failure'),
    });
    await expect(task.result).resolves.toMatchObject({ status: 'success' });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('maps constructor failure without creating an unhandled rejection', async () => {
    const starter = createSchemaImportWorkerTaskStarter(() => {
      throw new Error('private constructor detail');
    });
    const task = starter(dtdRequest, vi.fn());
    await expect(task.result).resolves.toEqual({
      status: 'failure',
      diagnostic: createSchemaWorkerFailureDiagnostic('worker-start-failure'),
    });
  });

  it('maps postMessage transfer failure and terminates the created worker', async () => {
    const worker = new FakeWorker();
    worker.postMessage.mockImplementation(() => {
      throw new DOMException('private clone detail', 'DataCloneError');
    });
    const { factory } = harness(worker);
    const task = createSchemaImportWorkerTaskStarter(factory)(
      dtdRequest,
      vi.fn(),
    );
    await expect(task.result).resolves.toEqual({
      status: 'failure',
      diagnostic: createSchemaWorkerFailureDiagnostic('worker-message-failure'),
    });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('reports unavailable when the browser has no Worker constructor', async () => {
    const previousWorker = globalThis.Worker;
    vi.stubGlobal('Worker', undefined);
    try {
      const task = createSchemaImportWorkerTaskStarter()(dtdRequest, vi.fn());
      await expect(task.result).resolves.toEqual({
        status: 'failure',
        diagnostic: createSchemaWorkerFailureDiagnostic('worker-unavailable'),
      });
    } finally {
      vi.stubGlobal('Worker', previousWorker);
    }
  });

  it.each([
    'constructor failure',
    'postMessage failure',
    'runtime error',
    'messageerror',
    'protocol failure',
    'timeout',
    'cancel',
  ] as const)('restarts successfully after %s', async (failure) => {
    vi.useFakeTimers();
    try {
      const first = new FakeWorker();
      const second = new FakeWorker();
      if (failure === 'postMessage failure') {
        first.postMessage.mockImplementation(() => {
          throw new DOMException('clone detail', 'DataCloneError');
        });
      }
      let calls = 0;
      const factory: SchemaImportWorkerFactory = () => {
        calls += 1;
        if (failure === 'constructor failure' && calls === 1) {
          throw new Error('constructor detail');
        }
        return failure === 'constructor failure'
          ? second
          : calls === 1
            ? first
            : second;
      };
      const starter = createSchemaImportWorkerTaskStarter(factory);
      const firstTask = starter(dtdRequest, vi.fn());

      if (failure === 'runtime error') first.emit('error');
      if (failure === 'messageerror') first.emit('messageerror');
      if (failure === 'protocol failure') first.emitMessage({ invalid: true });
      if (failure === 'timeout') {
        await vi.advanceTimersByTimeAsync(XERCES_WORKER_LIFETIME_MS);
      }
      if (failure === 'cancel') firstTask.cancel();
      await expect(firstTask.result).resolves.toMatchObject(
        failure === 'cancel' ? { status: 'cancelled' } : { status: 'failure' },
      );

      const progress = vi.fn();
      const restarted = starter(
        { ...dtdRequest, requestId: `restart-${failure}` },
        progress,
      );
      second.emitMessage({
        type: 'progress',
        requestId: `restart-${failure}`,
        progress: {
          phase: 'parsing',
          format: 'dtd',
          filename: 'schema.dtd',
        },
      });
      second.emitMessage(success(`restart-${failure}`));

      await expect(restarted.result).resolves.toMatchObject({
        status: 'success',
      });
      expect(progress).toHaveBeenCalledOnce();
      if (failure !== 'constructor failure') expectExactCleanup(first);
      expectExactCleanup(second);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
