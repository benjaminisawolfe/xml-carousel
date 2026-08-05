import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { startHostileMimeServer } from './hostile-mime-build-server.mjs';

const DEFAULT_TIMEOUT_MS = 60_000;
const INPUTS = {
  dtd: path.resolve('tests/fixtures/dtd/library.dtd'),
  xsd: path.resolve('tests/fixtures/xsd/attributes.xsd'),
  zip: path.resolve('tests/fixtures/zip/valid-xsd-include.zip'),
  invalid: path.resolve('tests/fixtures/dtd/broken.dtd'),
  cancellation: path.resolve('tests/fixtures/dtd/large-40000.dtd'),
};

function parseArguments(argv) {
  const options = {
    browser: undefined,
    browserPath: undefined,
    geckodriverPath: undefined,
    hermeticPath: undefined,
    outputPath: undefined,
    mixedCycles: 30,
    hermeticCycles: 10,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const [rawName, inlineValue] = argument.split('=', 2);
    const name = rawName.replace(/^--/u, '');
    const value = inlineValue ?? argv[(index += 1)];
    if (name === 'browser') options.browser = value;
    else if (name === 'browser-path') options.browserPath = value;
    else if (name === 'geckodriver-path') options.geckodriverPath = value;
    else if (name === 'hermetic-path') options.hermeticPath = value;
    else if (name === 'output') options.outputPath = value;
    else if (name === 'mixed-cycles') options.mixedCycles = Number(value);
    else if (name === 'hermetic-cycles') options.hermeticCycles = Number(value);
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!['chrome', 'edge', 'firefox'].includes(options.browser)) {
    throw new Error('--browser must be chrome, edge, or firefox.');
  }
  if (!options.browserPath) throw new Error('--browser-path is required.');
  if (options.browser === 'firefox' && !options.geckodriverPath) {
    throw new Error('--geckodriver-path is required for Firefox.');
  }
  if (!options.hermeticPath) throw new Error('--hermetic-path is required.');
  if (!options.outputPath) throw new Error('--output is required.');
  for (const [name, value] of [
    ['--mixed-cycles', options.mixedCycles],
    ['--hermetic-cycles', options.hermeticCycles],
  ]) {
    if (!Number.isInteger(value) || value < 1) {
      throw new Error(`${name} must be a positive integer.`);
    }
  }
  return options;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitUntil(
  operation,
  description,
  timeoutMs = DEFAULT_TIMEOUT_MS,
) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const result = await operation();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await delay(25);
  }
  throw new Error(
    `${description} did not complete within ${timeoutMs} ms${
      lastError instanceof Error ? `: ${lastError.message}` : ''
    }.`,
  );
}

class CdpConnection {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Set();
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id !== undefined) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result ?? {});
        return;
      }
      for (const listener of this.listeners) listener(message);
    });
    socket.addEventListener('close', () => {
      for (const { reject } of this.pending.values()) {
        reject(new Error('The browser debugging connection closed.'));
      }
      this.pending.clear();
    });
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });
    return new CdpConnection(socket);
  }

  onMessage(listener) {
    this.listeners.add(listener);
  }

  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    const message = { id, method, params, ...(sessionId ? { sessionId } : {}) };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify(message));
    });
  }

  close() {
    this.socket.close();
  }
}

class ChromiumDriver {
  constructor({ process, profileDirectory, connection, sessionId, targetId }) {
    this.process = process;
    this.profileDirectory = profileDirectory;
    this.connection = connection;
    this.sessionId = sessionId;
    this.targetId = targetId;
    this.consoleEntries = [];
    this.pageErrors = [];
    this.requests = [];
    connection.onMessage((message) => {
      if (message.method === 'Runtime.consoleAPICalled') {
        this.consoleEntries.push({
          type: message.params.type,
          text: message.params.args
            .map((argument) => argument.value ?? argument.description ?? '')
            .join(' '),
        });
      } else if (message.method === 'Runtime.exceptionThrown') {
        this.pageErrors.push(
          message.params.exceptionDetails?.exception?.description ??
            message.params.exceptionDetails?.text ??
            'Unknown page exception',
        );
      } else if (message.method === 'Network.requestWillBeSent') {
        this.requests.push(message.params.request.url);
      }
    });
  }

