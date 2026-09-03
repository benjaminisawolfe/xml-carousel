import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import JSZip from 'jszip';
import {
  MAX_LEAFWARD_CARDS,
  MAX_EARLIER_PATH_ROWS,
} from '../src/ui/carousel/carouselWindowing.ts';
import {
  ChromiumDriver,
  FirefoxDriver,
  dismissWelcome,
  importFile,
  waitForIdle,
  waitUntil,
} from './audit-standards-engine-lifecycle.mjs';
import { startHostileMimeServer } from './hostile-mime-build-server.mjs';
import {
  productionSourceDigest,
  distInventory,
} from './relax-ng-release-acceptance.mjs';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fixtures = 'tests/fixtures/relax-ng';
const fullCardBound = 1 + 1 + MAX_EARLIER_PATH_ROWS + MAX_LEAFWARD_CARDS;
const basic = (syntax) =>
  `${fixtures}/${syntax === 'rng' ? 'manual-qa' : 'manual-qa-rnc'}/01-basic-grammar.${syntax}`;
const folder = (syntax) =>
  `${fixtures}/${syntax === 'rng' ? 'manual-qa' : 'manual-qa-rnc'}`;
const args = Object.fromEntries(
  process.argv
    .slice(2)
    .map((value, index, values) =>
      value.startsWith('--') ? [value.slice(2), values[index + 1]] : [],
    )
    .filter((entry) => entry.length),
);
assert(
  ['chrome', 'firefox'].includes(args.browser),
  '--browser chrome|firefox is required',
);
assert(
  args['browser-path'] && args['axe-path'] && args.output,
  '--browser-path, --axe-path, and --output are required',
);
const output = path.resolve(args.output);
const work = path.join(
  path.dirname(output),
  `task-17.10-${args.browser}-fixtures`,
);
await mkdir(work, { recursive: true });
const axe = await readFile(path.resolve(args['axe-path']), 'utf8');
assert.equal(
  hash(axe),
  'c24f097bd2f451d4f933e8bc7d8d539f8672a2ebcb5cc9f9f3eec8ca9470a0c1',
  'Use the pinned axe-core 4.13.0 bundle.',
);
const report = {
  schemaVersion: 1,
  browser: args.browser,
  axeVersion: '4.13.0',
  axeSha256: hash(axe),
  checks: [],
  timings: [],
};
report.productionSourceDigest = await productionSourceDigest();
report.dist = await distInventory();
const requests = [];
const server = await startHostileMimeServer({
  onRequest: (request) => requests.push(request),
});
let driver;
let currentMount;
let closingBrowser = false;
const detachedSessions = new Set();
const instrumentationErrors = [];

