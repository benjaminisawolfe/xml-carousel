import { describe, expect, it } from 'vitest';
import {
  isRelaxNgWorkerRequestMessage,
  isRelaxNgWorkerResultMessage,
} from './workerProtocol';

describe('RELAX NG worker protocol', () => {
  it('accepts only the narrow request shape', () => {
    expect(
      isRelaxNgWorkerRequestMessage({
        type: 'relaxng:validate',
        request: {
          attemptId: 'a',
          entryPath: 'main.rng',
          files: [{ path: 'main.rng', bytes: new Uint8Array() }],
        },
      }),
    ).toBe(true);
    expect(isRelaxNgWorkerRequestMessage({ type: 'relaxng:validate' })).toBe(
      false,
    );
    expect(
      isRelaxNgWorkerRequestMessage({
        type: 'relaxng:validate',
        request: { attemptId: '', entryPath: 'main.rng', files: [] },
      }),
    ).toBe(false);
  });

  it('rejects malformed and wrong-engine terminal results', () => {
    const valid = {
      type: 'relaxng:result',
      result: {
        attemptId: 'a',
        engine: { name: 'libxml2 RELAX NG', version: '2.15.3' },
        status: 'valid',
        diagnostics: [],
        dependencyRequests: [],
        metrics: { elapsedMs: 1, fileCount: 1, inputBytes: 10 },
      },
    };
    expect(isRelaxNgWorkerResultMessage(valid)).toBe(true);
    expect(
      isRelaxNgWorkerResultMessage({
        ...valid,
        result: {
          ...valid.result,
          engine: { name: 'other', version: '2.15.3' },
        },
      }),
    ).toBe(false);
  });
});
