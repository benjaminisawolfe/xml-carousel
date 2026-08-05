import type { XercesSpikeRequest, XercesSpikeResult } from './types';
import { isWorkerResult } from './workerProtocol';

export interface SpikeWorkerLike {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  onerror: ((event: Event) => void) | null;
  postMessage(message: unknown): void;
  terminate(): void;
}

export type SpikeWorkerFactory = () => SpikeWorkerLike;

export class XercesSpikeWorkerClient {
  private worker: SpikeWorkerLike;
  private currentAttemptId: string | undefined;
  private pending:
    | {
        attemptId: string;
        resolve: (value: XercesSpikeResult) => void;
        reject: (reason: Error) => void;
      }
    | undefined;

  constructor(private readonly createWorker: SpikeWorkerFactory) {
    this.worker = this.makeWorker();
  }

  run(request: XercesSpikeRequest): Promise<XercesSpikeResult> {
    this.cancel('Superseded by a newer attempt.');
    this.currentAttemptId = request.attemptId;
    return new Promise<XercesSpikeResult>((resolve, reject) => {
      this.pending = { attemptId: request.attemptId, resolve, reject };
      this.worker.postMessage({ type: 'run', request });
    });
  }

  cancel(message = 'Attempt cancelled.'): void {
    if (this.pending) this.pending.reject(new Error(message));
    this.pending = undefined;
    this.currentAttemptId = undefined;
    this.worker.terminate();
    this.worker = this.makeWorker();
  }

  dispose(): void {
    if (this.pending) this.pending.reject(new Error('Client disposed.'));
    this.pending = undefined;
    this.worker.terminate();
  }

  private makeWorker(): SpikeWorkerLike {
    const worker = this.createWorker();
    worker.onmessage = (event) => {
      if (!isWorkerResult(event.data)) return;
      if (
        !this.pending ||
        event.data.result.attemptId !== this.currentAttemptId ||
        event.data.result.attemptId !== this.pending.attemptId
      ) {
        return;
      }
      const pending = this.pending;
      this.pending = undefined;
      pending.resolve(event.data.result);
    };
    worker.onerror = () => {
      if (!this.pending) return;
      const pending = this.pending;
      this.pending = undefined;
      pending.reject(new Error('Experimental worker failed.'));
    };
    return worker;
  }
}
