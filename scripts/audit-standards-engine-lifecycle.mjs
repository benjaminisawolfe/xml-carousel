import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
  largeDtd: path.resolve('tests/fixtures/dtd/large-10000.dtd'),
  largeXsd: path.resolve('tests/fixtures/xsd/large-10000.xsd'),
  relationshipLines: path.resolve(
    'tests/fixtures/semantic-zoom/relationship-lines.xsd',
  ),
  rng: path.resolve('tests/fixtures/relax-ng/manual-qa/01-basic-grammar.rng'),
  invalidRng: path.resolve(
    'tests/fixtures/relax-ng/manual-qa/09-invalid-schema.rng',
  ),
  blockedRng: path.resolve(
    'tests/fixtures/relax-ng/manual-qa/10-blocked-external-ref.rng',
  ),
  rnc: path.resolve(
    'tests/fixtures/relax-ng/manual-qa-rnc/01-basic-grammar.rnc',
  ),
  invalidRnc: path.resolve(
    'tests/fixtures/relax-ng/manual-qa-rnc/09-invalid-syntax.rnc',
  ),
  blockedRnc: path.resolve(
    'tests/fixtures/relax-ng/manual-qa-rnc/10-blocked-external.rnc',
  ),
  localRngPackage: path.resolve(
    'tests/fixtures/relax-ng/manual-qa/11-multi-file-includes.zip',
  ),
  localRncPackage: path.resolve(
    'tests/fixtures/relax-ng/manual-qa-rnc/11-multi-file-includes.zip',
  ),
  cancellationRng: path.resolve(
    'tests/fixtures/relax-ng/conformance/real-world/docbook-5.1/docbook.rng',
  ),
};

function parseArguments(argv) {
  const options = {
    browser: undefined,
    browserPath: undefined,
    geckodriverPath: undefined,
    hermeticPath: undefined,
    outputPath: undefined,
    screenshotDirectory: undefined,
    firefoxMotion: 'reduced',
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
    else if (name === 'screenshot-dir') options.screenshotDirectory = value;
    else if (name === 'firefox-motion') options.firefoxMotion = value;
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
  if (!['normal', 'reduced'].includes(options.firefoxMotion)) {
    throw new Error('--firefox-motion must be normal or reduced.');
  }
  if (options.hermeticCycles > 0 && !options.hermeticPath) {
    throw new Error('--hermetic-path is required when Hermetic cycles run.');
  }
  if (!options.outputPath) throw new Error('--output is required.');
  for (const [name, value] of [['--mixed-cycles', options.mixedCycles]]) {
    if (!Number.isInteger(value) || value < 1) {
      throw new Error(`${name} must be a positive integer.`);
    }
  }
  if (!Number.isInteger(options.hermeticCycles) || options.hermeticCycles < 0) {
    throw new Error('--hermetic-cycles must be a non-negative integer.');
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
    await this.setMediaPreferences({ reducedMotion: true });
  }

  async setMediaPreferences({ reducedMotion = false, forcedColors = false }) {
    const features = [];
    if (reducedMotion) {
      features.push({ name: 'prefers-reduced-motion', value: 'reduce' });
    }
    if (forcedColors) {
      features.push({ name: 'forced-colors', value: 'active' });
    }
    await this.send('Emulation.setEmulatedMedia', { features });
    return { reducedMotion, forcedColors, supported: true };
  }

  async screenshot(outputPath) {
    const { data } = await this.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
    });
    await writeFile(outputPath, Buffer.from(data, 'base64'));
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
  constructor({
    process,
    baseUrl,
    sessionId,
    profileDirectory,
    bidiConnection,
    browsingContext,
    reducedMotion,
  }) {
    this.process = process;
    this.baseUrl = baseUrl;
    this.sessionId = sessionId;
    this.profileDirectory = profileDirectory;
    this.bidiConnection = bidiConnection;
    this.browsingContext = browsingContext;
    this.reducedMotion = reducedMotion;
    this.consoleEntries = [];
    this.pageErrors = [];
    this.requests = [];
    bidiConnection.onMessage((message) => {
      if (message.method === 'network.beforeRequestSent') {
        const url = message.params?.request?.url;
        if (typeof url === 'string') this.requests.push(url);
      }
    });
  }

  static async launch(executablePath, geckodriverPath, reducedMotion = true) {
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
            webSocketUrl: true,
            'moz:firefoxOptions': {
              binary: executablePath,
              args: ['-headless', '-profile', profileDirectory],
              log: { level: 'warn' },
              prefs: { 'ui.prefersReducedMotion': reducedMotion ? 1 : 0 },
            },
          },
        },
      }),
    }).then((result) => result.json());
    const sessionId = response.value?.sessionId ?? response.sessionId;
    if (!sessionId) {
      throw new Error(`Firefox session failed: ${JSON.stringify(response)}`);
    }
    const webSocketUrl = response.value.capabilities.webSocketUrl;
    if (!webSocketUrl) {
      throw new Error('Firefox session did not provide a WebDriver BiDi URL.');
    }
    const bidiConnection = await CdpConnection.connect(webSocketUrl);
    const contextTree = await bidiConnection.send('browsingContext.getTree');
    const browsingContext = contextTree.contexts?.[0]?.context;
    if (!browsingContext) {
      bidiConnection.close();
      throw new Error('Firefox session did not provide a browsing context.');
    }
    await bidiConnection.send('session.subscribe', {
      events: ['network.beforeRequestSent'],
      contexts: [browsingContext],
    });
    return {
      driver: new FirefoxDriver({
        process: child,
        baseUrl,
        sessionId,
        profileDirectory,
        bidiConnection,
        browsingContext,
        reducedMotion,
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

  async setViewport(width, height) {
    await this.bidiConnection.send('browsingContext.setViewport', {
      context: this.browsingContext,
      viewport: { width, height },
      devicePixelRatio: 1,
    });
  }

  async setReducedMotion() {
    // The isolated Firefox profile sets ui.prefersReducedMotion before launch.
  }

  async setMediaPreferences({ reducedMotion = true, forcedColors = false }) {
    return {
      reducedMotion: this.reducedMotion,
      forcedColors: false,
      supported: reducedMotion === this.reducedMotion && !forcedColors,
    };
  }

  async screenshot(outputPath) {
    const data = await this.command('GET', '/screenshot');
    await writeFile(outputPath, Buffer.from(data, 'base64'));
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
    this.bidiConnection.close();
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
      fileInputs: ['dtd', 'xsd', 'rng', 'zip'].every((format) => document.querySelector('#' + format + '-file-input')?.type === 'file'),
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
    const controls = ['Open DTD', 'Open XSD', 'Open RNG', 'Open ZIP', 'Open XML Carousel help'];
    const semanticZoomSurface = document.querySelector('[data-semantic-zoom-requested]');
    const semanticZoomControl = document.querySelector('[data-semantic-zoom-control]');
    const semanticZoomRange = semanticZoomControl?.querySelector('input[type="range"]');
    const controlRect = semanticZoomControl?.getBoundingClientRect();
    return {
      width: innerWidth,
      height: innerHeight,
      pageOverflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      pageOverflowY: document.documentElement.scrollHeight > document.documentElement.clientHeight,
      modalClipped: !rect || rect.left < 0 || rect.top < 0 || rect.right > innerWidth || rect.bottom > innerHeight,
      topBarBottom: document.querySelector('.top-bar')?.getBoundingClientRect().bottom ?? null,
      carouselTop: document.querySelector('.carousel-region')?.getBoundingClientRect().top ?? null,
      controlsPresent: controls.every((label) => document.querySelector('[aria-label="' + label + '"]')),
      semanticZoom: {
        queryMatches: matchMedia('(min-width: 1024px) and (min-height: 600px)').matches,
        requested: semanticZoomSurface?.getAttribute('data-semantic-zoom-requested') ?? null,
        effective: semanticZoomSurface?.getAttribute('data-semantic-zoom-effective') ?? null,
        presentation: semanticZoomSurface?.getAttribute('data-semantic-zoom-presentation') ?? null,
        available: semanticZoomSurface?.getAttribute('data-semantic-zoom-available') ?? null,
        controlPresent: Boolean(semanticZoomControl),
        controlContained: !controlRect || (
          controlRect.left >= 0 && controlRect.top >= 0 &&
          controlRect.right <= innerWidth && controlRect.bottom <= innerHeight
        ),
        rangeMin: semanticZoomRange?.getAttribute('min') ?? null,
        rangeMax: semanticZoomRange?.getAttribute('max') ?? null,
        overviewVisible:
          semanticZoomControl?.querySelector('.current-level')?.textContent?.trim() ===
          'Overview',
        lineLayerCount: document.querySelectorAll('[data-semantic-zoom-relationship-lines]').length,
      },
    };
  })()`);
  await driver.click('[aria-label="Close XML Carousel help"]');
  return result;
}

async function relationshipLineSnapshot(driver) {
  return driver.evaluate(`(() => {
    const stage = document.querySelector('.carousel-stage');
    const svg = document.querySelector('[data-semantic-zoom-relationship-lines]');
    const focus = document.querySelector('[data-semantic-zoom-focus-card]');
    const paths = [...document.querySelectorAll('[data-semantic-zoom-line-key]')];
    if (!stage || !svg || !focus) return null;
    const stageRect = stage.getBoundingClientRect();
    const svgRect = svg.getBoundingClientRect();
    const focusRect = focus.getBoundingClientRect();
    const numberAttribute = (element, name) =>
      Number(element.getAttribute(name));
    const rectangle = (rect) => ({
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    });
    const close = (left, right, allowance = 1) =>
      Number.isFinite(left) && Number.isFinite(right) &&
      Math.abs(left - right) <= allowance;
    const details = paths.map((line) => {
      const kind = line.getAttribute('data-semantic-zoom-line-kind');
      const sourceIdentity = line.getAttribute('data-semantic-zoom-line-source') ?? '';
      const targetIdentity = line.getAttribute('data-semantic-zoom-line-target') ?? '';
      const from = {
        x: numberAttribute(line, 'data-semantic-zoom-line-from-x'),
        y: numberAttribute(line, 'data-semantic-zoom-line-from-y'),
      };
      const to = {
        x: numberAttribute(line, 'data-semantic-zoom-line-to-x'),
        y: numberAttribute(line, 'data-semantic-zoom-line-to-y'),
      };
      let source = focus;
      let target;
      if (kind === 'leafward') {
        const edgeId = targetIdentity.replace(/^leafward:/u, '');
        target = stage.querySelector(
          '[data-semantic-zoom-leafward-edge-id="' + CSS.escape(edgeId) + '"]',
        );
      } else {
        const sourcePosition = sourceIdentity.split(':')[1];
        source = stage.querySelector(
          '[data-semantic-zoom-rootward-position="' + CSS.escape(sourcePosition ?? '') + '"]',
        );
        target = focus;
      }
      const sourceRect = source?.getBoundingClientRect();
      const targetRect = target?.getBoundingClientRect();
      const pathBox = line.getBBox();
      const expectedFrom = sourceRect
        ? {
            x: sourceRect.right - stageRect.left,
            y: sourceRect.top + sourceRect.height / 2 - stageRect.top,
          }
        : null;
      const expectedTo = targetRect
        ? {
            x: targetRect.left - stageRect.left,
            y: targetRect.top + targetRect.height / 2 - stageRect.top,
          }
        : null;
      const horizontalGap =
        sourceRect && targetRect ? targetRect.left - sourceRect.right : null;
      const minX = Math.min(from.x, to.x);
      const maxX = Math.max(from.x, to.x);
      const minY = Math.min(from.y, to.y);
      const maxY = Math.max(from.y, to.y);
      const finite = [
        from.x,
        from.y,
        to.x,
        to.y,
        pathBox.x,
        pathBox.y,
        pathBox.width,
        pathBox.height,
      ].every(Number.isFinite) && !/NaN|Infinity/u.test(line.getAttribute('d') ?? '');
      const endpointsMeetCards = Boolean(
        expectedFrom && expectedTo &&
        close(from.x, expectedFrom.x) && close(from.y, expectedFrom.y) &&
        close(to.x, expectedTo.x) && close(to.y, expectedTo.y),
      );
      const boundedCorridor =
        pathBox.x >= minX - 1 && pathBox.x + pathBox.width <= maxX + 1 &&
        pathBox.y >= minY - 1 && pathBox.y + pathBox.height <= maxY + 1 &&
        pathBox.x >= -1 && pathBox.x + pathBox.width <= stageRect.width + 1 &&
        pathBox.y >= -1 && pathBox.y + pathBox.height <= stageRect.height + 1;
      const visibleAcrossGap = Boolean(
        horizontalGap !== null && horizontalGap >= 20 &&
        pathBox.width >= horizontalGap - 2,
      );
      return {
        key: line.getAttribute('data-semantic-zoom-line-key'),
        kind,
        sourceIdentity,
        targetIdentity,
        from,
        to,
        sourceRect: sourceRect ? rectangle(sourceRect) : null,
        targetRect: targetRect ? rectangle(targetRect) : null,
        pathBox: rectangle({
          left: pathBox.x,
          top: pathBox.y,
          right: pathBox.x + pathBox.width,
          bottom: pathBox.y + pathBox.height,
          width: pathBox.width,
          height: pathBox.height,
        }),
        horizontalGap,
        finite,
        endpointsMeetCards,
        boundedCorridor,
        visibleAcrossGap,
      };
    });
    const completeCards = [
      focus,
      ...stage.querySelectorAll('[data-semantic-zoom-leafward-edge-id]'),
      ...stage.querySelectorAll('[data-semantic-zoom-rootward-position]'),
    ].every((card) => {
      const rect = card.getBoundingClientRect();
      return rect.left >= 0 && rect.top >= 0 &&
        rect.right <= innerWidth && rect.bottom <= innerHeight;
    });
    return {
      focusName: document.querySelector('[data-focus-card-heading]')?.textContent?.trim() ?? '',
      stage: rectangle(stageRect),
      svg: rectangle(svgRect),
      viewBox: svg.getAttribute('viewBox'),
      stageWidth: Number(svg.getAttribute('data-semantic-zoom-stage-width')),
      stageHeight: Number(svg.getAttribute('data-semantic-zoom-stage-height')),
      lineState: svg.getAttribute('data-semantic-zoom-lines-state'),
      lineCount: details.length,
      leafwardCount: details.filter(({ kind }) => kind === 'leafward').length,
      rootwardCount: details.filter(({ kind }) => kind === 'rootward').length,
      keys: details.map(({ key }) => key),
      details,
      completeCards,
      pointerInert: getComputedStyle(svg).pointerEvents === 'none',
      ariaHidden: svg.getAttribute('aria-hidden') === 'true',
      sharedCoordinateSystem:
        close(stageRect.left, svgRect.left) && close(stageRect.top, svgRect.top) &&
        close(stageRect.width, svgRect.width) && close(stageRect.height, svgRect.height) &&
        close(stageRect.width, Number(svg.getAttribute('data-semantic-zoom-stage-width'))) &&
        close(stageRect.height, Number(svg.getAttribute('data-semantic-zoom-stage-height'))),
      allCorrect: details.length > 0 && completeCards &&
        details.every(({ finite, endpointsMeetCards, boundedCorridor, visibleAcrossGap }) =>
          finite && endpointsMeetCards && boundedCorridor && visibleAcrossGap,
        ),
    };
  })()`);
}

async function waitForRelationshipLineState(
  driver,
  focusName,
  minimumLeafward,
  rootwardCount,
) {
  let lastSnapshot;
  try {
    return await waitUntil(
      async () => {
        const snapshot = await relationshipLineSnapshot(driver);
        lastSnapshot = snapshot;
        if (
          snapshot?.focusName !== focusName ||
          snapshot.leafwardCount < minimumLeafward ||
          snapshot.rootwardCount !== rootwardCount ||
          !snapshot.sharedCoordinateSystem ||
          !snapshot.allCorrect ||
          !snapshot.pointerInert ||
          !snapshot.ariaHidden
        ) {
          return null;
        }
        return snapshot;
      },
      `relationship-line geometry for ${focusName}`,
      15_000,
    );
  } catch (error) {
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}\nLast snapshot: ${JSON.stringify(lastSnapshot)}`,
    );
  }
}

