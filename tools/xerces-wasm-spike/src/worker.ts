import createModule from '../dist/xerces-spike.mjs';
import { createXercesSpikeAdapter } from './adapter';
import type {
  XercesSpikeWorkerRequest,
  XercesSpikeWorkerResponse,
} from './workerProtocol';

const moduleUrl = new URL('../dist/xerces-spike.mjs', import.meta.url);
const wasmUrl = new URL('../dist/xerces-spike.wasm', import.meta.url);
const adapter = createXercesSpikeAdapter(createModule, moduleUrl, wasmUrl);

const scope = self as unknown as {
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<XercesSpikeWorkerRequest>) => void,
  ): void;
  postMessage(response: XercesSpikeWorkerResponse): void;
};

void adapter
  .then(() => scope.postMessage({ type: 'ready', engineVersion: '3.3.0' }))
  .catch((error: unknown) =>
    scope.postMessage({
      type: 'failure',
      attemptId: 'initialization',
      message:
        error instanceof Error ? error.message : 'WASM initialization failed.',
    }),
  );

scope.addEventListener('message', (event) => {
  if (event.data.type !== 'run') return;
  const request = event.data.request;
  void adapter
    .then((engine) => engine.run(request))
    .then((result) => scope.postMessage({ type: 'result', result }))
    .catch((error: unknown) =>
      scope.postMessage({
        type: 'failure',
        attemptId: request.attemptId,
        message: error instanceof Error ? error.message : 'Worker run failed.',
      }),
    );
});
