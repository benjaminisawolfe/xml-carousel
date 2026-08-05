import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createXercesSpikeAdapter,
  type XercesSpikeAdapter,
} from '../src/adapter';

const spikeRoot = path.resolve('tools/xerces-wasm-spike');
const fixtureRoot = path.resolve('tests/fixtures/dtd/conformance');
let adapter: XercesSpikeAdapter;

beforeAll(async () => {
  const moduleUrl = pathToFileURL(
    path.join(spikeRoot, 'dist/xerces-spike.mjs'),
  );
  const imported = (await import(moduleUrl.href)) as {
    default: Parameters<typeof createXercesSpikeAdapter>[0];
  };
  adapter = await createXercesSpikeAdapter(imported.default, moduleUrl);
});

async function run(name: string, dependencies: readonly string[] = []) {
  const names = [name, ...dependencies];
  return adapter.run({
    attemptId: name,
    format: 'dtd',
    entryPath: name,
    files: await Promise.all(
      names.map(async (fileName) => ({
        path: fileName,
        bytes: new Uint8Array(await readFile(path.join(fixtureRoot, fileName))),
      })),
    ),
  });
}

describe('Xerces DTD validating probe investigation', () => {
  it('enforces declaration validity, entity WFCs, and the standalone boundary', async () => {
    const cases: readonly [
      string,
      'valid' | 'invalid',
      string | undefined,
      readonly string[]?,
    ][] = [
      ['invalid-id-default.dtd', 'invalid', 'xerces-validity:8'],
      ['invalid-id-fixed-default.dtd', 'invalid', 'xerces-validity:8'],
      ['valid-id-implied.dtd', 'valid', undefined],
      ['valid-id-required.dtd', 'valid', undefined],
      ['multiple-id-attributes.dtd', 'invalid', 'xerces-validity:11'],
      ['invalid-nmtoken-default.dtd', 'invalid', 'xerces-validity:25'],
      ['invalid-enumeration-default.dtd', 'invalid', 'xerces-validity:23'],
      ['duplicate-enumeration-token.dtd', 'invalid', 'xerces-validity:77'],
      ['multiple-notation-attributes.dtd', 'invalid', 'xerces-validity:76'],
      ['notation-on-empty-element.dtd', 'invalid', 'xerces-validity:74'],
      ['undeclared-notation-attribute.dtd', 'invalid', 'xerces-validity:14'],
      [
        'undeclared-unparsed-entity-notation.dtd',
        'invalid',
        'xerces-validity:4',
      ],
      ['valid-unparsed-entity.dtd', 'valid', undefined],
      ['duplicate-element.dtd', 'invalid', 'xerces-validity:10'],
      ['duplicate-notation.dtd', 'invalid', 'xerces-xml:2'],
      ['duplicate-attribute.dtd', 'valid', 'xerces-xml:3'],
      ['undeclared-attlist-target.dtd', 'valid', 'xerces-xml:6'],
      ['undeclared-child.dtd', 'valid', 'xerces-xml:5'],
      ['improper-pe-nesting.dtd', 'invalid', 'xerces-xml:263'],
      ['recursive-parameter-entity.dtd', 'invalid', 'xerces-xml:205'],
      ['recursive-general-entities.dtd', 'invalid', 'xerces-xml:205'],
      [
        'external-entity-malformed.dtd',
        'invalid',
        'xerces-xml:206',
        ['malformed-declarations.ent'],
      ],
      [
        'external-general-entity-malformed.dtd',
        'invalid',
        'xerces-xml:180',
        ['malformed-chapter.ent'],
      ],
      ['malformed-conditional-section.dtd', 'invalid', 'xerces-validity:52'],
      ['instance-dependent-idrefs.dtd', 'valid', undefined],
      ['probe-required-attribute.dtd', 'valid', undefined],
      ['probe-content-model.dtd', 'valid', undefined],
    ];
    for (const [name, status, code, dependencies = []] of cases) {
      const result = await run(name, dependencies);
      expect(result.status, name).toBe(status);
      if (code) {
        expect(
          result.diagnostics.some((diagnostic) => diagnostic.code === code),
          name,
        ).toBe(true);
      }
      expect(JSON.stringify(result), name).not.toContain(
        '__xml_carousel_probe__',
      );
    }
  });
});
