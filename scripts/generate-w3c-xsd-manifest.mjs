import { createHash } from 'node:crypto';
import {
  copyFile,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

const repositoryRoot = process.cwd();
const release = '2007-06-20';
const archiveName = 'xsts-2007-06-20.tar.gz';
const archiveBytes = 4_367_182;
const archiveSha256 =
  '902176b25e4111cf96b08663107521a4992e8ea67aad6b815592a6a5b4b9ea06';
const cacheRoot = path.join(
  repositoryRoot,
  'tools/xerces-wasm-spike/.cache/w3c-xsd-2007-06-20',
);
const suiteRoot = path.join(cacheRoot, 'xmlschema2006-11-06');
const suitePath = path.join(suiteRoot, 'suite.xml');
const outputRoot = path.join(
  repositoryRoot,
  'tests/fixtures/w3c-xsd-1.0/2007-06-20',
);
const outputPath = path.join(outputRoot, 'selected-tests.json');
const ciRoot = path.join(outputRoot, 'ci-corpus');
const knownXercesCppLimitations = new Set([
  'msMeta/Additional_w3c.xml#addB033#addB033',
  'msMeta/Additional_w3c.xml#addB036#addB036',
  'msMeta/ComplexType_w3c.xml#ctF008#ctF008',
]);

function attributes(source) {
  return Object.fromEntries(
    [...source.matchAll(/([:\w.-]+)\s*=\s*(["'])(.*?)\2/gsu)].map((match) => [
      match[1],
      match[3],
    ]),
  );
}

function textContent(source) {
  return source
    .replace(/<[^>]+>/gu, ' ')
    .replace(/&(?:#\d+|#x[\da-f]+|\w+);/giu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function decodeXml(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes);
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    const swapped = Uint8Array.from(bytes, (_, index) =>
      index % 2 === 0 ? (bytes[index + 1] ?? 0) : (bytes[index - 1] ?? 0),
    );
    return new TextDecoder('utf-16le').decode(swapped);
  }
  return new TextDecoder('utf-8').decode(bytes);
}

async function fileExists(filePath) {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

function posixSuitePath(absolute) {
  return path.relative(suiteRoot, absolute).replaceAll('\\', '/');
}

function resolveMetadataPath(metadataPath, href) {
  return path.resolve(path.dirname(metadataPath), href);
}

function schemaReferences(source) {
  const references = [];
  for (const match of source.matchAll(
    /<(?:[\w.-]+:)?(?:include|import|redefine)\b[^>]*\bschemaLocation\s*=\s*(["'])(.*?)\1[^>]*>/giu,
  )) {
    references.push(match[2]);
  }
  return references;
}

const sourceCache = new Map();
async function readSuiteSource(relativePath) {
  if (sourceCache.has(relativePath)) return sourceCache.get(relativePath);
  const absolute = path.join(suiteRoot, ...relativePath.split('/'));
  if (!(await fileExists(absolute))) {
    sourceCache.set(relativePath, undefined);
    return undefined;
  }
  const bytes = new Uint8Array(await readFile(absolute));
  const value = {
    bytes,
    source: decodeXml(bytes),
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
  sourceCache.set(relativePath, value);
  return value;
}

async function dependencyInventory(initialPaths) {
  const files = new Set();
  const missing = new Set();
  const external = new Set();
  async function visit(relativePath) {
    if (files.has(relativePath)) return;
    const file = await readSuiteSource(relativePath);
    if (!file) {
      missing.add(relativePath);
      return;
    }
    files.add(relativePath);
    for (const reference of schemaReferences(file.source)) {
      if (
        reference.startsWith('/') ||
        /^[a-z][a-z\d+.-]*:/iu.test(reference) ||
        /^[a-z]:/iu.test(reference)
      ) {
        external.add(reference);
        continue;
      }
      const resolved = path.posix.normalize(
        path.posix.join(path.posix.dirname(relativePath), reference),
      );
      if (resolved === '..' || resolved.startsWith('../')) {
        external.add(reference);
        continue;
      }
      await visit(resolved);
    }
  }
  for (const initialPath of initialPaths) await visit(initialPath);
  return {
    files: [...files].sort(),
    missing: [...missing].sort(),
    external: [...external].sort(),
  };
}

function expectedValues(block) {
  return [
    ...new Set(
      [...block.matchAll(/<expected\b([^>]*)\/?\s*>/giu)].map(
        (match) => attributes(match[1]).validity,
      ),
    ),
  ].filter(Boolean);
}

function currentStatus(block) {
  const match = /<current\b([^>]*)\/?\s*>/iu.exec(block);
  return match ? (attributes(match[1]).status ?? 'unspecified') : 'unspecified';
}

function familyFor(metadataPath, groupName, description, sources) {
  const metadata = path.basename(metadataPath).toLowerCase();
  const label = `${metadata} ${groupName} ${description}`.toLowerCase();
  const source = sources.join('\n').toLowerCase();
  const markup = (name) =>
    new RegExp(`<(?:(?:xs|xsd):)?${name}\\b`, 'iu').test(source);

  if (markup('redefine')) return 'redefine';
  if (markup('include')) {
    if (/chameleon|no target namespace|notargetnamespace/iu.test(label)) {
      return 'chameleon-include';
    }
    return 'include-and-import';
  }
  if (markup('import')) return 'include-and-import';
  if (/recursive|recursion|circular/iu.test(label)) {
    return 'recursive-declarations';
  }
  if (metadata.includes('annotation')) {
    return 'annotations-and-appinfo';
  }
  if (metadata.includes('identity') || /idconstr/iu.test(metadata)) {
    return 'identity-constraints';
  }
  if (
    /substitution/iu.test(label) ||
    /\bsubstitutiongroup\s*=/iu.test(source)
  ) {
    return 'substitution-groups';
  }
  if (metadata.includes('notation') || markup('notation')) {
    return 'notation-components';
  }
  if (
    metadata.includes('wildcard') ||
    markup('any') ||
    markup('anyattribute')
  ) {
    return 'wildcards';
  }
  if (metadata.includes('attributegroup') || /agroupdef/iu.test(metadata)) {
    return 'attribute-groups';
  }
  if (
    metadata.includes('modelgroups') ||
    /mgroup/iu.test(metadata) ||
    metadata === 'group_w3c.xml' ||
    metadata === 'particles_w3c.xml'
  ) {
    return 'model-groups';
  }
  if (metadata.includes('nist')) {
    if (/\batomic-/iu.test(label)) return 'atomic-datatypes';
    if (/\b(?:list|union)-/iu.test(label)) return 'list-and-union';
    if (
      /(?:min|max)(?:exclusive|inclusive)|length|pattern|fractiondigits|totaldigits|whitespace|enumeration/iu.test(
        label,
      )
    ) {
      return 'facets';
    }
    return 'atomic-datatypes';
  }
  if (metadata.includes('datatypes')) {
    if (
      /(?:min|max)(?:exclusive|inclusive)|length|pattern|fractiondigits|totaldigits|whitespace|enumeration|facet/iu.test(
        label,
      )
    ) {
      return 'facets';
    }
    return 'atomic-datatypes';
  }
  if (metadata.includes('simpletype') || /stype/iu.test(metadata)) {
    if (
      markup('list') ||
      markup('union') ||
      /\b(?:list|union)-/iu.test(label)
    ) {
      return 'list-and-union';
    }
    if (/facet|length|pattern|inclusive|exclusive/iu.test(label)) {
      return 'facets';
    }
    return 'simple-types';
  }
  if (markup('simplecontent')) return 'simple-content';
  if (markup('complexcontent')) {
    if (/extension/iu.test(label)) return 'extension';
    if (/restriction/iu.test(label)) return 'restriction';
    return 'complex-content';
  }
  if (markup('extension')) return 'extension';
  if (
    markup('restriction') &&
    /facet|length|pattern|inclusive|exclusive/iu.test(label)
  ) {
    return 'facets';
  }
  if (markup('restriction')) return 'restriction';
  if (markup('list') || markup('union') || /\b(?:list|union)-/iu.test(label)) {
    return 'list-and-union';
  }
  if (metadata.includes('regex')) {
    return /facet|length|pattern|inclusive|exclusive/iu.test(label)
      ? 'facets'
      : 'atomic-datatypes';
  }
  if (metadata.includes('complextype') || /ctype/iu.test(metadata)) {
    return 'complex-types';
  }
  if (/namespace|qname|targetnamespace/iu.test(label)) {
    return 'namespaces-and-qnames';
  }
  if (metadata.includes('schema')) return 'schema-for-schemas-constraints';
  return 'schema-document-grammar';
}

const archivePath = path.join(cacheRoot, archiveName);
if (!(await fileExists(archivePath)) || !(await fileExists(suitePath))) {
  throw new Error(
    'The W3C XSD 2007-06-20 corpus is absent. Run npm run spike:xerces:bootstrap-w3c-xsd, then rerun npm run w3c:xsd:manifest.',
  );
}
const archive = new Uint8Array(await readFile(archivePath));
const actualArchiveHash = createHash('sha256').update(archive).digest('hex');
if (
  archive.byteLength !== archiveBytes ||
  actualArchiveHash !== archiveSha256
) {
  throw new Error(
    `W3C XSD archive identity mismatch: expected ${archiveBytes} bytes / ${archiveSha256}, found ${archive.byteLength} bytes / ${actualArchiveHash}.`,
  );
}

const suiteSource = await readFile(suitePath, 'utf8');
const metadataPaths = [
  ...suiteSource.matchAll(/<ts:testSetRef\b[^>]*\bxlink:href=(["'])(.*?)\1/giu),
].map((match) => resolveMetadataPath(suitePath, match[2]));

const cases = [];
let testGroupCount = 0;
let schemaTestCount = 0;
let instanceTestCount = 0;
let schemaDocumentCount = 0;
let instanceDocumentCount = 0;

for (const metadataPath of metadataPaths) {
  const metadataSource = await readFile(metadataPath, 'utf8');
  const testSet = attributes(
    /<testSet\b([^>]*)>/iu.exec(metadataSource)?.[1] ?? '',
  );
  const contribution =
    testSet.contributor ?? path.basename(path.dirname(metadataPath));
  const testSetName = testSet.name ?? path.basename(metadataPath);
  for (const groupMatch of metadataSource.matchAll(
    /<testGroup\b([^>]*)>([\s\S]*?)<\/testGroup>/giu,
  )) {
    testGroupCount += 1;
    const groupName =
      attributes(groupMatch[1]).name ?? `group-${testGroupCount}`;
    const groupBody = groupMatch[2];
    const description = textContent(
      /<annotation\b[^>]*>([\s\S]*?)<\/annotation>/iu.exec(groupBody)?.[1] ??
        '',
    );
    const instanceTests = [
      ...groupBody.matchAll(
        /<instanceTest\b([^>]*)>([\s\S]*?)<\/instanceTest>/giu,
      ),
    ].map((match) => {
      instanceTestCount += 1;
      const documentMatch = /<instanceDocument\b([^>]*)\/?\s*>/iu.exec(
        match[2],
      );
      const href = documentMatch
        ? attributes(documentMatch[1])['xlink:href']
        : undefined;
      if (href) instanceDocumentCount += 1;
      return {
        name: attributes(match[1]).name ?? `instance-${instanceTestCount}`,
        document: href
          ? posixSuitePath(resolveMetadataPath(metadataPath, href))
          : null,
        expectedValidity: expectedValues(match[2]),
        metadataStatus: currentStatus(match[2]),
      };
    });
    const schemaTests = [
      ...groupBody.matchAll(/<schemaTest\b([^>]*)>([\s\S]*?)<\/schemaTest>/giu),
    ];
    if (schemaTests.length === 0) {
      cases.push({
        id: `${posixSuitePath(metadataPath)}#${groupName}#instance-only`,
        contribution,
        testSet: testSetName,
        metadataFile: posixSuitePath(metadataPath),
        testGroup: groupName,
        schemaTest: null,
        schemaDocuments: [],
        dependencyPaths: [],
        dependencySha256: {},
        instanceTests,
        expectedSchemaValidity: [],
        metadataStatus: 'instance-only',
        xsdVersion: '1.0 Second Edition',
        family: 'instance-only',
        productionBoundaryRelevance:
          'instance-only outside product schema import',
        selected: false,
        runInCi: false,
        exclusionReason: 'instance-only',
        knownClassification: 'instance-dependent',
      });
      continue;
    }
    for (const schemaMatch of schemaTests) {
      schemaTestCount += 1;
      const schemaName =
        attributes(schemaMatch[1]).name ?? `schema-${schemaTestCount}`;
      const schemaDocuments = [
        ...schemaMatch[2].matchAll(/<schemaDocument\b([^>]*)\/?\s*>/giu),
      ]
        .map((match) => attributes(match[1])['xlink:href'])
        .filter(Boolean)
        .map((href) => posixSuitePath(resolveMetadataPath(metadataPath, href)));
      schemaDocumentCount += schemaDocuments.length;
      const dependencies = await dependencyInventory(schemaDocuments);
      const sources = (
        await Promise.all(
          dependencies.files.map(
            async (filePath) => (await readSuiteSource(filePath))?.source ?? '',
          ),
        )
      ).filter(Boolean);
      const dependencySha256 = Object.fromEntries(
        await Promise.all(
          dependencies.files.map(async (filePath) => [
            filePath,
            (await readSuiteSource(filePath))?.sha256,
          ]),
        ),
      );
      const metadataStatus = currentStatus(schemaMatch[2]);
      const expectedSchemaValidity = expectedValues(schemaMatch[2]);
      const family = familyFor(metadataPath, groupName, description, sources);
      const missing = dependencies.missing.length > 0;
      const external = dependencies.external.length > 0;
      const disputed = metadataStatus === 'queried';
      const id = `${posixSuitePath(metadataPath)}#${groupName}#${schemaName}`;
      cases.push({
        id,
        contribution,
        testSet: testSetName,
        metadataFile: posixSuitePath(metadataPath),
        testGroup: groupName,
        schemaTest: schemaName,
        schemaDocuments,
        dependencyPaths: dependencies.files,
        dependencySha256,
        externalReferences: dependencies.external,
        missingDependencies: dependencies.missing,
        instanceTests,
        expectedSchemaValidity,
        metadataStatus,
        xsdVersion: '1.0 Second Edition',
        family,
        productionBoundaryRelevance: 'schema-document validity',
        selected: false,
        runInCi: false,
        exclusionReason: missing
          ? 'missing corpus resource'
          : external
            ? 'security-policy conflict'
            : disputed
              ? 'metadata-disputed'
              : 'bounded-family-sample-limit',
        knownClassification: disputed
          ? 'metadata-disputed'
          : knownXercesCppLimitations.has(id)
            ? 'unsupported'
            : null,
      });
    }
  }
}

cases.sort((left, right) => left.id.localeCompare(right.id));
const candidateFamilies = [
  ...new Set(
    cases
      .filter(
        (test) =>
          test.schemaDocuments.length > 0 &&
          test.metadataStatus !== 'queried' &&
          test.missingDependencies.length === 0 &&
          test.externalReferences.length === 0,
      )
      .map(({ family }) => family),
  ),
].sort();

for (const family of candidateFamilies) {
  for (const expected of ['valid', 'invalid']) {
    const selected = cases
      .filter(
        (test) =>
          test.family === family &&
          test.expectedSchemaValidity.includes(expected) &&
          test.metadataStatus !== 'queried' &&
          test.missingDependencies.length === 0 &&
          test.externalReferences.length === 0,
      )
      .slice(0, 4);
    for (const [index, test] of selected.entries()) {
      test.selected = true;
      test.runInCi = index === 0;
      test.exclusionReason = null;
    }
  }
}

for (const test of cases
  .filter((candidate) => candidate.metadataStatus === 'queried')
  .slice(0, 4)) {
  test.selected = true;
  test.runInCi = true;
  test.exclusionReason = null;
  test.knownClassification = 'metadata-disputed';
}
for (const test of cases
  .filter(
    (candidate) =>
      candidate.schemaDocuments.length > 0 &&
      candidate.externalReferences.length > 0 &&
      candidate.missingDependencies.length === 0,
  )
  .slice(0, 2)) {
  test.selected = true;
  test.runInCi = true;
  test.exclusionReason = null;
  test.knownClassification = 'security-blocked';
}
for (const test of cases
  .filter((candidate) => candidate.knownClassification === 'instance-dependent')
  .slice(0, 2)) {
  test.selected = true;
  test.runInCi = true;
  test.exclusionReason = null;
}

const ciCases = cases.filter(({ runInCi }) => runInCi);
await rm(ciRoot, { recursive: true, force: true });
await mkdir(ciRoot, { recursive: true });
for (const test of ciCases) {
  for (const filePath of test.dependencyPaths) {
    const destination = path.join(ciRoot, ...filePath.split('/'));
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(path.join(suiteRoot, ...filePath.split('/')), destination);
  }
}
await copyFile(
  path.join(suiteRoot, '00COPYRIGHT'),
  path.join(outputRoot, '00COPYRIGHT'),
);

const selected = cases.filter(({ selected }) => selected);
for (const test of cases) {
  if (!test.selected) delete test.dependencySha256;
}
const manifest = {
  schemaVersion: 1,
  suite: {
    name: 'W3C XML Schema Test Suite',
    release,
    distribution: archiveName,
    officialUrl:
      'https://www.w3.org/XML/2004/xml-schema-test-suite/xmlschema2006-11-06/xsts-2007-06-20.tar.gz',
    archiveBytes,
    archiveSha256,
    extractedRoot: 'xmlschema2006-11-06',
    suiteMetadata: 'suite.xml',
    suiteSchemaVersion: 'W3C XML Schema 1.0 2nd edition',
    license:
      'W3C Document Notice and License; see 00COPYRIGHT and https://www.w3.org/copyright/document-license-2023/',
  },
  inventory: {
    metadataFiles: metadataPaths.length,
    testGroups: testGroupCount,
    schemaTests: schemaTestCount,
    instanceTests: instanceTestCount,
    schemaDocuments: schemaDocumentCount,
    instanceDocuments: instanceDocumentCount,
  },
  selection: {
    fullSelected: selected.length,
    ciSelected: ciCases.length,
    familyTotals: Object.fromEntries(
      [...new Set(selected.map(({ family }) => family))]
        .sort()
        .map((family) => [
          family,
          selected.filter((test) => test.family === family).length,
        ]),
    ),
    exclusionReasonTotals: Object.fromEntries(
      [...new Set(cases.map(({ exclusionReason }) => exclusionReason))]
        .filter((reason) => reason !== null)
        .sort()
        .map((reason) => [
          reason,
          cases.filter((test) => test.exclusionReason === reason).length,
        ]),
    ),
    knownClassificationTotals: Object.fromEntries(
      [
        ...new Set(
          selected.map(({ knownClassification }) => knownClassification),
        ),
      ]
        .filter((classification) => classification !== null)
        .sort()
        .map((classification) => [
          classification,
          selected.filter((test) => test.knownClassification === classification)
            .length,
        ]),
    ),
  },
  cases,
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(manifest)}\n`, 'utf8');
console.log(
  JSON.stringify({
    inventory: manifest.inventory,
    selection: manifest.selection,
  }),
);
