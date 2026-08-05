import {
  createSchemaWorkerFailureDiagnostic,
  isSchemaImportWorkerRequest,
  type SchemaImportWorkerResponse,
} from './schemaImportWorkerProtocol';
import { executeSchemaImportWorkerRequest } from './schemaImportWorkerRuntime';

interface SchemaImportWorkerScope {
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<unknown>) => void,
  ): void;
  postMessage(message: SchemaImportWorkerResponse): void;
}

const workerScope = self as unknown as SchemaImportWorkerScope;
let requestAccepted = false;
let terminalResponsePosted = false;

function requestIdFrom(value: unknown): string {
  if (
    typeof value === 'object' &&
    value !== null &&
    'requestId' in value &&
    typeof value.requestId === 'string'
  ) {
    return value.requestId;
  }
  return 'invalid-request';
}

function postTerminal(response: SchemaImportWorkerResponse): void {
  if (terminalResponsePosted) return;
  terminalResponsePosted = true;
  workerScope.postMessage(response);
}

workerScope.addEventListener('message', (event) => {
  if (requestAccepted || terminalResponsePosted) return;
  const requestId = requestIdFrom(event.data);
  if (!isSchemaImportWorkerRequest(event.data)) {
    postTerminal({
      type: 'failure',
      requestId,
      diagnostic: createSchemaWorkerFailureDiagnostic(
        'worker-protocol-failure',
      ),
    });
    return;
  }

  requestAccepted = true;
  const request = event.data;
  void executeSchemaImportWorkerRequest(request, (progress) => {
    if (terminalResponsePosted) return;
    workerScope.postMessage({ type: 'progress', requestId, progress });
  })
    .then((result) => {
      postTerminal({ type: 'success', requestId, result });
    })
    .catch(() => {
      postTerminal({
        type: 'failure',
        requestId,
        diagnostic: createSchemaWorkerFailureDiagnostic(
          'worker-runtime-failure',
        ),
      });
    });
});
