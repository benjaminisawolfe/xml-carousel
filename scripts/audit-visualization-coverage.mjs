import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { createServer } from 'vite';
import { buildCoverageMatrix } from './visualization-coverage-catalogue.mjs';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const defaultMatrixPath = path.join(
  repositoryRoot,
  'docs/technical/visualization-coverage-matrix.json',
);
const defaultLocalizationPath = path.join(
  repositoryRoot,
  'tests/fixtures/visualization-coverage/hermetic-finding-localization.json',
);

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(
        ([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`,
      )
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function repositoryRelative(candidate) {
  return path.relative(repositoryRoot, candidate).split(path.sep).join('/');
}

function isSafeRepositoryReference(reference) {
  return (
    typeof reference === 'string' &&
    reference.length > 0 &&
    !path.isAbsolute(reference) &&
    !/^[a-z][a-z+.-]*:/iu.test(reference) &&
    !reference.split('/').includes('..')
  );
}

function countBy(values, keyOf) {
  const counts = {};
  for (const value of values) {
    const key = keyOf(value);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)),
  );
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function listFiles(directory) {
  const found = [];
  async function visit(current) {
    for (const entry of (await readdir(current, { withFileTypes: true })).sort(
      (left, right) => left.name.localeCompare(right.name),
    )) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(entryPath);
      else if (entry.isFile()) found.push(repositoryRelative(entryPath));
    }
  }
  await visit(directory);
  return found.sort((left, right) => left.localeCompare(right));
}

const requiredEntryFields = [
  'id',
  'standardsFamily',
  'constructName',
  'category',
  'supportedStandardStatus',
  'standardsAndCorpusEvidence',
  'extractionStatus',
  'normalizedModelStatus',
  'sourceIdentityStatus',
  'rawSourceMarkupStatus',
  'navigationStatus',
  'searchStatus',
  'carouselStatus',
  'inspectorStatus',
  'sourceViewStatus',
  'accessibilityStatus',
  'existingTestCoverage',
  'currentProjectFixtures',
  'selectedW3cCases',
  'hermeticFoundry',
  'currentFindings',
  'exactGapClassification',
  'reasonBoundary',
  'intendedPrimaryPresentation',
  'intendedSecondaryPresentationRoutes',
  'owningFutureTask',
  'notes',
  'deterministicEvidenceReferences',
];

export function validateCoverageMatrix(matrix) {
  const errors = [];
  if (matrix?.schemaVersion !== 1) errors.push('schemaVersion must equal 1');
  if (!Array.isArray(matrix?.entries) || matrix.entries.length === 0) {
    return [...errors, 'entries must be a nonempty array'];
  }
  const states = new Set(matrix.coverageStates ?? []);
  const reasons = new Set(matrix.reasonBoundaries ?? []);
  const ids = new Set();
  let previousId = '';
  for (const [index, entry] of matrix.entries.entries()) {
    const location = `entries[${index}]`;
    for (const field of requiredEntryFields) {
      if (!(field in entry)) errors.push(`${location}.${field} is required`);
    }
    if (typeof entry.id !== 'string' || !/^[a-z0-9.-]+$/u.test(entry.id)) {
      errors.push(`${location}.id must be a stable lower-case identifier`);
    } else {
      if (ids.has(entry.id)) errors.push(`${location}.id is duplicated`);
      if (entry.id.localeCompare(previousId) <= 0) {
        errors.push(`${location}.id is not strictly sorted`);
      }
      ids.add(entry.id);
      previousId = entry.id;
    }
    for (const field of [
      'extractionStatus',
      'normalizedModelStatus',
      'sourceIdentityStatus',
      'rawSourceMarkupStatus',
      'navigationStatus',
      'searchStatus',
      'carouselStatus',
      'inspectorStatus',
      'sourceViewStatus',
      'accessibilityStatus',
      'exactGapClassification',
    ]) {
      if (!states.has(entry[field])) {
        errors.push(`${location}.${field} has unknown value ${entry[field]}`);
      }
    }
    if (!reasons.has(entry.reasonBoundary)) {
      errors.push(`${location}.reasonBoundary has an unknown value`);
    }
    if (!/^13\.(?:1[1-7])$/u.test(entry.owningFutureTask)) {
      errors.push(`${location}.owningFutureTask must be Task 13.11–13.17`);
    }
    if (
      entry.intendedPrimaryPresentation.length === 0 ||
      entry.intendedSecondaryPresentationRoutes.length === 0
    ) {
      errors.push(`${location} must define primary and secondary presentation`);
    }
    const references = [
      ...entry.standardsAndCorpusEvidence,
      ...entry.currentProjectFixtures,
      ...entry.deterministicEvidenceReferences,
      ...entry.existingTestCoverage.references,
    ];
    for (const reference of references) {
      if (!isSafeRepositoryReference(reference)) {
        errors.push(
          `${location} contains unsafe evidence reference ${reference}`,
        );
      }
    }
  }
  return errors;
}

function parseSourceKinds(source) {
  const match = source.match(/export const \w+ = \[([\s\S]*?)\] as const;/u);
  return match
    ? [...match[1].matchAll(/'([^']+)'/gu)].map((candidate) => candidate[1])
    : [];
}

function rangeContains(outer, inner) {
  return (
    outer.start.offset <= inner.start.offset &&
    outer.end.offset >= inner.end.offset
  );
}

function flattenElements(root) {
  const elements = [];
  function visit(element, parent) {
    elements.push({ element, parent });
    for (const child of element.children) {
      if (child.kind === 'element') visit(child, element);
    }
  }
  if (root) visit(root, undefined);
  return elements;
}

function nameOf(element) {
  return element?.attributes.find(({ localName }) => localName === 'name')
    ?.value;
}

function referenceOf(element) {
  return element?.attributes.find(({ localName }) => localName === 'ref')
    ?.value;
}

function diagnosticContext(document, diagnostic) {
  const elements = flattenElements(document.root);
  const containing = elements
    .filter(({ element }) => rangeContains(element.range, diagnostic.range))
    .sort(
      (left, right) =>
        left.element.range.end.offset -
        left.element.range.start.offset -
        (right.element.range.end.offset - right.element.range.start.offset),
    );
  const exactElement = elements.find(
    ({ element }) =>
      element.range.start.offset === diagnostic.range.start.offset &&
      element.range.end.offset === diagnostic.range.end.offset,
  );
  const ownerRecord = exactElement ?? containing[0];
  const exactAttribute = containing
    .flatMap(({ element }) =>
      element.attributes.map((attribute) => ({ attribute, element })),
    )
    .find(
      ({ attribute }) =>
        attribute.range.start.offset === diagnostic.range.start.offset &&
        attribute.range.end.offset === diagnostic.range.end.offset,
    );
  return {
    element: ownerRecord?.element,
    parent: ownerRecord?.parent,
    attribute: exactAttribute?.attribute,
    attributeOwner: exactAttribute?.element,
  };
}

const unsupportedElementMatrixIds = {
  all: 'xsd.struct.all',
  any: 'xsd.struct.element-wildcard',
  anyAttribute: 'xsd.struct.attribute-wildcard',
  attributeGroup: 'xsd.struct.attribute-group-definition',
  field: 'xsd.type.field',
  group: 'xsd.struct.model-group-definition',
  import: 'xsd.relationship.import',
  include: 'xsd.relationship.include',
  key: 'xsd.type.key',
  keyref: 'xsd.type.keyref',
  list: 'xsd.type.simple-list',
  notation: 'xsd.type.notation-declaration',
  pattern: 'xsd.type.facet-pattern',
  redefine: 'xsd.relationship.redefine',
  selector: 'xsd.type.selector',
  simpleContent: 'xsd.struct.simple-content',
  union: 'xsd.type.simple-union',
  unique: 'xsd.type.unique',
  whiteSpace: 'xsd.type.facet-whitespace',
  length: 'xsd.type.facet-length',
  minLength: 'xsd.type.facet-min-length',
  maxLength: 'xsd.type.facet-max-length',
  minInclusive: 'xsd.type.facet-min-inclusive',
  maxInclusive: 'xsd.type.facet-max-inclusive',
  minExclusive: 'xsd.type.facet-min-exclusive',
  maxExclusive: 'xsd.type.facet-max-exclusive',
  totalDigits: 'xsd.type.facet-total-digits',
  fractionDigits: 'xsd.type.facet-fraction-digits',
};

function matrixIdForFinding(diagnostic, context) {
  if (diagnostic.code === 'multiple-annotations') {
    return 'annotation.xsd-multiple-annotations';
  }
  if (diagnostic.code === 'invalid-annotation-placement') {
    return 'annotation.xsd-annotation-placement';
  }
  if (diagnostic.code !== 'unsupported-xsd-component') return undefined;
  if (context.attribute?.localName === 'substitutionGroup') {
    return 'xsd.relationship.substitution-group';
  }
  const element = context.element;
  if (!element) return undefined;
  if (element.localName === 'group' && referenceOf(element)) {
    return 'xsd.struct.group-reference';
  }
  if (element.localName === 'attributeGroup' && referenceOf(element)) {
    return 'xsd.struct.attribute-group-reference';
  }
  return unsupportedElementMatrixIds[element.localName];
}

function normalizedIdentityFor(context, metadataByNodeId) {
  const owner =
    context.element?.localName === 'annotation'
      ? context.parent
      : context.element;
  if (!owner) return null;
  const match = Object.entries(metadataByNodeId).find(([, metadata]) => {
    const range = metadata.sourceRange;
    return (
      range.start.offset === owner.range.start.offset &&
      range.end.offset === owner.range.end.offset
    );
  });
  return match?.[0] ?? null;
}

function localizationSort(left, right) {
  return (
    left.sourcePath.localeCompare(right.sourcePath) ||
    left.range.startOffset - right.range.startOffset ||
    left.range.endOffset - right.range.endOffset ||
    left.diagnosticCode.localeCompare(right.diagnosticCode) ||
    left.matrixEntryId.localeCompare(right.matrixEntryId)
  );
}

function deterministicShuffle(paths) {
  return [...paths].sort((left, right) => {
    const leftHash = sha256(`xml-carousel-task-13.10\0${left}`);
    const rightHash = sha256(`xml-carousel-task-13.10\0${right}`);
    return leftHash.localeCompare(rightHash) || left.localeCompare(right);
  });
}

async function localizeHermeticFindings(archivePath, matrix, expectation) {
  const archiveBytes = await readFile(archivePath);
  const archiveHash = sha256(archiveBytes);
  const summary = expectation.regressionSummary;
  if (archiveBytes.length !== summary.archiveByteLength) {
    throw new Error(
      'Hermetic archive byte length does not match the expectation.',
    );
  }
  if (archiveHash !== summary.archiveSha256) {
    throw new Error('Hermetic archive SHA-256 does not match the expectation.');
  }
  const archive = await JSZip.loadAsync(archiveBytes);
  const sourcePaths = [...summary.sourceFiles];
  const sourceBytes = new Map();
  for (const sourcePath of sourcePaths) {
    const archivePathName = `${summary.commonRootDirectory}${sourcePath}`;
    const entry = archive.file(archivePathName);
    if (!entry) throw new Error(`Hermetic source is missing: ${sourcePath}`);
    sourceBytes.set(sourcePath, await entry.async('uint8array'));
  }

  const server = await createServer({
    appType: 'custom',
    server: { middlewareMode: true },
    logLevel: 'error',
  });
  try {
    const xsd = await server.ssrLoadModule('/src/schema/xsd/index.ts');
    const matrixById = new Map(
      matrix.entries.map((entry) => [entry.id, entry]),
    );
    async function localize(order) {
      const records = [];
      for (const sourcePath of order) {
        const sourceText = new TextDecoder('utf-8', { fatal: true }).decode(
          sourceBytes.get(sourcePath),
        );
        const sourceId = `hermetic:${sourcePath}`;
        const parsed = xsd.parseXsd(sourceText, sourceId);
        const imported = xsd.importXsdSource(sourceText, {
          projectId: `audit:${sourcePath}`,
          displayName: sourcePath,
          sourceFileId: sourceId,
          sourceFilename: sourcePath,
          unresolvedReferencePolicy: 'deferForPackage',
          standardsAccepted: true,
        });
        const metadataByNodeId =
          imported.status === 'success' ? imported.xsdMetadataByNodeId : {};
        const findings = parsed.diagnostics.filter(({ code }) =>
          [
            'invalid-annotation-placement',
            'multiple-annotations',
            'unsupported-xsd-component',
          ].includes(code),
        );
        for (const diagnostic of findings) {
          const context = diagnosticContext(parsed.document, diagnostic);
          const matrixEntryId = matrixIdForFinding(diagnostic, context);
          if (!matrixEntryId || !matrixById.has(matrixEntryId)) {
            const candidate =
              context.attribute?.localName ?? context.element?.localName;
            throw new Error(
              `Uncatalogued Hermetic finding ${diagnostic.code} for ${candidate ?? 'unknown construct'} in ${sourcePath}:${diagnostic.range.start.line}`,
            );
          }
          const constructElement =
            context.element?.localName === 'annotation'
              ? context.parent
              : (context.attributeOwner ?? context.element);
          const sourceConstructKind = context.attribute
            ? `@${context.attribute.localName}`
            : `xs:${context.element?.localName ?? 'unknown'}`;
          const sourceConstructName =
            nameOf(constructElement) ?? referenceOf(constructElement) ?? null;
          const matrixEntry = matrixById.get(matrixEntryId);
          records.push({
            sourcePath,
            diagnosticCode: `xsd:${diagnostic.code}`,
            matrixEntryId,
            sourceConstruct: {
              kind: sourceConstructKind,
              name: sourceConstructName,
              ownerKind: constructElement
                ? `xs:${constructElement.localName}`
                : null,
              ownerName: nameOf(constructElement) ?? null,
            },
            normalizedIdentity: normalizedIdentityFor(
              context,
              metadataByNodeId,
            ),
            actualStandardsConstruct: matrixEntry.constructName,
            missingOrDefectiveCapability: matrixEntry.reasonBoundary,
            affectedPresentationLayers: [
              'normalized model',
              'Navigation',
              'Search',
              'inspector',
              'source view',
              'accessibility',
            ].filter((layer) => {
              const key =
                layer === 'normalized model'
                  ? 'normalizedModelStatus'
                  : layer === 'source view'
                    ? 'sourceViewStatus'
                    : `${layer.toLocaleLowerCase()}Status`;
              return matrixEntry[key] !== 'complete';
            }),
            owningFutureTask: matrixEntry.owningFutureTask,
            range: {
              startOffset: diagnostic.range.start.offset,
              endOffset: diagnostic.range.end.offset,
              startLine: diagnostic.range.start.line,
              startColumn: diagnostic.range.start.column,
              endLine: diagnostic.range.end.line,
              endColumn: diagnostic.range.end.column,
            },
          });
        }
      }
      return records.sort(localizationSort);
    }

    const orders = {
      original: sourcePaths,
      reversed: [...sourcePaths].reverse(),
      'deterministic-shuffled': deterministicShuffle(sourcePaths),
    };
    const results = {};
    for (const [orderName, order] of Object.entries(orders)) {
      const records = await localize(order);
      results[orderName] = {
        sha256: sha256(stableStringify(records)),
        records,
      };
    }
    const hashes = Object.values(results).map(({ sha256: hash }) => hash);
    if (new Set(hashes).size !== 1) {
      throw new Error(
        'Hermetic finding localization depends on ZIP entry order.',
      );
    }
    const records = results.original.records;
    const counts = countBy(records, ({ diagnosticCode }) => diagnosticCode);
    const expectedCounts = summary.visualizationFindingCountsByCode;
    if (stableStringify(counts) !== stableStringify(expectedCounts)) {
      throw new Error(
        `Hermetic localization counts differ: ${JSON.stringify(counts)}`,
      );
    }
    return {
      schemaVersion: 1,
      archive: {
        filename: path.basename(archivePath),
        byteLength: archiveBytes.length,
        sha256: archiveHash,
      },
      findingCount: records.length,
      findingCountsByCode: counts,
      findingCountsByMatrixEntry: countBy(
        records,
        ({ matrixEntryId }) => matrixEntryId,
      ),
      sourceCount: new Set(records.map(({ sourcePath }) => sourcePath)).size,
      orderResults: Object.fromEntries(
        Object.entries(results).map(([name, value]) => [name, value.sha256]),
      ),
      records,
    };
  } finally {
    await server.close();
  }
}

export function validateLocalization(localization, matrix, expectation) {
  const errors = [];
  const ids = new Set(matrix.entries.map(({ id }) => id));
  if (localization?.schemaVersion !== 1) {
    errors.push('localization.schemaVersion must equal 1');
  }
  if (!Array.isArray(localization?.records)) {
    return [...errors, 'localization.records must be an array'];
  }
  if (localization.records.length !== localization.findingCount) {
    errors.push('localization finding count does not match its records');
  }
  if (
    localization.findingCount !==
    expectation.regressionSummary.visualizationTotalFindingCount
  ) {
    errors.push('localization finding count does not match Hermetic baseline');
  }
  const sorted = [...localization.records].sort(localizationSort);
  if (stableStringify(sorted) !== stableStringify(localization.records)) {
    errors.push('localization records are not stably sorted');
  }
  for (const [index, record] of localization.records.entries()) {
    if (!ids.has(record.matrixEntryId)) {
      errors.push(`localization.records[${index}] has unknown matrix entry`);
    }
    if (
      !isSafeRepositoryReference(record.sourcePath) ||
      record.sourcePath.includes('tests/fixtures/')
    ) {
      errors.push(`localization.records[${index}] has an invalid source path`);
    }
    if (/^[a-z]:[\\/]/iu.test(JSON.stringify(record))) {
      errors.push(`localization.records[${index}] leaks an absolute host path`);
    }
  }
  const counts = countBy(
    localization.records,
    ({ diagnosticCode }) => diagnosticCode,
  );
  if (
    stableStringify(counts) !==
    stableStringify(
      expectation.regressionSummary.visualizationFindingCountsByCode,
    )
  ) {
    errors.push(
      'localization diagnostic counts do not match Hermetic baseline',
    );
  }
  const matrixFindingCounts = Object.fromEntries(
    matrix.entries
      .filter(({ currentFindings }) => currentFindings.length > 0)
      .map((entry) => [
        entry.id,
        entry.currentFindings.reduce(
          (total, finding) => total + finding.count,
          0,
        ),
      ]),
  );
  if (
    stableStringify(matrixFindingCounts) !==
    stableStringify(localization.findingCountsByMatrixEntry)
  ) {
    errors.push(
      'matrix finding counts do not match localized Hermetic findings',
    );
  }
  return errors;
}

function humanSummary(report) {
  const lines = [
    '# Visualization coverage audit summary',
    '',
    `Matrix entries: ${report.matrix.entryCount}`,
    `Matrix SHA-256: ${report.matrix.sha256}`,
    `Persistent fixture files: ${report.evidence.persistentFixtureFileCount}`,
    `Hermetic localized findings: ${report.hermeticFindingLocalization.findingCount}`,
    `Hermetic localization SHA-256: ${report.hermeticFindingLocalization.sha256}`,
    '',
    '## Coverage states',
    '',
  ];
  for (const [state, count] of Object.entries(report.matrix.byCoverageState)) {
    lines.push(`- ${state}: ${count}`);
  }
  lines.push('', '## Future-task ownership', '');
  for (const [task, count] of Object.entries(report.matrix.byOwningTask)) {
    lines.push(`- Task ${task}: ${count}`);
  }
  lines.push('', 'Audit result: PASS', '');
  return `${lines.join('\n')}\n`;
}

export async function runCoverageAudit(options = {}) {
  const matrixPath = path.resolve(options.matrixPath ?? defaultMatrixPath);
  const localizationPath = path.resolve(
    options.localizationPath ?? defaultLocalizationPath,
  );
  const expectationPath = path.join(
    repositoryRoot,
    'tests/fixtures/hermetic-foundry/expected-audit.json',
  );
  const [
    matrixText,
    expectation,
    nodeKindsSource,
    fixturePaths,
    dtdManifest,
    xsdManifest,
  ] = await Promise.all([
    readFile(matrixPath, 'utf8'),
    readJson(expectationPath),
    readFile(
      path.join(repositoryRoot, 'src/schema/model/schemaKinds.ts'),
      'utf8',
    ),
    listFiles(path.join(repositoryRoot, 'tests/fixtures')),
    readJson(
      path.join(
        repositoryRoot,
        'tests/fixtures/w3c-xmlconf-20130923/dtd-selected-tests.json',
      ),
    ),
    readJson(
      path.join(
        repositoryRoot,
        'tests/fixtures/w3c-xsd-1.0/2007-06-20/selected-tests.json',
      ),
    ),
  ]);
  const matrix = JSON.parse(matrixText);
  const matrixErrors = validateCoverageMatrix(matrix);
  const generatedText = `${JSON.stringify(buildCoverageMatrix(), null, 2)}\n`;
  if (matrixText !== generatedText) {
    matrixErrors.push(
      'canonical matrix differs from its deterministic generator',
    );
  }
  if (matrixErrors.length > 0) {
    throw new Error(
      `Coverage matrix validation failed:\n${matrixErrors.join('\n')}`,
    );
  }

  let localization;
  if (options.hermeticArchive) {
    localization = await localizeHermeticFindings(
      path.resolve(options.hermeticArchive),
      matrix,
      expectation,
    );
    if (options.localizationOutput) {
      await writeFile(
        path.resolve(options.localizationOutput),
        `${JSON.stringify(localization, null, 2)}\n`,
        'utf8',
      );
    }
  } else {
    localization = await readJson(localizationPath);
  }
  const localizationErrors = validateLocalization(
    localization,
    matrix,
    expectation,
  );
  if (localizationErrors.length > 0) {
    throw new Error(
      `Hermetic localization validation failed:\n${localizationErrors.join('\n')}`,
    );
  }

  const report = {
    schemaVersion: 1,
    matrix: {
      path: repositoryRelative(matrixPath),
      sha256: sha256(matrixText),
      entryCount: matrix.entries.length,
      byStandardsFamily: countBy(
        matrix.entries,
        ({ standardsFamily }) => standardsFamily,
      ),
      byCoverageState: countBy(
        matrix.entries,
        ({ exactGapClassification }) => exactGapClassification,
      ),
      byReasonBoundary: countBy(
        matrix.entries,
        ({ reasonBoundary }) => reasonBoundary,
      ),
      byOwningTask: countBy(
        matrix.entries,
        ({ owningFutureTask }) => owningFutureTask,
      ),
    },
    architecture: {
      normalizedNodeKinds: parseSourceKinds(nodeKindsSource),
      normalizedEdgeKinds: parseSourceKinds(
        nodeKindsSource.slice(nodeKindsSource.indexOf('schemaEdgeKinds')),
      ),
      inspectedAreas: [
        'Xerces production validation',
        'DTD extraction and normalization',
        'XSD extraction and normalization',
        'ZIP package assembly and reference resolution',
        'project storage',
        'visualization finding policy',
        'Navigation',
        'Search',
        'carousel',
        'inspector',
        'source markup and source view',
        'accessibility and keyboard reachability',
        'W3C conformance harnesses',
        'Hermetic Foundry audit',
        'security, lifecycle, runtime, and deterministic builds',
      ],
    },
    evidence: {
      persistentFixtureFileCount: fixturePaths.length,
      persistentFixtureInventorySha256: sha256(fixturePaths.join('\n')),
      dtdSelectedCases: dtdManifest.selection.selectedTests,
      dtdCiCases: dtdManifest.selection.ciTests,
      xsdSelectedCases: xsdManifest.selection.fullSelected,
      xsdCiCases: xsdManifest.selection.ciSelected,
      dtdManifestSha256: sha256(JSON.stringify(dtdManifest)),
      xsdManifestSha256: sha256(JSON.stringify(xsdManifest)),
    },
    hermeticFindingLocalization: {
      path: repositoryRelative(localizationPath),
      sha256: sha256(`${JSON.stringify(localization, null, 2)}\n`),
      findingCount: localization.findingCount,
      findingCountsByCode: localization.findingCountsByCode,
      findingCountsByMatrixEntry: localization.findingCountsByMatrixEntry,
      sourceCount: localization.sourceCount,
      orderResults: localization.orderResults,
    },
  };
  return { report, human: humanSummary(report), localization };
}

function argument(args, name) {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}

const isCli =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const args = process.argv.slice(2);
  try {
    const { report, human } = await runCoverageAudit({
      matrixPath: argument(args, '--matrix'),
      localizationPath: argument(args, '--localization'),
      hermeticArchive: argument(args, '--hermetic-archive'),
      localizationOutput: argument(args, '--localization-output'),
    });
    const outputJson = argument(args, '--output-json');
    const outputText = argument(args, '--output-text');
    if (outputJson) {
      await writeFile(
        path.resolve(outputJson),
        `${JSON.stringify(report, null, 2)}\n`,
        'utf8',
      );
    }
    if (outputText) await writeFile(path.resolve(outputText), human, 'utf8');
    process.stdout.write(human);
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
