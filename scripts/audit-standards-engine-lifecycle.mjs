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
  relationshipLines: path.resolve(
    'tests/fixtures/semantic-zoom/relationship-lines.xsd',
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
    await this.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    });
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
        overviewVisible: semanticZoomControl?.textContent?.includes('Overview') ?? false,
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
    const range = document.querySelector('[aria-label="Semantic zoom"]');
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
    const range = document.querySelector('[aria-label="Semantic zoom"]');
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
    const range = document.querySelector('[aria-label="Semantic zoom"]');
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

async function compactSemanticZoomAudit(driver, url, screenshotDirectory) {
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
      overviewVisible: control?.textContent?.includes('Overview') ?? false,
      fullSummaryPresent: Boolean(document.querySelector('[data-focus-card-scroll-region]')),
      lineLayerCount: document.querySelectorAll('[data-semantic-zoom-relationship-lines]').length,
    };
  })()`);

  await driver.evaluate(`(() => {
    document.querySelector('[data-focus-card-scroll-region]')?.focus();
    const range = document.querySelector('[aria-label="Semantic zoom"]');
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
    const range = document.querySelector('[aria-label="Semantic zoom"]');
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
      overviewVisible: document.querySelector('[data-semantic-zoom-control]')?.textContent?.includes('Overview') ?? false,
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
      rangeValue: document.querySelector('[aria-label="Semantic zoom"]')?.value ?? null,
      rangeValueText: document.querySelector('[aria-label="Semantic zoom"]')?.getAttribute('aria-valuetext') ?? null,
      focusText: visibleText(focus),
      focusName: focus?.querySelector('[data-focus-card-heading]')?.textContent?.trim() ?? '',
      focusHeight: focus?.getBoundingClientRect().height ?? null,
      rootwardNamesOnly: ${overviewRootwardNamesOnly},
      contextNamesOnly: contextCards.every((card) =>
        visibleText(card) === visibleText(card.querySelector('.node-name'))
      ),
      historyNamesOnly: historyRows.every((row) =>
        visibleText(row) === visibleText(row.querySelector('.node-name'))
      ),
      inspectCount: surface?.querySelectorAll('[data-inspect-node-id]').length ?? -1,
      kindBadgeCount: surface?.querySelectorAll('.kind-badge').length ?? -1,
      occurrenceVisible: contextCards.some((card) => /[?*+]$/u.test(visibleText(card))),
      linePresentation: document.querySelector('[data-semantic-zoom-relationship-lines]')?.getAttribute('data-semantic-zoom-line-presentation') ?? null,
      compactVisibleLeafwardCards: ${compactVisibleLeafwardCards},
      overviewVisibleLeafwardCards: ${overviewVisibleLeafwardCards},
      contextIncrease: ${overviewVisibleLeafwardCards} > ${compactVisibleLeafwardCards},
      overflowControlPresent: Boolean(document.querySelector('[data-carousel-window-direction^="leafward-"]')),
    };
  })()`);
  const relationshipLines = {
    compact: compactRelationshipLines,
    overview: overviewRelationshipLines,
  };

  const importPersistence = [];
  for (const [format, input, filename] of [
    ['dtd', INPUTS.dtd, 'library.dtd'],
    ['xsd', INPUTS.xsd, 'attributes.xsd'],
    ['zip', INPUTS.zip, 'valid-xsd-include.zip'],
  ]) {
    await importFile(driver, format, input, filename);
    importPersistence.push(
      await driver.evaluate(`(() => {
        const surface = document.querySelector('[data-carousel-gesture-viewport]');
        return {
          format: ${JSON.stringify(format)},
          project: document.querySelector('.project-name strong')?.textContent?.trim() ?? '',
          requested: surface?.getAttribute('data-semantic-zoom-requested') ?? null,
          effective: surface?.getAttribute('data-semantic-zoom-effective') ?? null,
          presentation: surface?.getAttribute('data-semantic-zoom-presentation') ?? null,
          controlPresent: Boolean(document.querySelector('[data-semantic-zoom-control]')),
        };
      })()`),
    );
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
    const range = document.querySelector('[aria-label="Semantic zoom"]');
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
          rangeValue: document.querySelector('[aria-label="Semantic zoom"]')?.value ?? null,
        };
      })()`),
    'Task 14.3 desktop restoration',
  );

  return {
    url,
    initial,
    compact,
    overview,
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
    wheel,
    constrained,
    restored,
  };
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
          )
        : await ChromiumDriver.launch(path.resolve(options.browserPath));
    driver = launched.driver;
    await driver.setReducedMotion();
    const compactSemanticZoom = await compactSemanticZoomAudit(
      driver,
      server.rootUrl,
      screenshotDirectory,
    );
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
          compactSemanticZoom.initial.reducedMotion === 'true' &&
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
          compactSemanticZoom.overview.focusText ===
            compactSemanticZoom.overview.focusName &&
          compactSemanticZoom.overview.focusHeight <
            compactSemanticZoom.compact.focusHeight &&
          compactSemanticZoom.overview.rootwardNamesOnly &&
          compactSemanticZoom.overview.contextNamesOnly &&
          compactSemanticZoom.overview.historyNamesOnly &&
          compactSemanticZoom.overview.inspectCount === 0 &&
          compactSemanticZoom.overview.kindBadgeCount === 0 &&
          !compactSemanticZoom.overview.occurrenceVisible &&
          compactSemanticZoom.overview.linePresentation === 'overview' &&
          compactSemanticZoom.overview.contextIncrease &&
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
          compactSemanticZoom.importPersistence.length === 3 &&
          compactSemanticZoom.importPersistence.every(
            ({ requested, effective, presentation, controlPresent }) =>
              requested === 'overview' &&
              effective === 'overview' &&
              presentation === 'overview' &&
              controlPresent,
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