async function relationshipLineRegression(
  driver,
  screenshotDirectory,
  presentation = 'compact',
) {
  const rangeValue = presentation === 'overview' ? '0' : '1';
  await driver.evaluate(`(() => {
    const range = document.querySelector('input[aria-label="Semantic zoom"]');
    if (!range) return false;
    range.value = ${JSON.stringify(rangeValue)};
    range.dispatchEvent(new InputEvent('input', { bubbles: true }));
    return true;
  })()`);
  await importFile(
    driver,
    'xsd',
    INPUTS.relationshipLines,
    'relationship-lines.xsd',
  );
  const stateA = await waitForRelationshipLineState(
    driver,
    'Schema overview',
    3,
    0,
  );
  const screenshots = {};
  if (screenshotDirectory) {
    screenshots.stateA = path.join(
      screenshotDirectory,
      `relationship-lines-${presentation}-state-a.png`,
    );
    await driver.screenshot(screenshots.stateA);
  }

  await driver.click(
    '[data-semantic-zoom-leafward-edge-id] [data-carousel-navigation-action]',
  );
  const stateB = await waitForRelationshipLineState(
    driver,
    'RelationshipLineType',
    1,
    1,
  );
  if (screenshotDirectory) {
    screenshots.stateB = path.join(
      screenshotDirectory,
      `relationship-lines-${presentation}-state-b.png`,
    );
    await driver.screenshot(screenshots.stateB);
  }

  await driver.click(
    '[data-semantic-zoom-rootward-position] [data-carousel-navigation-action]',
  );
  const stateC = await waitForRelationshipLineState(
    driver,
    'Schema overview',
    3,
    0,
  );
  if (screenshotDirectory) {
    screenshots.stateC = path.join(
      screenshotDirectory,
      `relationship-lines-${presentation}-state-c.png`,
    );
    await driver.screenshot(screenshots.stateC);
  }

  const noStateBPathsRemain = stateC.keys.every(
    (key) => !stateB.keys.includes(key),
  );
  const stateARestored =
    JSON.stringify(stateC.keys) === JSON.stringify(stateA.keys);
  await driver.evaluate(`(() => {
    const range = document.querySelector('input[aria-label="Semantic zoom"]');
    if (!range) return false;
    range.value = '2';
    range.dispatchEvent(new InputEvent('input', { bubbles: true }));
    return true;
  })()`);
  const fullCleared = await waitUntil(
    () =>
      driver.evaluate(
        `document.querySelector('[data-carousel-gesture-viewport]')?.getAttribute('data-semantic-zoom-presentation') === 'full' &&
       !document.querySelector('[data-semantic-zoom-relationship-lines]')`,
      ),
    'relationship lines cleared in Full',
  );
  await driver.evaluate(`(() => {
    const range = document.querySelector('input[aria-label="Semantic zoom"]');
    if (!range) return false;
    range.value = ${JSON.stringify(rangeValue)};
    range.dispatchEvent(new InputEvent('input', { bubbles: true }));
    return true;
  })()`);
  const presentationRestored = await waitForRelationshipLineState(
    driver,
    'Schema overview',
    3,
    0,
  );
  return {
    presentation,
    fixture: INPUTS.relationshipLines,
    stateA,
    stateB,
    stateC,
    noStateBPathsRemain,
    stateARestored,
    fullCleared,
    presentationRestored,
    screenshots,
  };
}

