import {
  createRelaxNgValidationClient,
  type RelaxNgAttemptOutcome,
} from '../../../src/standards/relaxng/workerClient';
import type { RelaxNgProjectFile } from '../../../src/standards/relaxng/types';

const namespace = 'http://relaxng.org/ns/structure/1.0';
const encoder = new TextEncoder();
const output = document.querySelector<HTMLPreElement>('#output')!;
const pageErrors: string[] = [];
const consoleErrors: string[] = [];
const originalConsoleError = console.error;
console.error = (...values: unknown[]) => {
  consoleErrors.push(values.map(String).join(' '));
  originalConsoleError(...values);
};
window.addEventListener('error', (event) => pageErrors.push(event.message));
window.addEventListener('unhandledrejection', (event) =>
  pageErrors.push(String(event.reason)),
);

function files(
  entries: ReadonlyArray<readonly [string, string]>,
): RelaxNgProjectFile[] {
  return entries.map(([path, source]) => ({
    path,
    bytes: encoder.encode(source),
  }));
}

const fixtures = {
  valid: files([
    [
      'main.rng',
      `<element xmlns="${namespace}" name="root"><empty/></element>`,
    ],
  ]),
  invalid: files([
    [
      'main.rng',
      `<grammar xmlns="${namespace}"><start><attribute name="bad"/></start></grammar>`,
    ],
  ]),
  include: files([
    [
      'schemas/main.rng',
      `<grammar xmlns="${namespace}"><include href="parts/defs.rng"/><start><ref name="root"/></start></grammar>`,
    ],
    [
      'schemas/parts/defs.rng',
      `<grammar xmlns="${namespace}"><define name="root"><element name="root"><empty/></element></define></grammar>`,
    ],
  ]),
  external: files([
    [
      'main.rng',
      `<element xmlns="${namespace}" name="root"><externalRef href="shared.rng"/></element>`,
    ],
    ['shared.rng', `<choice xmlns="${namespace}"><empty/><text/></choice>`],
  ]),
  missing: files([
    ['main.rng', `<externalRef xmlns="${namespace}" href="missing.rng"/>`],
  ]),
  https: files([
    [
      'main.rng',
      `<externalRef xmlns="${namespace}" href="https://example.invalid/common.rng"/>`,
    ],
  ]),
  file: files([
    [
      'main.rng',
      `<externalRef xmlns="${namespace}" href="file:///etc/passwd"/>`,
    ],
  ]),
} as const;

let attempt = 0;
async function run(
  key: keyof typeof fixtures,
  entryPath = 'main.rng',
): Promise<RelaxNgAttemptOutcome> {
  const client = createRelaxNgValidationClient();
  const operation = client.validate({
    attemptId: `browser-${++attempt}`,
    entryPath,
    files: fixtures[key],
  });
  const result = await operation.result;
  client.dispose();
  return result;
}

async function runEvidence() {
  const scenarios = {
    valid: await run('valid'),
    invalid: await run('invalid'),
    include: await run('include', 'schemas/main.rng'),
    external: await run('external'),
    missing: await run('missing'),
    https: await run('https'),
    file: await run('file'),
    validAfterInvalid: await run('valid'),
  };

  const cancellationClient = createRelaxNgValidationClient();
  const cancelledAttempt = cancellationClient.validate({
    attemptId: `browser-${++attempt}`,
    entryPath: 'main.rng',
    files: fixtures.valid,
  });
  cancelledAttempt.cancel();
  const cancellation = await cancelledAttempt.result;
  cancellationClient.dispose();

  const supersessionClient = createRelaxNgValidationClient();
  const staleAttempt = supersessionClient.validate({
    attemptId: `browser-${++attempt}`,
    entryPath: 'main.rng',
    files: fixtures.valid,
  });
  const currentAttempt = supersessionClient.validate({
    attemptId: `browser-${++attempt}`,
    entryPath: 'main.rng',
    files: fixtures.valid,
  });
  const staleSuppression = await staleAttempt.result;
  const workerRecreation = await currentAttempt.result;
  supersessionClient.dispose();

  const expected: Record<string, string> = {
    valid: 'valid',
    invalid: 'invalid',
    include: 'valid',
    external: 'valid',
    missing: 'blocked',
    https: 'blocked',
    file: 'blocked',
    validAfterInvalid: 'valid',
  };
  const assertions = Object.entries(scenarios).map(([name, outcome]) => ({
    name,
    pass:
      outcome.status === 'completed' &&
      outcome.result.status === expected[name],
    actual:
      outcome.status === 'completed' ? outcome.result.status : outcome.status,
    expected: expected[name],
  }));
  assertions.push(
    {
      name: 'real-libxml2-identity',
      pass:
        scenarios.valid.status === 'completed' &&
        scenarios.valid.result.engine.version === '2.15.3',
      actual:
        scenarios.valid.status === 'completed'
          ? scenarios.valid.result.engine.version
          : scenarios.valid.status,
      expected: '2.15.3',
    },
    {
      name: 'hard-cancellation',
      pass: cancellation.status === 'cancelled',
      actual: cancellation.status,
      expected: 'cancelled',
    },
    {
      name: 'stale-suppression',
      pass:
        staleSuppression.status === 'cancelled' &&
        staleSuppression.reason === 'superseded',
      actual:
        staleSuppression.status === 'cancelled'
          ? staleSuppression.reason
          : staleSuppression.status,
      expected: 'superseded',
    },
    {
      name: 'worker-recreation',
      pass:
        workerRecreation.status === 'completed' &&
        workerRecreation.result.status === 'valid',
      actual:
        workerRecreation.status === 'completed'
          ? workerRecreation.result.status
          : workerRecreation.status,
      expected: 'valid',
    },
  );

  const evidence = {
    pass:
      assertions.every((assertion) => assertion.pass) &&
      pageErrors.length === 0 &&
      consoleErrors.length === 0,
    browserIdentity: navigator.userAgent,
    basePath: location.pathname,
    pageErrors,
    consoleErrors,
    resourceUrls: performance
      .getEntriesByType('resource')
      .map((entry) => entry.name),
    assertions,
    scenarios,
    cancellation,
    staleSuppression,
    workerRecreation,
  };
  document.documentElement.dataset.result = evidence.pass ? 'pass' : 'fail';
  output.textContent = JSON.stringify(evidence, null, 2);
}

void runEvidence().catch((error: unknown) => {
  pageErrors.push('Production RELAX NG harness failed safely.');
  output.textContent =
    error instanceof Error ? error.message : 'Unknown failure';
  document.documentElement.dataset.result = 'error';
});