  static async launch(executablePath) {
    const profileDirectory = await mkdtemp(
      path.join(os.tmpdir(), 'xml-carousel-chromium-'),
    );
    const child = spawn(
      executablePath,
      [
        '--headless=new',
        '--remote-debugging-port=0',
        `--user-data-dir=${profileDirectory}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-background-networking',
        '--disable-component-update',
        '--disable-sync',
        '--enable-precise-memory-info',
        '--js-flags=--expose-gc',
        'about:blank',
      ],
      { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true },
    );
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    const portFile = path.join(profileDirectory, 'DevToolsActivePort');
    const port = await waitUntil(async () => {
      try {
        const [value] = (await readFile(portFile, 'utf8')).split(/\r?\n/u);
        return Number(value);
      } catch {
        if (child.exitCode !== null) {
          throw new Error(`Chromium exited early: ${stderr.trim()}`);
        }
        return undefined;
      }
    }, 'Chromium remote debugging startup');
    const version = await fetch(`http://127.0.0.1:${port}/json/version`).then(
      (response) => response.json(),
    );
    const connection = await CdpConnection.connect(
      version.webSocketDebuggerUrl,
    );
    await connection.send('Target.setDiscoverTargets', { discover: true });
    const { targetId } = await connection.send('Target.createTarget', {
      url: 'about:blank',
    });
    const { sessionId } = await connection.send('Target.attachToTarget', {
      targetId,
      flatten: true,
    });
    const driver = new ChromiumDriver({
      process: child,
      profileDirectory,
      connection,
      sessionId,
      targetId,
    });
    await Promise.all([
      connection.send('Page.enable', {}, sessionId),
      connection.send('Runtime.enable', {}, sessionId),
      connection.send('Network.enable', {}, sessionId),
      connection.send('Performance.enable', {}, sessionId),
    ]);
    return { driver, version: version.Browser };
  }

  send(method, params = {}) {
    return this.connection.send(method, params, this.sessionId);
  }

  async evaluate(expression) {
    const response = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (response.exceptionDetails) {
      throw new Error(
        response.exceptionDetails.exception?.description ??
          response.exceptionDetails.text,
      );
    }
    return response.result?.value;
  }

  async navigate(url) {
    await this.send('Page.navigate', { url });
    await waitUntil(
      () => this.evaluate('document.readyState === "complete"'),
      `navigation to ${url}`,
    );
  }

  async setViewport(width, height, mobile = false) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile,
    });
    await this.send('Emulation.setTouchEmulationEnabled', {
      enabled: mobile,
      maxTouchPoints: mobile ? 5 : 1,
    });
  }

  async setReducedMotion() {
    await this.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    });
  }

  async setFile(selector, filePath) {
    const { root } = await this.send('DOM.getDocument', {
      depth: -1,
      pierce: true,
    });
    const { nodeId } = await this.send('DOM.querySelector', {
      nodeId: root.nodeId,
      selector,
    });
    if (!nodeId) throw new Error(`File input not found: ${selector}`);
    await this.send('DOM.setFileInputFiles', {
      nodeId,
      files: [filePath],
    });
  }

  async click(selector) {
    const clicked = await this.evaluate(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!(element instanceof HTMLElement)) return false;
      element.click();
      return true;
    })()`);
    if (!clicked) throw new Error(`Clickable element not found: ${selector}`);
  }

  async pressKey(key) {
    const descriptor =
      key === 'Enter'
        ? { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }
        : { key: ' ', code: 'Space', windowsVirtualKeyCode: 32 };
    await this.send('Input.dispatchKeyEvent', {
      type: key === 'Enter' ? 'rawKeyDown' : 'keyDown',
      ...descriptor,
    });
    if (key === 'Enter') {
      await this.send('Input.dispatchKeyEvent', {
        type: 'char',
        ...descriptor,
        text: '\r',
        unmodifiedText: '\r',
      });
    }
    await this.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      ...descriptor,
    });
  }

  async collectGarbage() {
    await this.send('HeapProfiler.collectGarbage');
  }

  async sample(cycle, kind) {
    await this.collectGarbage();
    await this.evaluate(
      'new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
    );
    const metrics = await this.send('Performance.getMetrics');
    const heap = metrics.metrics.find(
      ({ name }) => name === 'JSHeapUsedSize',
    )?.value;
    const counters = await this.send('Memory.getDOMCounters');
    const { targetInfos } = await this.connection.send('Target.getTargets');
    const workerTargets = targetInfos
      .filter(({ type }) => type === 'worker')
      .map(({ targetId, url, attached }) => ({ targetId, url, attached }));
    const pageState = await this.evaluate(`(() => ({
      project: document.querySelector('.project-name strong')?.textContent?.trim() ?? '',
      elements: document.getElementsByTagName('*').length,
      retainedProblems: Number((document.querySelector('[aria-label^="Open retained problem report"]')?.getAttribute('aria-label')?.match(/, (\\d+) problem/) ?? [])[1] ?? 0),
      focusIsHeading: document.activeElement?.matches?.('[data-focus-card-heading]') ?? false,
      importPhase: document.querySelector('.app-shell')?.getAttribute('data-schema-import-phase') ?? null,
    }))()`);
    return {
      cycle,
      kind,
      usedHeapBytes: heap,
      documents: counters.documents,
      domNodes: counters.nodes,
      eventListeners: counters.jsEventListeners,
      liveWorkers: workerTargets.length,
      workerTargets,
      ...pageState,
    };
  }

  async close() {
    try {
      await this.connection.send('Target.closeTarget', {
        targetId: this.targetId,
      });
    } catch {
      // The process shutdown below remains authoritative.
    }
    this.connection.close();
    if (this.process.exitCode === null) this.process.kill();
    await waitUntil(
      () => this.process.exitCode !== null,
      'Chromium process shutdown',
      10_000,
    ).catch(() => undefined);
    await rm(this.profileDirectory, { recursive: true, force: true });
  }
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen({ host: '127.0.0.1', port: 0 }, resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No free port.');
  await new Promise((resolve) => server.close(resolve));
  return address.port;
}

class FirefoxDriver {
  constructor({ process, baseUrl, sessionId, profileDirectory }) {
    this.process = process;
    this.baseUrl = baseUrl;
    this.sessionId = sessionId;
    this.profileDirectory = profileDirectory;
    this.consoleEntries = [];
    this.pageErrors = [];
    this.requests = [];
  }

  static async launch(executablePath, geckodriverPath) {
    const port = await freePort();
    const profileDirectory = await mkdtemp(
      path.join(os.tmpdir(), 'xml-carousel-firefox-'),
    );
    const child = spawn(
      geckodriverPath,
      ['--host', '127.0.0.1', '--port', String(port)],
      { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true },
    );
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    const baseUrl = `http://127.0.0.1:${port}`;
    await waitUntil(async () => {
      try {
        return (await fetch(`${baseUrl}/status`)).ok;
      } catch {
        if (child.exitCode !== null) {
          throw new Error(`geckodriver exited early: ${stderr.trim()}`);
        }
        return false;
      }
    }, 'geckodriver startup');
    const response = await fetch(`${baseUrl}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        capabilities: {
          alwaysMatch: {
            browserName: 'firefox',
            'moz:firefoxOptions': {
              binary: executablePath,
              args: ['-headless', '-profile', profileDirectory],
              log: { level: 'warn' },
              prefs: { 'ui.prefersReducedMotion': 1 },
            },
          },
        },
      }),
    }).then((result) => result.json());
    const sessionId = response.value?.sessionId ?? response.sessionId;
    if (!sessionId) {
      throw new Error(`Firefox session failed: ${JSON.stringify(response)}`);
    }
    return {
      driver: new FirefoxDriver({
        process: child,
        baseUrl,
        sessionId,
        profileDirectory,
      }),
      version: `Firefox ${response.value.capabilities.browserVersion}`,
    };
  }

  async command(method, endpoint, body) {
    const response = await fetch(
      `${this.baseUrl}/session/${this.sessionId}${endpoint}`,
      {
        method,
        headers: { 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
    ).then((result) => result.json());
    if (response.value?.error) {
      throw new Error(`${response.value.error}: ${response.value.message}`);
    }
    return response.value;
  }

  navigate(url) {
    return this.command('POST', '/url', { url });
  }

  setViewport(width, height) {
    return this.command('POST', '/window/rect', { width, height, x: 0, y: 0 });
  }

  async setReducedMotion() {
    // The isolated Firefox profile sets ui.prefersReducedMotion before launch.
  }

  async evaluate(expression) {
    return this.command('POST', '/execute/sync', {
      script: 'return eval(arguments[0]);',
      args: [expression],
    });
  }

  async find(selector) {
    const element = await this.command('POST', '/element', {
      using: 'css selector',
      value: selector,
    });
    return element['element-6066-11e4-a52e-4f735466cecf'];
  }

  async setFile(selector, filePath) {
    const element = await this.find(selector);
    await this.command('POST', `/element/${element}/value`, {
      text: filePath,
      value: [...filePath],
    });
  }

  async click(selector) {
    const element = await this.find(selector);
    await this.command('POST', `/element/${element}/click`, {});
  }

  async pressKey(key) {
    const value = key === 'Enter' ? '\uE007' : '\uE00D';
    await this.command('POST', '/actions', {
      actions: [
        {
          type: 'key',
          id: 'package-disclosure-keyboard',
          actions: [
            { type: 'keyDown', value },
            { type: 'keyUp', value },
          ],
        },
      ],
    });
  }

  async sample(cycle, kind) {
    const pageState = await this.evaluate(`(() => ({
      project: document.querySelector('.project-name strong')?.textContent?.trim() ?? '',
      elements: document.getElementsByTagName('*').length,
      retainedProblems: Number((document.querySelector('[aria-label^="Open retained problem report"]')?.getAttribute('aria-label')?.match(/, (\\d+) problem/) ?? [])[1] ?? 0),
      focusIsHeading: document.activeElement?.matches?.('[data-focus-card-heading]') ?? false,
      importPhase: document.querySelector('.app-shell')?.getAttribute('data-schema-import-phase') ?? null,
    }))()`);
    return {
      cycle,
      kind,
      usedHeapBytes: null,
      documents: 1,
      domNodes: pageState.elements,
      eventListeners: null,
      liveWorkers: null,
      ...pageState,
    };
  }

  async close() {
    try {
      await this.command('DELETE', '', undefined);
    } catch {
      // Process shutdown remains authoritative.
    }
    if (this.process.exitCode === null) this.process.kill();
    await waitUntil(
      () => this.process.exitCode !== null,
      'Firefox process shutdown',
      10_000,
    ).catch(() => undefined);
    await rm(this.profileDirectory, { recursive: true, force: true });
  }
}

async function dismissWelcome(driver) {
  const visible = await driver.evaluate(
    'Boolean(document.querySelector(\'[aria-label="Close XML Carousel help"]\'))',
  );
  if (visible) await driver.click('[aria-label="Close XML Carousel help"]');
}

async function waitForIdle(driver) {
  await waitUntil(
    () =>
      driver.evaluate(`(() => {
        const shell = document.querySelector('.app-shell');
        const phase = shell?.getAttribute('data-schema-import-phase');
        return phase === null && !document.querySelector('[aria-busy="true"]');
      })()`),
    'schema import settlement',
  );
}

async function importFile(driver, format, filePath, expectedProject) {
  await driver.setFile(`#${format}-file-input`, filePath);
  await waitUntil(async () => {
    await waitForIdle(driver);
    const state = await driver.evaluate(`(() => ({
      project: document.querySelector('.project-name strong')?.textContent?.trim() ?? '',
      failure: document.querySelector('[aria-label="Dismiss import error"]')?.closest('[role="alert"]')?.textContent?.trim() ?? '',
    }))()`);
    if (state.failure) {
      throw new Error(
        `${format.toUpperCase()} import failed: ${state.failure}`,
      );
    }
    return state.project === expectedProject;
  }, `${format.toUpperCase()} activation for ${expectedProject}`);
}

