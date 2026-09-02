import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';
import { format } from 'prettier';

const root = path.resolve('tests/fixtures/relax-ng/manual-qa-rnc');
const projectsRoot = path.join(root, 'projects');
const equivalenceRoot = path.join(root, 'equivalence');
const verify = process.argv.includes('--verify');

async function filesUnder(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const result = [];
  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory())
      result.push(
        ...(await filesUnder(path.join(directory, entry.name), relative)),
      );
    else result.push(relative);
  }
  return result;
}

const projectNames = (await readdir(projectsRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const packages = [];
for (const project of projectNames) {
  const directory = path.join(projectsRoot, project);
  const files = await filesUnder(directory);
  const zip = new JSZip();
  for (const file of files) {
    zip.file(file, await readFile(path.join(directory, ...file.split('/'))), {
      date: new Date('1980-01-01T00:00:00.000Z'),
      createFolders: false,
    });
  }
  const bytes = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
    platform: 'DOS',
  });
  const output = path.join(root, `${project}.zip`);
  if (verify) {
    const existing = new Uint8Array(await readFile(output));
    if (!Buffer.from(existing).equals(Buffer.from(bytes))) {
      throw new Error(`RNC fixture ZIP is stale: ${path.basename(output)}`);
    }
  } else {
    await writeFile(output, bytes);
  }
  packages.push({
    name: project,
    file: `${project}.zip`,
    members: files,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
}

const loose = (await readdir(root))
  .filter((name) => /^\d\d-.*\.rnc$/u.test(name))
  .sort();
const manifest = {
  version: 1,
  provenance:
    'Project-authored for XML Carousel Task 17.8; no third-party corpus content.',
  equivalence: await Promise.all(
    (await filesUnder(equivalenceRoot)).map(async (name) => ({
      file: `equivalence/${name}`,
      sha256: createHash('sha256')
        .update(await readFile(path.join(equivalenceRoot, ...name.split('/'))))
        .digest('hex'),
    })),
  ),
  loose: await Promise.all(
    loose.map(async (name) => ({
      file: name,
      sha256: createHash('sha256')
        .update(await readFile(path.join(root, name)))
        .digest('hex'),
      expected: name.startsWith('09-')
        ? 'syntax-invalid'
        : name.startsWith('10-')
          ? 'blocked'
          : 'valid',
    })),
  ),
  packages,
};
const manifestText = await format(JSON.stringify(manifest), {
  parser: 'json',
});
const manifestPath = path.join(root, 'manifest.json');
if (verify) {
  if ((await readFile(manifestPath, 'utf8')) !== manifestText) {
    throw new Error('RNC fixture manifest is stale.');
  }
} else {
  await writeFile(manifestPath, manifestText);
}

console.log(
  `RNC manual-QA fixtures ${verify ? 'verified' : 'generated'}: ${loose.length} loose, ${packages.length} packages.`,
);