async function compactSemanticZoomAudit(
  driver,
  url,
  screenshotDirectory,
  hermeticPath,
) {
  await driver.setViewport(1440, 900, false);
  await driver.navigate(url);
  await dismissWelcome(driver);
  const initial = await driver.evaluate(`(() => {
    const surface = document.querySelector('[data-carousel-gesture-viewport]');
    const control = document.querySelector('[data-semantic-zoom-control]');
    const range = control?.querySelector('input[type="range"]');
    return {
      project: document.querySelector('.project-name strong')?.textContent?.trim() ?? '',
      currentNode: document.querySelector('[data-focus-card-heading]')?.textContent?.trim() ?? '',
      requested: surface?.getAttribute('data-semantic-zoom-requested') ?? null,
      effective: surface?.getAttribute('data-semantic-zoom-effective') ?? null,
      presentation: surface?.getAttribute('data-semantic-zoom-presentation') ?? null,
      available: surface?.getAttribute('data-semantic-zoom-available') ?? null,
      reducedMotion: surface?.getAttribute('data-reduced-motion') ?? null,
      controlPresent: Boolean(control),
      range: range ? {
        min: range.getAttribute('min'),
        max: range.getAttribute('max'),
        value: range.value,
        valueText: range.getAttribute('aria-valuetext'),
      } : null,
      overviewVisible:
        control?.querySelector('.current-level')?.textContent?.trim() ===
        'Overview',
      fullSummaryPresent: Boolean(document.querySelector('[data-focus-card-scroll-region]')),
      lineLayerCount: document.querySelectorAll('[data-semantic-zoom-relationship-lines]').length,
    };
  })()`);

  await driver.evaluate(`(() => {
    document.querySelector('[data-focus-card-scroll-region]')?.focus();
    const range = document.querySelector('input[aria-label="Semantic zoom"]');
    if (!range) return false;
    range.value = '1';
    range.dispatchEvent(new InputEvent('input', { bubbles: true }));
    return true;
  })()`);
  await waitUntil(
    () =>
      driver.evaluate(
        `document.querySelector('[data-carousel-gesture-viewport]')?.getAttribute('data-semantic-zoom-presentation') === 'compact'`,
      ),
    'Task 14.2 Compact selection',
  );
  await waitUntil(
    () =>
      driver.evaluate(
        `document.querySelectorAll('[data-semantic-zoom-line-kind="leafward"]').length > 0`,
      ),
    'Task 14.2 initial Compact relationship lines',
  );
  const compact = await driver.evaluate(`(() => {
    const surface = document.querySelector('[data-carousel-gesture-viewport]');
    const focus = document.querySelector('[data-semantic-zoom-line-role="focus"]');
    const range = document.querySelector('input[aria-label="Semantic zoom"]');
    return {
      requested: surface?.getAttribute('data-semantic-zoom-requested') ?? null,
      effective: surface?.getAttribute('data-semantic-zoom-effective') ?? null,
      presentation: surface?.getAttribute('data-semantic-zoom-presentation') ?? null,
      focusName: document.querySelector('[data-focus-card-heading]')?.textContent?.trim() ?? '',
      focusIsHeading: document.activeElement?.matches?.('[data-focus-card-heading]') ?? false,
      focusCompact: focus?.classList.contains('compact') ?? false,
      focusHeight: focus?.getBoundingClientRect().height ?? null,
      focusSummaryPresent: Boolean(focus?.querySelector('[data-focus-card-scroll-region]')),
      focusKindPresent: Boolean(focus?.querySelector('.kind-badge')),
      inspectPresent: Boolean(focus?.querySelector('[aria-label="Inspect book"]')),
      rangeValue: range?.value ?? null,
      rangeValueText: range?.getAttribute('aria-valuetext') ?? null,
      overviewVisible:
        document
          .querySelector('[data-semantic-zoom-control] .current-level')
          ?.textContent?.trim() === 'Overview',
      lineCount: document.querySelectorAll('[data-semantic-zoom-line-kind="leafward"]').length,
    };
  })()`);

  await driver.click('[aria-label="Inspect book.content"]');
  const inspectionOpened = await waitUntil(
    () =>
      driver.evaluate(
        `document.querySelector('[data-inspector-close]')?.getAttribute('aria-label') === 'Close inspector for book.content'`,
      ),
    'Task 14.2 Compact inspection',
  );
  await driver.click('[aria-label="Close inspection for book.content"]');
  const inspectionClosed = await waitUntil(
    () => driver.evaluate(`!document.querySelector('[data-inspector-close]')`),
    'Task 14.2 Compact inspection close',
  );

  await driver.click(
    '[aria-label="Navigate leafward to book.content, DTD element declaration"]',
  );
  await waitUntil(
    () =>
      driver.evaluate(
        `document.querySelector('[data-focus-card-heading]')?.textContent?.trim() === 'book.content'`,
      ),
    'Task 14.2 Compact card navigation',
  );
  await waitUntil(
    () =>
      driver.evaluate(
        `document.querySelectorAll('[data-semantic-zoom-line-kind="rootward"]').length > 0`,
      ),
    'Task 14.2 Compact rootward relationship line',
  );
  const compactContext = await driver.evaluate(`(() => {
    const chapter = document.querySelector('[aria-label="Navigate leafward to chapter+, DTD element declaration"]');
    const paths = [...document.querySelectorAll('[data-semantic-zoom-line-key]')];
    return {
      currentNode: document.querySelector('[data-focus-card-heading]')?.textContent?.trim() ?? '',
      requested: document.querySelector('[data-carousel-gesture-viewport]')?.getAttribute('data-semantic-zoom-requested') ?? null,
      chapterOccurrenceVisible: chapter?.textContent?.includes('chapter+') ?? false,
      chapterDirectionHidden: !chapter?.textContent?.includes('Destination'),
      chapterInspectPresent: Boolean(document.querySelector('[aria-label="Inspect chapter"]')),
      rootwardLineCount: paths.filter((path) => path.getAttribute('data-semantic-zoom-line-kind') === 'rootward').length,
      leafwardLineCount: paths.filter((path) => path.getAttribute('data-semantic-zoom-line-kind') === 'leafward').length,
      finitePaths: paths.every((path) => !/NaN|Infinity/.test(path.getAttribute('d') ?? '')),
      uniqueKeys: new Set(paths.map((path) => path.getAttribute('data-semantic-zoom-line-key'))).size === paths.length,
    };
  })()`);

  await driver.evaluate(
    `document.querySelector('[data-focus-card-heading]')?.focus()`,
  );
  await driver.evaluate(`document.body.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'ArrowRight', bubbles: true, cancelable: true
  }))`);
  const leafwardNode = await waitUntil(
    () =>
      driver.evaluate(
        `document.querySelector('[data-focus-card-heading]')?.textContent?.trim() === 'chapter'
        ? 'chapter' : ''`,
      ),
    'Task 14.2 Compact leafward keyboard navigation',
  );
  await driver.evaluate(`document.body.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'ArrowLeft', bubbles: true, cancelable: true
  }))`);
  const rootwardNode = await waitUntil(
    () =>
      driver.evaluate(
        `document.querySelector('[data-focus-card-heading]')?.textContent?.trim() === 'book.content'
        ? 'book.content' : ''`,
      ),
    'Task 14.2 Compact rootward keyboard navigation',
  );

  await driver.evaluate(`(() => {
    const search = document.querySelector('[aria-label="Search schema"]');
    if (!search) return false;
    search.value = 'chapter';
    search.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: 'chapter' }));
    return true;
  })()`);
  await waitUntil(
    () =>
      driver.evaluate(
        `Boolean(document.querySelector('[aria-label="Inspect chapter, DTD element declaration"]'))`,
      ),
    'Task 14.2 Compact Search results',
  );
  await driver.click('[aria-label="Inspect chapter, DTD element declaration"]');
  const searchInspection = await waitUntil(
    () =>
      driver.evaluate(`(() => ({
        inspected: document.querySelector('[data-inspector-close]')?.getAttribute('aria-label') ?? '',
        currentNode: document.querySelector('[data-focus-card-heading]')?.textContent?.trim() ?? '',
        requested: document.querySelector('[data-carousel-gesture-viewport]')?.getAttribute('data-semantic-zoom-requested') ?? null,
        searchValue: document.querySelector('[aria-label="Search schema"]')?.value ?? '',
      }))()`),
    'Task 14.2 Search Inspect state',
  );
  await driver.click('[aria-label="Center chapter, DTD element declaration"]');
  const searchCenter = await waitUntil(
    () =>
      driver.evaluate(
        `document.querySelector('[data-focus-card-heading]')?.textContent?.trim() === 'chapter'`,
      ),
    'Task 14.2 Search centre',
  );

  const compactBranchDirectory = await mkdtemp(
    path.join(os.tmpdir(), 'xml-carousel-compact-branch-'),
  );
  let branchShift;
  try {
    const compactBranchPath = path.join(
      compactBranchDirectory,
      'compact-branches.dtd',
    );
    const childNames = Array.from({ length: 9 }, (_, index) => `child${index}`);
    await writeFile(
      compactBranchPath,
      [
        `<!ELEMENT branch-root (${childNames.join(',')})>`,
        ...childNames.map((name) => `<!ELEMENT ${name} EMPTY>`),
      ].join('\n'),
      'utf8',
    );
    await importFile(driver, 'dtd', compactBranchPath, 'compact-branches.dtd');
    await waitUntil(
      () =>
        driver.evaluate(
          `Boolean(document.querySelector('[data-carousel-window-direction="leafward-next"]')) &&
          document.querySelector('[data-carousel-gesture-viewport]')?.getAttribute('data-semantic-zoom-presentation') === 'compact'`,
        ),
      'Task 14.2 Compact branch window',
    );
    const before = await driver.evaluate(`[
      ...document.querySelectorAll('[data-semantic-zoom-line-kind="leafward"]'),
    ].map((line) => line.getAttribute('data-semantic-zoom-line-key'))`);
    await driver.click('[data-carousel-window-direction="leafward-next"]');
    const after = await waitUntil(async () => {
      const current = await driver.evaluate(`[
        ...document.querySelectorAll('[data-semantic-zoom-line-kind="leafward"]'),
      ].map((line) => line.getAttribute('data-semantic-zoom-line-key'))`);
      return JSON.stringify(before) !== JSON.stringify(current)
        ? current
        : null;
    }, 'Task 14.2 Compact branch-window line redraw');
    branchShift = await driver.evaluate(`(() => ({
      project: document.querySelector('.project-name strong')?.textContent?.trim() ?? '',
      requested: document.querySelector('[data-carousel-gesture-viewport]')?.getAttribute('data-semantic-zoom-requested') ?? null,
      controlPresent: true,
    }))()`);
    branchShift = {
      ...branchShift,
      changed: true,
      before,
      after,
    };
  } finally {
    await rm(compactBranchDirectory, { recursive: true, force: true });
  }

  const compactRelationshipLines = await relationshipLineRegression(
    driver,
    screenshotDirectory,
    'compact',
  );
  const compactVisibleLeafwardCards =
    compactRelationshipLines.stateA.leafwardCount;
  const overviewRelationshipLines = await relationshipLineRegression(
    driver,
    screenshotDirectory,
    'overview',
  );
  const overviewVisibleLeafwardCards =
    overviewRelationshipLines.stateA.leafwardCount;
  await driver.click(
    '[data-semantic-zoom-leafward-edge-id] [data-carousel-navigation-action]',
  );
  await waitUntil(
    () =>
      driver.evaluate(
        `document.querySelector('[data-focus-card-heading]')?.textContent?.trim() === 'RelationshipLineType'`,
      ),
    'Task 14.3 Overview rootward names-only state',
  );
  const overviewRootwardNamesOnly = await driver.evaluate(`(() => {
    const cards = [...document.querySelectorAll('.rootward-context .context-card')];
    return cards.length > 0 && cards.every((card) =>
      card.textContent?.trim() === card.querySelector('.node-name')?.textContent?.trim()
    );
  })()`);
  await driver.click(
    '[data-semantic-zoom-rootward-position] [data-carousel-navigation-action]',
  );
  await waitUntil(
    () =>
      driver.evaluate(
        `document.querySelector('[data-focus-card-heading]')?.textContent?.trim() === 'Schema overview'`,
      ),
    'Task 14.3 Overview rootward return',
  );
  const overview = await driver.evaluate(`(() => {
    const surface = document.querySelector('[data-carousel-gesture-viewport]');
    const focus = document.querySelector('[data-semantic-zoom-focus-card]');
    const contextCards = [...document.querySelectorAll('.context-card')];
    const historyRows = [...document.querySelectorAll('[data-rootward-history-row]')];
    const visibleText = (element) => element?.textContent?.trim() ?? '';
    return {
      requested: surface?.getAttribute('data-semantic-zoom-requested') ?? null,
      effective: surface?.getAttribute('data-semantic-zoom-effective') ?? null,
      presentation: surface?.getAttribute('data-semantic-zoom-presentation') ?? null,
      rangeValue: document.querySelector('input[aria-label="Semantic zoom"]')?.value ?? null,
      rangeValueText: document.querySelector('input[aria-label="Semantic zoom"]')?.getAttribute('aria-valuetext') ?? null,
      focusName: focus?.querySelector('[data-focus-card-heading]')?.textContent?.trim() ?? '',
      focusHeight: focus?.getBoundingClientRect().height ?? null,
      rootwardNamesOnly: ${overviewRootwardNamesOnly},
      contextNamesOnly: contextCards.every((card) =>
        visibleText(card) === visibleText(card.querySelector('.node-name'))
      ),
      historyNamesOnly: historyRows.every((row) =>
        visibleText(row) === visibleText(row.querySelector('.node-name'))
      ),
      focusedInspectCount: focus?.querySelectorAll('[data-inspect-node-id]').length ?? -1,
      contextInspectCount: contextCards.reduce(
        (count, card) => count + card.querySelectorAll('[data-inspect-node-id]').length,
        0,
      ),
      kindBadgeCount: surface?.querySelectorAll('.kind-badge').length ?? -1,
      occurrenceVisible: contextCards.some((card) => /[?*+]$/u.test(visibleText(card))),
      linePresentation: document.querySelector('[data-semantic-zoom-relationship-lines]')?.getAttribute('data-semantic-zoom-line-presentation') ?? null,
      compactVisibleLeafwardCards: ${compactVisibleLeafwardCards},
      overviewVisibleLeafwardCards: ${overviewVisibleLeafwardCards},
      contextIncrease: ${overviewVisibleLeafwardCards} > ${compactVisibleLeafwardCards},
      overflowControlPresent: Boolean(document.querySelector('[data-carousel-window-direction^="leafward-"]')),
    };
  })()`);
  const overviewBeforeInspection = await driver.evaluate(`(() => ({
    project: document.querySelector('.project-name strong')?.textContent?.trim() ?? '',
    currentNode: document.querySelector('[data-focus-card-heading]')?.textContent?.trim() ?? '',
    requested: document.querySelector('[data-carousel-gesture-viewport]')?.getAttribute('data-semantic-zoom-requested') ?? null,
    effective: document.querySelector('[data-carousel-gesture-viewport]')?.getAttribute('data-semantic-zoom-effective') ?? null,
    presentation: document.querySelector('[data-carousel-gesture-viewport]')?.getAttribute('data-semantic-zoom-presentation') ?? null,
    searchValue: document.querySelector('[aria-label="Search schema"]')?.value ?? '',
  }))()`);
  await driver.click('[aria-label="Inspect Schema overview"]');
  const overviewInspectionOpened = await waitUntil(
    () =>
      driver.evaluate(`(() => {
        const close = document.querySelector('[data-inspector-close]');
        if (close?.getAttribute('aria-label') !== 'Close inspector for Schema overview') return null;
        return {
          inspected: close.getAttribute('aria-label'),
          focusAction: document.querySelector('[data-semantic-zoom-focus-card] [data-inspect-node-id]')?.getAttribute('aria-label') ?? '',
          project: document.querySelector('.project-name strong')?.textContent?.trim() ?? '',
          currentNode: document.querySelector('[data-focus-card-heading]')?.textContent?.trim() ?? '',
          requested: document.querySelector('[data-carousel-gesture-viewport]')?.getAttribute('data-semantic-zoom-requested') ?? null,
          effective: document.querySelector('[data-carousel-gesture-viewport]')?.getAttribute('data-semantic-zoom-effective') ?? null,
          presentation: document.querySelector('[data-carousel-gesture-viewport]')?.getAttribute('data-semantic-zoom-presentation') ?? null,
          searchValue: document.querySelector('[aria-label="Search schema"]')?.value ?? '',
        };
      })()`),
    'Task 16.1 focused Overview inspection',
  );
  await driver.click('[aria-label="Close inspection for Schema overview"]');
  const overviewInspectionClosed = await waitUntil(
    () =>
      driver.evaluate(`(() => {
        if (document.querySelector('[data-inspector-close]')) return null;
        const action = document.querySelector('[data-semantic-zoom-focus-card] [data-inspect-node-id]');
        return action?.getAttribute('aria-label') === 'Inspect Schema overview';
      })()`),
    'Task 16.1 focused Overview inspection close',
  );
  const overviewInspection = {
    before: overviewBeforeInspection,
    opened: overviewInspectionOpened,
    closed: overviewInspectionClosed,
  };
  const relationshipLines = {
    compact: compactRelationshipLines,
    overview: overviewRelationshipLines,
  };

  const importPersistence = [];
  const importCases = [
    ['dtd', INPUTS.dtd, 'library.dtd', 'dtd'],
    ['xsd', INPUTS.xsd, 'attributes.xsd', 'xsd'],
    ['zip', INPUTS.zip, 'valid-xsd-include.zip', 'zip'],
    ...(hermeticPath
      ? [
          [
            'zip',
            path.resolve(hermeticPath),
            path.basename(hermeticPath),
            'hermetic-foundry',
          ],
        ]
      : []),
  ];
  for (const [inputFormat, input, filename, evidenceFormat] of importCases) {
    await importFile(driver, inputFormat, input, filename);
    importPersistence.push(
      await driver.evaluate(`(() => {
        const surface = document.querySelector('[data-carousel-gesture-viewport]');
        return {
          format: ${JSON.stringify(evidenceFormat)},
          project: document.querySelector('.project-name strong')?.textContent?.trim() ?? '',
          requested: surface?.getAttribute('data-semantic-zoom-requested') ?? null,
          effective: surface?.getAttribute('data-semantic-zoom-effective') ?? null,
          presentation: surface?.getAttribute('data-semantic-zoom-presentation') ?? null,
          controlPresent: Boolean(document.querySelector('[data-semantic-zoom-control]')),
        };
      })()`),
    );
  }

  const largeSchemas = [];
  for (const [format, input, filename] of [
    ['dtd', INPUTS.largeDtd, 'large-10000.dtd'],
    ['xsd', INPUTS.largeXsd, 'large-10000.xsd'],
  ]) {
    const importStartedAt = Date.now();
    await importFile(driver, format, input, filename);
    const importDurationMs = Date.now() - importStartedAt;
    const presentations = [];
    for (const [presentation, rangeValue] of [
      ['full', '2'],
      ['compact', '1'],
      ['overview', '0'],
    ]) {
      await driver.evaluate(`(() => {
        const range = document.querySelector('input[aria-label="Semantic zoom"]');
        if (!range) return false;
        range.value = ${JSON.stringify(rangeValue)};
        range.dispatchEvent(new InputEvent('input', { bubbles: true }));
        return true;
      })()`);
      await waitForSemanticZoomSettlement(driver, presentation);
      await driver.evaluate(
        `new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))`,
      );
      presentations.push(
        await driver.evaluate(`(() => {
          const surface = document.querySelector('[data-carousel-gesture-viewport]');
          return {
            presentation: surface?.getAttribute('data-semantic-zoom-presentation') ?? null,
            requested: surface?.getAttribute('data-semantic-zoom-requested') ?? null,
            effective: surface?.getAttribute('data-semantic-zoom-effective') ?? null,
            project: document.querySelector('.project-name strong')?.textContent?.trim() ?? '',
            visibleCarouselCards: document.querySelectorAll(
              '[data-semantic-zoom-focus-card], .context-card',
            ).length,
            totalElements: document.getElementsByTagName('*').length,
            importPhase: document.querySelector('.app-shell')?.getAttribute('data-schema-import-phase') ?? null,
            pageOverflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          };
        })()`),
      );
    }
    const searchStartedAt = Date.now();
    await driver.evaluate(`(() => {
      const search = document.querySelector('[aria-label="Search schema"]');
      if (!search) return false;
      search.value = 'node00001';
      search.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        inputType: 'insertText',
        data: 'node00001',
      }));
      return true;
    })()`);
    await waitUntil(
      () =>
        driver.evaluate(
          `Boolean(document.querySelector('[aria-label^="Center node00001,"]'))`,
        ),
      `Task 14.5 ${filename} Search result`,
    );
    largeSchemas.push({
      format,
      filename,
      importDurationMs,
      searchDurationMs: Date.now() - searchStartedAt,
      searchResultFound: true,
      presentations,
    });
  }

  await driver.navigate(url);
  await dismissWelcome(driver);
  const wheel = await driver.evaluate(`(async () => {
    const surface = document.querySelector('[data-carousel-gesture-viewport]');
    const control = document.querySelector('[data-semantic-zoom-control]');
    if (!surface || !control) return null;
    const dispatch = (target, input) => {
      const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...input });
      const dispatchResult = target.dispatchEvent(event);
      return { dispatchResult, defaultPrevented: event.defaultPrevented, ...input };
    };
    const down = dispatch(control, { deltaY: 120 });
    await new Promise((resolve) => setTimeout(resolve, 220));
    const downAgain = dispatch(control, { deltaY: 120 });
    await new Promise((resolve) => setTimeout(resolve, 220));
    const overviewBoundary = dispatch(control, { deltaY: 120 });
    const overviewAfterBoundary = surface.getAttribute('data-semantic-zoom-requested');
    const up = dispatch(control, { deltaY: -120 });
    await new Promise((resolve) => setTimeout(resolve, 220));
    const upAgain = dispatch(control, { deltaY: -120 });
    await new Promise((resolve) => setTimeout(resolve, 220));
    const fullBoundary = dispatch(control, { deltaY: -120 });
    const ctrl = dispatch(control, { deltaY: 120, ctrlKey: true });
    const meta = dispatch(control, { deltaY: -120, metaKey: true });
    const ordinary = dispatch(surface, { deltaY: 120 });
    return {
      down,
      downAgain,
      overviewBoundary,
      up,
      upAgain,
      fullBoundary,
      ctrl,
      meta,
      ordinary,
      overviewAfterBoundary,
      finalRequested: surface.getAttribute('data-semantic-zoom-requested'),
    };
  })()`);

  await driver.evaluate(`(() => {
    const range = document.querySelector('input[aria-label="Semantic zoom"]');
    range.value = '0';
    range.dispatchEvent(new InputEvent('input', { bubbles: true }));
    range.focus();
  })()`);
  await driver.setViewport(768, 900, false);
  const constrained = await waitUntil(
    () =>
      driver.evaluate(`(() => {
        const surface = document.querySelector('[data-carousel-gesture-viewport]');
        if (surface?.getAttribute('data-semantic-zoom-available') !== 'false') return null;
        if (!document.activeElement?.matches?.('[data-focus-card-heading]')) return null;
        return {
          requested: surface.getAttribute('data-semantic-zoom-requested'),
          effective: surface.getAttribute('data-semantic-zoom-effective'),
          presentation: surface.getAttribute('data-semantic-zoom-presentation'),
          controlPresent: Boolean(document.querySelector('[data-semantic-zoom-control]')),
          focusIsHeading: document.activeElement?.matches?.('[data-focus-card-heading]') ?? false,
          lineLayerPresent: Boolean(document.querySelector('[data-semantic-zoom-relationship-lines]')),
        };
      })()`),
    'Task 14.3 constrained fallback',
  );
  await driver.setViewport(1440, 900, false);
  const restored = await waitUntil(
    () =>
      driver.evaluate(`(() => {
        const surface = document.querySelector('[data-carousel-gesture-viewport]');
        if (surface?.getAttribute('data-semantic-zoom-presentation') !== 'overview') return null;
        return {
          requested: surface.getAttribute('data-semantic-zoom-requested'),
          effective: surface.getAttribute('data-semantic-zoom-effective'),
          presentation: surface.getAttribute('data-semantic-zoom-presentation'),
          controlPresent: Boolean(document.querySelector('[data-semantic-zoom-control]')),
          rangeValue: document.querySelector('input[aria-label="Semantic zoom"]')?.value ?? null,
        };
      })()`),
    'Task 14.3 desktop restoration',
  );

  return {
    url,
    initial,
    compact,
    overview,
    overviewInspection,
    inspectionOpened,
    inspectionClosed,
    compactContext,
    leafwardNode,
    rootwardNode,
    searchInspection,
    searchCenter,
    branchShift,
    relationshipLines,
    importPersistence,
    largeSchemas,
    wheel,
    constrained,
    restored,
  };
}

