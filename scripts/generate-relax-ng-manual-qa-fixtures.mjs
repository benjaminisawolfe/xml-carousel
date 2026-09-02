import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import prettier from 'prettier';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(
  repositoryRoot,
  'tests',
  'fixtures',
  'relax-ng',
  'manual-qa',
);
const fixedDate = new Date('1980-01-01T00:00:00.000Z');
const verifyOnly = process.argv.includes('--verify');

const zipSpecifications = [
  {
    path: '11-multi-file-includes.zip',
    sourceDirectory: 'projects/11-multi-file-includes',
    roots: ['main.rng'],
    resolved: ['main.rng -> parts/common.rng', 'main.rng -> parts/types.rng'],
    missingOrBlocked: [],
    areas: ['resolved include', 'include definitions', 'combine'],
  },
  {
    path: '12-external-ref-project.zip',
    sourceDirectory: 'projects/12-external-ref-project',
    roots: ['main.rng'],
    resolved: ['main.rng -> patterns/address.rng'],
    missingOrBlocked: [],
    areas: ['resolved externalRef', 'nested relative path'],
  },
  {
    path: '13-shared-dependency.zip',
    sourceDirectory: 'projects/13-shared-dependency',
    roots: ['catalog-a.rng', 'catalog-b.rng'],
    resolved: [
      'catalog-a.rng -> shared/item.rng',
      'catalog-b.rng -> shared/item.rng',
    ],
    missingOrBlocked: [],
    areas: ['shared dependency', 'multiple independent RNG roots'],
  },
  {
    path: '14-nested-include-project.zip',
    sourceDirectory: 'projects/14-nested-include-project',
    roots: ['schemas/main.rng'],
    resolved: [
      'schemas/main.rng -> schemas/levels/first.rng',
      'schemas/levels/first.rng -> schemas/common/base.rng',
    ],
    missingOrBlocked: [],
    areas: ['nested include', 'safe parent normalization'],
  },
  {
    path: '15-mixed-large-rng-project.zip',
    members: [
      ['large/catalog-model.rng', '07-large-semantic-model-a.rng'],
      ['large/publishing-model.rng', '08-large-semantic-model-b.rng'],
      [
        'readme-schema.rng',
        'projects/15-mixed-large-rng-project/readme-schema.rng',
      ],
    ],
    roots: [
      'large/catalog-model.rng',
      'large/publishing-model.rng',
      'readme-schema.rng',
    ],
    resolved: [],
    missingOrBlocked: [],
    areas: ['large models', 'multiple roots', 'mixed small and large members'],
  },
  {
    path: '16-missing-dependency.zip',
    sourceDirectory: 'projects/16-missing-dependency',
    roots: ['main.rng', 'support.rng'],
    resolved: [],
    missingOrBlocked: ['main.rng -> absent/definitions.rng (missing)'],
    areas: ['missing include', 'source-first failure retention'],
  },
  {
    path: '17-blocked-external-uri.zip',
    sourceDirectory: 'projects/17-blocked-external-uri',
    roots: ['file-root.rng', 'https-root.rng', 'local-support.rng'],
    resolved: [],
    missingOrBlocked: [
      'https-root.rng -> https://example.invalid/common.rng (blocked)',
      'file-root.rng -> file:///tmp/local.rng (blocked)',
    ],
    areas: ['blocked HTTPS', 'blocked file URI', 'no retrieval'],
  },
  {
    path: '18-cycle-project.zip',
    sourceDirectory: 'projects/18-cycle-project',
    roots: ['external-a.rng', 'include-a.rng'],
    resolved: [
      'include-a.rng -> include-b.rng',
      'include-b.rng -> include-a.rng',
      'external-a.rng -> external-b.rng',
      'external-b.rng -> external-a.rng',
    ],
    missingOrBlocked: [],
    areas: ['include cycle', 'externalRef cycle', 'bounded graph binding'],
  },
];

