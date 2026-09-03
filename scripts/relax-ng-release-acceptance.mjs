import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const evidencePath =
  'docs/technical/relax-ng-release-browser-evidence.json';
export const matrixPath =
  'docs/technical/relax-ng-release-acceptance-matrix.json';
/** @param {import('node:crypto').BinaryLike} bytes */
export const sha256 = (bytes) =>
  createHash('sha256').update(bytes).digest('hex');
/** @param {unknown} value */
export const serialize = (value) => `${JSON.stringify(value, null, 2)}\n`;
const base = 'tests/fixtures/relax-ng/';
const ui = 'src/tests/StandaloneRngImportIntegration.test.ts';
const semantic = 'src/schema/relaxng/relaxNgSemanticModel.test.ts';
const packageTest = 'src/app/import/schemaPackage/rngPackageResolution.test.ts';
const zoomTest = 'src/tests/RelaxNgCompleteVisualizationAcceptance.test.ts';
const lifecycle = 'src/app/import/schemaFileImportController.test.ts';
const source = 'src/ui/source/SourceViewDialog.test.ts';

// Each browser check is required independently in BOTH browsers and BOTH mounts.
// Automated test paths supplement the real production-browser observations.
/** @type {Array<[id: string, requirement: string, expected: string, checks: string[], tests: string[], gates?: string[]]>} */
export const catalogue = [
  [
    'standalone-rng-valid',
    'Accept and activate a standards-valid RNG',
    'Semantic Start, exact source, disposable worker',
    ['rng-valid'],
    [ui, `${base}manual-qa/01-basic-grammar.rng`],
  ],
  [
    'standalone-rng-invalid',
    'Reject invalid RNG',
    'Prior project and source remain active',
    ['rng-invalid-preservation'],
    [ui, `${base}manual-qa/09-invalid-schema.rng`],
  ],
  [
    'standalone-rnc-valid',
    'Accept and activate a standards-valid RNC',
    'Compact parser and libxml2 agree; original RNC retained',
    ['rnc-valid'],
    [ui, `${base}manual-qa-rnc/01-basic-grammar.rnc`],
  ],
  [
    'standalone-rnc-invalid',
    'Reject invalid RNC',
    'Prior project preserved; diagnostics refer to original source',
    ['rnc-invalid-preservation'],
    [ui, `${base}manual-qa-rnc/09-invalid-syntax.rnc`],
  ],
  [
    'package-rng',
    'Resolve supplied RNG package dependencies',
    'Include, externalRef, nested paths and source inventory remain truthful',
    [
      'rng-package-11-multi-file-includes.zip',
      'rng-package-12-external-ref-project.zip',
      'rng-package-14-nested-include-project.zip',
    ],
    [packageTest],
  ],
  [
    'package-rnc',
    'Resolve supplied RNC package dependencies',
    'Include, external and nested paths retain Compact Syntax identity',
    [
      'rnc-package-11-multi-file-includes.zip',
      'rnc-package-12-external-project.zip',
      'rnc-package-14-nested-include.zip',
    ],
    [packageTest],
  ],
  [
    'package-mixed-rng-rnc',
    'Keep both RELAX NG syntaxes in one package',
    'Independent syntax-owned identities; no extension fallback',
    ['mixed-rng-rnc'],
    [packageTest],
  ],
  [
    'package-mixed-all',
    'Keep DTD/XSD/RNG/RNC in one package',
    'Complete inventory and exact member text across formats',
    [
      'rnc-package-19-mixed-inventory.zip',
      'rnc-19-mixed-inventory.zip-all-package-sources',
    ],
    [packageTest],
  ],
  [
    'package-order',
    'Ignore ZIP entry order for semantic identity',
    'Reversed ZIP order has identical semantic focus, nodes and sorted paths',
    ['package-order-determinism'],
    [packageTest],
  ],
  [
    'package-source',
    'Open every retained text member in representative packages',
    'Each source equals the original decoded ZIP member byte-for-byte as text',
    [
      'rng-11-multi-file-includes.zip-all-package-sources',
      'rnc-11-multi-file-includes.zip-all-package-sources',
      'rnc-19-mixed-inventory.zip-all-package-sources',
    ],
    ['src/ui/layout/SchemaSetOutline.test.ts'],
  ],
  [
    'missing-dependency',
    'Retain missing include/external relationships',
    'Literal reference visible; no invented target semantics',
    ['rng-missing-visible', 'rnc-missing-visible'],
    [packageTest, semantic],
  ],
  [
    'blocked-https',
    'Block remote schema retrieval',
    'HTTPS reference remains blocked; no remote request',
    [
      'rng-blocked-https',
      'rnc-blocked-https',
      'rng-blocked-visible',
      'rnc-blocked-visible',
    ],
    [packageTest],
  ],
  [
    'blocked-file',
    'Block arbitrary host filesystem references',
    'file: references rejected without host retrieval',
    ['rng-blocked-file', 'rnc-blocked-file'],
    [packageTest],
  ],
  [
    'blocked-traversal',
    'Block references outside the supplied project',
    'Traversal rejected without target semantics',
    ['rng-blocked-traversal', 'rnc-blocked-traversal'],
    [packageTest],
  ],
  [
    'cycles',
    'Keep recursive graphs navigable',
    'Repeated navigation remains bounded by production window limits',
    ['rng-cycle-bounded', 'rnc-cycle-bounded'],
    [semantic],
  ],
  [
    'shared-dependencies',
    'Preserve shared target identity',
    'One target identity, truthful incoming and outgoing relationships',
    [
      'rng-package-13-shared-dependency.zip',
      'rnc-package-13-shared-dependency.zip',
    ],
    [semantic, packageTest],
  ],
  [
    'large-rng',
    'Use bounded presentation for large RNG',
    'Search, Inspector and source remain usable with bounded DOM',
    ['large-rng', 'docbook-large', 'docbook-source-copy'],
    [semantic],
  ],
  [
    'large-rnc',
    'Use bounded presentation for large RNC',
    '1,000 definitions searchable; exact source and usable Inspector',
    ['large-rnc', 'large-1000-rnc', 'large-1000-rnc-source-copy'],
    ['scripts/relax-ng-release-browser-acceptance.mjs'],
  ],
  [
    'real-world-docbook',
    'Explore pinned DocBook 5.1',
    'book Search, Inspector and original source work',
    ['docbook-large', 'docbook-source-copy'],
    [
      `${base}conformance/real-world/docbook-5.1/docbook.rng`,
      'src/tests/RelaxNgConformanceGate.test.ts',
    ],
  ],
  [
    'real-world-epubcheck',
    'Explore supplied EPUBCheck Compact Syntax',
    'Local package activates with retained source identities',
    ['real-world-epubcheck-5.3.0'],
    ['src/tests/RelaxNgConformanceGate.test.ts'],
  ],
  [
    'validator-datatype-boundary',
    'Keep the reviewed Validator.nu custom datatype boundary explicit',
    'WHATWG datatype-library limitation remains an expected boundary',
    ['real-world-validator-26.8.30'],
    [
      'src/tests/RelaxNgConformanceGate.test.ts',
      `${base}conformance/expected-boundaries.json`,
    ],
  ],
  [
    'search',
    'Search semantic names, references, literals, annotations and source context',
    'Inspect leaves focus unchanged; Center navigates; no generated XML',
    ['rng-search-inspect', 'rnc-search-inspect'],
    ['src/schema/relaxng/relaxNgPresentationProjector.test.ts', zoomTest],
  ],
  [
    'navigation',
    'Navigate through the shared Navigation panel',
    'Keyboard Enter changes semantic focus through normal navigation',
    ['rng-navigation-keyboard', 'rnc-navigation-keyboard'],
    ['src/ui/layout/SchemaOutlineList.test.ts'],
  ],
  [
    'carousel',
    'Preserve journey semantics and orientation',
    'Leafward right, rootward left; rootward returns through actual journey',
    ['rng-journey', 'rnc-journey'],
    ['src/tests/OverviewSemanticZoom.test.ts'],
  ],
  [
    'inspector',
    'Expose faithful RELAX NG semantics independently of focus',
    'Kind, source, range, scope, bindings, names, datatype and relationships remain inspectable',
    ['rng-search-inspect', 'rnc-search-inspect'],
    [semantic, 'src/schema/relaxng/relaxNgPresentationProjector.test.ts'],
  ],
  [
    'problems',
    'Retain truthful failed-import reports',
    'Original identity, no host paths/generated XML, retry clears old report',
    [
      'rng-problems-retained',
      'rnc-problems-retained',
      'rng-retry-clears-problems',
      'rnc-retry-clears-problems',
    ],
    [
      'src/ui/problems/ProblemReportDialog.test.ts',
      'src/standards/relaxng/productionValidator.test.ts',
    ],
  ],
  [
    'source-modal',
    'Show exact retained semantic source fragments',
    'RNG XML/RNC text exact; Search and Inspector survive Escape',
    [
      'rng-source-copy',
      'rnc-source-copy',
      'rng-source-focus',
      'rnc-source-focus',
    ],
    [source, zoomTest],
  ],
  [
    'copy-source',
    'Copy the exact viewed source',
    'Clipboard API receives exact original syntax, without generated RNC XML',
    ['rng-source-copy', 'rnc-source-copy', 'docbook-source-copy'],
    [source, ui],
  ],
  [
    'copy-summary',
    'Keep summary copying distinct and safe across replacement',
    'Summary differs from source; stale completion cannot affect new project',
    ['rng-source-copy', 'rnc-source-copy', 'stale-copy-replacement'],
    ['src/ui/inspector/NodeSummaryCopyAction.test.ts', source],
  ],
  [
    'zoom-full',
    'Preserve semantic identity in Full',
    'Focus, journey, Search results, Inspector and source target unchanged',
    ['rng-zoom-full', 'rnc-zoom-full'],
    [zoomTest],
  ],
  [
    'zoom-compact',
    'Preserve semantic identity in Compact',
    'Focus, journey, Search results, Inspector and source target unchanged',
    ['rng-zoom-compact', 'rnc-zoom-compact'],
    [zoomTest],
  ],
  [
    'zoom-overview',
    'Preserve semantic identity in Overview',
    'Focus, journey, Search results, Inspector and source target unchanged',
    ['rng-zoom-overview', 'rnc-zoom-overview'],
    [zoomTest],
  ],
  [
    'overview-inspect',
    'Keep focused Overview Inspect available',
    'Space and pointer inspect without navigating; independent target may be centered explicitly',
    [
      'rng-overview-keyboard-inspect',
      'rnc-overview-keyboard-inspect',
      'rng-overview-pointer-inspect',
      'rnc-overview-pointer-inspect',
    ],
    ['src/tests/OverviewSemanticZoom.test.ts'],
  ],
  [
    'keyboard',
    'Support keyboard workflows and native input keys',
    'Tab/Shift+Tab, Enter, Space, Escape and arrows work without traps',
    [
      'rng-tab-order',
      'rnc-tab-order',
      'rng-input-keys',
      'rnc-input-keys',
      'rng-navigation-keyboard',
      'rnc-navigation-keyboard',
    ],
    ['src/tests/OverviewSemanticZoom.test.ts', source],
  ],
  [
    'pointer-drag',
    'Support pointer card and drag navigation',
    'Real mouse drag reaches same leafward target as pointer activation',
    ['rng-drag', 'rnc-drag'],
    ['src/tests/CarouselGesture.test.ts'],
  ],
  [
    'focus-restoration',
    'Restore useful focus after transient UI closes',
    'Source, invalid import and Problems return to appropriate controls',
    [
      'rng-source-focus',
      'rnc-source-focus',
      'rng-invalid-focus',
      'rnc-invalid-focus',
      'rng-problems-retained',
      'rnc-problems-retained',
    ],
    [source, 'src/ui/problems/ProblemReportDialog.test.ts'],
  ],
  [
    'responsive',
    'Adapt desktop and narrow layouts',
    'No document overflow at 1440x900 and 768x900; Search and carousel usable',
    [
      'rng-responsive-1440',
      'rnc-responsive-1440',
      'rng-responsive-768',
      'rnc-responsive-768',
    ],
    ['src/tests/OverviewSemanticZoom.test.ts'],
  ],
  [
    'mobile',
    'Keep phone-width workflows usable',
    '390x844 Search, Inspector, source/copy and retained Problems usable',
    [
      'rng-responsive-390',
      'rnc-responsive-390',
      'rng-mobile-source-copy',
      'rnc-mobile-source-copy',
    ],
    [source, 'src/ui/problems/ProblemReportDialog.test.ts'],
  ],
  [
    'accessible-labels',
    'Provide accessible names and truthful status',
    'No serious/critical axe WCAG A/AA findings on representative screens',
    [
      'axe-rng-search-inspector',
      'axe-rnc-search-inspector',
      'axe-rng-problems-mobile',
      'axe-rnc-problems-mobile',
      'axe-rng-390',
      'axe-rnc-390',
    ],
    [
      'src/ui/layout/TopBarImport.test.ts',
      'src/ui/search/SchemaSearch.test.ts',
      'src/tests/ReleaseCandidateAccessibility.test.ts',
    ],
  ],
  [
    'cancellation',
    'Cancel reading and processing imports',
    'Cancelled attempts leave no active worker and fresh import succeeds',
    [
      'cancel-fresh-0',
      'cancel-fresh-1',
      'cancel-fresh-2',
      'cancel-reading-stale',
    ],
    [lifecycle],
  ],
  [
    'stale-results',
    'Suppress late read, worker and copy results',
    'Latest attempt wins after controlled late settlement',
    ['cancel-reading-stale', 'superseded-read-stale', 'stale-copy-replacement'],
    [lifecycle, 'src/standards/relaxng/workerClient.test.ts', source],
  ],
  [
    'worker-cleanup',
    'Dispose workers across formats and outcomes',
    'Created count equals terminated count; zero live workers',
    ['worker-cleanup'],
    [lifecycle, 'src/standards/relaxng/workerClient.test.ts'],
  ],
  [
    'project-replacement',
    'Replace one coherent project atomically',
    'Fresh source/semantic identity; old Inspector and Problems cleared',
    [
      'stale-copy-replacement',
      'rng-retry-clears-problems',
      'rnc-retry-clears-problems',
    ],
    [lifecycle],
  ],
  [
    'failed-replacement',
    'Preserve active project after failure',
    'RNG and RNC failures do not discard focus or source',
    ['rng-invalid-preservation', 'rnc-invalid-preservation'],
    [ui],
  ],
  [
    'root-mount',
    'Run the portable artifact at /',
    'Complete representative browser flow passes',
    ['startup-lazy', 'docbook-large', 'worker-cleanup'],
    ['scripts/verify-static-build.mjs'],
  ],
  [
    'nested-mount',
    'Run the same artifact at /xml-carousel/',
    'Imports, workers, WASM and UI resolve under the nested mount',
    ['startup-lazy', 'docbook-large', 'worker-cleanup'],
    ['scripts/verify-hostile-mime-build.mjs'],
  ],
  [
    'chrome',
    'Run controlled Chrome independently',
    'Every required browser check passes with zero errors',
    ['worker-cleanup'],
    ['scripts/relax-ng-release-browser-acceptance.mjs'],
  ],
  [
    'firefox',
    'Run controlled Firefox independently',
    'Every required browser check passes with zero errors',
    ['worker-cleanup'],
    ['scripts/relax-ng-release-browser-acceptance.mjs'],
  ],
  [
    'lazy-loading',
    'Load RELAX NG runtime only when needed',
    'Startup and DTD/XSD do not load it; RNG/RNC do',
    ['startup-lazy', 'dtd-xsd-lazy', 'rng-lazy-loaded'],
    ['src/app/import/schemaFileImportController.test.ts'],
  ],
  [
    'authority-determinism',
    'Rebuild conformance, oracle, visualization and manual-QA authorities twice',
    'Byte-identical repeated results and approved digests',
    [],
    [
      'npm run relaxng:oracle',
      'node scripts/generate-relax-ng-conformance-authority.mjs',
      'node scripts/relax-ng-complete-visualization-acceptance.mjs',
    ],
    ['authorityRepeat'],
  ],
  [
    'build-determinism',
    'Repeat clean builds from identical inputs',
    'Every production artifact path and byte digest identical',
    [],
    ['npm run build'],
    ['buildRepeat'],
  ],
  [
    'portable-build',
    'Verify only portable intended release assets',
    'Relative URLs, pinned runtimes, notices and no conformance/test assets',
    [],
    ['npm run verify:dist -- --base=./'],
    ['dist'],
  ],
  [
    'hostile-mime',
    'Support WASM served as application/octet-stream',
    'Both browser mounts run and static verifier passes',
    ['rng-lazy-loaded'],
    ['npm run verify:hostile-mime'],
    ['hostileMime'],
  ],
  [
    'privacy',
    'Make no schema-network or host-file requests',
    'Zero remote schema requests, file requests and unexpected origins',
    [],
    ['scripts/relax-ng-release-browser-acceptance.mjs'],
    ['privacy'],
  ],
  [
    'licensing',
    'Preserve production and test-corpus attribution',
    'Required notices reachable; test-only JARs/corpus absent from dist',
    [],
    ['npm run verify:release-integrity', 'docs/third-party-licensing.md'],
    ['licensing', 'releaseIntegrity'],
  ],
  [
    'release-documentation',
    'Prepare an unreleased 0.3 candidate decision record',
    'Support, limits, evidence and manual QA documented; version remains 0.2.0',
    [],
    ['docs/release-0.3.0-candidate.md', 'docs/release-0.3.0-manual-qa.md'],
    ['documentation'],
  ],
  [
    'historical-visualization',
    'Preserve the historical presentation authority',
    '221/221; approved digest unchanged',
    [],
    ['npm run acceptance:complete-visualization'],
    ['historicalVisualization'],
  ],
  [
    'relaxng-visualization',
    'Preserve the RELAX NG presentation authority',
    '77/77; zero findings; approved digest unchanged',
    [],
    ['npm run acceptance:relaxng-complete-visualization'],
    ['relaxNgVisualization'],
  ],
  [
    'relaxng-conformance',
    'Keep all reviewed conformance boundaries explicit',
    '385 spectest + 90 compacttest = 475 selected; zero excluded/investigations/harness errors',
    [],
    ['npm run relaxng:conformance'],
    ['relaxNgConformance'],
  ],
  [
    'full-validation',
    'Run the full repository and legacy CI gates',
    'Validation, DTD and XSD CI pass with exact counts recorded',
    [],
    ['npm run validate', 'npm run w3c:dtd:ci', 'npm run w3c:xsd:ci'],
    ['validate', 'dtdCi', 'xsdCi'],
  ],
];
catalogue.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