function check(id, actual, condition = true) {
  const result = {
    id: `${currentMount}:${id}`,
    pass: Boolean(condition),
    actual,
  };
  report.checks.push(result);
  console.log(`${result.pass ? 'PASS' : 'FAIL'} ${result.id}`);
  assert(result.pass, `${result.id}: ${JSON.stringify(actual)}`);
}
const snapshotExpression = `(() => ({
  project: document.querySelector('.project-name strong')?.textContent?.trim(),
  focus: document.querySelector('[data-semantic-zoom-focus-card]')?.getAttribute('data-semantic-zoom-line-node-id'),
  heading: document.querySelector('[data-focus-card-heading]')?.textContent?.trim(),
  journey: [...document.querySelectorAll('[data-semantic-zoom-rootward-position]')].map(e => [e.getAttribute('data-semantic-zoom-line-node-id'), e.getAttribute('data-semantic-zoom-rootward-position')]),
  inspected: document.querySelector('[data-inspector-close]')?.getAttribute('aria-label') ?? null,
  zoom: document.querySelector('[data-carousel-gesture-viewport]')?.getAttribute('data-semantic-zoom-presentation'),
  active: document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.tagName,
  cards: document.querySelectorAll('[data-semantic-zoom-line-node-id]').length,
  overflow: document.documentElement.scrollWidth > innerWidth + 1,
  workers: window.__releaseAudit?.workers.size ?? null,
  retainedProblems: document.querySelector('[aria-label^="Open retained problem report"]')?.getAttribute('aria-label') ?? null,
}))()`;
const snapshot = () => driver.evaluate(snapshotExpression);
async function focus(selector) {
  assert(
    await driver.evaluate(
      `(() => { const e = document.querySelector(${JSON.stringify(selector)}); e?.focus(); return document.activeElement === e; })()`,
    ),
    `Cannot focus ${selector}`,
  );
}
async function key(name, shift = false) {
  if (driver instanceof ChromiumDriver) {
    const codes = {
      Enter: ['Enter', 13],
      Space: ['Space', 32],
      Tab: ['Tab', 9],
      Escape: ['Escape', 27],
      ArrowLeft: ['ArrowLeft', 37],
      ArrowRight: ['ArrowRight', 39],
      ArrowDown: ['ArrowDown', 40],
    };
    const [code, virtual] = codes[name];
    const descriptor = {
      key: name === 'Space' ? ' ' : name,
      code,
      windowsVirtualKeyCode: virtual,
      modifiers: shift ? 8 : 0,
    };
    await driver.send('Input.dispatchKeyEvent', {
      type: name === 'Enter' ? 'rawKeyDown' : 'keyDown',
      ...descriptor,
    });
    if (name === 'Enter')
      await driver.send('Input.dispatchKeyEvent', {
        type: 'char',
        ...descriptor,
        text: '\r',
        unmodifiedText: '\r',
      });
    await driver.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      ...descriptor,
    });
  } else {
    const keys = {
      Enter: '\uE007',
      Space: '\uE00D',
      Tab: '\uE004',
      Escape: '\uE00C',
      ArrowLeft: '\uE012',
      ArrowRight: '\uE014',
      ArrowDown: '\uE015',
    };
    const actions = [
      ...(shift ? [{ type: 'keyDown', value: '\uE008' }] : []),
      { type: 'keyDown', value: keys[name] },
      { type: 'keyUp', value: keys[name] },
      ...(shift ? [{ type: 'keyUp', value: '\uE008' }] : []),
    ];
    await driver.command('POST', '/actions', {
      actions: [{ type: 'key', id: 'release-keyboard', actions }],
    });
  }
}
async function pointer(selector) {
  const point = await driver.evaluate(
    `(() => { const e = document.querySelector(${JSON.stringify(selector)}); e?.scrollIntoView({block:'nearest'}); const r=e?.getBoundingClientRect(); return r ? {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}:null; })()`,
  );
  assert(point, `Pointer target missing: ${selector}`);
  if (driver instanceof ChromiumDriver) {
    await driver.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      ...point,
      button: 'left',
      clickCount: 1,
    });
    await driver.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      ...point,
      button: 'left',
      clickCount: 1,
    });
  } else await driver.click(selector);
}
async function dragLeafward() {
  const point = await driver.evaluate(
    `(() => {const r=document.querySelector('[data-semantic-zoom-focus-card]').getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+12)};})()`,
  );
  if (driver instanceof ChromiumDriver) {
    await driver.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      ...point,
    });
    await driver.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      ...point,
      button: 'left',
      buttons: 1,
      clickCount: 1,
    });
    for (let step = 1; step <= 10; step++)
      await driver.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: point.x - step * 14,
        y: point.y,
        button: 'left',
        buttons: 1,
      });
    await driver.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: point.x - 140,
      y: point.y,
      button: 'left',
      clickCount: 1,
    });
  } else {
    await driver.command('POST', '/actions', {
      actions: [
        {
          type: 'pointer',
          id: 'release-drag',
          parameters: { pointerType: 'mouse' },
          actions: [
            { type: 'pointerMove', duration: 0, origin: 'viewport', ...point },
            { type: 'pointerDown', button: 0 },
            {
              type: 'pointerMove',
              duration: 400,
              origin: 'viewport',
              x: point.x - 140,
              y: point.y,
            },
            { type: 'pointerUp', button: 0 },
          ],
        },
      ],
    });
  }
}
async function setSearch(query) {
  if (
    !(await driver.evaluate(
      `Boolean(document.querySelector('#schema-search-input'))`,
    ))
  ) {
    await driver.click('button[aria-label="Search schema"]');
    await waitUntil(
      () =>
        driver.evaluate(
          `Boolean(document.querySelector('#schema-search-input'))`,
        ),
      'compact Search input',
    );
  }
  await driver.evaluate(
    `(() => { const e=document.querySelector('#schema-search-input'); e.value=${JSON.stringify(query)}; e.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:${JSON.stringify(query)}})); })()`,
  );
  if (query)
    await waitUntil(
      () =>
        driver.evaluate(
          `document.querySelectorAll('[data-search-result-node-id]').length > 0`,
        ),
      `Search ${query}`,
    );
}
async function closeInspector() {
  if (
    await driver.evaluate(
      `Boolean(document.querySelector('[data-inspector-close]'))`,
    )
  )
    await driver.click('[data-inspector-close]');
}
async function accessibility(id) {
  // A failure banner can render before the import controls finish re-enabling.
  // Run axe on the settled screen so one scan does not mix disabled styles
  // with enabled DOM state from the next Svelte update.
  await waitForIdle(driver);
  await driver.evaluate(
    `new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`,
  );
  await driver.evaluate(axe);
  const result = await driver.evaluate(
    `axe.run(document, {runOnly: {type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}}).then(r => ({ violations:r.violations.map(v=>({id:v.id,impact:v.impact,targets:v.nodes.map(n=>n.target),summary:v.nodes.map(n=>n.failureSummary)})), incomplete:r.incomplete.map(v=>v.id), passes:r.passes.length }))`,
  );
  assert(
    result && Array.isArray(result.violations),
    'axe did not produce an actual result',
  );
  check(
    `axe-${id}`,
    result,
    !result.violations.some((v) => ['serious', 'critical'].includes(v.impact)),
  );
}
async function zoom(level) {
  const values = { full: '2', compact: '1', overview: '0' };
  await waitUntil(
    () =>
      driver.evaluate(
        `Boolean(document.querySelector('[data-semantic-zoom-control] input'))`,
      ),
    'responsive zoom control',
  );
  await driver.evaluate(
    `(() => { const e=document.querySelector('[data-semantic-zoom-control] input'); if(!e) throw new Error('Zoom slider unavailable'); e.value=${JSON.stringify(values[level])}; e.dispatchEvent(new Event('input',{bubbles:true})); })()`,
  );
  await waitUntil(
    () =>
      driver.evaluate(
        `document.querySelector('[data-carousel-gesture-viewport]')?.getAttribute('data-semantic-zoom-presentation') === ${JSON.stringify(level)} && document.querySelector('[data-carousel-gesture-viewport]')?.getAttribute('data-semantic-zoom-transition') === 'idle'`,
      ),
    `zoom ${level}`,
  );
}
async function sourceAndCopy(syntax, source, id) {
  const before = await snapshot();
  const searchBefore = await driver.evaluate(
    `document.querySelector('#schema-search-input')?.value ?? ''`,
  );
  await driver.click('[data-copy-node-summary]');
  await waitUntil(
    () =>
      driver.evaluate(
        `document.querySelector('[data-node-summary-copy-status]')?.textContent?.trim() === 'Copied node summary'`,
      ),
    'copy summary',
  );
  const summary = await driver.evaluate(`window.__releaseAudit.copies.at(-1)`);
  await focus('[data-node-inspector] [aria-label^="View source for "]');
  await key('Enter');
  await waitUntil(
    () =>
      driver.evaluate(
        `Boolean(document.querySelector('#source-view-dialog[open]'))`,
      ),
    'source dialog',
  );
  const text = await driver.evaluate(
    `document.querySelector('[data-source-reading-region] code')?.textContent ?? ''`,
  );
  await driver.click('[data-copy-source]');
  await waitUntil(
    () =>
      driver.evaluate(
        `document.querySelector('#source-view-dialog [role="status"]')?.textContent?.trim() === 'Copied source'`,
      ),
    'copy source',
  );
  const copied = await driver.evaluate(`window.__releaseAudit.copies.at(-1)`);
  check(
    `${id}-source-copy`,
    {
      syntax,
      sourceSha256: hash(text),
      copiedSha256: hash(copied),
      length: text.length,
      summaryDistinct: summary !== text,
    },
    text.length > 0 &&
      source.includes(text) &&
      copied === text &&
      summary !== text &&
      (syntax !== 'rnc' ||
        !text.includes('http://relaxng.org/ns/structure/1.0')),
  );
  await accessibility(`${id}-source`);
  await key('Escape');
  await waitUntil(
    () =>
      driver.evaluate(`!document.querySelector('#source-view-dialog[open]')`),
    'Escape source',
  );
  const after = await snapshot();
  check(
    `${id}-source-focus`,
    { before, after },
    before.focus === after.focus &&
      before.inspected === after.inspected &&
      searchBefore ===
        (await driver.evaluate(
          `document.querySelector('#schema-search-input')?.value ?? ''`,
        )) &&
      after.active?.startsWith('View source for'),
  );
}
async function standalone(syntax) {
  await importFile(
    driver,
    'rng',
    path.resolve(basic(syntax)),
    `01-basic-grammar.${syntax}`,
  );
  const source = await readFile(basic(syntax), 'utf8');
  const initial = await snapshot();
  check(
    `${syntax}-valid`,
    initial,
    Boolean(initial.focus) &&
      !initial.retainedProblems &&
      initial.workers === 0,
  );
  await setSearch('book');
  const result = await driver.evaluate(
    `(() => {const e=document.querySelector('[data-search-result-node-id] [data-inspect-search-result]'); return {id:e?.closest('[data-search-result-node-id]')?.getAttribute('data-search-result-node-id'),label:e?.getAttribute('aria-label')};})()`,
  );
  await pointer('[data-search-result-node-id] [data-inspect-search-result]');
  const inspected = await snapshot();
  check(
    `${syntax}-search-inspect`,
    { result, inspected },
    Boolean(result.id) &&
      initial.focus === inspected.focus &&
      Boolean(inspected.inspected),
  );
  await sourceAndCopy(syntax, source, syntax);
  await accessibility(`${syntax}-search-inspector`);
  await driver.click('[aria-label^="Center inspected node "]');
  await waitUntil(
    async () => (await snapshot()).focus === result.id,
    'center inspected node',
  );
  await setSearch('');
  await closeInspector();
  const centered = await snapshot();
  const modes = [];
  for (const level of ['full', 'compact', 'overview']) {
    await zoom(level);
    await setSearch('book');
    const resultIds = await driver.evaluate(
      `Array.from(document.querySelectorAll('[data-search-result-node-id]')).map(e=>e.getAttribute('data-search-result-node-id'))`,
    );
    await pointer('[data-search-result-node-id] [data-inspect-search-result]');
    const sourceLabel = await driver.evaluate(
      `document.querySelector('[data-node-inspector] [aria-label^="View source for "]')?.getAttribute('aria-label')`,
    );
    const state = await snapshot();
    modes.push({ resultIds, sourceLabel, inspected: state.inspected });
    check(
      `${syntax}-zoom-${level}`,
      { state, identity: modes.at(-1) },
      state.focus === centered.focus &&
        JSON.stringify(state.journey) === JSON.stringify(centered.journey) &&
        JSON.stringify(modes.at(-1)) === JSON.stringify(modes[0]),
    );
    await closeInspector();
    await setSearch('');
  }
  await focus('[data-semantic-zoom-focus-card] [data-inspect-node-id]');
  await key('Space');
  const overview = await snapshot();
  check(
    `${syntax}-overview-keyboard-inspect`,
    overview,
    overview.focus === centered.focus && Boolean(overview.inspected),
  );
  await closeInspector();
  await pointer('[data-semantic-zoom-focus-card] [data-inspect-node-id]');
  check(
    `${syntax}-overview-pointer-inspect`,
    await snapshot(),
    (await snapshot()).focus === centered.focus &&
      Boolean((await snapshot()).inspected),
  );
  await closeInspector();
  await zoom('full');
  const leaf =
    '[data-semantic-zoom-leafward-edge-id] [data-carousel-navigation-action]';
  if (
    await driver.evaluate(
      `Boolean(document.querySelector(${JSON.stringify(leaf)}))`,
    )
  ) {
    await pointer(leaf);
    await waitUntil(
      async () => (await snapshot()).focus !== centered.focus,
      'leafward navigation',
    );
    const leafState = await snapshot();
    await focus('[data-focus-card-heading]');
    await key('ArrowLeft');
    await waitUntil(
      async () => (await snapshot()).focus === centered.focus,
      'rootward keyboard history',
    );
    check(`${syntax}-journey`, { leaf: leafState, root: await snapshot() });
    await dragLeafward();
    await waitUntil(
      async () => (await snapshot()).focus !== centered.focus,
      'drag leafward',
    );
    const dragged = await snapshot();
    await focus('[data-focus-card-heading]');
    await key('ArrowLeft');
    await waitUntil(
      async () => (await snapshot()).focus === centered.focus,
      'drag rootward restoration',
    );
    check(
      `${syntax}-drag`,
      { dragged, restored: await snapshot() },
      dragged.focus === leafState.focus,
    );
  } else throw new Error(`${syntax}: no representative leafward route`);
  await focus('[aria-label="Search schema"]');
  await key('ArrowLeft');
  const inputState = await snapshot();
  check(
    `${syntax}-input-keys`,
    inputState,
    inputState.active === 'Search schema' &&
      inputState.focus === centered.focus,
  );
  await key('Tab');
  const tabState = await snapshot();
  await key('Tab', true);
  check(
    `${syntax}-tab-order`,
    { next: tabState.active, previous: (await snapshot()).active },
    (await snapshot()).active === 'Search schema',
  );
  for (const [width, height] of [
    [1440, 900],
    [768, 900],
    [390, 844],
  ]) {
    await driver.setViewport(width, height);
    await waitUntil(
      () => driver.evaluate(`innerWidth === ${width}`),
      'responsive viewport',
    );
    await setSearch('book');
    const state = await snapshot();
    check(
      `${syntax}-responsive-${width}`,
      state,
      !state.overflow && state.focus === centered.focus && state.cards > 0,
    );
    await accessibility(`${syntax}-${width}`);
    if (width === 390) {
      await pointer(
        '[data-search-result-node-id] [data-inspect-search-result]',
      );
      await sourceAndCopy(syntax, source, `${syntax}-mobile`);
      await closeInspector();
    }
    await setSearch('');
  }
  await driver.setViewport(1440, 900);
  await zoom('full');
  const beforeInvalid = await snapshot();
  const invalid = `${folder(syntax)}/${syntax === 'rng' ? '09-invalid-schema.rng' : '09-invalid-syntax.rnc'}`;
  await driver.setFile('#rng-file-input', path.resolve(invalid));
  await waitUntil(
    () =>
      driver.evaluate(
        `Boolean(document.querySelector('[aria-label="Dismiss import error"]'))`,
      ),
    'invalid replacement',
  );
  const message = await driver.evaluate(
    `document.querySelector('[aria-label="Dismiss import error"]')?.closest('[role="alert"]')?.textContent ?? ''`,
  );
  const afterInvalid = await snapshot();
  check(
    `${syntax}-invalid-preservation`,
    { beforeInvalid, afterInvalid, message },
    beforeInvalid.focus === afterInvalid.focus &&
      beforeInvalid.project === afterInvalid.project &&
      !/project:\/\/\/|[A-Z]:\\|<grammar|<element/.test(message),
  );
  await accessibility(`${syntax}-invalid`);
  await driver.click('[aria-label="Dismiss import error"]');
  await waitForIdle(driver);
  check(
    `${syntax}-invalid-focus`,
    await snapshot(),
    (await snapshot()).active === 'Open RNG',
  );
  await driver.setViewport(390, 844);
  await focus('[aria-label^="Open retained problem report"]');
  await key('Enter');
  await waitUntil(
    () =>
      driver.evaluate(
        `Boolean(document.querySelector('#problem-report-dialog[open]'))`,
      ),
    'retained Problems',
  );
  const problemText = await driver.evaluate(
    `document.querySelector('#problem-report-dialog').textContent`,
  );
  await accessibility(`${syntax}-problems-mobile`);
  await key('Tab');
  await key('Tab', true);
  await key('Escape');
  await waitUntil(
    () =>
      driver.evaluate(
        `!document.querySelector('#problem-report-dialog[open]')`,
      ),
    'Problems Escape',
  );
  check(
    `${syntax}-problems-retained`,
    { text: problemText, state: await snapshot() },
    problemText.includes(path.basename(invalid)) &&
      !/project:\/\/\/|[A-Z]:\\|<grammar|<element/.test(problemText) &&
      !(await snapshot()).overflow &&
      (await snapshot()).active?.startsWith('Open retained problem report'),
  );
  await driver.setViewport(1440, 900);
  await importFile(
    driver,
    'rng',
    path.resolve(basic(syntax)),
    `01-basic-grammar.${syntax}`,
  );
  check(
    `${syntax}-retry-clears-problems`,
    await snapshot(),
    !(await snapshot()).retainedProblems,
  );
  const nav = '[data-center-navigation-entry]';
  await focus(nav);
  const beforeNav = await snapshot();
  await key('Enter');
  await waitUntil(
    async () => (await snapshot()).focus !== beforeNav.focus,
    'Navigation Enter',
  );
  check(`${syntax}-navigation-keyboard`, {
    before: beforeNav,
    after: await snapshot(),
  });
}

