import { mkdirSync, writeFileSync } from 'node:fs';
import { URL, fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const dtdDirectory = `${repositoryRoot}tests/fixtures/dtd`;
const xsdDirectory = `${repositoryRoot}tests/fixtures/xsd`;
const zipDirectory = `${repositoryRoot}tests/fixtures/zip`;
const deterministicDate = new Date('2000-01-01T00:00:00.000Z');

for (const directory of [dtdDirectory, xsdDirectory, zipDirectory]) {
  mkdirSync(directory, { recursive: true });
}

function padded(value, width) {
  return String(value).padStart(width, '0');
}

function buildLargeDtd(elementCount) {
  const childNames = Array.from(
    { length: elementCount - 1 },
    (_, index) => `node${padded(index + 1, 5)}`,
  );
  return [
    `<!ELEMENT root (${childNames.join(',')})>`,
    ...childNames.map((name) => `<!ELEMENT ${name} EMPTY>`),
    '',
  ].join('\n');
}

function buildLargeXsd(elementCount, namespaceSuffix) {
  const elements = Array.from(
    { length: elementCount },
    (_, index) =>
      `  <xs:element name="node${padded(index + 1, 5)}" type="xs:string"/>`,
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"',
    `           targetNamespace="urn:xml-carousel:manual-qa:${namespaceSuffix}"`,
    `           xmlns="urn:xml-carousel:manual-qa:${namespaceSuffix}"`,
    '           elementFormDefault="qualified">',
    ...elements,
    '</xs:schema>',
    '',
  ].join('\n');
}

function buildPackageXsd({
  sourceIndex,
  sourceCount,
  elementsPerSource,
  unresolvedInclude,
}) {
  const sourceLabel = padded(sourceIndex, 2);
  const includes = [];
  if (sourceIndex < sourceCount) {
    includes.push(
      `  <xs:include schemaLocation="source-${padded(sourceIndex + 1, 2)}.xsd"/>`,
    );
  }
  if (unresolvedInclude && sourceIndex === 1) {
    includes.push(
      '  <xs:include schemaLocation="missing-manual-qa-source.xsd"/>',
    );
  }
  const elements = Array.from(
    { length: elementsPerSource },
    (_, index) =>
      `  <xs:element name="s${sourceLabel}-node${padded(index + 1, 4)}" type="xs:string"/>`,
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"',
    '           targetNamespace="urn:xml-carousel:manual-qa:package"',
    '           xmlns="urn:xml-carousel:manual-qa:package"',
    '           elementFormDefault="qualified">',
    ...includes,
    ...elements,
    '</xs:schema>',
    '',
  ].join('\n');
}

async function writeXsdPackage({
  filename,
  sourceCount,
  elementsPerSource,
  unresolvedInclude = false,
}) {
  const archive = new JSZip();
  for (let sourceIndex = 1; sourceIndex <= sourceCount; sourceIndex += 1) {
    archive.file(
      `source-${padded(sourceIndex, 2)}.xsd`,
      buildPackageXsd({
        sourceIndex,
        sourceCount,
        elementsPerSource,
        unresolvedInclude,
      }),
      { date: deterministicDate },
    );
  }
  const content = await archive.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
    platform: 'DOS',
  });
  writeFileSync(`${zipDirectory}/${filename}`, content);
}

writeFileSync(`${dtdDirectory}/large-10000.dtd`, buildLargeDtd(10_000));
writeFileSync(`${dtdDirectory}/large-40000.dtd`, buildLargeDtd(40_000));
writeFileSync(
  `${xsdDirectory}/large-10000.xsd`,
  buildLargeXsd(10_000, 'xsd-10000'),
);
writeFileSync(
  `${xsdDirectory}/large-40000.xsd`,
  buildLargeXsd(40_000, 'xsd-40000'),
);

await writeXsdPackage({
  filename: 'large-xsd-package-20x1000.zip',
  sourceCount: 20,
  elementsPerSource: 1_000,
});
await writeXsdPackage({
  filename: 'large-xsd-package-unresolved-10x1000.zip',
  sourceCount: 10,
  elementsPerSource: 1_000,
  unresolvedInclude: true,
});
