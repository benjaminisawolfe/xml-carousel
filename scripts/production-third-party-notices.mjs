import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

export const shippedJavaScriptComponents = Object.freeze([
  { name: 'svelte', licenseFile: 'LICENSE.md' },
  { name: 'clsx', licenseFile: 'license' },
  { name: 'esm-env', licenseFile: 'LICENSE' },
  {
    name: 'jszip',
    licenseFile: 'LICENSE.markdown',
    before: '\n\nGPL version 3',
  },
  { name: 'pako', licenseFile: 'LICENSE' },
  { name: 'lie', licenseFile: 'license.md' },
  { name: 'immediate', licenseFile: 'LICENSE.txt' },
  { name: 'readable-stream', licenseFile: 'LICENSE' },
  { name: 'setimmediate', licenseFile: 'LICENSE.txt' },
  { name: 'core-util-is', licenseFile: 'LICENSE' },
  { name: 'inherits', licenseFile: 'LICENSE' },
  { name: 'isarray', licenseFile: 'README.md', after: '## License' },
  { name: 'process-nextick-args', licenseFile: 'license.md' },
  { name: 'safe-buffer', licenseFile: 'LICENSE' },
  { name: 'string_decoder', licenseFile: 'LICENSE' },
  { name: 'util-deprecate', licenseFile: 'LICENSE' },
]);

/** @param {string} value */
function normalizeText(value) {
  return value.replace(/\r\n/gu, '\n').trim();
}

/** @param {string} name */
function packageLockPath(name) {
  return `node_modules/${name}`;
}

export async function generateProductionThirdPartyNotices() {
  const packageLock = JSON.parse(
    await readFile(path.join(repositoryRoot, 'package-lock.json'), 'utf8'),
  );
  const sections = [];
  for (const component of shippedJavaScriptComponents) {
    const lockEntry = packageLock.packages?.[packageLockPath(component.name)];
    if (!lockEntry?.version || !lockEntry.license) {
      throw new Error(
        `package-lock.json lacks version or license metadata for ${component.name}.`,
      );
    }
    const packageDirectory = path.join(
      repositoryRoot,
      'node_modules',
      ...component.name.split('/'),
    );
    const installed = JSON.parse(
      await readFile(path.join(packageDirectory, 'package.json'), 'utf8'),
    );
    if (
      installed.version !== lockEntry.version ||
      installed.license !== lockEntry.license
    ) {
      throw new Error(
        `${component.name} installed metadata differs from package-lock.json.`,
      );
    }
    let licenseText = normalizeText(
      await readFile(
        path.join(packageDirectory, component.licenseFile),
        'utf8',
      ),
    );
    if (component.after) {
      const index = licenseText.indexOf(component.after);
      if (index < 0) {
        throw new Error(
          `${component.name} license source lacks ${component.after}.`,
        );
      }
      licenseText = licenseText.slice(index + component.after.length).trim();
    }
    if (component.before) {
      const index = licenseText.indexOf(component.before);
      if (index < 0) {
        throw new Error(
          `${component.name} license source lacks ${component.before.trim()}.`,
        );
      }
      licenseText = licenseText.slice(0, index).trim();
    }
    sections.push(
      [
        '-------------------------------------------------------------------------------',
        `${component.name} ${lockEntry.version} — ${lockEntry.license}`,
        `Authoritative package source: node_modules/${component.name}/${component.licenseFile}`,
        '',
        licenseText,
      ].join('\n'),
    );
  }

  return `${[
    'XML Carousel — Third-Party Notices',
    '====================================',
    '',
    'This file covers third-party JavaScript incorporated into the production',
    'application bundle. It is generated deterministically from package-lock.json',
    'and the exact license files shipped by the locked npm packages.',
    '',
    'Apache Xerces-C++ 3.3.0 and libxml2 2.15.3 are shipped as separate',
    'WebAssembly runtime assets built with Emscripten 6.0.5. Their complete',
    'terms are distributed as LICENSE.xerces.txt, NOTICE.xerces.txt,',
    'LICENSE.libxml2.txt, and LICENSE.emscripten.txt.',
    '',
    "XML Carousel's own CC0 dedication is distributed separately as LICENSE.txt.",
    'CC0 does not apply to any third-party component or fixture.',
    '',
    ...sections,
  ].join('\n')}\n`;
}

async function main() {
  const generated = await generateProductionThirdPartyNotices();
  const outputPath = path.join(repositoryRoot, 'THIRD_PARTY_NOTICES.txt');
  if (process.argv.includes('--write')) {
    await writeFile(outputPath, generated, 'utf8');
    console.log(`Wrote ${path.relative(repositoryRoot, outputPath)}.`);
    return;
  }
  const committed = await readFile(outputPath, 'utf8');
  if (committed !== generated) {
    throw new Error(
      'THIRD_PARTY_NOTICES.txt differs from locked package license sources.',
    );
  }
  console.log(
    `Verified ${shippedJavaScriptComponents.length} bundled JavaScript component notices.`,
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
