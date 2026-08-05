import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const repositoryRoot = process.cwd();
const suiteRoot = path.join(
  repositoryRoot,
  'tools/xerces-wasm-spike/.cache/w3c-xmlconf-20130923/extracted/xmlconf',
);
const outputPath = path.join(
  repositoryRoot,
  'tests/fixtures/w3c-xmlconf-20130923/dtd-selected-tests.json',
);
const ciRoot = path.join(
  repositoryRoot,
  'tests/fixtures/w3c-xmlconf-20130923/ci-corpus',
);
const archiveBackedCiPaths = new Set([
  'xmltest/invalid/not-sa/022.ent',
  'xmltest/invalid/not-sa/022.xml',
]);

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(absolute)));
    else files.push(absolute);
  }
  return files;
}

function suitePath(absolute) {
  return path.relative(suiteRoot, absolute).replaceAll('\\', '/');
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

function attributes(source) {
  return Object.fromEntries(
    [...source.matchAll(/([A-Z][A-Z0-9_-]*)\s*=\s*(["'])(.*?)\2/gsu)].map(
      (match) => [match[1], match[3]],
    ),
  );
}

function localReferences(source) {
  const references = [];
  for (const match of source.matchAll(/\bSYSTEM\s+(["'])(.*?)\1/giu)) {
    references.push(match[2]);
  }
  for (const match of source.matchAll(
    /\bPUBLIC\s+(["'])(.*?)\1\s+(["'])(.*?)\3/giu,
  )) {
    references.push(match[4]);
  }
  return references;
}

async function exists(filePath) {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

async function requiredFiles(entryAbsolute) {
  const found = new Set();
  const missing = [];
  async function visit(absolute) {
    const relative = suitePath(absolute);
    if (found.has(relative)) return;
    if (!(await exists(absolute))) {
      missing.push(relative);
      return;
    }
    found.add(relative);
    const source = decodeXml(new Uint8Array(await readFile(absolute)));
    for (const reference of localReferences(source)) {
      if (
        /^[a-z][a-z\d+.-]*:/iu.test(reference) ||
        path.isAbsolute(reference)
      ) {
        missing.push(reference);
        continue;
      }
      await visit(path.resolve(path.dirname(absolute), reference));
    }
  }
  await visit(entryAbsolute);
  return {
    files: [...found].sort(),
    missing: [...new Set(missing)].sort(),
  };
}

function applicabilityExclusion(test) {
  if (test.RECOMMENDATION?.startsWith('NS')) return 'namespace-only';
  if (test.VERSION === '1.1' || test.RECOMMENDATION === 'XML1.1') {
    return 'XML 1.1-only';
  }
  if (test.EDITION && !test.EDITION.split(/\s+/u).includes('5')) {
    return 'not XML 1.0 Fifth Edition';
  }
  return null;
}

function dtdRelevant(test, source) {
  return (
    /<!DOCTYPE\b/iu.test(source) ||
    /<!ENTITY\b/iu.test(source) ||
    (test.ENTITIES !== undefined && test.ENTITIES !== 'none') ||
    /(?:^|\s)(?:2\.8|3\.2(?:\.1|\.2)?|3\.3(?:\.1)?|3\.4|4\.[1-5]|5\.[12])(?:\s|$|\s*\[)/u.test(
      test.SECTIONS ?? '',
    )
  );
}

function testFamily(test, source, isDtdRelevant) {
  const sections = test.SECTIONS ?? '';
  if (!isDtdRelevant) return 'xml-document-well-formedness';
  if (/4\.7/u.test(sections) || /<!NOTATION\b/iu.test(source)) {
    return 'notations-and-unparsed-entities';
  }
  if (/4\.3/u.test(sections)) return 'external-entities-and-encoding';
  if (/4\.[1245]/u.test(sections) || /<!ENTITY\b/iu.test(source)) {
    return 'parameter-and-general-entities';
  }
  if (/3\.4/u.test(sections)) return 'conditional-sections';
  if (/3\.3/u.test(sections) || /<!ATTLIST\b/iu.test(source)) {
    return 'attributes-and-defaults';
  }
  if (/3\.2/u.test(sections) || /<!ELEMENT\b/iu.test(source)) {
    return 'elements-and-content-models';
  }
  if (/2\.8/u.test(sections) || /<!DOCTYPE\b/iu.test(source)) {
    return 'doctype-and-external-subset';
  }
  if (/5\.1/u.test(sections)) return 'validating-processor-behavior';
  if (/5\.2/u.test(sections)) return 'nonvalidating-processor-behavior';
  return 'xml-lexical-and-declaration-grammar';
}

const metadataFiles = [];
for (const file of await walk(suiteRoot)) {
  if (path.extname(file).toLowerCase() !== '.xml') continue;
  const source = decodeXml(new Uint8Array(await readFile(file)));
  if (/<TEST\s/iu.test(source)) metadataFiles.push({ file, source });
}

const tests = [];
for (const metadata of metadataFiles.sort((a, b) =>
  suitePath(a.file).localeCompare(suitePath(b.file)),
)) {
  const collection = suitePath(metadata.file);
  for (const match of metadata.source.matchAll(
    /<TEST\s+([^>]+)>([\s\S]*?)<\/TEST>/giu,
  )) {
    const test = attributes(match[1]);
    const entryAbsolute = path.resolve(
      path.dirname(metadata.file),
      test.URI ?? '',
    );
    const entryPresent = Boolean(test.URI) && (await exists(entryAbsolute));
    const source = entryPresent
      ? decodeXml(new Uint8Array(await readFile(entryAbsolute)))
      : '';
    const applicabilityReason = applicabilityExclusion(test);
    const applicable = applicabilityReason === null;
    const relevant = dtdRelevant(test, source);
    const required = entryPresent
      ? await requiredFiles(entryAbsolute)
      : { files: [], missing: [test.URI ?? '(missing URI)'] };
    let exclusionReason = applicabilityReason;
    if (applicable && !entryPresent)
      exclusionReason = 'missing corpus resource';
    const selected = applicable && entryPresent;
    tests.push({
      id: test.ID,
      collection,
      editionApplicability: test.EDITION ?? 'XML 1.0 editions 1-5',
      expected: test.TYPE,
      relevantSpecificationRule:
        test.SECTIONS ?? 'metadata does not name a section',
      entry: entryPresent ? suitePath(entryAbsolute) : test.URI,
      requiredFiles: required.files,
      unresolvedReferences: required.missing,
      runInCi: false,
      selected,
      exclusionReason,
      testFamily: testFamily(test, source, relevant),
      outputCanonicalization: test.OUTPUT !== undefined,
      productionBoundaryRelevance: relevant
        ? 'standalone-DTD-or-supplied-entity boundary'
        : 'harness-only complete XML document conformance',
      executionBoundary: relevant
        ? 'shared controlled Xerces XML/DTD harness'
        : 'nonproduction complete XML document harness',
      knownBoundaryClassification:
        test.ID === 'x-rmt-008b'
          ? 'unsupported-by-current-product-boundary'
          : [
                'rmt-e2e-15a',
                'rmt-e2e-20',
                'inv-not-sa05',
                'inv-not-sa06',
              ].includes(test.ID)
            ? 'instance-dependent-outside-standalone-DTD-check'
            : null,
      description: match[2]
        .replace(/<[^>]+>/gu, ' ')
        .replace(/\s+/gu, ' ')
        .trim(),
    });
  }
}

const selectedCandidates = tests.filter((candidate) => candidate.selected);
const representedFamilyExpectations = new Set();
for (const test of selectedCandidates) {
  const key = `${test.testFamily}\u0000${test.expected}`;
  if (!representedFamilyExpectations.has(key)) {
    test.runInCi = true;
    representedFamilyExpectations.add(key);
  }
}

const ciPerExpected = new Map();
for (const test of selectedCandidates.filter(
  (candidate) => candidate.runInCi,
)) {
  ciPerExpected.set(test.expected, (ciPerExpected.get(test.expected) ?? 0) + 1);
}
for (const test of selectedCandidates) {
  const count = ciPerExpected.get(test.expected) ?? 0;
  if (!test.runInCi && count < 16) {
    test.runInCi = true;
    ciPerExpected.set(test.expected, count + 1);
  }
}

const selected = tests.filter((test) => test.selected);
const ciTests = selected.filter((test) => test.runInCi);
await rm(ciRoot, { recursive: true, force: true });
await mkdir(ciRoot, { recursive: true });
for (const test of ciTests) {
  test.requiredFileSha256 = {};
  for (const filePath of test.requiredFiles) {
    const source = path.join(suiteRoot, ...filePath.split('/'));
    const destination = path.join(ciRoot, ...filePath.split('/'));
    const bytes = await readFile(source);
    test.requiredFileSha256[filePath] = createHash('sha256')
      .update(bytes)
      .digest('hex');
    if (archiveBackedCiPaths.has(filePath)) continue;
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(source, destination);
  }
}
const manifest = {
  suite: {
    name: 'XML W3C Conformance Test Suite 20130923',
    officialUrl: 'https://www.w3.org/XML/Test/xmlts20130923.zip',
    archive: 'xmlts20130923.zip',
    sha256: 'f9510b3532926e1b4c2e54855b021e4b8a66ec98a5337dcf4ff07e8a41968deb',
    extractedManifest: 'xmlconf/xmlconf.xml',
  },
  selection: {
    totalMetadataTests: tests.length,
    selectedTests: selected.length,
    ciTests: selected.filter((test) => test.runInCi).length,
    expectedTotals: Object.fromEntries(
      ['valid', 'invalid', 'not-wf', 'error'].map((expected) => [
        expected,
        selected.filter((test) => test.expected === expected).length,
      ]),
    ),
    exclusionReasonTotals: Object.fromEntries(
      [...new Set(tests.map(({ exclusionReason }) => exclusionReason))]
        .filter((reason) => reason !== null)
        .sort()
        .map((reason) => [
          reason,
          tests.filter((test) => test.exclusionReason === reason).length,
        ]),
    ),
    familyTotals: Object.fromEntries(
      [...new Set(selected.map(({ testFamily }) => testFamily))]
        .sort()
        .map((family) => [
          family,
          selected.filter((test) => test.testFamily === family).length,
        ]),
    ),
    productionBoundaryTotals: {
      standaloneDtdOrEntity: selected.filter(
        ({ productionBoundaryRelevance }) =>
          productionBoundaryRelevance.startsWith('standalone-DTD'),
      ).length,
      harnessOnlyXmlDocument: selected.filter(
        ({ productionBoundaryRelevance }) =>
          productionBoundaryRelevance.startsWith('harness-only'),
      ).length,
    },
  },
  tests,
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(manifest.selection));