/** @param {string} directory @returns {Promise<string[]>} */
async function filesIn(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = `${directory}/${entry.name}`;
    if (entry.isDirectory()) result.push(...(await filesIn(file)));
    else result.push(file);
  }
  return result.sort();
}

export async function productionSourceDigest() {
  const files = [
    ...(await filesIn('src')).filter(
      (file) => !file.endsWith('.test.ts') && !file.startsWith('src/tests/'),
    ),
    'package-lock.json',
    'vite.config.ts',
    'index.html',
    'LICENSE',
    'THIRD_PARTY_NOTICES.txt',
    'scripts/release-text-assets.js',
  ].sort();
  const records = [];
  for (const file of files) {
    const bytes = await readFile(file);
    records.push([
      file,
      sha256(
        file.endsWith('.wasm')
          ? bytes
          : bytes.toString('utf8').replace(/\r\n/gu, '\n'),
      ),
    ]);
  }
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  records.push([
    'package-runtime-configuration',
    sha256(
      JSON.stringify({
        version: pkg.version,
        dependencies: pkg.dependencies,
        devDependencies: pkg.devDependencies,
      }),
    ),
  ]);
  return sha256(serialize(records));
}

export async function distInventory() {
  return Promise.all(
    (await filesIn('dist')).map(async (file) => ({
      path: file.slice(5),
      sha256: sha256(await readFile(file)),
    })),
  );
}

