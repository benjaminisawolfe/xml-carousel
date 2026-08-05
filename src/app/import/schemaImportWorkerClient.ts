import {
  createSchemaWorkerFailureDiagnostic,
  isSchemaImportWorkerResponse,
  type SchemaImportProgress,
  type SchemaImportWorkerRequest,
  type SchemaImportWorkerTask,
  type SchemaImportWorkerTaskResult,
} from '../../workers/schemaImportWorkerProtocol';
import { markWorkerOwnedImportResult } from './workerOwnedImportResult';
import { XERCES_WORKER_LIFETIME_MS } from '../../standards/xerces';

export interface SchemaImportWorkerLike {
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<unknown>) => void,
  ): void;
  addEventListener(
    type: 'error' | 'messageerror',
    listener: (event: Event) => void,
  ): void;
  removeEventListener(
    type: 'message',
    listener: (event: MessageEvent<unknown>) => void,
  ): void;
  removeEventListener(
    type: 'error' | 'messageerror',
    listener: (event: Event) => void,
  ): void;
  postMessage(message: unknown, transfer?: Transferable[]): void;
  terminate(): void;
}

export type SchemaImportWorkerFactory = (
  url: URL,
  options: WorkerOptions,
) => SchemaImportWorkerLike;

export type StartSchemaImportWorkerTask = (
  request: SchemaImportWorkerRequest,
  onProgress: (progress: SchemaImportProgress) => void,
) => SchemaImportWorkerTask;

function terminalTask(
  result: SchemaImportWorkerTaskResult,
): SchemaImportWorkerTask {
  return {
    result: Promise.resolve(result),
    cancel() {},
  };
}

function unavailableTask(): SchemaImportWorkerTask {
  return terminalTask({
    status: 'failure',
    diagnostic: createSchemaWorkerFailureDiagnostic('worker-unavailable'),
  });
}

export function createSchemaImportWorkerTaskStarter(
  workerFactory?: SchemaImportWorkerFactory,
): StartSchemaImportWorkerTask {
  return (request, onProgress) => {
    if (workerFactory === undefined && typeof Worker === 'undefined') {
      return unavailableTask();
    }

    let createdWorker: SchemaImportWorkerLike;
    try {
      createdWorker = workerFactory
        ? workerFactory(
            new URL('../../workers/schemaImportWorker.ts', import.meta.url),
            { type: 'module', name: 'xml-carousel-schema-import' },
          )
        : new Worker(
            new URL('../../workers/schemaImportWorker.ts', import.meta.url),
            {
              type: 'module',
              name: 'xml-carousel-schema-import',
            },
          );
    } catch {
      return terminalTask({
        status: 'failure',
        diagnostic: createSchemaWorkerFailureDiagnostic('worker-start-failure'),
      });
    }

    const { requestId, format, filename } = request;
    let settled = false;
    let terminated = false;
    let activeWorker: SchemaImportWorkerLike | undefined = createdWorker;
    let progressObserver:
      ((progress: SchemaImportProgress) => void) | undefined = onProgress;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let resolveResult:
      ((result: SchemaImportWorkerTaskResult) => void) | undefined;
    const result = new Promise<SchemaImportWorkerTaskResult>((resolve) => {
      resolveResult = resolve;
    });

    const terminate = (): void => {
      if (terminated) return;
      terminated = true;
      const worker = activeWorker;
      activeWorker = undefined;
      try {
        worker?.terminate();
      } catch {
        // Termination is best-effort after the task has become unreachable.
      }
    };

    const cleanup = (): void => {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
        timeoutId = undefined;
      }
      const worker = activeWorker;
      if (!worker) return;
      try {
        worker.removeEventListener('message', handleMessage);
      } catch {
        // A browser cleanup exception cannot prevent terminal settlement.
      }
      try {
        worker.removeEventListener('error', handleError);
      } catch {
        // A browser cleanup exception cannot prevent terminal settlement.
      }
      try {
        worker.removeEventListener('messageerror', handleMessageError);
      } catch {
        // A browser cleanup exception cannot prevent terminal settlement.
      }
    };

    const settle = (terminal: SchemaImportWorkerTaskResult): void => {
      if (settled) return;
      settled = true;
      cleanup();
      terminate();
      progressObserver = undefined;
      const resolve = resolveResult;
      resolveResult = undefined;
      resolve?.(terminal);
    };

    function protocolFailure(): void {
      settle({
        status: 'failure',
        diagnostic: createSchemaWorkerFailureDiagnostic(
          'worker-protocol-failure',
        ),
      });
    }

    function handleMessage(event: MessageEvent<unknown>): void {
      if (settled) return;
      if (!isSchemaImportWorkerResponse(event.data)) {
        protocolFailure();
        return;
      }
      const response = event.data;
      if (response.requestId !== requestId) {
        protocolFailure();
        return;
      }
      if (response.type === 'progress') {
        if (
          response.progress.format !== format ||
          response.progress.filename !== filename
        ) {
          protocolFailure();
          return;
        }
        try {
          progressObserver?.(response.progress);
        } catch {
          // UI progress observers cannot change worker task settlement.
        }
        return;
      }
      if (response.type === 'failure') {
        settle({ status: 'failure', diagnostic: response.diagnostic });
        return;
      }
      if (response.result.format !== format) {
        protocolFailure();
        return;
      }
      if (response.result.importResult.status === 'success') {
        markWorkerOwnedImportResult(response.result.importResult);
      }
      settle({ status: 'success', result: response.result });
    }

    function handleError(): void {
      settle({
        status: 'failure',
        diagnostic: createSchemaWorkerFailureDiagnostic(
          'worker-runtime-failure',
        ),
      });
    }

    function handleMessageError(): void {
      settle({
        status: 'failure',
        diagnostic: createSchemaWorkerFailureDiagnostic(
          'worker-message-failure',
        ),
      });
    }

    createdWorker.addEventListener('message', handleMessage);
    createdWorker.addEventListener('error', handleError);
    createdWorker.addEventListener('messageerror', handleMessageError);
    timeoutId = setTimeout(() => {
      settle({
        status: 'failure',
        diagnostic: createSchemaWorkerFailureDiagnostic('worker-timeout'),
      });
    }, XERCES_WORKER_LIFETIME_MS);

    try {
      if (request.format === 'zip') {
        const data = request.data.slice(0);
        createdWorker.postMessage({ ...request, data }, [data]);
      } else {
        createdWorker.postMessage(request);
      }
    } catch {
      settle({
        status: 'failure',
        diagnostic: createSchemaWorkerFailureDiagnostic(
          'worker-message-failure',
        ),
      });
    }

    return {
      result,
      cancel() {
        settle({ status: 'cancelled' });
      },
    };
  };
}

export const startSchemaImportWorkerTask =
  createSchemaImportWorkerTaskStarter();