async function failImport(driver) {
  await driver.setFile('#dtd-file-input', INPUTS.invalid);
  await waitUntil(
    () =>
      driver.evaluate(
        'Boolean(document.querySelector(\'[aria-label="Dismiss import error"]\'))',
      ),
    'invalid DTD failure banner',
  );
  await driver.click('[aria-label="Dismiss import error"]');
  await waitForIdle(driver);
}

async function cancelImport(driver) {
  await driver.setFile('#dtd-file-input', INPUTS.cancellation);
  await waitUntil(
    () =>
      driver.evaluate(
        'Boolean(document.querySelector(\'[data-schema-import-phase] button[aria-label^="Cancel"]\'))',
      ),
    'large DTD cancellation control',
  );
  await driver.click('[data-schema-import-phase] button[aria-label^="Cancel"]');
  await waitForIdle(driver);
}

async function capabilitySnapshot(driver) {
  return driver.evaluate(`(() => {
    const transferable = new Uint8Array([1, 2, 3]).buffer;
    const clone = structuredClone(transferable, { transfer: [transferable] });
    return {
      moduleWorker: typeof Worker === 'function',
      webAssembly: typeof WebAssembly === 'object',
      dialog: typeof HTMLDialogElement === 'function' && typeof HTMLDialogElement.prototype.showModal === 'function',
      inert: 'inert' in HTMLElement.prototype,
      structuredClone: typeof structuredClone === 'function',
      transferableArrayBuffer: transferable.byteLength === 0 && clone.byteLength === 3,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      fileInputs: ['dtd', 'xsd', 'zip'].every((format) => document.querySelector('#' + format + '-file-input')?.type === 'file'),
    };
  })()`);
}

