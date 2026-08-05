import { describe, expect, it } from 'vitest';
import {
  XercesSpikeWorkerClient,
  type SpikeWorkerLike,
} from '../src/workerClient';
import type { XercesSpikeRequest, XercesSpikeResult } from '../src/types';

function request(attemptId: string): XercesSpikeRequest {
  return { attemptId, format: 'xsd', entryPath: 'a.xsd', files: [] };
}

function result(attemptId: string): XercesSpikeResult {
  return {
    attemptId,
    engine: { name: 'Apache Xerces-C++', version: '3.3.0' },
    status: 'valid',
    diagnostics: [],
    metrics: { elapsedMs: 1, fileCount: 0, inputBytes: 0 },
  };
}

describe('experimental worker client', () => {
  it('terminates and recreates the worker for cancellation', async () => {
    const workers: SpikeWorkerLike[] = [];
    const terminated: SpikeWorkerLike[] = [];
    const client = new XercesSpikeWorkerClient(() => {
      const worker: SpikeWorkerLike = {
        onmessage: null,
        onerror: null,
        postMessage() {},
        terminate() {
          terminated.push(worker);
        },
      };
      workers.push(worker);
      return worker;
    });
    const pending = client.run(request('cancel-me'));
    client.cancel();
    await expect(pending).rejects.toThrow(/cancelled/u);
    expect(workers).toHaveLength(3);
    expect(terminated).toHaveLength(2);
    client.dispose();
  });

  it('rejects stale responses and accepts only the current attempt', async () => {
    const workers: SpikeWorkerLike[] = [];
    const client = new XercesSpikeWorkerClient(() => {
      const worker: SpikeWorkerLike = {
        onmessage: null,
        onerror: null,
        postMessage() {},
        terminate() {},
      };
      workers.push(worker);
      return worker;
    });
    const old = client.run(request('old'));
    const current = client.run(request('current'));
    await expect(old).rejects.toThrow(/Superseded/u);
    workers[1].onmessage?.(
      new MessageEvent('message', {
        data: { type: 'result', result: result('old') },
      }),
    );
    workers.at(-1)?.onmessage?.(
      new MessageEvent('message', {
        data: { type: 'result', result: result('current') },
      }),
    );
    await expect(current).resolves.toMatchObject({ attemptId: 'current' });
    client.dispose();
  });
});