async function waitForSemanticZoomSettlement(driver, presentation) {
  return waitUntil(
    () =>
      driver.evaluate(`(() => {
        const surface = document.querySelector('[data-carousel-gesture-viewport]');
        return surface?.getAttribute('data-semantic-zoom-presentation') === ${JSON.stringify(presentation)} &&
          surface?.getAttribute('data-semantic-zoom-transition') === 'idle';
      })()`),
    `Task 14.4 ${presentation} semantic zoom settlement`,
  );
}

async function beginSemanticZoomPhaseCapture(driver) {
  await driver.evaluate(`(() => {
    window.__xmlCarouselSemanticZoomPhases = [];
    window.__xmlCarouselSemanticZoomObserver?.disconnect();
    const surface = document.querySelector('[data-carousel-gesture-viewport]');
    if (!surface) return false;
    const capture = () => window.__xmlCarouselSemanticZoomPhases.push({
      phase: surface.getAttribute('data-semantic-zoom-transition'),
      from: surface.getAttribute('data-semantic-zoom-transition-from'),
      to: surface.getAttribute('data-semantic-zoom-transition-to'),
      presentation: surface.getAttribute('data-semantic-zoom-presentation'),
      lineCount: document.querySelectorAll('[data-semantic-zoom-line-key]').length,
      temporaryMotionCount: document.querySelectorAll('[data-semantic-zoom-motion]').length,
    });
    capture();
    window.__xmlCarouselSemanticZoomObserver = new MutationObserver(capture);
    window.__xmlCarouselSemanticZoomObserver.observe(surface, {
      attributes: true,
      attributeFilter: [
        'data-semantic-zoom-transition',
        'data-semantic-zoom-transition-from',
        'data-semantic-zoom-transition-to',
        'data-semantic-zoom-presentation',
      ],
    });
    return true;
  })()`);
}

async function finishSemanticZoomPhaseCapture(driver) {
  return driver.evaluate(`(() => {
    window.__xmlCarouselSemanticZoomObserver?.disconnect();
    window.__xmlCarouselSemanticZoomObserver = undefined;
    const phases = window.__xmlCarouselSemanticZoomPhases ?? [];
    delete window.__xmlCarouselSemanticZoomPhases;
    return phases;
  })()`);
}

async function semanticZoomAction(
  driver,
  triggerExpression,
  expectedPresentation,
) {
  await beginSemanticZoomPhaseCapture(driver);
  const triggered = await driver.evaluate(triggerExpression);
  if (triggered === false || triggered === null) {
    throw new Error(
      `Task 14.4 semantic zoom action could not target ${expectedPresentation}.`,
    );
  }
  await waitForSemanticZoomSettlement(driver, expectedPresentation);
  if (expectedPresentation !== 'full') {
    await waitUntil(
      () =>
        driver.evaluate(`(() => {
          const lines = document.querySelector('[data-semantic-zoom-relationship-lines]');
          return lines?.getAttribute('data-semantic-zoom-lines-state') === 'resting' &&
            lines.querySelectorAll('[data-semantic-zoom-line-key]').length > 0;
        })()`),
      `Task 14.4 ${expectedPresentation} relationship-line redraw`,
    );
  }
  const phases = await finishSemanticZoomPhaseCapture(driver);
  const settled = await driver.evaluate(`(() => {
    const surface = document.querySelector('[data-carousel-gesture-viewport]');
    const active = document.activeElement;
    return {
      requested: surface?.getAttribute('data-semantic-zoom-requested') ?? null,
      effective: surface?.getAttribute('data-semantic-zoom-effective') ?? null,
      presentation: surface?.getAttribute('data-semantic-zoom-presentation') ?? null,
      transition: surface?.getAttribute('data-semantic-zoom-transition') ?? null,
      focusLabel: active?.getAttribute?.('aria-label') ?? active?.textContent?.trim() ?? '',
      focusOnBody: active === document.body,
      temporaryMotionCount: document.querySelectorAll('[data-semantic-zoom-motion]').length,
      transformedMotionCount: [...document.querySelectorAll('[data-carousel-motion-key]')]
        .filter((element) => element.style.transform).length,
      lineState: document.querySelector('[data-semantic-zoom-relationship-lines]')
        ?.getAttribute('data-semantic-zoom-lines-state') ?? null,
      lineCount: document.querySelectorAll('[data-semantic-zoom-line-key]').length,
      pageOverflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  })()`);
  return { phases, settled };
}

async function semanticZoomViewportSnapshot(driver, width, height) {
  await driver.setViewport(width, height, false);
  const available = width >= 1024 && height >= 600;
  await waitUntil(
    () =>
      driver.evaluate(`(() => {
        const surface = document.querySelector('[data-carousel-gesture-viewport]');
        return surface?.getAttribute('data-semantic-zoom-available') === ${JSON.stringify(String(available))} &&
          surface?.getAttribute('data-semantic-zoom-transition') === 'idle';
      })()`),
    `Task 14.4 ${width}x${height} responsive settlement`,
  );
  return driver.evaluate(`(() => {
    const surface = document.querySelector('[data-carousel-gesture-viewport]');
    const control = document.querySelector('[data-semantic-zoom-control]');
    const controlRect = control?.getBoundingClientRect();
    const surfaceRect = surface?.getBoundingClientRect();
    const currentLevel = control?.querySelector('.current-level');
    const range = control?.querySelector('input[type="range"]');
    const buttons = [...(control?.querySelectorAll('button') ?? [])];
    const visible = (element) => {
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    return {
      width: innerWidth,
      height: innerHeight,
      queryMatches: matchMedia(${JSON.stringify(
        '(min-width: 1024px) and (min-height: 600px)',
      )}).matches,
      requested: surface?.getAttribute('data-semantic-zoom-requested') ?? null,
      effective: surface?.getAttribute('data-semantic-zoom-effective') ?? null,
      available: surface?.getAttribute('data-semantic-zoom-available') ?? null,
      transition: surface?.getAttribute('data-semantic-zoom-transition') ?? null,
      controlPresent: Boolean(control),
      controlContained: !control || Boolean(controlRect && surfaceRect &&
        controlRect.left >= surfaceRect.left - 1 &&
        controlRect.right <= surfaceRect.right + 1 &&
        controlRect.top >= surfaceRect.top - 1 &&
        controlRect.bottom <= surfaceRect.bottom + 1),
      buttonsVisible: buttons.length === 0 || buttons.every(visible),
      rangeVisible: !range || visible(range),
      currentLevelVisible: !currentLevel || visible(currentLevel),
      currentLevelText: currentLevel?.textContent?.trim() ?? '',
      controlClipped: Boolean(control &&
        (control.scrollWidth > control.clientWidth + 1 ||
          control.scrollHeight > control.clientHeight + 1)),
      pageOverflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      pageOverflowY: document.documentElement.scrollHeight > document.documentElement.clientHeight,
    };
  })()`);
}

async function semanticZoomReflowSnapshot(driver, width, height, scale) {
  await driver.setViewport(width, height, false);
  await driver.evaluate(`(() => {
    document.documentElement.style.fontSize = ${JSON.stringify(`${scale}%`)};
    return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  })()`);
  return driver.evaluate(`(() => {
    const surface = document.querySelector('[data-carousel-gesture-viewport]');
    const control = document.querySelector('[data-semantic-zoom-control]');
    const focus = document.querySelector('[data-semantic-zoom-focus-card]');
    const summary = document.querySelector('[data-focus-card-scroll-region]');
    const controlRect = control?.getBoundingClientRect();
    const surfaceRect = surface?.getBoundingClientRect();
    return {
      scale: ${scale},
      width: innerWidth,
      height: innerHeight,
      requested: surface?.getAttribute('data-semantic-zoom-requested') ?? null,
      effective: surface?.getAttribute('data-semantic-zoom-effective') ?? null,
      controlPresent: Boolean(control),
      controlContained: !control || Boolean(controlRect && surfaceRect &&
        controlRect.left >= surfaceRect.left - 1 && controlRect.right <= surfaceRect.right + 1),
      currentLevelVisible: Boolean(control?.querySelector('.current-level')?.getClientRects().length),
      focusVisible: Boolean(focus?.getClientRects().length),
      summaryScrollable: !summary || summary.scrollHeight >= summary.clientHeight,
      pageOverflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      pageOverflowY: document.documentElement.scrollHeight > document.documentElement.clientHeight,
      ordinaryTwoDimensionalScrolling: document.documentElement.scrollWidth > document.documentElement.clientWidth &&
        document.documentElement.scrollHeight > document.documentElement.clientHeight,
    };
  })()`);
}