async function viewportAudit(driver, width, height) {
  const mobile = width <= 915 && (width <= 412 || height <= 412);
  await driver.setViewport(width, height, mobile);
  await driver.evaluate(
    'new Promise((resolve) => requestAnimationFrame(resolve))',
  );
  await driver.click('[aria-label="Open XML Carousel help"]');
  const result = await driver.evaluate(`(() => {
    const dialog = document.querySelector('dialog[open]');
    const rect = dialog?.getBoundingClientRect();
    const controls = ['Open DTD', 'Open XSD', 'Open ZIP', 'Open XML Carousel help'];
    return {
      width: innerWidth,
      height: innerHeight,
      pageOverflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      pageOverflowY: document.documentElement.scrollHeight > document.documentElement.clientHeight,
      modalClipped: !rect || rect.left < 0 || rect.top < 0 || rect.right > innerWidth || rect.bottom > innerHeight,
      topBarBottom: document.querySelector('.top-bar')?.getBoundingClientRect().bottom ?? null,
      carouselTop: document.querySelector('.carousel-region')?.getBoundingClientRect().top ?? null,
      controlsPresent: controls.every((label) => document.querySelector('[aria-label="' + label + '"]')),
    };
  })()`);
  await driver.click('[aria-label="Close XML Carousel help"]');
  return result;
}

async function smokeDeployment(driver, url) {
  await driver.navigate(url);
  await dismissWelcome(driver);
  const capabilities = await capabilitySnapshot(driver);
  await importFile(driver, 'dtd', INPUTS.dtd, 'library.dtd');
  await importFile(driver, 'xsd', INPUTS.xsd, 'attributes.xsd');
  await importFile(driver, 'zip', INPUTS.zip, 'valid-xsd-include.zip');
  return {
    url,
    capabilities,
    project: await driver.evaluate(
      "document.querySelector('.project-name strong')?.textContent?.trim()",
    ),
  };
}

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0
    ? (ordered[middle - 1] + ordered[middle]) / 2
    : ordered[middle];
}

function slope(values) {
  const count = values.length;
  const meanX = (count + 1) / 2;
  const meanY = values.reduce((sum, value) => sum + value, 0) / count;
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < count; index += 1) {
    const x = index + 1;
    numerator += (x - meanX) * (values[index] - meanY);
    denominator += (x - meanX) ** 2;
  }
  return numerator / denominator;
}

async function runMixedCycles(driver, count) {
  await importFile(driver, 'dtd', INPUTS.dtd, 'library.dtd');
  await importFile(driver, 'xsd', INPUTS.xsd, 'attributes.xsd');
  await importFile(driver, 'zip', INPUTS.zip, 'valid-xsd-include.zip');
  const samples = [];
  for (let cycle = 1; cycle <= count; cycle += 1) {
    await importFile(driver, 'dtd', INPUTS.dtd, 'library.dtd');
    await importFile(driver, 'xsd', INPUTS.xsd, 'attributes.xsd');
    await importFile(driver, 'zip', INPUTS.zip, 'valid-xsd-include.zip');
    await failImport(driver);
    await cancelImport(driver);
    await importFile(driver, 'dtd', INPUTS.dtd, 'library.dtd');
    samples.push(await driver.sample(cycle, 'mixed'));
  }
  return samples;
}

async function runHermeticCycles(driver, filePath, count) {
  const samples = [];
  for (let cycle = 1; cycle <= count; cycle += 1) {
    await importFile(driver, 'zip', filePath, 'xml-schemas.zip');
    samples.push(await driver.sample(cycle, 'hermetic-foundry'));
  }
  return samples;
}

const packageDisclosureSelectors = [
  '[data-package-section="root-candidates"]',
  '[data-package-section="schema-sources"]',
  '[data-package-section="ignored-entries"]',
  '[data-package-section="directories"]',
];

