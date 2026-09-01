import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const spikeRoot = resolve(here, '..');
const driverPath = resolve(spikeRoot, '.tools/geckodriver/geckodriver.exe');
const firefoxPath = 'C:\\Program Files\\Mozilla Firefox\\firefox.exe';
const driverPort = Number(process.env.XML_CAROUSEL_GECKODRIVER_PORT ?? 4458);
const driverOrigin = `http://127.0.0.1:${driverPort}`;
const harnessOrigin =
  process.env.XML_CAROUSEL_RELAX_NG_ORIGIN ?? 'http://127.0.0.1:4179';
const label = process.env.XML_CAROUSEL_RELAX_NG_EVIDENCE_LABEL ?? 'normal';
let driverError = '';

async function webdriver(path, body, method = 'POST') {
  let response;
  try {
    response = await fetch(`${driverOrigin}${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(path === '/session' ? 60000 : 30000),
    });
  } catch (error) {
    throw new Error(`${error}; geckodriver: ${driverError.trim()}`);
  }
  const json = await response.json();
  if (!response.ok || json.value?.error) throw new Error(JSON.stringify(json));
  return json.value;
}

async function waitForDriver() {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      if ((await webdriver('/status', undefined, 'GET')).ready) return;
    } catch {
      // Retry within the bounded startup interval.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`geckodriver startup timeout: ${driverError.trim()}`);
}

async function runPath(sessionId, pathname) {
  await webdriver(`/session/${sessionId}/url`, {
    url: `${harnessOrigin}${pathname}`,
  });
  const deadline = Date.now() + 30000;
  let state;
  while (Date.now() < deadline) {
    state = await webdriver(`/session/${sessionId}/execute/sync`, {
      script: 'return document.documentElement.dataset.result || null;',
      args: [],
    });
    if (state) break;
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  const text = await webdriver(`/session/${sessionId}/execute/sync`, {
    script: 'return document.getElementById("output").textContent;',
    args: [],
  });
  assert.equal(state, 'pass', text);
  const result = JSON.parse(text);
  assert.equal(result.pass, true);
  assert.deepEqual(result.pageErrors, []);
  assert.deepEqual(result.consoleErrors, []);
  assert.equal(
    result.assertions.every((assertion) => assertion.pass),
    true,
  );
  assert.equal(
    result.resourceUrls.filter((url) => !url.startsWith(`${harnessOrigin}/`))
      .length,
    0,
  );
  return result;
}

const profile = await mkdtemp(
  join(tmpdir(), 'xml-carousel-relax-ng-production-'),
);
const driver = spawn(
  driverPath,
  [
    '--allow-system-access',
    '--host',
    '127.0.0.1',
    '--port',
    String(driverPort),
  ],
  { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
);
driver.stderr.on('data', (chunk) => {
  driverError += chunk.toString();
});
let sessionId;
try {
  await waitForDriver();
  const session = await webdriver('/session', {
    capabilities: {
      alwaysMatch: {
        browserName: 'firefox',
        'moz:firefoxOptions': {
          binary: firefoxPath,
          args: ['-headless', '-no-remote', '-profile', profile],
          log: { level: 'warn' },
        },
      },
    },
  });
  sessionId = session.sessionId;
  const root = await runPath(sessionId, '/');
  const nested = await runPath(sessionId, '/xml-carousel-relax-ng-production/');
  const serverRequests = await fetch(`${harnessOrigin}/__requests`).then(
    (response) => response.json(),
  );
  assert.equal(
    serverRequests.some(({ path }) => /^https?:|^file:/iu.test(path)),
    false,
  );
  const evidence = {
    browserName: session.capabilities.browserName,
    browserVersion: session.capabilities.browserVersion,
    platformName: session.capabilities.platformName,
    geckodriverVersion: '0.37.1',
    label,
    root,
    nested,
    serverRequests,
    remoteSchemaRequests: 0,
    fileRequests: 0,
    unexpectedOrigins: 0,
  };
  await mkdir(resolve(spikeRoot, '.evidence'), { recursive: true });
  await writeFile(
    resolve(spikeRoot, `.evidence/production-firefox-${label}.json`),
    `${JSON.stringify(evidence, null, 2)}\n`,
  );
  console.log(
    `PASS Firefox ${evidence.browserVersion} production ${label}: root and nested; ${root.assertions.length + nested.assertions.length} assertions; 0 page/console/remote/file errors`,
  );
} finally {
  if (sessionId) {
    await webdriver(`/session/${sessionId}`, {}, 'DELETE').catch(() => {});
  }
  driver.kill();
  await rm(profile, { recursive: true, force: true });
}