async function semanticZoomUxHardeningAudit(
  driver,
  url,
  browser,
  screenshotDirectory,
) {
  const normalMotion = await driver.setMediaPreferences({
    reducedMotion: false,
    forcedColors: false,
  });
  await driver.setViewport(1440, 900, false);
  await driver.navigate(url);
  await dismissWelcome(driver);
  const screenshots = {};
  if (screenshotDirectory) {
    screenshots.fullDetail = path.join(
      screenshotDirectory,
      'semantic-zoom-full-detail.png',
    );
    await driver.screenshot(screenshots.fullDetail);
  }

  const buttonFullToCompact = await semanticZoomAction(
    driver,
    `(() => {
      const button = document.querySelector('[aria-label="Zoom out to Compact"]');
      button?.focus();
      button?.click();
      return Boolean(button);
    })()`,
    'compact',
  );
  const buttonCompactToOverview = await semanticZoomAction(
    driver,
    `(() => {
      const button = document.querySelector('[aria-label="Zoom out to Overview"]');
      button?.focus();
      button?.click();
      return Boolean(button);
    })()`,
    'overview',
  );
  const wheelOverviewToCompact = await semanticZoomAction(
    driver,
    `(() => {
      const control = document.querySelector('[data-semantic-zoom-control]');
      const range = control?.querySelector('input[type="range"]');
      if (!control || !range) return false;
      range.focus();
      const event = new WheelEvent('wheel', { deltaY: -120, bubbles: true, cancelable: true });
      control.dispatchEvent(event);
      return event.defaultPrevented;
    })()`,
    'compact',
  );
  const rangeCompactToFull = await semanticZoomAction(
    driver,
    `(() => {
      const range = document.querySelector('input[aria-label="Semantic zoom"]');
      if (!range) return false;
      range.focus();
      range.value = '2';
      range.dispatchEvent(new InputEvent('input', { bubbles: true }));
      return true;
    })()`,
    'full',
  );
  const directFullToOverview = await semanticZoomAction(
    driver,
    `(() => {
      const range = document.querySelector('input[aria-label="Semantic zoom"]');
      if (!range) return false;
      range.focus();
      range.value = '0';
      range.dispatchEvent(new InputEvent('input', { bubbles: true }));
      return true;
    })()`,
    'overview',
  );
  const rapidReversed = await semanticZoomAction(
    driver,
    `(async () => {
      const range = document.querySelector('input[aria-label="Semantic zoom"]');
      if (!range) return false;
      range.focus();
      for (const value of ['1', '2', '0', '1']) {
        range.value = value;
        range.dispatchEvent(new InputEvent('input', { bubbles: true }));
        await Promise.resolve();
      }
      return true;
    })()`,
    'compact',
  );

  const navigationAfterChange = await driver.evaluate(`(async () => {
    document.querySelector('[data-focus-card-heading]')?.focus();
    document.body.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'ArrowRight', bubbles: true, cancelable: true
    }));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    return {
      currentNode: document.querySelector('[data-focus-card-heading]')?.textContent?.trim() ?? '',
      focusIsHeading: document.activeElement?.matches?.('[data-focus-card-heading]') ?? false,
      transition: document.querySelector('[data-carousel-gesture-viewport]')
        ?.getAttribute('data-semantic-zoom-transition') ?? null,
    };
  })()`);

  await driver.navigate(url);
  await dismissWelcome(driver);
  await driver.evaluate(`(() => {
    const range = document.querySelector('input[aria-label="Semantic zoom"]');
    range.value = '0';
    range.dispatchEvent(new InputEvent('input', { bubbles: true }));
  })()`);
  await waitForSemanticZoomSettlement(driver, 'overview');
  const responsiveViewports = [];
  for (const [width, height] of [
    [1440, 900],
    [1280, 720],
    [1280, 600],
    [1100, 600],
    [1024, 768],
    [1024, 600],
    [1024, 599],
    [1023, 600],
    [768, 900],
    [412, 915],
    [390, 844],
    [915, 412],
    [844, 390],
    [320, 800],
  ]) {
    const snapshot = await semanticZoomViewportSnapshot(driver, width, height);
    responsiveViewports.push(snapshot);
    if (screenshotDirectory && width === 1024 && height === 600) {
      screenshots.threshold1024x600 = path.join(
        screenshotDirectory,
        'semantic-zoom-threshold-1024x600.png',
      );
      await driver.screenshot(screenshots.threshold1024x600);
    }
  }

  await driver.setViewport(1440, 900, false);
  const textScaling = [];
  for (const scale of [125, 150, 200]) {
    textScaling.push(
      await semanticZoomReflowSnapshot(driver, 1440, 900, scale),
    );
  }
  await driver.evaluate(
    `document.documentElement.style.removeProperty('font-size')`,
  );

  const magnificationEquivalent = [];
  for (const [scale, width, height] of [
    [125, 1152, 720],
    [150, 960, 600],
    [200, 720, 450],
    [400, 320, 640],
  ]) {
    const snapshot = await semanticZoomReflowSnapshot(
      driver,
      width,
      height,
      100,
    );
    magnificationEquivalent.push(snapshot);
    magnificationEquivalent[
      magnificationEquivalent.length - 1
    ].equivalentScale = scale;
    if (screenshotDirectory && scale === 400) {
      screenshots.reflow320CssPx = path.join(
        screenshotDirectory,
        'semantic-zoom-reflow-320-css-px.png',
      );
      await driver.screenshot(screenshots.reflow320CssPx);
    }
  }
  await driver.evaluate(
    `document.documentElement.style.removeProperty('font-size')`,
  );

  await driver.setViewport(1440, 900, false);
  await driver.navigate(url);
  await dismissWelcome(driver);
  const nativeZoomInputs = await driver.evaluate(`(() => {
    const surface = document.querySelector('[data-carousel-gesture-viewport]');
    const control = document.querySelector('[data-semantic-zoom-control]');
    const dispatchWheel = (target, init) => {
      const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init });
      const result = target.dispatchEvent(event);
      return { dispatchResult: result, defaultPrevented: event.defaultPrevented };
    };
    const dispatchKey = (key) => {
      const event = new KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true, cancelable: true });
      const result = document.dispatchEvent(event);
      return { key, dispatchResult: result, defaultPrevented: event.defaultPrevented };
    };
    return {
      controlCtrlWheel: dispatchWheel(control, { deltaY: 120, ctrlKey: true }),
      controlMetaWheel: dispatchWheel(control, { deltaY: -120, metaKey: true }),
      carouselCtrlWheel: dispatchWheel(surface, { deltaY: 120, ctrlKey: true }),
      keys: ['+', '-', '0'].map(dispatchKey),
    };
  })()`);

  const forcedColourSupport = await driver.setMediaPreferences({
    reducedMotion: false,
    forcedColors: true,
  });
  let forcedColours = { supported: false };
  if (forcedColourSupport.forcedColors) {
    await driver.navigate(url);
    await dismissWelcome(driver);
    await driver.evaluate(`(() => {
      const range = document.querySelector('input[aria-label="Semantic zoom"]');
      range.value = '1';
      range.dispatchEvent(new InputEvent('input', { bubbles: true }));
    })()`);
    await waitForSemanticZoomSettlement(driver, 'compact');
    await waitUntil(
      () =>
        driver.evaluate(
          `document.querySelectorAll('[data-semantic-zoom-line-kind="leafward"]').length > 0`,
        ),
      'Task 14.4 forced-colour Compact relationship lines',
    );
    await driver.click(
      '[aria-label="Navigate leafward to book.content, DTD element declaration"]',
    );
    await waitUntil(
      () =>
        driver.evaluate(
          `document.querySelector('[data-focus-card-heading]')?.textContent?.trim() === 'book.content'`,
        ),
      'Task 14.4 forced-colour rootward navigation',
    );
    await driver.evaluate(`(() => {
      const range = document.querySelector('input[aria-label="Semantic zoom"]');
      range.value = '0';
      range.dispatchEvent(new InputEvent('input', { bubbles: true }));
      range.focus();
    })()`);
    await waitForSemanticZoomSettlement(driver, 'overview');
    await waitUntil(
      () =>
        driver.evaluate(`(() =>
          document.querySelectorAll('[data-semantic-zoom-line-kind="leafward"]').length > 0 &&
          document.querySelectorAll('[data-semantic-zoom-line-kind="rootward"]').length > 0
        )()`),
      'Task 14.4 forced-colour Overview relationship lines',
    );
    forcedColours = await driver.evaluate(`(() => {
      const control = document.querySelector('[data-semantic-zoom-control]');
      const range = control?.querySelector('input[type="range"]');
      const disabled = control?.querySelector('button:disabled');
      const focus = document.querySelector('[data-semantic-zoom-focus-card]');
      const leafward = document.querySelector('[data-semantic-zoom-line-kind="leafward"]');
      const rootward = document.querySelector('[data-semantic-zoom-line-kind="rootward"]');
      const terminal = document.querySelector('[data-semantic-zoom-line-terminal="true"]');
      return {
        supported: matchMedia('(forced-colors: active)').matches,
        controlVisible: Boolean(control?.getClientRects().length),
        rangeVisible: Boolean(range?.getClientRects().length),
        disabledVisible: Boolean(disabled?.getClientRects().length),
        focusVisible: Boolean(focus?.getClientRects().length),
        focusedControl: document.activeElement === range,
        controlBorderStyle: control ? getComputedStyle(control).borderStyle : '',
        disabledBorderStyle: disabled ? getComputedStyle(disabled).borderStyle : '',
        leafwardPattern: leafward ? getComputedStyle(leafward).strokeDasharray : '',
        rootwardPattern: rootward ? getComputedStyle(rootward).strokeDasharray : '',
        terminalPattern: terminal ? getComputedStyle(terminal).strokeDasharray : '',
        pageOverflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    })()`);
    if (screenshotDirectory) {
      screenshots.forcedColoursFocus = path.join(
        screenshotDirectory,
        'task-14-4-forced-colours-focus.png',
      );
      await driver.screenshot(screenshots.forcedColoursFocus);
    }
  }

  const reducedMotionSupport = await driver.setMediaPreferences({
    reducedMotion: true,
    forcedColors: false,
  });
  await driver.navigate(url);
  await dismissWelcome(driver);
  const reducedMotion = await semanticZoomAction(
    driver,
    `(() => {
      const button = document.querySelector('[aria-label="Zoom out to Compact"]');
      button?.focus();
      button?.click();
      return Boolean(button);
    })()`,
    'compact',
  );

  return {
    browser,
    normalMotion,
    buttonFullToCompact,
    buttonCompactToOverview,
    wheelOverviewToCompact,
    rangeCompactToFull,
    directFullToOverview,
    rapidReversed,
    navigationAfterChange,
    responsiveViewports,
    textScaling,
    magnificationEquivalent,
    nativeZoomInputs,
    forcedColours,
    reducedMotionSupport,
    reducedMotion,
    screenshots,
  };
}

async function dismissImportFailure(driver) {
  await driver.click('[aria-label="Dismiss import error"]');
  await waitForIdle(driver);
}

