import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { posix } from 'node:path';

/** @param {import('node:crypto').BinaryLike} bytes */
export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/** @param {Uint8Array} bytes */
export function gitBlobId(bytes) {
  return createHash('sha1')
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest('hex');
}

/** @param {string} value */
function unwrapText(value) {
  const trimmed = value.trim();
  const cdata = trimmed.match(/^<!\[CDATA\[([\s\S]*)\]\]>$/u);
  if (cdata) return cdata[1].trim();
  return trimmed
    .split('&lt;')
    .join('<')
    .split('&gt;')
    .join('>')
    .split('&quot;')
    .join('"')
    .split('&apos;')
    .join("'")
    .split('&amp;')
    .join('&');
}

/** @param {string} source */
export function parseSpectest(source) {
  return [
    ...source.matchAll(/<testCase(?:\s[^>]*)?>([\s\S]*?)<\/testCase>/gu),
  ].map((match, index) => {
    const body = match[1];
    const correct = body.match(/<correct(?:\s[^>]*)?>([\s\S]*?)<\/correct>/u);
    const incorrect = body.match(
      /<incorrect(?:\s[^>]*)?>([\s\S]*?)<\/incorrect>/u,
    );
    if ((correct === null) === (incorrect === null)) {
      throw new Error(
        `spectest testCase ${index + 1} must have exactly one schema outcome.`,
      );
    }

    const files = [];
    const directories = [];
    const resourceExpression =
      /<dir\s+name="([^"]+)"\s*>|<\/dir\s*>|<resource\s+name="([^"]+)"\s*>([\s\S]*?)<\/resource\s*>/gu;
    for (const resource of body.matchAll(resourceExpression)) {
      if (resource[1] !== undefined) {
        directories.push(resource[1]);
      } else if (resource[2] !== undefined) {
        const path = posix.join(...directories, resource[2]);
        if (posix.isAbsolute(path) || path === '..' || path.startsWith('../')) {
          throw new Error(
            `spectest testCase ${index + 1} has an unsafe resource path.`,
          );
        }
        files.push({ path, source: unwrapText(resource[3]) });
      } else {
        directories.pop();
      }
    }
    if (directories.length !== 0) {
      throw new Error(
        `spectest testCase ${index + 1} has unbalanced resource directories.`,
      );
    }

    const outcome = correct ?? incorrect;
    if (!outcome) throw new Error('Unreachable spectest outcome state.');
    const mainSource = outcome[1].trim();
    return {
      id: `spectest:${String(index + 1).padStart(3, '0')}`,
      authority: 'jing-trang-spectest',
      classification: 'selected-product-schema-conformance',
      expected: correct === null ? 'invalid' : 'accepted',
      entryPath: 'main.rng',
      source: mainSource,
      files: [{ path: 'main.rng', source: mainSource }, ...files],
      sourceLocator: `testCase[${index}]`,
      applicableLater: false,
    };
  });
}

/** @param {string} source */
export function parseCompacttest(source) {
  return [...source.matchAll(/<testCase>([\s\S]*?)<\/testCase>/gu)].map(
    (match, index) => {
      const compact = match[1].match(/<compact>([\s\S]*?)<\/compact>/u)?.[1];
      if (compact === undefined) {
        throw new Error(
          `compacttest testCase ${index + 1} has no compact authority.`,
        );
      }
      const correct = compact.match(
        /<correct(?:\s[^>]*)?>([\s\S]*?)<\/correct>/u,
      );
      const incorrect = compact.match(
        /<incorrect(?:\s[^>]*)?>([\s\S]*?)<\/incorrect>/u,
      );
      if ((correct === null) === (incorrect === null)) {
        throw new Error(
          `compacttest testCase ${index + 1} must have exactly one outcome.`,
        );
      }
      const outcome = correct ?? incorrect;
      if (!outcome) throw new Error('Unreachable compacttest outcome state.');
      const xml = match[1]
        .match(/<xml>([\s\S]*?)<\/xml>/u)?.[1]
        ?.match(/<correct(?:\s[^>]*)?>([\s\S]*?)<\/correct>/u)?.[1];
      return {
        id: `compacttest:${String(index + 1).padStart(3, '0')}`,
        authority: 'jing-trang-compacttest',
        classification: 'selected-rnc-translation-conformance',
        expected: correct === null ? 'invalid' : 'accepted',
        source: unwrapText(outcome[1]),
        expectedXml: xml === undefined ? undefined : unwrapText(xml),
        sourceLocator: `testCase[${index}]`,
        applicableLater: false,
      };
    },
  );
}

/** @param {URL} root */
export async function loadAuthorityCases(root) {
  const upstream = new URL(
    'tests/fixtures/relax-ng/conformance/upstream/jing-trang-v20241231/',
    root,
  );
  const [spectest, compacttest] = await Promise.all([
    readFile(new URL('spectest.xml', upstream), 'utf8'),
    readFile(new URL('compacttest.xml', upstream), 'utf8'),
  ]);
  return {
    spectest: parseSpectest(spectest),
    compacttest: parseCompacttest(compacttest),
  };
}