async function packageDisclosureSnapshot(driver) {
  return driver.evaluate(`(() => {
    const selectors = ${JSON.stringify(packageDisclosureSelectors)};
    const navigation = document.querySelector('.left-panel');
    const navigationRect = navigation?.getBoundingClientRect();
    return selectors.map((selector) => {
      const button = document.querySelector(selector);
      const panelId = button?.getAttribute('aria-controls') ?? '';
      const panel = panelId ? document.getElementById(panelId) : null;
      const buttonRect = button?.getBoundingClientRect();
      const chevron = button?.querySelector('.disclosure-chevron');
      return {
        section: button?.getAttribute('data-package-section') ?? '',
        tag: button?.tagName ?? '',
        type: button?.getAttribute('type') ?? '',
        label: button?.querySelector('.package-section-label')?.textContent?.trim() ?? '',
        count: Number(button?.querySelector('.package-section-count')?.textContent?.trim()),
        accessibleLabel: button?.getAttribute('aria-label') ?? '',
        expanded: button?.getAttribute('aria-expanded') === 'true',
        panelId,
        panelExists: Boolean(panel),
        panelHidden: panel?.hidden ?? null,
        contentCount: panel?.querySelectorAll('.root-candidate-card, .package-entry').length ?? 0,
        chevronDecorative: chevron?.getAttribute('aria-hidden') === 'true',
        chevronTransitionDuration: chevron ? getComputedStyle(chevron).transitionDuration : '',
        active: document.activeElement === button,
        contained: Boolean(
          buttonRect &&
          navigationRect &&
          buttonRect.left >= navigationRect.left - 1 &&
          buttonRect.right <= navigationRect.right + 1 &&
          button.scrollWidth <= button.clientWidth + 1
        ),
      };
    });
  })()`);
}

async function setPackageDisclosureStates(driver, states) {
  await driver.evaluate(`(async () => {
    const desired = ${JSON.stringify(states)};
    for (const [section, expanded] of Object.entries(desired)) {
      const button = document.querySelector('[data-package-section="' + section + '"]');
      if (button?.getAttribute('aria-expanded') !== String(expanded)) button?.click();
    }
    await new Promise((resolve) => requestAnimationFrame(resolve));
  })()`);
}