async function relaxNgWorkflowAudit(driver) {
  const retainedSource = await readFile(INPUTS.rng, 'utf8');
  const retainedCompactSource = await readFile(INPUTS.rnc, 'utf8');
  const openRngVisible = await driver.evaluate(
    `Boolean(document.querySelector('[aria-label="Open RNG"]'))`,
  );
  await importFile(driver, 'rng', INPUTS.rng, '01-basic-grammar.rng');
  const valid = await driver.evaluate(`(() => ({
    project: document.querySelector('.project-name strong')?.textContent?.trim() ?? '',
    focused: document.activeElement?.matches?.('[data-focus-card-heading]') ?? false,
    heading: document.querySelector('[data-focus-card-heading]')?.textContent?.trim() ?? '',
    structuralFindingAbsent: !(document.body.textContent?.includes('Structural RELAX NG visualization is not available yet') ?? false),
  }))()`);
  const journeyBeforeInspect = valid.heading;
  await driver.click('[aria-label^="Inspect "]');
  const inspect = await waitUntil(
    () =>
      driver.evaluate(`(() => {
        const inspector = document.querySelector('[aria-label="Schema inspector"]');
        if (!inspector) return null;
        return {
          journey: document.querySelector('[data-focus-card-heading]')?.textContent?.trim() ?? '',
          text: inspector.textContent?.replace(/\\s+/gu, ' ').trim() ?? '',
          syntax: inspector.textContent?.includes('RELAX NG XML syntax') ?? false,
          engine: inspector.textContent?.includes('libxml2 RELAX NG 2.15.3') ?? false,
        };
      })()`),
    'RELAX NG inspector',
  );
  await driver.click('[aria-label^="View source for "]');
  const source = await waitUntil(
    () =>
      driver.evaluate(`(() => {
        const dialog = document.querySelector('#source-view-dialog[open]');
        if (!dialog) return null;
        return {
          text: dialog.querySelector('[data-source-reading-region] code')?.textContent ?? '',
          identity: dialog.querySelector('.source-identity')?.textContent?.replace(/\\s+/gu, ' ').trim() ?? '',
        };
      })()`),
    'RELAX NG source modal',
  );
  await driver.click('[aria-label^="Close source for "]');

  await driver.setFile('#rng-file-input', INPUTS.invalidRng);
  const invalid = await waitUntil(
    () =>
      driver.evaluate(`(() => {
        const alert = document.querySelector('[aria-label="Dismiss import error"]')?.closest('[role="alert"]');
        if (!alert) return null;
        return {
          message: alert.textContent?.replace(/\\s+/gu, ' ').trim() ?? '',
          project: document.querySelector('.project-name strong')?.textContent?.trim() ?? '',
          hasRawProjectUri: document.body.textContent?.includes('project:///') ?? false,
        };
      })()`),
    'invalid RELAX NG failure',
  );
  await dismissImportFailure(driver);
  const invalidFocusRestored = await driver.evaluate(
    `document.activeElement?.getAttribute('aria-label') === 'Open RNG'`,
  );

  await importFile(driver, 'rng', INPUTS.rnc, '01-basic-grammar.rnc');
  const compact = await driver.evaluate(`(() => ({
    project: document.querySelector('.project-name strong')?.textContent?.trim() ?? '',
    heading: document.querySelector('[data-focus-card-heading]')?.textContent?.trim() ?? '',
    compactSyntax: document.body.textContent?.includes('RELAX NG Compact Syntax') ?? false,
  }))()`);
  await driver.click('[aria-label^="View source for "]');
  const compactSource = await waitUntil(
    () =>
      driver.evaluate(`(() => {
        const dialog = document.querySelector('#source-view-dialog[open]');
        if (!dialog) return null;
        return dialog.querySelector('[data-source-reading-region] code')?.textContent ?? '';
      })()`),
    'RELAX NG Compact Syntax source modal',
  );
  await driver.click('[aria-label^="Close source for "]');

  await driver.setFile('#rng-file-input', INPUTS.invalidRnc);
  const invalidCompact = await waitUntil(
    () =>
      driver.evaluate(`(() => {
        const alert = document.querySelector('[aria-label="Dismiss import error"]')?.closest('[role="alert"]');
        if (!alert) return null;
        return {
          project: document.querySelector('.project-name strong')?.textContent?.trim() ?? '',
          message: alert.textContent?.replace(/\\s+/gu, ' ').trim() ?? '',
        };
      })()`),
    'invalid Compact Syntax failure',
  );
  await dismissImportFailure(driver);

  const requestsBeforeBlockedCompact = driver.requests.length;
  await driver.setFile('#rng-file-input', INPUTS.blockedRnc);
  const blockedCompact = await waitUntil(
    () =>
      driver.evaluate(`(() => {
        const alert = document.querySelector('[aria-label="Dismiss import error"]')?.closest('[role="alert"]');
        if (!alert) return null;
        return {
          project: document.querySelector('.project-name strong')?.textContent?.trim() ?? '',
          message: alert.textContent?.replace(/\\s+/gu, ' ').trim() ?? '',
        };
      })()`),
    'blocked Compact Syntax dependency failure',
  );
  const blockedCompactRequests = driver.requests.slice(
    requestsBeforeBlockedCompact,
  );
  await dismissImportFailure(driver);

  const requestsBeforeLocalPackages = driver.requests.length;
  await importFile(
    driver,
    'zip',
    INPUTS.localRngPackage,
    '11-multi-file-includes.zip',
  );
  const localRngProject = await driver.evaluate(
    `document.querySelector('.project-name strong')?.textContent?.trim() ?? ''`,
  );
  await importFile(
    driver,
    'zip',
    INPUTS.localRncPackage,
    '11-multi-file-includes.zip',
  );
  const localRncProject = await driver.evaluate(
    `document.querySelector('.project-name strong')?.textContent?.trim() ?? ''`,
  );
  const localPackageRequests = driver.requests.slice(
    requestsBeforeLocalPackages,
  );

  await driver.setFile('#rng-file-input', INPUTS.cancellationRng);
  const cancellation = await waitUntil(async () => {
    const state = await driver.evaluate(`(() => ({
      cancel: Boolean(document.querySelector('[data-schema-import-phase] button[aria-label^="Cancel"]')),
      project: document.querySelector('.project-name strong')?.textContent?.trim() ?? '',
    }))()`);
    return state.cancel ? state : null;
  }, 'RELAX NG cancellation control');
  await driver.click('[data-schema-import-phase] button[aria-label^="Cancel"]');
  await waitForIdle(driver);
  await importFile(driver, 'rng', INPUTS.rnc, '01-basic-grammar.rnc');
  const freshAfterCancellation = await driver.evaluate(
    `document.querySelector('.project-name strong')?.textContent?.trim() ?? ''`,
  );

  const requestsBeforeBlocked = driver.requests.length;
  await driver.setFile('#rng-file-input', INPUTS.blockedRng);
  const blocked = await waitUntil(
    () =>
      driver.evaluate(`(() => {
        const alert = document.querySelector('[aria-label="Dismiss import error"]')?.closest('[role="alert"]');
        if (!alert) return null;
        return {
          message: alert.textContent?.replace(/\\s+/gu, ' ').trim() ?? '',
          project: document.querySelector('.project-name strong')?.textContent?.trim() ?? '',
        };
      })()`),
    'blocked RELAX NG dependency failure',
  );
  const blockedBrowserRequests = driver.requests.slice(requestsBeforeBlocked);
  await dismissImportFailure(driver);

  await importFile(driver, 'rng', INPUTS.cancellationRng, 'docbook.rng');
  const realWorldProject = await driver.evaluate(
    `document.querySelector('.project-name strong')?.textContent?.trim() ?? ''`,
  );
  await driver.evaluate(`(() => {
    const search = document.querySelector('[aria-label="Search schema"]');
    if (!search) return false;
    search.value = 'book';
    search.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      inputType: 'insertText',
      data: 'book',
    }));
    return true;
  })()`);
  await waitUntil(
    () =>
      driver.evaluate(
        `Boolean(document.querySelector('[aria-label^="Inspect book,"]'))`,
      ),
    'real-world DocBook Search result',
  );
  await driver.click('[aria-label^="Inspect book,"]');
  const realWorldInspector = await waitUntil(
    () =>
      driver.evaluate(`(() => {
        const inspector = document.querySelector('[aria-label="Schema inspector"]');
        if (!inspector) return null;
        return {
          text: inspector.textContent?.replace(/\\s+/gu, ' ').trim() ?? '',
          sourceAction: Boolean(inspector.querySelector('[aria-label^="View source for "]')),
        };
      })()`),
    'real-world DocBook Inspector',
  );
  await driver.click('[aria-label^="View source for "]');
  const realWorldSource = await waitUntil(
    () =>
      driver.evaluate(`(() => {
        const dialog = document.querySelector('#source-view-dialog[open]');
        if (!dialog) return null;
        return {
          identity: dialog.querySelector('.source-identity')?.textContent?.replace(/\\s+/gu, ' ').trim() ?? '',
          text: dialog.querySelector('[data-source-reading-region] code')?.textContent ?? '',
        };
      })()`),
    'real-world DocBook source',
  );
  await driver.click('[aria-label^="Close source for "]');

  return {
    openRngVisible,
    valid,
    inspect,
    inspectDidNotNavigate: inspect.journey === journeyBeforeInspect,
    source: {
      ...source,
      exact: source.text.length > 0 && retainedSource.includes(source.text),
    },
    invalid: {
      ...invalid,
      preserved: invalid.project === '01-basic-grammar.rng',
      focusRestored: invalidFocusRestored,
    },
    compact: {
      ...compact,
      sourceExact:
        compactSource.length > 0 &&
        retainedCompactSource.includes(compactSource),
      invalidPreserved: invalidCompact.project === '01-basic-grammar.rnc',
      invalidMessage: invalidCompact.message,
      blockedPreserved: blockedCompact.project === '01-basic-grammar.rnc',
      blockedMessage: blockedCompact.message,
      blockedNoRemoteRequest: blockedCompactRequests.every((request) => {
        const parsed = new URL(request);
        return parsed.hostname === '127.0.0.1';
      }),
    },
    localPackages: {
      rng: localRngProject,
      rnc: localRncProject,
      noExternalRequests: localPackageRequests.every((request) => {
        const parsed = new URL(request);
        return parsed.hostname === '127.0.0.1';
      }),
    },
    cancellation: {
      ...cancellation,
      freshProject: freshAfterCancellation,
    },
    blocked: {
      ...blocked,
      preserved: blocked.project === '01-basic-grammar.rnc',
      browserRequests: blockedBrowserRequests,
      noRemoteRequest: blockedBrowserRequests.every((request) => {
        const parsed = new URL(request);
        return parsed.hostname === '127.0.0.1';
      }),
    },
    realWorld: {
      project: realWorldProject,
      inspector: realWorldInspector,
      source: realWorldSource,
    },
  };
}

async function smokeDeployment(driver, url, serverRequests) {
  const requestStart = serverRequests.length;
  await driver.navigate(url);
  await dismissWelcome(driver);
  const capabilities = await capabilitySnapshot(driver);
  const startupRequests = serverRequests.slice(requestStart);
  const rng = await relaxNgWorkflowAudit(driver);
  await importFile(driver, 'dtd', INPUTS.dtd, 'library.dtd');
  await importFile(driver, 'xsd', INPUTS.xsd, 'attributes.xsd');
  await importFile(driver, 'zip', INPUTS.zip, 'valid-xsd-include.zip');
  const completedRequests = serverRequests.slice(requestStart);
  return {
    url,
    capabilities,
    rng,
    requests: {
      startup: startupRequests,
      completed: completedRequests,
      startupLazy: startupRequests.every(
        ({ pathname }) =>
          !/relaxNgStandardsWorker|libxml2-relaxng-runtime/u.test(pathname),
      ),
      rngRuntimeLoaded: completedRequests.some(({ pathname }) =>
        /libxml2-relaxng-runtime-[\w-]+\.wasm$/u.test(pathname),
      ),
      rngWorkerLoaded: completedRequests.some(({ pathname }) =>
        /relaxNgStandardsWorker-[\w-]+\.js$/u.test(pathname),
      ),
    },
    project: await driver.evaluate(
      "document.querySelector('.project-name strong')?.textContent?.trim()",
    ),
  };
}