async function zipFromFiles(name, entries) {
  const zip = new JSZip();
  for (const [entry, bytes] of entries)
    zip.file(entry, bytes, {
      date: new Date('2000-01-01T00:00:00Z'),
      createFolders: false,
    });
  const file = path.join(work, name);
  await writeFile(
    file,
    await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }),
  );
  return file;
}
async function schemaEntries(directory, root = directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await schemaEntries(file, root)));
    else if (/\.rnc$|\.rng$/.test(file))
      result.push([
        path.relative(root, file).replaceAll('\\', '/'),
        await readFile(file),
      ]);
  }
  return result.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}
async function packageAudit() {
  for (const syntax of ['rng', 'rnc']) {
    const names =
      syntax === 'rng'
        ? [
            '11-multi-file-includes.zip',
            '12-external-ref-project.zip',
            '13-shared-dependency.zip',
            '14-nested-include-project.zip',
            '16-missing-dependency.zip',
            '17-blocked-external-uri.zip',
            '18-cycle-project.zip',
          ]
        : [
            '11-multi-file-includes.zip',
            '12-external-project.zip',
            '13-shared-dependency.zip',
            '14-nested-include.zip',
            '16-missing-dependency.zip',
            '17-blocked-references.zip',
            '18-cycles.zip',
            '19-mixed-inventory.zip',
          ];
    for (const name of names) {
      await importFile(driver, 'zip', path.resolve(folder(syntax), name), name);
      const state = await snapshot();
      const inventory = await driver.evaluate(
        `({paths:[...document.querySelectorAll('[data-package-entry-id] .entry-path')].map(e=>e.textContent), text:document.querySelector('[aria-label="Navigation"]')?.textContent ?? document.body.textContent})`,
      );
      check(
        `${syntax}-package-${name}`,
        {
          state,
          paths: inventory.paths,
          blocked: /blocked/i.test(inventory.text),
          missing: /missing|not supplied|unavailable/i.test(inventory.text),
        },
        inventory.paths.length > 0 && state.workers === 0 && !state.overflow,
      );
      if (name.startsWith('11-') || name.startsWith('19-'))
        await packageSources(
          path.resolve(folder(syntax), name),
          `${syntax}-${name}`,
        );
      if (name.startsWith('16-'))
        check(
          `${syntax}-missing-visible`,
          { text: inventory.text },
          /missing|not supplied|unavailable/i.test(inventory.text),
        );
      if (name.startsWith('17-'))
        check(
          `${syntax}-blocked-visible`,
          { text: inventory.text },
          /blocked/i.test(inventory.text),
        );
      if (name.startsWith('18-')) {
        for (let step = 0; step < 12; step++) {
          const selector =
            '[data-semantic-zoom-leafward-edge-id] [data-carousel-navigation-action]';
          if (
            !(await driver.evaluate(
              `Boolean(document.querySelector(${JSON.stringify(selector)}))`,
            ))
          )
            break;
          await pointer(selector);
        }
        check(
          `${syntax}-cycle-bounded`,
          await snapshot(),
          (await snapshot()).cards <= fullCardBound,
        );
      }
    }
  }
  const mixedFile = path.resolve(`${folder('rnc')}/19-mixed-inventory.zip`);
  const zip = await JSZip.loadAsync(await readFile(mixedFile));
  const entries = await Promise.all(
    Object.values(zip.files)
      .filter((f) => !f.dir)
      .map(async (f) => [f.name, await f.async('nodebuffer')]),
  );
  const orders = [];
  for (const ordering of [entries, [...entries].reverse()]) {
    const file = await zipFromFiles('permuted-mixed.zip', ordering);
    await importFile(driver, 'zip', file, 'permuted-mixed.zip');
    orders.push(
      await driver.evaluate(
        `({ entries:[...document.querySelectorAll('[data-package-entry-id] .entry-path')].map(e=>e.textContent), focus:document.querySelector('[data-semantic-zoom-focus-card]')?.getAttribute('data-semantic-zoom-line-node-id'), nodes:[...document.querySelectorAll('[data-inspect-node-id]')].map(e=>e.getAttribute('data-inspect-node-id')) })`,
      ),
    );
  }
  check(
    'package-order-determinism',
    orders,
    JSON.stringify(orders[0]) === JSON.stringify(orders[1]),
  );
  const pairs = [];
  for (const syntax of ['rng', 'rnc'])
    pairs.push([`schema.${syntax}`, await readFile(basic(syntax))]);
  const mixedRng = await zipFromFiles('mixed-rng-rnc.zip', pairs);
  await importFile(driver, 'zip', mixedRng, 'mixed-rng-rnc.zip');
  check('mixed-rng-rnc', await snapshot(), (await snapshot()).workers === 0);
  for (const id of ['epubcheck-5.3.0', 'validator-26.8.30']) {
    const file = await zipFromFiles(
      `${id}.zip`,
      await schemaEntries(`${fixtures}/conformance/real-world/${id}`),
    );
    await importFile(driver, 'zip', file, `${id}.zip`);
    const text = await driver.evaluate('document.body.textContent');
    check(
      `real-world-${id}`,
      {
        state: await snapshot(),
        customDatatypeBoundary: /datatype|library|invalid/i.test(text),
      },
      id !== 'validator-26.8.30' || /datatype|library|invalid/i.test(text),
    );
  }
}
async function packageSources(file, id) {
  const archive = await JSZip.loadAsync(await readFile(file));
  const entries = await driver.evaluate(
    `Array.from(document.querySelectorAll('[data-package-entry-id]')).map(e=>({id:e.getAttribute('data-package-entry-id'),path:e.querySelector('.entry-path').textContent,source:!!e.querySelector('.source-view')}))`,
  );
  const originalPaths = Object.values(archive.files)
    .filter((e) => !e.dir)
    .map((e) => e.name)
    .sort();
  assert.deepEqual(
    entries
      .map((e) => e.path)
      .filter((p) => !p.endsWith('/'))
      .sort(),
    originalPaths,
    'Complete supplied package inventory',
  );
  const sources = [];
  for (const entry of entries.filter((e) => e.source)) {
    const selector = `[data-package-entry-id=${JSON.stringify(entry.id)}]`;
    await driver.evaluate(
      `(() => {const e=document.querySelector(${JSON.stringify(selector)});const p=e.closest('[hidden]');if(p){document.querySelector('[aria-controls="'+p.id+'"]').click();}})()`,
    );
    await pointer(`${selector} > summary`);
    await pointer(`${selector} .source-view > summary`);
    await waitUntil(
      () =>
        driver.evaluate(
          `Boolean(document.querySelector(${JSON.stringify(`${selector} .source-view pre code`)}))`,
        ),
      'package source',
    );
    const actual = await driver.evaluate(
      `document.querySelector(${JSON.stringify(`${selector} .source-view pre code`)}).textContent`,
    );
    const expected = await archive.file(entry.path).async('string');
    sources.push({
      path: entry.path,
      sha256: hash(actual),
      exact: actual === expected,
    });
    assert.equal(actual, expected, entry.path);
    await pointer(`${selector} .source-view > summary`);
    await pointer(`${selector} > summary`);
  }
  check(
    `${id}-all-package-sources`,
    { sources, inventory: originalPaths },
    sources.length > 0 && sources.every((e) => e.exact),
  );
}
async function privacyAndLifecycle() {
  for (const syntax of ['rng', 'rnc']) {
    await importFile(
      driver,
      'rng',
      path.resolve(basic(syntax)),
      `01-basic-grammar.${syntax}`,
    );
    for (const [kind, target] of [
      ['https', 'https://example.invalid/private-schema'],
      ['file', 'file:///private/schema'],
      ['traversal', '../../outside'],
    ]) {
      const source =
        syntax === 'rng'
          ? `<element xmlns="http://relaxng.org/ns/structure/1.0" name="root"><externalRef href="${target}.rng"/></element>`
          : `start = element root { external "${target}.rnc" }`;
      const file = path.join(work, `blocked-${kind}.${syntax}`);
      await writeFile(file, source);
      await driver.setFile('#rng-file-input', file);
      await waitUntil(
        () =>
          driver.evaluate(
            `Boolean(document.querySelector('[aria-label="Dismiss import error"]'))`,
          ),
        `${kind} rejection`,
      );
      const state = await snapshot();
      check(
        `${syntax}-blocked-${kind}`,
        state,
        state.project === `01-basic-grammar.${syntax}`,
      );
      await driver.click('[aria-label="Dismiss import error"]');
    }
  }
  const rncSource = `start = element catalog { (${Array.from({ length: 1000 }, (_, i) => `entry${i}`).join(' | ')})* }\n${Array.from({ length: 1000 }, (_, i) => `entry${i} = element entry${i} { attribute id { text }, text }`).join('\n')}\n`;
  const largeRnc = path.join(work, 'large-1000-definitions.rnc');
  await writeFile(largeRnc, rncSource);
  const largeStarted = performance.now();
  await importFile(driver, 'rng', largeRnc, 'large-1000-definitions.rnc');
  await setSearch('entry999');
  await pointer('[data-search-result-node-id] [data-inspect-search-result]');
  await sourceAndCopy('rnc', rncSource, 'large-1000-rnc');
  check(
    'large-1000-rnc',
    await snapshot(),
    (await snapshot()).cards <= fullCardBound &&
      (await snapshot()).workers === 0,
  );
  report.timings.push({
    id: `${currentMount}:large-1000-rnc`,
    milliseconds: Math.round(performance.now() - largeStarted),
  });
  await closeInspector();
  await setSearch('');
  for (const syntax of ['rng', 'rnc']) {
    const file = path.resolve(
      folder(syntax),
      `07-large-semantic-model-a.${syntax}`,
    );
    const started = performance.now();
    await importFile(driver, 'rng', file, path.basename(file));
    report.timings.push({
      id: `${currentMount}:large-${syntax}`,
      milliseconds: Math.round(performance.now() - started),
    });
    const state = await snapshot();
    await setSearch(syntax === 'rng' ? 'catalog' : 'entry');
    check(
      `large-${syntax}`,
      {
        state,
        results: await driver.evaluate(
          `document.querySelectorAll('[data-search-result-node-id]').length`,
        ),
      },
      state.cards <= fullCardBound && state.workers === 0,
    );
    await setSearch('');
  }
  const docbook = path.resolve(
    `${fixtures}/conformance/real-world/docbook-5.1/docbook.rng`,
  );
  await importFile(driver, 'rng', docbook, 'docbook.rng');
  await setSearch('book');
  await driver.click(
    '[data-search-result-node-id] [data-inspect-search-result]',
  );
  await sourceAndCopy('rng', await readFile(docbook, 'utf8'), 'docbook');
  check(
    'docbook-large',
    await snapshot(),
    (await snapshot()).cards <= fullCardBound &&
      (await snapshot()).workers === 0,
  );
  await setSearch('');
  await closeInspector();
  for (let iteration = 0; iteration < 3; iteration++) {
    await driver.setFile('#rng-file-input', docbook);
    await waitUntil(
      () =>
        driver.evaluate(
          `Boolean(document.querySelector('[data-schema-import-phase] button[aria-label^="Cancel"]')) && window.__releaseAudit.workers.size > 0`,
        ),
      'processing worker cancel control',
    );
    await driver.click(
      '[data-schema-import-phase] button[aria-label^="Cancel"]',
    );
    await waitForIdle(driver);
    await importFile(
      driver,
      'rng',
      path.resolve(basic('rnc')),
      '01-basic-grammar.rnc',
    );
    check(
      `cancel-fresh-${iteration}`,
      await snapshot(),
      (await snapshot()).workers === 0 &&
        (await snapshot()).project === '01-basic-grammar.rnc',
    );
  }
  await driver.evaluate(`window.__releaseAudit.holdReadName='docbook.rng'`);
  await driver.setFile('#rng-file-input', docbook);
  await waitUntil(
    () =>
      driver.evaluate(
        `window.__releaseAudit.reads.length>0 && document.querySelector('[data-schema-import-phase]')?.getAttribute('data-schema-import-phase')==='reading'`,
      ),
    'held browser file read',
  );
  await driver.click('[data-schema-import-phase] button[aria-label^="Cancel"]');
  await importFile(
    driver,
    'rng',
    path.resolve(basic('rnc')),
    '01-basic-grammar.rnc',
  );
  await driver.evaluate(
    `(() => {window.__releaseAudit.holdReadName=null;window.__releaseAudit.reads.splice(0).forEach(resolve=>resolve());})()`,
  );
  await waitForIdle(driver);
  check(
    'cancel-reading-stale',
    await snapshot(),
    (await snapshot()).project === '01-basic-grammar.rnc' &&
      (await snapshot()).workers === 0,
  );
  await driver.evaluate(`window.__releaseAudit.holdReadName='docbook.rng'`);
  await driver.setFile('#rng-file-input', docbook);
  await waitUntil(
    () => driver.evaluate(`window.__releaseAudit.reads.length>0`),
    'superseded read',
  );
  await importFile(
    driver,
    'rng',
    path.resolve(basic('rng')),
    '01-basic-grammar.rng',
  );
  await driver.evaluate(
    `(() => {window.__releaseAudit.holdReadName=null;window.__releaseAudit.reads.splice(0).forEach(resolve=>resolve());})()`,
  );
  await waitForIdle(driver);
  check(
    'superseded-read-stale',
    await snapshot(),
    (await snapshot()).project === '01-basic-grammar.rng' &&
      (await snapshot()).workers === 0,
  );
  await setSearch('book');
  await pointer('[data-search-result-node-id] [data-inspect-search-result]');
  await driver.evaluate(`window.__releaseAudit.holdCopies=true`);
  await driver.click('[data-copy-node-summary]');
  await waitUntil(
    () => driver.evaluate(`window.__releaseAudit.copyResolutions.length>0`),
    'pending clipboard write',
  );
  await importFile(
    driver,
    'rng',
    path.resolve(basic('rnc')),
    '01-basic-grammar.rnc',
  );
  await driver.evaluate(
    `(() => {window.__releaseAudit.holdCopies=false;window.__releaseAudit.copyResolutions.splice(0).forEach(resolve=>resolve());})()`,
  );
  await waitForIdle(driver);
  const copyState = await snapshot();
  check(
    'stale-copy-replacement',
    copyState,
    copyState.project === '01-basic-grammar.rnc' &&
      !copyState.inspected &&
      !(await driver.evaluate(
        `document.body.textContent.includes('Copied node summary')`,
      )),
  );
  const audit = await driver.evaluate(
    `({created:window.__releaseAudit.created,terminated:window.__releaseAudit.terminated,live:window.__releaseAudit.workers.size})`,
  );
  check(
    'worker-cleanup',
    audit,
    audit.created > 0 && audit.created === audit.terminated && audit.live === 0,
  );
}