/**
 * @typedef {{browser: string, status: string, checks: Array<{id: string, pass: boolean}>, privacy: Record<string, number>}} BrowserEvidence
 * @typedef {{baseline: {commit: string, tree: string}, productionSourceDigest: string, browsers: BrowserEvidence[], gates: Record<string, {status: string}>}} ReleaseEvidence
 */

/** @param {ReleaseEvidence} evidence */
export function buildReleaseAcceptanceMatrix(evidence) {
  const browsers = ['chrome', 'firefox'].map((name) =>
    evidence.browsers.find((browser) => browser.browser === name),
  );
  /** @param {BrowserEvidence | undefined} browser */
  const privacy = (browser) =>
    Boolean(
      browser &&
      browser.status === 'passed' &&
      browser.checks.length > 0 &&
      browser.checks.every((check) => check.pass) &&
      [
        'pageErrors',
        'consoleErrors',
        'remoteSchemaRequests',
        'fileRequests',
        'unexpectedOrigins',
      ].every((key) => browser.privacy[key] === 0),
    );
  const browserPass = browsers.every(privacy);
  const entries = catalogue.map(
    ([
      id,
      requirement,
      expectedResult,
      browserChecks,
      automatedEvidence,
      gates = [],
    ]) => {
      const observations = [];
      for (const browser of browsers)
        for (const mount of ['root', 'nested'])
          for (const checkId of browserChecks) {
            const check = browser?.checks.find(
              (check) => check.id === `${mount}:${checkId}`,
            );
            observations.push({
              browser: browser?.browser ?? 'missing',
              id: `${mount}:${checkId}`,
              pass: check?.pass === true,
            });
          }
      const gateResults = gates.map((gate) => ({
        gate,
        pass:
          gate === 'privacy'
            ? browserPass
            : evidence.gates[gate]?.status === 'PASS',
      }));
      const passed =
        browserPass &&
        observations.every((check) => check.pass) &&
        gateResults.every((gate) => gate.pass);
      return {
        id,
        requirement,
        evidence: { browserChecks, automated: automatedEvidence, gates },
        expectedResult,
        actualResult: {
          browserObservations: observations.length,
          passedBrowserObservations: observations.filter((check) => check.pass)
            .length,
          gateResults,
        },
        status: passed ? 'PASS' : 'FAIL',
        notes:
          id === 'carousel'
            ? 'Ben confirmed the approved rootward-left, leafward-right orientation; Task 17.10 section 19 diagram is superseded.'
            : id === 'accessible-labels'
              ? 'axe-core 4.13.0 plus keyboard/focus checks; no claim of manual screen-reader or physical-device QA.'
              : id === 'copy-source'
                ? 'Browser instrumentation captures navigator.clipboard.writeText arguments; OS clipboard paste is in manual QA.'
                : id === 'large-rnc'
                  ? 'Existing compact fixtures plus a deterministic 1,000-definition grammar generated only in the external audit directory.'
                  : id === 'stale-results'
                    ? 'Real browser File reads and clipboard promises are held/released deliberately; production workers are also cancelled. Late worker messages are covered by controller/client tests.'
                    : 'Existing automated semantics and real production-browser observations are complementary.',
      };
    },
  );
  return {
    schemaVersion: 1,
    authority: 'XML Carousel Task 17.10 release acceptance',
    baseline: evidence.baseline,
    productionSourceDigest: evidence.productionSourceDigest,
    evidenceDigest: sha256(serialize(evidence)),
    entries,
    recommendation: entries.every((row) => row.status === 'PASS')
      ? 'READY_FOR_0_3_0_RELEASE'
      : 'NOT_READY_FOR_0_3_0_RELEASE',
  };
}