async function developerHandoffAudit(driver, url) {
  await driver.setViewport(1440, 900, false);
  await driver.navigate(url);
  await dismissWelcome(driver);
  const builtInDtd = await driver.evaluate(`(() => ({
    project: document.querySelector('.project-name strong')?.textContent?.trim() ?? '',
    currentNode: document.querySelector('[data-focus-card-heading]')?.textContent?.trim() ?? '',
  }))()`);
  await driver.click('[aria-label="Open XML Carousel help"]');
  await driver.evaluate(`[
    ...document.querySelectorAll('.welcome-help-dialog[open] button'),
  ].find((button) => button.textContent?.trim() === 'Load sample XSD')?.click()`);
  const builtInXsd = await waitUntil(
    () =>
      driver.evaluate(`(() => {
        const project = document.querySelector('.project-name strong')?.textContent?.trim() ?? '';
        const currentNode = document.querySelector('[data-focus-card-heading]')?.textContent?.trim() ?? '';
        return project === 'library.xsd' && currentNode ? { project, currentNode } : null;
      })()`),
    'built-in Library XSD sample',
  );
  const clipboardInstalled = await driver.evaluate(`(() => {
    window.__xmlCarouselCopiedText = [];
    try {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (text) => {
            window.__xmlCarouselCopiedText.push(String(text));
          },
        },
      });
      return typeof navigator.clipboard?.writeText === 'function';
    } catch {
      return false;
    }
  })()`);
  await importFile(driver, 'xsd', INPUTS.xsd, 'attributes.xsd');
  await driver.evaluate(`(() => {
    const search = document.querySelector('[aria-label="Search schema"]');
    if (!search) return false;
    search.value = 'root';
    search.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      inputType: 'insertText',
      data: 'root',
    }));
    return true;
  })()`);
  await waitUntil(
    () =>
      driver.evaluate(
        `Boolean(document.querySelector('[aria-label^="Inspect root,"]'))`,
      ),
    'Task 15 developer handoff Search result',
  );
  await driver.click('[aria-label^="Inspect root,"]');
  await waitUntil(
    () =>
      driver.evaluate(`Boolean(
        document.querySelector('[data-copy-node-summary]') &&
        document.querySelector('[aria-label="View source for root"]')
      )`),
    'Task 15 developer handoff Inspector actions',
  );
  const stateBefore = await driver.evaluate(`(() => ({
    project: document.querySelector('.project-name strong')?.textContent?.trim() ?? '',
    currentNode: document.querySelector('[data-focus-card-heading]')?.textContent?.trim() ?? '',
    inspected: document.querySelector('[data-inspector-close]')?.getAttribute('aria-label') ?? '',
    requested: document.querySelector('[data-carousel-gesture-viewport]')?.getAttribute('data-semantic-zoom-requested') ?? null,
    effective: document.querySelector('[data-carousel-gesture-viewport]')?.getAttribute('data-semantic-zoom-effective') ?? null,
    searchValue: document.querySelector('[aria-label="Search schema"]')?.value ?? '',
  }))()`);
  await driver.click('[data-copy-node-summary]');
  await waitUntil(
    () =>
      driver.evaluate(
        `document.querySelector('[data-node-summary-copy-status]')?.textContent?.trim() === 'Copied node summary' && window.__xmlCarouselCopiedText?.length === 1`,
      ),
    'Task 15 Copy node summary',
  );
  await driver.click('[data-copy-node-summary]');
  await waitUntil(
    () => driver.evaluate(`window.__xmlCarouselCopiedText?.length === 2`),
    'Task 15 deterministic Copy node summary repeat',
  );
  const nodeSummary = await driver.evaluate(`(() => ({
    first: window.__xmlCarouselCopiedText?.[0] ?? '',
    second: window.__xmlCarouselCopiedText?.[1] ?? '',
    feedback: document.querySelector('[data-node-summary-copy-status]')?.textContent?.trim() ?? '',
  }))()`);
  await driver.click('[aria-label="View source for root"]');
  await waitUntil(
    () =>
      driver.evaluate(
        `Boolean(document.querySelector('#source-view-dialog[open] [data-copy-source]'))`,
      ),
    'Task 15 source modal',
  );
  const sourceModal = await driver.evaluate(`(() => {
    const dialog = document.querySelector('#source-view-dialog[open]');
    const rect = dialog?.getBoundingClientRect();
    const code = dialog?.querySelector('[data-source-reading-region] code');
    return {
      heading: dialog?.querySelector('#source-view-title')?.textContent?.trim() ?? '',
      sourceIdentity: dialog?.querySelector('.source-identity')?.textContent?.replace(/\\s+/gu, ' ').trim() ?? '',
      location: dialog?.querySelector('#source-view-location')?.textContent?.replace(/\\s+/gu, ' ').trim() ?? '',
      retainedSource: code?.textContent ?? '',
      fragmentCount: dialog?.querySelectorAll('[data-source-reading-region]').length ?? 0,
      contained: Boolean(rect) && rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight,
      readingRegionScrollable: Boolean(dialog?.querySelector('[data-source-reading-region][tabindex="0"]')),
    };
  })()`);
  await driver.click('#source-view-dialog[open] [data-copy-source]');
  await waitUntil(
    () =>
      driver.evaluate(
        `document.querySelector('#source-view-dialog[open] [role="status"]')?.textContent?.trim() === 'Copied source' && window.__xmlCarouselCopiedText?.length === 3`,
      ),
    'Task 15 exact Copy source',
  );
  const copiedSource = await driver.evaluate(
    `window.__xmlCarouselCopiedText?.[2] ?? ''`,
  );
  await driver.click('[aria-label="Close source for root"]');
  const sourceClosed = await waitUntil(
    () =>
      driver.evaluate(
        `!document.querySelector('#source-view-dialog[open]') && Boolean(document.querySelector('[aria-label="View source for root"]'))`,
      ),
    'Task 15 source modal close',
  );
  const stateAfter = await driver.evaluate(`(() => ({
    project: document.querySelector('.project-name strong')?.textContent?.trim() ?? '',
    currentNode: document.querySelector('[data-focus-card-heading]')?.textContent?.trim() ?? '',
    inspected: document.querySelector('[data-inspector-close]')?.getAttribute('aria-label') ?? '',
    requested: document.querySelector('[data-carousel-gesture-viewport]')?.getAttribute('data-semantic-zoom-requested') ?? null,
    effective: document.querySelector('[data-carousel-gesture-viewport]')?.getAttribute('data-semantic-zoom-effective') ?? null,
    searchValue: document.querySelector('[aria-label="Search schema"]')?.value ?? '',
  }))()`);
  return {
    builtInDtd,
    builtInXsd,
    clipboardInstalled,
    stateBefore,
    nodeSummary,
    sourceModal,
    copiedSource,
    sourceClosed,
    stateAfter,
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
  const screenshotDirectory =
    options.browser === 'chrome' && options.screenshotDirectory
      ? path.resolve(options.screenshotDirectory)
      : undefined;
  if (screenshotDirectory) {
    await mkdir(screenshotDirectory, { recursive: true });
  }
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
            options.firefoxMotion === 'reduced',
          )
        : await ChromiumDriver.launch(path.resolve(options.browserPath));
    driver = launched.driver;
    await driver.setReducedMotion();
    const compactSemanticZoom = await compactSemanticZoomAudit(
      driver,
      server.rootUrl,
      screenshotDirectory,
      options.hermeticPath,
    );
    const semanticZoomUxHardening = await semanticZoomUxHardeningAudit(
      driver,
      server.rootUrl,
      options.browser,
      screenshotDirectory,
    );
    const developerHandoff = await developerHandoffAudit(
      driver,
      server.rootUrl,
    );
    const root = await smokeDeployment(driver, server.rootUrl, serverRequests);
    const nested = await smokeDeployment(
      driver,
      server.nestedUrl,
      serverRequests,
    );
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
    const hermeticSamples =
      options.hermeticCycles > 0
        ? await runHermeticCycles(
            driver,
            path.resolve(options.hermeticPath),
            options.hermeticCycles,
          )
        : [];
    const rootCandidateViewports = [];
    if (options.hermeticCycles > 0) {
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
      compactSemanticZoom,
      semanticZoomUxHardening,
      developerHandoff,
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
        noExternalRequests: driver.requests.every((url) => {
          const parsed = new URL(url);
          return parsed.protocol === 'data:' || parsed.hostname === '127.0.0.1';
        }),
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
        standaloneRngWorkflow: [root, nested].every(
          ({ capabilities, rng, requests, project }) =>
            capabilities.fileInputs &&
            rng.openRngVisible &&
            rng.valid.project === '01-basic-grammar.rng' &&
            rng.valid.heading.length > 0 &&
            rng.valid.focused &&
            rng.valid.structuralFindingAbsent &&
            rng.inspect.text.length > 0 &&
            rng.inspectDidNotNavigate &&
            rng.source.identity.includes('01-basic-grammar.rng') &&
            rng.source.exact &&
            rng.invalid.preserved &&
            !rng.invalid.hasRawProjectUri &&
            rng.invalid.focusRestored &&
            rng.compact.project === '01-basic-grammar.rnc' &&
            rng.compact.heading.length > 0 &&
            rng.compact.sourceExact &&
            rng.compact.invalidPreserved &&
            rng.compact.invalidMessage.length > 0 &&
            rng.compact.blockedPreserved &&
            rng.compact.blockedMessage.length > 0 &&
            rng.compact.blockedNoRemoteRequest &&
            rng.localPackages.rng === '11-multi-file-includes.zip' &&
            rng.localPackages.rnc === '11-multi-file-includes.zip' &&
            rng.localPackages.noExternalRequests &&
            rng.cancellation.cancel &&
            rng.cancellation.freshProject === '01-basic-grammar.rnc' &&
            rng.blocked.preserved &&
            rng.blocked.noRemoteRequest &&
            rng.realWorld.project === 'docbook.rng' &&
            rng.realWorld.inspector.text.length > 0 &&
            rng.realWorld.inspector.sourceAction &&
            rng.realWorld.source.identity.includes('docbook.rng') &&
            rng.realWorld.source.text.length > 0 &&
            requests.startupLazy &&
            requests.rngWorkerLoaded &&
            requests.rngRuntimeLoaded &&
            project === 'valid-xsd-include.zip',
        ),
        reducedMotionPreference:
          options.browser === 'firefox' && options.firefoxMotion === 'normal'
            ? !root.capabilities.reducedMotion &&
              !nested.capabilities.reducedMotion
            : root.capabilities.reducedMotion &&
              nested.capabilities.reducedMotion,
        viewportContainment: viewports.every(
          ({
            pageOverflowX,
            modalClipped,
            controlsPresent,
            topBarBottom,
            carouselTop,
            semanticZoom,
          }) =>
            !pageOverflowX &&
            !modalClipped &&
            controlsPresent &&
            carouselTop >= topBarBottom &&
            semanticZoom.requested === 'full' &&
            semanticZoom.effective === 'full' &&
            semanticZoom.presentation === 'full' &&
            semanticZoom.available === String(semanticZoom.queryMatches) &&
            semanticZoom.controlPresent === semanticZoom.queryMatches &&
            semanticZoom.controlContained &&
            semanticZoom.overviewVisible === false &&
            semanticZoom.lineLayerCount === 0 &&
            (!semanticZoom.queryMatches ||
              (semanticZoom.rangeMin === '0' && semanticZoom.rangeMax === '2')),
        ),
        compactSemanticZoom:
          compactSemanticZoom.initial.project === 'sample.book.dtd' &&
          compactSemanticZoom.initial.currentNode === 'book' &&
          compactSemanticZoom.initial.requested === 'full' &&
          compactSemanticZoom.initial.effective === 'full' &&
          compactSemanticZoom.initial.presentation === 'full' &&
          compactSemanticZoom.initial.available === 'true' &&
          compactSemanticZoom.initial.reducedMotion ===
            String(
              options.browser !== 'firefox' ||
                options.firefoxMotion === 'reduced',
            ) &&
          compactSemanticZoom.initial.controlPresent &&
          compactSemanticZoom.initial.range?.min === '0' &&
          compactSemanticZoom.initial.range?.max === '2' &&
          compactSemanticZoom.initial.range?.value === '2' &&
          compactSemanticZoom.initial.range?.valueText === 'Full detail' &&
          !compactSemanticZoom.initial.overviewVisible &&
          compactSemanticZoom.initial.fullSummaryPresent &&
          compactSemanticZoom.initial.lineLayerCount === 0 &&
          compactSemanticZoom.compact.requested === 'compact' &&
          compactSemanticZoom.compact.effective === 'compact' &&
          compactSemanticZoom.compact.presentation === 'compact' &&
          compactSemanticZoom.compact.focusName === 'book' &&
          compactSemanticZoom.compact.focusIsHeading &&
          compactSemanticZoom.compact.focusCompact &&
          !compactSemanticZoom.compact.focusSummaryPresent &&
          !compactSemanticZoom.compact.focusKindPresent &&
          compactSemanticZoom.compact.inspectPresent &&
          compactSemanticZoom.compact.rangeValue === '1' &&
          compactSemanticZoom.compact.rangeValueText === 'Compact' &&
          !compactSemanticZoom.compact.overviewVisible &&
          compactSemanticZoom.compact.lineCount > 0 &&
          compactSemanticZoom.inspectionOpened &&
          compactSemanticZoom.inspectionClosed &&
          compactSemanticZoom.compactContext.currentNode === 'book.content' &&
          compactSemanticZoom.compactContext.requested === 'compact' &&
          compactSemanticZoom.compactContext.chapterOccurrenceVisible &&
          compactSemanticZoom.compactContext.chapterDirectionHidden &&
          compactSemanticZoom.compactContext.chapterInspectPresent &&
          compactSemanticZoom.compactContext.rootwardLineCount > 0 &&
          compactSemanticZoom.compactContext.leafwardLineCount > 0 &&
          compactSemanticZoom.compactContext.finitePaths &&
          compactSemanticZoom.compactContext.uniqueKeys &&
          compactSemanticZoom.overview.requested === 'overview' &&
          compactSemanticZoom.overview.effective === 'overview' &&
          compactSemanticZoom.overview.presentation === 'overview' &&
          compactSemanticZoom.overview.rangeValue === '0' &&
          compactSemanticZoom.overview.rangeValueText === 'Overview' &&
          compactSemanticZoom.overview.focusName === 'Schema overview' &&
          compactSemanticZoom.overview.focusHeight <
            compactSemanticZoom.compact.focusHeight &&
          compactSemanticZoom.overview.rootwardNamesOnly &&
          compactSemanticZoom.overview.contextNamesOnly &&
          compactSemanticZoom.overview.historyNamesOnly &&
          compactSemanticZoom.overview.focusedInspectCount === 1 &&
          compactSemanticZoom.overview.contextInspectCount === 0 &&
          compactSemanticZoom.overview.kindBadgeCount === 0 &&
          !compactSemanticZoom.overview.occurrenceVisible &&
          compactSemanticZoom.overview.linePresentation === 'overview' &&
          compactSemanticZoom.overview.contextIncrease &&
          compactSemanticZoom.overviewInspection.opened.inspected ===
            'Close inspector for Schema overview' &&
          compactSemanticZoom.overviewInspection.opened.focusAction ===
            'Close inspection for Schema overview' &&
          compactSemanticZoom.overviewInspection.opened.project ===
            compactSemanticZoom.overviewInspection.before.project &&
          compactSemanticZoom.overviewInspection.opened.currentNode ===
            compactSemanticZoom.overviewInspection.before.currentNode &&
          compactSemanticZoom.overviewInspection.opened.requested ===
            compactSemanticZoom.overviewInspection.before.requested &&
          compactSemanticZoom.overviewInspection.opened.effective ===
            compactSemanticZoom.overviewInspection.before.effective &&
          compactSemanticZoom.overviewInspection.opened.presentation ===
            compactSemanticZoom.overviewInspection.before.presentation &&
          compactSemanticZoom.overviewInspection.opened.searchValue ===
            compactSemanticZoom.overviewInspection.before.searchValue &&
          compactSemanticZoom.overviewInspection.closed &&
          compactSemanticZoom.relationshipLines.compact.stateA.leafwardCount >=
            3 &&
          compactSemanticZoom.relationshipLines.compact.stateA.rootwardCount ===
            0 &&
          compactSemanticZoom.relationshipLines.compact.stateA.allCorrect &&
          compactSemanticZoom.relationshipLines.compact.stateB.leafwardCount >=
            1 &&
          compactSemanticZoom.relationshipLines.compact.stateB.rootwardCount ===
            1 &&
          compactSemanticZoom.relationshipLines.compact.stateB.allCorrect &&
          compactSemanticZoom.relationshipLines.compact.stateC.leafwardCount >=
            3 &&
          compactSemanticZoom.relationshipLines.compact.stateC.rootwardCount ===
            0 &&
          compactSemanticZoom.relationshipLines.compact.stateC.allCorrect &&
          compactSemanticZoom.relationshipLines.compact.noStateBPathsRemain &&
          compactSemanticZoom.relationshipLines.compact.stateARestored &&
          compactSemanticZoom.relationshipLines.compact.fullCleared &&
          compactSemanticZoom.relationshipLines.compact.presentationRestored
            .allCorrect &&
          compactSemanticZoom.relationshipLines.overview.stateA.leafwardCount >
            compactSemanticZoom.relationshipLines.compact.stateA
              .leafwardCount &&
          compactSemanticZoom.relationshipLines.overview.stateA
            .rootwardCount === 0 &&
          compactSemanticZoom.relationshipLines.overview.stateA.allCorrect &&
          compactSemanticZoom.relationshipLines.overview.stateB.leafwardCount >=
            1 &&
          compactSemanticZoom.relationshipLines.overview.stateB
            .rootwardCount === 1 &&
          compactSemanticZoom.relationshipLines.overview.stateB.allCorrect &&
          compactSemanticZoom.relationshipLines.overview.stateC.leafwardCount >
            compactSemanticZoom.relationshipLines.compact.stateC
              .leafwardCount &&
          compactSemanticZoom.relationshipLines.overview.stateC
            .rootwardCount === 0 &&
          compactSemanticZoom.relationshipLines.overview.stateC.allCorrect &&
          compactSemanticZoom.relationshipLines.overview.noStateBPathsRemain &&
          compactSemanticZoom.relationshipLines.overview.stateARestored &&
          compactSemanticZoom.relationshipLines.overview.fullCleared &&
          compactSemanticZoom.relationshipLines.overview.presentationRestored
            .allCorrect &&
          compactSemanticZoom.leafwardNode === 'chapter' &&
          compactSemanticZoom.rootwardNode === 'book.content' &&
          compactSemanticZoom.searchInspection.inspected ===
            'Close inspector for chapter' &&
          compactSemanticZoom.searchInspection.currentNode === 'book.content' &&
          compactSemanticZoom.searchInspection.requested === 'compact' &&
          compactSemanticZoom.searchInspection.searchValue === 'chapter' &&
          compactSemanticZoom.searchCenter &&
          compactSemanticZoom.branchShift.controlPresent &&
          compactSemanticZoom.branchShift.changed &&
          compactSemanticZoom.branchShift.project === 'compact-branches.dtd' &&
          compactSemanticZoom.branchShift.requested === 'compact' &&
          compactSemanticZoom.importPersistence.length ===
            (options.hermeticPath ? 4 : 3) &&
          compactSemanticZoom.importPersistence.every(
            ({ requested, effective, presentation, controlPresent }) =>
              requested === 'overview' &&
              effective === 'overview' &&
              presentation === 'overview' &&
              controlPresent,
          ) &&
          compactSemanticZoom.largeSchemas.length === 2 &&
          compactSemanticZoom.largeSchemas.every(
            ({ filename, searchResultFound, presentations }) =>
              searchResultFound &&
              presentations.length === 3 &&
              presentations.every(
                ({
                  presentation,
                  requested,
                  effective,
                  project,
                  visibleCarouselCards,
                  totalElements,
                  importPhase,
                  pageOverflowX,
                }) =>
                  presentation === requested &&
                  presentation === effective &&
                  project === filename &&
                  visibleCarouselCards <= 20 &&
                  totalElements < 5_000 &&
                  importPhase === null &&
                  !pageOverflowX,
              ),
          ) &&
          compactSemanticZoom.wheel &&
          !compactSemanticZoom.wheel.down.dispatchResult &&
          compactSemanticZoom.wheel.down.defaultPrevented &&
          !compactSemanticZoom.wheel.downAgain.dispatchResult &&
          compactSemanticZoom.wheel.downAgain.defaultPrevented &&
          compactSemanticZoom.wheel.overviewBoundary.dispatchResult &&
          !compactSemanticZoom.wheel.overviewBoundary.defaultPrevented &&
          compactSemanticZoom.wheel.overviewAfterBoundary === 'overview' &&
          !compactSemanticZoom.wheel.up.dispatchResult &&
          compactSemanticZoom.wheel.up.defaultPrevented &&
          !compactSemanticZoom.wheel.upAgain.dispatchResult &&
          compactSemanticZoom.wheel.upAgain.defaultPrevented &&
          compactSemanticZoom.wheel.fullBoundary.dispatchResult &&
          !compactSemanticZoom.wheel.fullBoundary.defaultPrevented &&
          compactSemanticZoom.wheel.ctrl.dispatchResult &&
          !compactSemanticZoom.wheel.ctrl.defaultPrevented &&
          compactSemanticZoom.wheel.meta.dispatchResult &&
          !compactSemanticZoom.wheel.meta.defaultPrevented &&
          compactSemanticZoom.wheel.ordinary.dispatchResult &&
          !compactSemanticZoom.wheel.ordinary.defaultPrevented &&
          compactSemanticZoom.wheel.finalRequested === 'full' &&
          compactSemanticZoom.constrained.requested === 'overview' &&
          compactSemanticZoom.constrained.effective === 'full' &&
          compactSemanticZoom.constrained.presentation === 'full' &&
          !compactSemanticZoom.constrained.controlPresent &&
          compactSemanticZoom.constrained.focusIsHeading &&
          !compactSemanticZoom.constrained.lineLayerPresent &&
          compactSemanticZoom.restored.requested === 'overview' &&
          compactSemanticZoom.restored.effective === 'overview' &&
          compactSemanticZoom.restored.presentation === 'overview' &&
          compactSemanticZoom.restored.controlPresent &&
          compactSemanticZoom.restored.rangeValue === '0',
        semanticZoomUxHardening: (() => {
          const audit = semanticZoomUxHardening;
          const actions = [
            audit.buttonFullToCompact,
            audit.buttonCompactToOverview,
            audit.wheelOverviewToCompact,
            audit.rangeCompactToFull,
            audit.directFullToOverview,
            audit.rapidReversed,
          ];
          const transitionsClean = actions.every(
            ({ phases, settled }) =>
              settled.transition === 'idle' &&
              !settled.focusOnBody &&
              settled.temporaryMotionCount === 0 &&
              settled.transformedMotionCount === 0 &&
              !settled.pageOverflowX &&
              phases
                .filter(({ phase }) =>
                  ['measuring', 'animating'].includes(phase),
                )
                .every(({ lineCount }) => lineCount === 0),
          );
          const expectedPresentations = [
            'compact',
            'overview',
            'compact',
            'full',
            'overview',
            'compact',
          ];
          const actionOrderCorrect = actions.every(
            ({ settled }, index) =>
              settled.presentation === expectedPresentations[index] &&
              settled.requested === expectedPresentations[index] &&
              settled.effective === expectedPresentations[index],
          );
          const responsive = audit.responsiveViewports.every((viewport) => {
            const expectedAvailable =
              viewport.width >= 1024 && viewport.height >= 600;
            return (
              viewport.queryMatches === expectedAvailable &&
              viewport.available === String(expectedAvailable) &&
              viewport.controlPresent === expectedAvailable &&
              viewport.controlContained &&
              viewport.buttonsVisible &&
              viewport.rangeVisible &&
              viewport.currentLevelVisible &&
              (!expectedAvailable || viewport.currentLevelText.length > 0) &&
              !viewport.controlClipped &&
              !viewport.pageOverflowX &&
              viewport.transition === 'idle'
            );
          });
          const nativeInputsPreserved =
            audit.nativeZoomInputs.controlCtrlWheel.dispatchResult &&
            !audit.nativeZoomInputs.controlCtrlWheel.defaultPrevented &&
            audit.nativeZoomInputs.controlMetaWheel.dispatchResult &&
            !audit.nativeZoomInputs.controlMetaWheel.defaultPrevented &&
            audit.nativeZoomInputs.carouselCtrlWheel.dispatchResult &&
            !audit.nativeZoomInputs.carouselCtrlWheel.defaultPrevented &&
            audit.nativeZoomInputs.keys.every(
              ({ dispatchResult, defaultPrevented }) =>
                dispatchResult && !defaultPrevented,
            );
          const forcedColours =
            !audit.forcedColours.supported ||
            (audit.forcedColours.controlVisible &&
              audit.forcedColours.rangeVisible &&
              audit.forcedColours.disabledVisible &&
              audit.forcedColours.focusVisible &&
              audit.forcedColours.focusedControl &&
              audit.forcedColours.controlBorderStyle !== 'none' &&
              audit.forcedColours.disabledBorderStyle === 'dashed' &&
              audit.forcedColours.leafwardPattern !==
                audit.forcedColours.rootwardPattern &&
              !audit.forcedColours.pageOverflowX);
          return (
            transitionsClean &&
            actionOrderCorrect &&
            responsive &&
            audit.navigationAfterChange.currentNode !== '' &&
            audit.navigationAfterChange.focusIsHeading &&
            audit.navigationAfterChange.transition === 'idle' &&
            audit.textScaling.every(
              ({
                controlContained,
                currentLevelVisible,
                focusVisible,
                pageOverflowX,
              }) =>
                controlContained &&
                currentLevelVisible &&
                focusVisible &&
                !pageOverflowX,
            ) &&
            audit.magnificationEquivalent.every(
              ({ ordinaryTwoDimensionalScrolling }) =>
                !ordinaryTwoDimensionalScrolling,
            ) &&
            audit.magnificationEquivalent.at(-1)?.width === 320 &&
            audit.magnificationEquivalent.at(-1)?.effective === 'full' &&
            !audit.magnificationEquivalent.at(-1)?.controlPresent &&
            nativeInputsPreserved &&
            forcedColours &&
            (!audit.reducedMotionSupport.supported ||
              (audit.reducedMotion.phases.every(
                ({ phase }) => phase !== 'animating',
              ) &&
                audit.reducedMotion.settled.transition === 'idle' &&
                audit.reducedMotion.settled.temporaryMotionCount === 0))
          );
        })(),
        developerHandoff:
          developerHandoff.builtInDtd.project === 'sample.book.dtd' &&
          developerHandoff.builtInDtd.currentNode === 'book' &&
          developerHandoff.builtInXsd.project === 'library.xsd' &&
          developerHandoff.builtInXsd.currentNode !== '' &&
          developerHandoff.clipboardInstalled &&
          developerHandoff.nodeSummary.first ===
            developerHandoff.nodeSummary.second &&
          developerHandoff.nodeSummary.first.startsWith(
            'Name: root\nKind: Global element declaration',
          ) &&
          developerHandoff.nodeSummary.first.includes(
            'Source: attributes.xsd',
          ) &&
          developerHandoff.nodeSummary.feedback === 'Copied node summary' &&
          developerHandoff.sourceModal.heading === 'root' &&
          developerHandoff.sourceModal.sourceIdentity ===
            'Source file: attributes.xsd' &&
          developerHandoff.sourceModal.location.includes('Line ') &&
          developerHandoff.sourceModal.location.includes('exact') &&
          developerHandoff.sourceModal.fragmentCount === 1 &&
          developerHandoff.sourceModal.contained &&
          developerHandoff.sourceModal.readingRegionScrollable &&
          developerHandoff.copiedSource ===
            developerHandoff.sourceModal.retainedSource &&
          developerHandoff.copiedSource.startsWith('<xs:element name="root"') &&
          developerHandoff.sourceClosed &&
          JSON.stringify(developerHandoff.stateAfter) ===
            JSON.stringify(developerHandoff.stateBefore),
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
