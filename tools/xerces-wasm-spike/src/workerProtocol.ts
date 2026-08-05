import type { XercesSpikeRequest, XercesSpikeResult } from './types';

export type XercesSpikeWorkerRequest = {
  readonly type: 'run';
  readonly request: XercesSpikeRequest;
};

export type XercesSpikeWorkerResponse =
  | { readonly type: 'ready'; readonly engineVersion: string }
  | { readonly type: 'result'; readonly result: XercesSpikeResult }
  | {
      readonly type: 'failure';
      readonly attemptId: string;
      readonly message: string;
    };

export function isWorkerResult(
  value: unknown,
): value is Extract<XercesSpikeWorkerResponse, { type: 'result' }> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    value.type === 'result' &&
    'result' in value &&
    typeof value.result === 'object' &&
    value.result !== null &&
    'attemptId' in value.result &&
    typeof value.result.attemptId === 'string'
  );
}
