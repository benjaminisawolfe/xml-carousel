import { STANDARDS_WORKER_LIFETIME_MS } from '../projectResources';
import type {
  RelaxNgValidationRequest,
  RelaxNgValidationResult,
} from './types';
import {
  isRelaxNgWorkerResultMessage,
  type RelaxNgWorkerRequestMessage,
} from './workerProtocol';

export interface RelaxNgWorkerLike {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: RelaxNgWorkerRequestMessage): void;
  terminate(): void;
}

export type RelaxNgAttemptOutcome =
  | { readonly status: 'completed'; readonly result: RelaxNgValidationResult }
  | {
      readonly status: 'cancelled';
      readonly reason: 'cancelled' | 'superseded';
    }
  | {
      readonly status: 'failed';
      readonly code: 'worker-timeout' | 'worker-error' | 'protocol-failure';
    };

export interface RelaxNgValidationAttempt {
  readonly attemptId: string;
  readonly result: Promise<RelaxNgAttemptOutcome>;
  cancel(reason?: 'cancelled' | 'superseded'): void;
}

export type RelaxNgWorkerFactory = () => RelaxNgWorkerLike;

export function createProductionRelaxNgWorker(): RelaxNgWorkerLike {
  return new Worker(new URL('./relaxNgStandardsWorker.ts', import.meta.url), {
    type: 'module',
    name: 'xml-carousel-relax-ng-standards',
  });
}

export function startRelaxNgValidation(
  request: RelaxNgValidationRequest,
  workerFactory: RelaxNgWorkerFactory = createProductionRelaxNgWorker,
  timeoutMs = STANDARDS_WORKER_LIFETIME_MS,
): RelaxNgValidationAttempt {
  let worker: RelaxNgWorkerLike | undefined;
  let settle: ((outcome: RelaxNgAttemptOutcome) => void) | undefined;
  let settled = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const finish = (outcome: RelaxNgAttemptOutcome) => {
    if (settled) return;
    settled = true;
    if (timeout !== undefined) clearTimeout(timeout);
    worker?.terminate();
    worker = undefined;
    settle?.(outcome);
  };

  const result = new Promise<RelaxNgAttemptOutcome>((resolve) => {
    settle = resolve;
    try {
      worker = workerFactory();
      worker.onmessage = (event) => {
        if (
          !isRelaxNgWorkerResultMessage(event.data) ||
          event.data.result.attemptId !== request.attemptId
        ) {
          finish({ status: 'failed', code: 'protocol-failure' });
          return;
        }
        finish({ status: 'completed', result: event.data.result });
      };
      worker.onerror = () => finish({ status: 'failed', code: 'worker-error' });
      timeout = setTimeout(
        () => finish({ status: 'failed', code: 'worker-timeout' }),
        timeoutMs,
      );
      worker.postMessage({ type: 'relaxng:validate', request });
    } catch {
      finish({ status: 'failed', code: 'worker-error' });
    }
  });

  return {
    attemptId: request.attemptId,
    result,
    cancel(reason = 'cancelled') {
      finish({ status: 'cancelled', reason });
    },
  };
}

export function createRelaxNgValidationClient(
  workerFactory: RelaxNgWorkerFactory = createProductionRelaxNgWorker,
  timeoutMs = STANDARDS_WORKER_LIFETIME_MS,
) {
  let active: RelaxNgValidationAttempt | undefined;
  return {
    validate(request: RelaxNgValidationRequest): RelaxNgValidationAttempt {
      active?.cancel('superseded');
      const attempt = startRelaxNgValidation(request, workerFactory, timeoutMs);
      active = attempt;
      void attempt.result.finally(() => {
        if (active === attempt) active = undefined;
      });
      return attempt;
    },
    cancel(): void {
      active?.cancel();
      active = undefined;
    },
    dispose(): void {
      active?.cancel();
      active = undefined;
    },
  };
}
