const rng = 'http://relaxng.org/ns/structure/1.0';
const fixtures = {
  valid: [
    {
      path: 'main.rng',
      bytes: `<element xmlns="${rng}" name="root"><empty/></element>`,
    },
  ],
  invalid: [
    {
      path: 'main.rng',
      bytes: `<grammar xmlns="${rng}"><start><attribute name="bad"/></start></grammar>`,
    },
  ],
  include: [
    {
      path: 'schemas/main.rng',
      bytes: `<grammar xmlns="${rng}"><include href="parts/defs.rng"/><start><ref name="root"/></start></grammar>`,
    },
    {
      path: 'schemas/parts/defs.rng',
      bytes: `<grammar xmlns="${rng}"><define name="root"><element name="root"><empty/></element></define></grammar>`,
    },
  ],
  external: [
    {
      path: 'main.rng',
      bytes: `<element xmlns="${rng}" name="root"><externalRef href="shared.rng"/></element>`,
    },
    {
      path: 'shared.rng',
      bytes: `<choice xmlns="${rng}"><empty/><text/></choice>`,
    },
  ],
  missing: [
    {
      path: 'main.rng',
      bytes: `<externalRef xmlns="${rng}" href="missing.rng"/>`,
    },
  ],
  https: [
    {
      path: 'main.rng',
      bytes: `<externalRef xmlns="${rng}" href="https://example.invalid/common.rng"/>`,
    },
  ],
  file: [
    {
      path: 'main.rng',
      bytes: `<externalRef xmlns="${rng}" href="file:///etc/passwd"/>`,
    },
  ],
};

const output = document.querySelector('#output');
const runButton = document.querySelector('#run');
let nextAttempt = 1;
const pageErrors = [];
window.addEventListener('error', (event) =>
  pageErrors.push(String(event.error ?? event.message)),
);
window.addEventListener('unhandledrejection', (event) =>
  pageErrors.push(String(event.reason)),
);

function createWorker() {
  return new Worker(new URL('./spike-worker.mjs', import.meta.url), {
    type: 'module',
  });
}

function send(worker, message) {
  return new Promise((resolve, reject) => {
    const onMessage = ({ data }) => {
      if (data.type === 'error') reject(new Error(data.message));
      else resolve(data);
      worker.removeEventListener('message', onMessage);
    };
    worker.addEventListener('message', onMessage);
    worker.postMessage(message);
  });
}

async function runCase(worker, key, entryPath = 'main.rng') {
  const attemptId = nextAttempt++;
  const message = await send(worker, {
    type: 'run',
    request: { attemptId, entryPath, files: fixtures[key] },
  });
  return message.result;
}

export async function runEvidence() {
  const started = performance.now();
  let worker = createWorker();
  const version = (await send(worker, { type: 'version' })).version;
  const scenarios = {};
  scenarios.valid = await runCase(worker, 'valid');
  scenarios.invalid = await runCase(worker, 'invalid');
  scenarios.include = await runCase(worker, 'include', 'schemas/main.rng');
  scenarios.external = await runCase(worker, 'external');
  scenarios.missing = await runCase(worker, 'missing');
  scenarios.https = await runCase(worker, 'https');
  scenarios.file = await runCase(worker, 'file');
  scenarios.validAgain = await runCase(worker, 'valid');

  let staleDelivered = false;
  worker.postMessage({
    type: 'run',
    delayMs: 500,
    request: {
      attemptId: nextAttempt++,
      entryPath: 'main.rng',
      files: fixtures.valid,
    },
  });
  worker.addEventListener(
    'message',
    () => {
      staleDelivered = true;
    },
    { once: true },
  );
  worker.terminate();
  worker = createWorker();
  scenarios.afterCancellation = await runCase(worker, 'valid');
  await new Promise((resolve) => setTimeout(resolve, 600));
  worker.terminate();

  const expected = {
    valid: 'accepted',
    invalid: 'invalid',
    include: 'accepted',
    external: 'accepted',
    missing: 'invalid',
    https: 'blocked',
    file: 'blocked',
    validAgain: 'accepted',
    afterCancellation: 'accepted',
  };
  const assertions = Object.entries(expected).map(([name, status]) => ({
    name,
    pass: scenarios[name].status === status,
    actual: scenarios[name].status,
    expected: status,
  }));
  assertions.push({
    name: 'real-version',
    pass: version === '2.15.3',
    actual: version,
    expected: '2.15.3',
  });
  assertions.push({
    name: 'stale-worker-result',
    pass: staleDelivered === false,
    actual: staleDelivered,
    expected: false,
  });
  assertions.push({
    name: 'no-horizontal-overflow',
    pass:
      document.documentElement.scrollWidth <=
      document.documentElement.clientWidth,
    actual: document.documentElement.scrollWidth,
    expected: document.documentElement.clientWidth,
  });
  const result = {
    pass: assertions.every((item) => item.pass),
    version,
    browserIdentity: navigator.userAgent,
    pageErrors: [...pageErrors],
    resourceUrls: performance
      .getEntriesByType('resource')
      .map((entry) => entry.name),
    basePath: location.pathname,
    elapsedMs: Number((performance.now() - started).toFixed(3)),
    assertions,
    scenarios,
  };
  window.__RELAX_NG_SPIKE_RESULT__ = result;
  document.documentElement.dataset.result = result.pass ? 'pass' : 'fail';
  output.textContent = JSON.stringify(result, null, 2);
  return result;
}

runButton.addEventListener('click', () =>
  runEvidence().catch((error) => {
    output.textContent = String(error?.stack ?? error);
    document.documentElement.dataset.result = 'error';
  }),
);

await runEvidence().catch((error) => {
  output.textContent = String(error?.stack ?? error);
  document.documentElement.dataset.result = 'error';
});