export async function verifyReleaseAcceptance() {
  const evidence = JSON.parse(await readFile(evidencePath, 'utf8'));
  assert.equal(
    await productionSourceDigest(),
    evidence.productionSourceDigest,
    'Production inputs changed since browser acceptance; rerun the browser audit.',
  );
  assert.equal(
    JSON.parse(await readFile('package.json', 'utf8')).version,
    '0.2.0',
  );
  const generated = buildReleaseAcceptanceMatrix(evidence);
  assert.equal(
    await readFile(matrixPath, 'utf8'),
    serialize(generated),
    'Release matrix differs from its evidence; review and regenerate.',
  );
  for (const row of generated.entries)
    for (const reference of row.evidence.automated) {
      if (!reference.startsWith('npm ') && !reference.startsWith('node '))
        await readFile(reference);
    }
  assert.equal(
    generated.recommendation,
    'READY_FOR_0_3_0_RELEASE',
    'Release-blocking acceptance remains incomplete.',
  );
  return {
    rows: generated.entries.length,
    digest: sha256(serialize(generated)),
    recommendation: generated.recommendation,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  if (process.argv.includes('--write')) {
    const evidence = JSON.parse(await readFile(evidencePath, 'utf8'));
    await writeFile(
      matrixPath,
      serialize(buildReleaseAcceptanceMatrix(evidence)),
    );
  }
  console.log(
    `RELAX_NG_RELEASE_ACCEPTANCE ${JSON.stringify(await verifyReleaseAcceptance())}`,
  );
}
