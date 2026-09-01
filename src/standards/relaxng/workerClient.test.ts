import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  RelaxNgValidationRequest,
  RelaxNgValidationResult,
} from './types';
import {
  createRelaxNgValidationClient,
  startRelaxNgValidation,
  type RelaxNgWorkerLike,
} from './workerClient';

const request = (attemptId: string): RelaxNgValidationRequest => ({
  attemptId,
  entryPath: 'main.rng',
  files: [{ path: 'main.rng', bytes: new Uint8Array() }],
});

const result = (attemptId: string): RelaxNgValidationResult => ({
  attemptId,
  engine: { name: 'libxml2 RELAX NG', version: '2.15.3' },
  status: 'valid',
  diagnostics: [],
  dependencyRequests: [],
  metrics: { elapsedMs: 1, fileCount: 1, inputBytes: 0 },
});

class FakeWorker implements RelaxNgWorkerLike {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  readonly terminate = vi.fn();
  readonly postMessage = vi.fn();

  respond(data: unknown): void {
    this.onmessage?.({ data } as MessageEvent<unknown>);
  }
}

afterEach(() => vi.useRealTimers());

describe('RELAX NG disposable worker client', () => {
  it('returns one matching terminal result and disposes the worker', async () => {
    const worker = new FakeWorker();
    const attempt = startRelaxNgValidation(request('valid'), () => worker);
    worker.respond({ type: 'relaxng:result', result: result('valid') });
    await expect(attempt.result).resolves.toMatchObject({
      status: 'completed',
    });
    expect(worker.postMessage).toHaveBeenCalledOnce();
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('hard-cancels and ignores a later stale result', async () => {
    const worker = new FakeWorker();
    const attempt = startRelaxNgValidation(request('cancel'), () => worker);
    attempt.cancel();
    worker.respond({ type: 'relaxng:result', result: result('cancel') });
    await expect(attempt.result).resolves.toEqual({
      status: 'cancelled',
      reason: 'cancelled',
    });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('hard-times out and disposes the worker', async () => {
    vi.useFakeTimers();
    const worker = new FakeWorker();
    const attempt = startRelaxNgValidation(
      request('timeout'),
      () => worker,
      10,
    );
    await vi.advanceTimersByTimeAsync(10);
    await expect(attempt.result).resolves.toEqual({
      status: 'failed',
      code: 'worker-timeout',
    });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('rejects stale attempt IDs and malformed results as protocol failures', async () => {
    for (const response of [
      { type: 'relaxng:result', result: result('stale') },
      { type: 'wrong' },
    ]) {
      const worker = new FakeWorker();
      const attempt = startRelaxNgValidation(request('current'), () => worker);
      worker.respond(response);
      await expect(attempt.result).resolves.toEqual({
        status: 'failed',
        code: 'protocol-failure',
      });
      expect(worker.terminate).toHaveBeenCalledOnce();
    }
  });

  it('supersedes an active attempt and creates a clean new worker', async () => {
    const allWorkers = [new FakeWorker(), new FakeWorker()];
    const availableWorkers = [...allWorkers];
    const client = createRelaxNgValidationClient(
      () => availableWorkers.shift()!,
      1000,
    );
    const first = client.validate(request('first'));
    const second = client.validate(request('second'));
    await expect(first.result).resolves.toEqual({
      status: 'cancelled',
      reason: 'superseded',
    });
    expect(allWorkers[0]!.terminate).toHaveBeenCalledOnce();
    expect(allWorkers[1]!.postMessage).toHaveBeenCalledOnce();
    second.cancel();
    await expect(second.result).resolves.toMatchObject({ status: 'cancelled' });
    expect(allWorkers[1]!.terminate).toHaveBeenCalledOnce();
  });

  it('maps worker startup and runtime errors without exposing exception text', async () => {
    const startup = startRelaxNgValidation(request('startup'), () => {
      throw new Error('secret startup details');
    });
    await expect(startup.result).resolves.toEqual({
      status: 'failed',
      code: 'worker-error',
    });

    const worker = new FakeWorker();
    const runtime = startRelaxNgValidation(request('runtime'), () => worker);
    worker.onerror?.({ message: 'secret runtime details' } as ErrorEvent);
    await expect(runtime.result).resolves.toEqual({
      status: 'failed',
      code: 'worker-error',
    });
  });
});