async function rootCandidateAudit(driver, width, height) {
  const mobile = width <= 915 && (width <= 412 || height <= 412);
  await driver.setViewport(width, height, mobile);
  await driver.evaluate(
    'new Promise((resolve) => requestAnimationFrame(resolve))',
  );
  const keyboardViewport = width === 1440 && height === 900;
  const initialDisclosures = await packageDisclosureSnapshot(driver);
  if (keyboardViewport) {
    await driver.click('[data-package-section="root-candidates"]');
  } else {
    await setPackageDisclosureStates(driver, { 'root-candidates': true });
  }
  const afterRootClick = await packageDisclosureSnapshot(driver);
  if (keyboardViewport) {
    await driver.click('[data-package-section="ignored-entries"]');
  } else {
    await setPackageDisclosureStates(driver, { 'ignored-entries': true });
  }
  const afterIgnoredClick = await packageDisclosureSnapshot(driver);
  if (keyboardViewport) {
    await driver.evaluate(
      `document.querySelector('[data-package-section="directories"]')?.focus()`,
    );
    await driver.pressKey('Enter');
    await driver.evaluate(
      'new Promise((resolve) => requestAnimationFrame(resolve))',
    );
  } else {
    await setPackageDisclosureStates(driver, { directories: true });
  }
  const afterEnter = await packageDisclosureSnapshot(driver);
  if (keyboardViewport) {
    await driver.pressKey(' ');
    await driver.evaluate(
      'new Promise((resolve) => requestAnimationFrame(resolve))',
    );
  } else {
    await setPackageDisclosureStates(driver, { directories: false });
  }
  const afterSpace = await packageDisclosureSnapshot(driver);
  await setPackageDisclosureStates(driver, {
    'root-candidates': false,
    'schema-sources': false,
    'ignored-entries': false,
    directories: false,
  });
  const collapsedNavigationHeight = await driver.evaluate(
    `document.querySelector('.left-panel')?.scrollHeight ?? 0`,
  );
  await setPackageDisclosureStates(driver, {
    'root-candidates': true,
    'schema-sources': true,
    'ignored-entries': true,
    directories: true,
  });
  const expandedNavigationHeight = await driver.evaluate(
    `document.querySelector('.left-panel')?.scrollHeight ?? 0`,
  );
  const expandedDisclosures = await packageDisclosureSnapshot(driver);
  const presentation = await driver.evaluate(`(() => {
    const section = document.querySelector('.root-candidates');
    const heading = section?.querySelector('h4');
    const headingLabel = heading?.querySelector('.package-section-label');
    const list = section?.querySelector(':scope > .package-section-panel > ul');
    const cards = [...(list?.querySelectorAll(':scope > li.root-candidate-card') ?? [])];
    const paths = cards.map((card) => card.querySelector('.root-candidate-path'));
    const reasons = cards.map((card) => card.querySelector('.root-candidate-reason'));
    const summaryTerms = [...document.querySelectorAll('.package-summary dt')];
    const summaryTerm = summaryTerms.find((term) => term.textContent?.trim() === 'Root candidates');
    const summaryCount = Number(summaryTerm?.nextElementSibling?.textContent?.trim());
    const headingStyle = heading ? getComputedStyle(heading) : null;
    const pathStyles = paths.map((path) => path ? getComputedStyle(path) : null);
    const reasonStyles = reasons.map((reason) => reason ? getComputedStyle(reason) : null);
    const cardStyles = cards.map((card) => getComputedStyle(card));
    const packageBackground = getComputedStyle(document.querySelector('.package-summary')).backgroundColor;
    const panel = section?.closest('aside, nav, .left-panel');
    const panelRect = panel?.getBoundingClientRect();
    const inventoryHeading = document.querySelector('.package-inventory > h3');
    const schemaSourceHeading = document
      .querySelector('[data-package-section="schema-sources"]')
      ?.closest('h4');
    const schemaSourceHeadingLabel = schemaSourceHeading?.querySelector('.package-section-label');
    const packageEntries = [...document.querySelectorAll('.package-entry')];
    const representativeEntries = [
      packageEntries.find((entry) => entry.querySelector('.entry-path')?.textContent?.trim() === 'xml-schemas/entities/abilities.xsd'),
      packageEntries.find((entry) => entry.querySelector('.entry-path')?.textContent?.trim() === 'xml-schemas/entities/covenant-organization-models.xsd'),
      packageEntries.find((entry) => entry.querySelector('.entry-path')?.textContent?.trim() === 'xml-schemas/README.md'),
      packageEntries.find((entry) => entry.querySelector('.entry-path')?.textContent?.trim() === 'xml-schemas/VALIDATION_REPORT.json'),
    ].filter(Boolean);
    representativeEntries.forEach((entry) => { entry.open = true; });
    const entryPaths = packageEntries.map((entry) => entry.querySelector('.entry-path'));
    const entrySummaries = packageEntries.map((entry) => entry.querySelector('.entry-summary-status'));
    const metadataLists = packageEntries.map((entry) => entry.querySelector('.package-entry-metadata'));
    const metadataFields = metadataLists.flatMap((list) => [...(list?.querySelectorAll(':scope > div') ?? [])]);
    const metadataLabels = metadataFields.map((field) => field.querySelector('dt'));
    const metadataValues = metadataFields.map((field) => field.querySelector('dd'));
    const inventoryHeadingStyle = inventoryHeading ? getComputedStyle(inventoryHeading) : null;
    const schemaSourceHeadingStyle = schemaSourceHeading ? getComputedStyle(schemaSourceHeading) : null;
    const entryPathStyles = entryPaths.map((path) => path ? getComputedStyle(path) : null);
    const entrySummaryStyles = entrySummaries.map((summary) => summary ? getComputedStyle(summary) : null);
    const metadataLabelStyles = metadataLabels.map((label) => label ? getComputedStyle(label) : null);
    const metadataValueStyles = metadataValues.map((value) => value ? getComputedStyle(value) : null);
    return {
      width: innerWidth,
      height: innerHeight,
      sectionLabelled: Boolean(section?.getAttribute('aria-labelledby') && heading?.id === section.getAttribute('aria-labelledby')),
      headingText: headingLabel?.textContent?.trim() ?? '',
      listTag: list?.tagName ?? '',
      cardTags: cards.map((card) => card.tagName),
      cardCount: cards.length,
      summaryCount,
      paths: paths.map((path) => path?.textContent?.trim() ?? ''),
      reasons: reasons.map((reason) => reason?.textContent?.trim() ?? ''),
      pathsSmallerThanHeading: Boolean(headingStyle && pathStyles.every((style) => style && Number.parseFloat(style.fontSize) < Number.parseFloat(headingStyle.fontSize))),
      pathsItalic: pathStyles.every((style) => style?.fontStyle === 'italic'),
      reasonsRegular: reasonStyles.every((style) => style?.fontStyle === 'normal'),
      reasonsMuted: reasonStyles.every((style) => style?.color !== pathStyles[0]?.color),
      reasonsBelowPaths: cards.every(
        (_card, index) =>
          paths[index]?.nextElementSibling === reasons[index] &&
          pathStyles[index]?.display === 'block' &&
          reasonStyles[index]?.display === 'block',
      ),
      cardsNeutralAndRounded: cardStyles.every((style) =>
        Number.parseFloat(style.borderTopWidth) > 0 &&
        Number.parseFloat(style.borderTopLeftRadius) > 0 &&
        style.backgroundColor !== packageBackground
      ),
      cardsStatic: cards.every((card) => !card.querySelector('button, a, [role="button"], [tabindex]')),
      pathsUntruncated: pathStyles.every((style) => style?.textOverflow !== 'ellipsis' && style?.overflowWrap === 'anywhere'),
      reasonsComplete: reasons.every((reason) => Boolean(reason?.textContent?.trim())),
      noPageOverflowX: document.documentElement.scrollWidth <= innerWidth,
      cardsWithinPanel: !panelRect || cards.every((card) => {
        const rect = card.getBoundingClientRect();
        return rect.left >= panelRect.left - 1 && rect.right <= panelRect.right + 1;
      }),
      packageEntryCount: packageEntries.length,
      packageInventoryHeading: inventoryHeading?.textContent?.trim() ?? '',
      schemaSourceHeading: schemaSourceHeadingLabel?.textContent?.trim() ?? '',
      representativeEntryCount: representativeEntries.length,
      packageEntryPathsComplete: entryPaths.every((path) => Boolean(path?.textContent?.trim())),
      packageEntryPathsSmallerThanHeadings: Boolean(
        inventoryHeadingStyle &&
        schemaSourceHeadingStyle &&
        entryPathStyles.every((style) =>
          style &&
          Number.parseFloat(style.fontSize) < Number.parseFloat(inventoryHeadingStyle.fontSize) &&
          Number.parseFloat(style.fontSize) < Number.parseFloat(schemaSourceHeadingStyle.fontSize)
        )
      ),
      packageEntrySummariesSubordinate: entrySummaryStyles.every(
        (style, index) =>
          style &&
          entryPathStyles[index] &&
          Number.parseFloat(style.fontSize) < Number.parseFloat(entryPathStyles[index].fontSize) &&
          style.textAlign === 'left',
      ),
      metadataSemanticAndStacked: metadataFields.length > 0 && metadataFields.every(
        (field, index) => {
          const columns = getComputedStyle(field).gridTemplateColumns;
          return metadataLabels[index]?.nextElementSibling === metadataValues[index] &&
            (columns.startsWith('minmax(') || !columns.includes(' '));
        },
      ),
      metadataLeftAligned: metadataLabelStyles.every((style) => style?.textAlign === 'left') &&
        metadataValueStyles.every((style) => style?.textAlign === 'left'),
      metadataHierarchy: metadataLabelStyles.every(
        (style, index) =>
          style &&
          metadataValueStyles[index] &&
          Number.parseFloat(style.fontSize) < Number.parseFloat(metadataValueStyles[index].fontSize),
      ) && metadataValueStyles.every(
        (style) =>
          style &&
          entryPathStyles[0] &&
          Number.parseFloat(style.fontSize) < Number.parseFloat(entryPathStyles[0].fontSize),
      ),
      metadataNoOverflow: representativeEntries.every((entry) => {
        const metadata = entry.querySelector('.package-entry-metadata');
        const path = entry.querySelector('.entry-path');
        return Boolean(
          metadata &&
          path &&
          metadata.scrollWidth <= metadata.clientWidth + 1 &&
          path.scrollWidth <= path.clientWidth + 1,
        );
      }),
      packageEntriesUseSharedPattern: metadataLists.every(
        (list) => list?.tagName === 'DL' && list.querySelectorAll(':scope > div').length > 0,
      ),
      packageEntriesHaveNoFalseButtons: packageEntries.every(
        (entry) => !entry.querySelector('button, [role="button"]'),
      ),
    };
  })()`);
  await setPackageDisclosureStates(driver, {
    'root-candidates': false,
    'schema-sources': false,
    'ignored-entries': false,
    directories: false,
  });
  return {
    ...presentation,
    disclosure: {
      initial: initialDisclosures,
      afterRootClick,
      afterIgnoredClick,
      afterEnter,
      afterSpace,
      expanded: expandedDisclosures,
      collapsedNavigationHeight,
      expandedNavigationHeight,
    },
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const serverRequests = [];
  const server = await startHostileMimeServer({
    host: '127.0.0.1',
    port: 0,
    onRequest: (request) => serverRequests.push(request),
  });
  let driver;
  try {
    const launched =
      options.browser === 'firefox'
        ? await FirefoxDriver.launch(
            path.resolve(options.browserPath),
            path.resolve(options.geckodriverPath),
          )
        : await ChromiumDriver.launch(path.resolve(options.browserPath));
    driver = launched.driver;
    await driver.setReducedMotion();
    const root = await smokeDeployment(driver, server.rootUrl);
    const nested = await smokeDeployment(driver, server.nestedUrl);
    const viewports = [];
    for (const [width, height] of [
      [1440, 900],
      [1280, 720],
      [1024, 768],
      [768, 900],
      [412, 915],
      [390, 844],
      [915, 412],
      [844, 390],
    ]) {
      viewports.push(await viewportAudit(driver, width, height));
    }
    await driver.setViewport(1440, 900, false);
    await driver.navigate(server.rootUrl);
    await dismissWelcome(driver);
    const mixedSamples = await runMixedCycles(driver, options.mixedCycles);
    const hermeticSamples = await runHermeticCycles(
      driver,
      path.resolve(options.hermeticPath),
      options.hermeticCycles,
    );
    const rootCandidateViewports = [];
    for (const [width, height] of [
      [1440, 900],
      [768, 900],
      [390, 844],
      [844, 390],
    ]) {
      rootCandidateViewports.push(
        await rootCandidateAudit(driver, width, height),
      );
    }
    const heapSamples = mixedSamples
      .map(({ usedHeapBytes }) => usedHeapBytes)
      .filter((value) => typeof value === 'number');
    const firstMedian = heapSamples.length
      ? median(heapSamples.slice(0, 3))
      : null;
    const finalMedian = heapSamples.length
      ? median(heapSamples.slice(-3))
      : null;
    const allowedIncrease = firstMedian
      ? Math.max(firstMedian * 0.2, 32 * 1024 * 1024)
      : null;
    const report = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      browser: options.browser,
      browserVersion: launched.version,
      deployment: { root, nested },
      viewports,
      rootCandidateViewports,
      mixedSamples,
      hermeticSamples,
      memory: {
        firstThreeMedianBytes: firstMedian,
        finalThreeMedianBytes: finalMedian,
        allowedIncreaseBytes: allowedIncrease,
        withinThreshold:
          firstMedian === null || finalMedian === null
            ? null
            : finalMedian <= firstMedian + allowedIncrease,
        slopeBytesPerCycle: heapSamples.length ? slope(heapSamples) : null,
      },
      consoleEntries: driver.consoleEntries,
      pageErrors: driver.pageErrors,
      browserRequests: driver.requests,
      serverRequests,
      assertions: {
        noPageErrors: driver.pageErrors.length === 0,
        noConsoleWarningsOrErrors: driver.consoleEntries.every(
          ({ type }) => type !== 'warning' && type !== 'error',
        ),
        noProductionMjs: serverRequests.every(
          ({ pathname }) => !pathname.endsWith('.mjs'),
        ),
        noExternalRequests: driver.requests.every(
          (url) => new URL(url).hostname === '127.0.0.1',
        ),
        noFileRequests: driver.requests.every(
          (url) => !url.toLowerCase().startsWith('file:'),
        ),
        wasmOctetStream: serverRequests.some(
          ({ pathname, contentType, status }) =>
            pathname.endsWith('.wasm') &&
            contentType === 'application/octet-stream' &&
            status === 200,
        ),
        noLiveWorkersBetweenImports: mixedSamples.every(
          ({ liveWorkers }) => liveWorkers === null || liveWorkers === 0,
        ),
        reducedMotionPreference:
          root.capabilities.reducedMotion && nested.capabilities.reducedMotion,
        viewportContainment: viewports.every(
          ({
            pageOverflowX,
            modalClipped,
            controlsPresent,
            topBarBottom,
            carouselTop,
          }) =>
            !pageOverflowX &&
            !modalClipped &&
            controlsPresent &&
            carouselTop >= topBarBottom,
        ),
        rootCandidatePresentation: rootCandidateViewports.every(
          (audit, index, audits) =>
            audit.sectionLabelled &&
            audit.headingText === 'Root schema candidates' &&
            audit.listTag === 'UL' &&
            audit.cardTags.every((tag) => tag === 'LI') &&
            audit.cardCount === 33 &&
            audit.summaryCount === 33 &&
            audit.paths.length === 33 &&
            audit.paths.every(Boolean) &&
            audit.reasons.length === 33 &&
            audit.reasonsComplete &&
            audit.pathsSmallerThanHeading &&
            audit.pathsItalic &&
            audit.reasonsRegular &&
            audit.reasonsMuted &&
            audit.reasonsBelowPaths &&
            audit.cardsNeutralAndRounded &&
            audit.cardsStatic &&
            audit.pathsUntruncated &&
            audit.noPageOverflowX &&
            audit.cardsWithinPanel &&
            audit.packageEntryCount === 85 &&
            audit.packageInventoryHeading === 'Complete package inventory' &&
            audit.schemaSourceHeading === 'Schema sources' &&
            audit.representativeEntryCount === 4 &&
            audit.packageEntryPathsComplete &&
            audit.packageEntryPathsSmallerThanHeadings &&
            audit.packageEntrySummariesSubordinate &&
            audit.metadataSemanticAndStacked &&
            audit.metadataLeftAligned &&
            audit.metadataHierarchy &&
            audit.metadataNoOverflow &&
            audit.packageEntriesUseSharedPattern &&
            audit.packageEntriesHaveNoFalseButtons &&
            (index === 0 ||
              JSON.stringify(audit.paths) ===
                JSON.stringify(audits[0].paths)) &&
            (index === 0 ||
              JSON.stringify(audit.reasons) ===
                JSON.stringify(audits[0].reasons)),
        ),
        packageDisclosurePresentation: rootCandidateViewports.every(
          ({ disclosure }, viewportIndex) => {
            const expectedSections = [
              'root-candidates',
              'schema-sources',
              'ignored-entries',
              'directories',
            ];
            const expectedLabels = [
              'Root schema candidates',
              'Schema sources',
              'Ignored entries',
              'Directories',
            ];
            const expectedCounts = [33, 38, 44, 3];
            const expectedAccessibleLabels = [
              'Root schema candidates, 33 items',
              'Schema sources, 38 items',
              'Ignored entries, 44 items',
              'Directories, 3 items',
            ];
            const states = (snapshot) =>
              snapshot.map(({ expanded }) => expanded);
            return (
              disclosure.initial.every(
                (item, index) =>
                  item.section === expectedSections[index] &&
                  item.tag === 'BUTTON' &&
                  item.type === 'button' &&
                  item.label === expectedLabels[index] &&
                  item.count === expectedCounts[index] &&
                  item.accessibleLabel === expectedAccessibleLabels[index] &&
                  item.panelExists &&
                  item.panelHidden === !item.expanded &&
                  item.chevronDecorative &&
                  Number.parseFloat(item.chevronTransitionDuration) <= 0.001 &&
                  item.contained,
              ) &&
              JSON.stringify(states(disclosure.initial)) ===
                JSON.stringify([false, false, false, false]) &&
              JSON.stringify(states(disclosure.afterRootClick)) ===
                JSON.stringify([true, false, false, false]) &&
              JSON.stringify(states(disclosure.afterIgnoredClick)) ===
                JSON.stringify([true, false, true, false]) &&
              (viewportIndex !== 0 ||
                (JSON.stringify(states(disclosure.afterEnter)) ===
                  JSON.stringify([true, false, true, true]) &&
                  disclosure.afterEnter[3]?.active &&
                  JSON.stringify(states(disclosure.afterSpace)) ===
                    JSON.stringify([true, false, true, false]) &&
                  disclosure.afterSpace[3]?.active)) &&
              disclosure.expanded.every(
                (item, index) =>
                  item.expanded &&
                  !item.panelHidden &&
                  item.contentCount === expectedCounts[index] &&
                  item.contained,
              ) &&
              (viewportIndex !== 0 ||
                disclosure.expandedNavigationHeight >
                  disclosure.collapsedNavigationHeight)
            );
          },
        ),
      },
    };
    await writeFile(
      path.resolve(options.outputPath),
      `${JSON.stringify(report, null, 2)}\n`,
      'utf8',
    );
    console.log(JSON.stringify(report.memory));
    console.log(`Browser lifecycle audit written to ${options.outputPath}`);
  } finally {
    await driver?.close();
    await server.close();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  });
}