const looseMetadata = {
  '01-basic-grammar.rng': ['valid', ['grammar', 'start', 'define', 'ref']],
  '02-pattern-operators.rng': [
    'valid',
    ['choice', 'group', 'interleave', 'repetition', 'mixed', 'list'],
  ],
  '03-name-classes.rng': [
    'valid',
    ['name', 'anyName', 'nsName', 'name-class choice', 'exclusions'],
  ],
  '04-datatypes-and-values.rng': [
    'valid',
    ['data', 'param', 'except', 'value', 'datatypeLibrary'],
  ],
  '05-annotations-and-compatibility.rng': [
    'valid',
    ['documentation', 'defaultValue', 'foreign content'],
  ],
  '06-nested-grammar-parent-ref.rng': [
    'valid',
    ['nested grammar', 'parentRef', 'scope binding'],
  ],
  '07-large-semantic-model-a.rng': [
    'valid',
    ['large catalog grammar', 'combine', 'datatypes', 'annotations'],
  ],
  '08-large-semantic-model-b.rng': [
    'valid',
    ['large publishing grammar', 'nested grammar', 'name classes'],
  ],
  '09-invalid-schema.rng': [
    'standards-invalid',
    ['invalid undefined reference'],
  ],
  '10-blocked-external-ref.rng': [
    'blocked-dependency',
    ['blocked HTTPS externalRef', 'no retrieval'],
  ],
};

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function writeOrVerify(path, bytes) {
  if (!verifyOnly) {
    await writeFile(path, bytes);
    return;
  }
  const current = await readFile(path);
  const expected =
    typeof bytes === 'string' ? Buffer.from(bytes, 'utf8') : bytes;
  if (!Buffer.from(current).equals(Buffer.from(expected))) {
    throw new Error(
      `Generated fixture differs from the committed file: ${path}`,
    );
  }
}

async function sourceFiles(directory) {
  const absoluteDirectory = join(fixtureRoot, directory);
  const entries = await readdir(absoluteDirectory, {
    recursive: true,
    withFileTypes: true,
  });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.rng'))
    .map((entry) => {
      const absolutePath = join(entry.parentPath, entry.name);
      return [
        relative(absoluteDirectory, absolutePath).replaceAll('\\', '/'),
        relative(fixtureRoot, absolutePath).replaceAll('\\', '/'),
      ];
    })
    .sort(([left], [right]) => left.localeCompare(right));
}

async function membersFor(specification) {
  return (
    specification.members ?? (await sourceFiles(specification.sourceDirectory))
  );
}

async function generateZip(specification) {
  const archive = new JSZip();
  const members = await membersFor(specification);
  for (const [memberPath, sourcePath] of [...members].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    archive.file(memberPath, await readFile(join(fixtureRoot, sourcePath)), {
      binary: true,
      createFolders: false,
      date: fixedDate,
      unixPermissions: 0o100644,
      dosPermissions: 0,
    });
  }
  const bytes = await archive.generateAsync({
    type: 'uint8array',
    compression: 'STORE',
    platform: 'DOS',
    streamFiles: false,
  });
  await writeOrVerify(join(fixtureRoot, specification.path), bytes);
  return { bytes, members: members.map(([memberPath]) => memberPath) };
}

const manifestEntries = [];
for (const [path, [expectedOutcome, primarySemanticAreas]] of Object.entries(
  looseMetadata,
)) {
  const bytes = await readFile(join(fixtureRoot, path));
  manifestEntries.push({
    path,
    kind: 'rng',
    expectedOutcome,
    byteSize: bytes.byteLength,
    sha256: sha256(bytes),
    largeFixture: bytes.byteLength >= 5_120,
    primarySemanticAreas,
  });
}

for (const specification of zipSpecifications) {
  const generated = await generateZip(specification);
  manifestEntries.push({
    path: specification.path,
    kind: 'zip',
    expectedOutcome:
      specification.missingOrBlocked.length === 0
        ? 'package-semantic-model'
        : 'source-first-with-relationship-findings',
    byteSize: generated.bytes.byteLength,
    sha256: sha256(generated.bytes),
    largeFixture: specification.path === '15-mixed-large-rng-project.zip',
    primarySemanticAreas: specification.areas,
    members: generated.members,
    expectedRngRoots: specification.roots,
    expectedResolvedRelationships: specification.resolved,
    expectedMissingOrBlockedRelationships: specification.missingOrBlocked,
  });
}

const manifest = {
  formatVersion: 1,
  provenance: 'Project-authored XML Carousel Task 17.6 fixtures.',
  entries: manifestEntries.sort((left, right) =>
    left.path.localeCompare(right.path),
  ),
};
const manifestText = await prettier.format(JSON.stringify(manifest), {
  parser: 'json',
});
await writeOrVerify(join(fixtureRoot, 'manifest.json'), manifestText);

console.log(
  `${verifyOnly ? 'Verified' : 'Generated'} ${zipSpecifications.length} deterministic RELAX NG ZIP fixtures and ${manifest.entries.length} manifest entries.`,
);