try {
  const launched =
    args.browser === 'firefox'
      ? await FirefoxDriver.launch(
          path.resolve(args['browser-path']),
          path.resolve(args['geckodriver-path']),
        )
      : await ChromiumDriver.launch(path.resolve(args['browser-path']));
  driver = launched.driver;
  report.browserVersion = launched.version;
  if (driver instanceof ChromiumDriver) {
    driver.connection.onMessage((message) => {
      if (message.method === 'Target.detachedFromTarget') {
        detachedSessions.add(message.params.sessionId);
        return;
      }
      if (
        message.method !== 'Target.attachedToTarget' ||
        !message.params.waitingForDebugger
      )
        return;
      const session = message.params.sessionId;
      void (async () => {
        try {
          await driver.connection.send('Network.enable', {}, session);
          await driver.connection.send('Runtime.enable', {}, session);
          await driver.connection.send(
            'Target.setAutoAttach',
            { autoAttach: true, waitForDebuggerOnStart: true, flatten: true },
            session,
          );
        } catch (error) {
          // Cancelled workers may detach while a CDP command is pending.
          // Browser close also rejects pending protocol calls. Neither is a
          // JavaScript error in the application; genuine setup errors fail below.
          if (!closingBrowser && !detachedSessions.has(session)) {
            instrumentationErrors.push(error.message);
          }
        } finally {
          await driver.connection
            .send('Runtime.runIfWaitingForDebugger', {}, session)
            .catch(() => {});
        }
      })();
    });
    await driver.send('Target.setAutoAttach', {
      autoAttach: true,
      waitForDebuggerOnStart: true,
      flatten: true,
    });
  }
  if (args.browser === 'firefox') {
    report.geckodriverVersion = spawnSync(
      path.resolve(args['geckodriver-path']),
      ['--version'],
      { encoding: 'utf8', windowsHide: true },
    )
      .stdout.split('\n')[0]
      .trim();
    await driver.bidiConnection.send('session.subscribe', {
      events: ['log.entryAdded'],
      contexts: [driver.browsingContext],
    });
    driver.bidiConnection.onMessage((message) => {
      if (message.method !== 'log.entryAdded') return;
      const event = message.params;
      if (event.type === 'javascript') driver.pageErrors.push(event.text);
      if (event.type === 'console')
        driver.consoleEntries.push({ type: event.level, text: event.text });
    });
  }
  const preload = `() => {
    const audit = {workers:new Set(),created:0,terminated:0,copies:[],reads:[],copyResolutions:[]};
    window.__releaseAudit=audit;
    const NativeWorker=window.Worker;
    window.Worker=class extends NativeWorker { constructor(...args){super(...args);audit.workers.add(this);audit.created++;} terminate(){if(audit.workers.delete(this))audit.terminated++;return super.terminate();} };
    for (const method of ['text','arrayBuffer']) {
      const original=File.prototype[method];
      File.prototype[method]=async function(...args){const result=await original.apply(this,args);if(this.name===audit.holdReadName)await new Promise(resolve=>audit.reads.push(resolve));return result;};
    }
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{audit.copies.push(String(text));if(audit.holdCopies)await new Promise(resolve=>audit.copyResolutions.push(resolve));}}});
  }`;
  if (driver instanceof ChromiumDriver)
    await driver.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `(${preload})()`,
    });
  else
    await driver.bidiConnection.send('script.addPreloadScript', {
      functionDeclaration: preload,
      contexts: [driver.browsingContext],
    });
  await driver.setReducedMotion();
  for (const [mount, url] of [
    ['root', server.rootUrl],
    ['nested', server.nestedUrl],
  ]) {
    currentMount = mount;
    await driver.setViewport(1440, 900);
    const requestStart = driver.requests.length;
    const serverRequestStart = requests.length;
    await driver.navigate(url);
    await waitUntil(
      () =>
        driver.evaluate(
          `Boolean(document.querySelector('[aria-label="Open RNG"]'))`,
        ),
      'application startup',
    );
    await dismissWelcome(driver);
    await waitForIdle(driver);
    check(
      'startup-lazy',
      {
        state: await snapshot(),
        requests: driver.requests.slice(requestStart).length,
      },
      !driver.requests
        .slice(requestStart)
        .some((u) => /libxml2-relaxng-runtime|relaxNgStandardsWorker/.test(u)),
    );
    await importFile(
      driver,
      'dtd',
      path.resolve('tests/fixtures/dtd/library.dtd'),
      'library.dtd',
    );
    await importFile(
      driver,
      'xsd',
      path.resolve('tests/fixtures/xsd/attributes.xsd'),
      'attributes.xsd',
    );
    check(
      'dtd-xsd-lazy',
      await snapshot(),
      !driver.requests
        .slice(requestStart)
        .some((u) => /libxml2-relaxng-runtime|relaxNgStandardsWorker/.test(u)),
    );
    await standalone('rng');
    await standalone('rnc');
    await packageAudit();
    await privacyAndLifecycle();
    const runtimeRequests = requests
      .slice(serverRequestStart)
      .filter((r) => /libxml2-relaxng-runtime.*\.wasm/.test(r.pathname));
    check(
      'rng-lazy-loaded',
      { runtimeRequests },
      runtimeRequests.length > 0 &&
        runtimeRequests.every(
          (r) =>
            r.status === 200 && r.contentType === 'application/octet-stream',
        ),
    );
  }
  currentMount = 'all';
  const origin = new URL(server.rootUrl).origin;
  const remote = driver.requests.filter(
    (url) =>
      !url.startsWith('data:') &&
      !url.startsWith('blob:') &&
      new URL(url).origin !== origin,
  );
  report.privacy = {
    instrumentationErrors: [...instrumentationErrors],
    pageErrors: [...driver.pageErrors],
    consoleErrors: driver.consoleEntries.filter((e) => e.type === 'error'),
    remoteSchemaRequests: remote.filter((u) => /^https?:/.test(u)),
    fileRequests: driver.requests.filter((u) => u.startsWith('file:')),
    unexpectedOrigins: remote,
    requestCount: driver.requests.length,
  };
  check(
    'privacy',
    report.privacy,
    !report.privacy.pageErrors.length &&
      !report.privacy.consoleErrors.length &&
      !instrumentationErrors.length &&
      !remote.length,
  );
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = error.stack ?? String(error);
  if (driver) {
    report.lastState = await snapshot().catch(() => null);
    report.lastPage = await driver
      .evaluate('document.body.innerText')
      .catch(() => null);
    await driver.screenshot(`${output}.png`).catch(() => {});
  }
  process.exitCode = 1;
} finally {
  closingBrowser = true;
  await driver?.close();
  await server.close();
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    `Task 17.10 ${args.browser}: ${report.status}; ${report.checks.length} checks; ${output}`,
  );
  if (report.error) console.error(report.error);
}
