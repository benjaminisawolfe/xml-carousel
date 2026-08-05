import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createXercesSpikeAdapter,
  type XercesSpikeAdapter,
} from '../src/adapter';
import type { XercesSpikeFile, XercesSpikeFormat } from '../src/types';

const spikeRoot = path.resolve('tools/xerces-wasm-spike');
const fixtureRoot = path.resolve('tests/fixtures/xerces-wasm-spike');
let adapter: XercesSpikeAdapter;

async function file(
  projectPath: string,
  fixturePath = projectPath,
): Promise<XercesSpikeFile> {
  return {
    path: projectPath,
    bytes: new Uint8Array(await readFile(path.join(fixtureRoot, fixturePath))),
  };
}

function inlineFile(projectPath: string, source: string): XercesSpikeFile {
  return { path: projectPath, bytes: new TextEncoder().encode(source) };
}

function schema(body: string): string {
  return `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:t="urn:test" targetNamespace="urn:test">${body}</xs:schema>`;
}

async function run(
  attemptId: string,
  format: XercesSpikeFormat,
  entryPath: string,
  files: readonly XercesSpikeFile[],
) {
  return adapter.run({ attemptId, format, entryPath, files });
}

beforeAll(async () => {
  const moduleUrl = pathToFileURL(
    path.join(spikeRoot, 'dist/xerces-spike.mjs'),
  );
  const imported = (await import(moduleUrl.href)) as {
    default: Parameters<typeof createXercesSpikeAdapter>[0];
  };
  adapter = await createXercesSpikeAdapter(imported.default, moduleUrl);
});

describe('real Xerces-C++ WebAssembly adapter', () => {
  it('reports the actual runtime Xerces version', async () => {
    const result = await run('version', 'xsd', 'valid.xsd', [
      await file('valid.xsd', 'xsd/valid.xsd'),
    ]);
    expect(result.engine).toEqual({
      name: 'Apache Xerces-C++',
      version: '3.3.0',
    });
    expect(result.status).toBe('valid');
  });

  it('rejects malformed and grammar-invalid XSDs with retained locations', async () => {
    const malformed = await run('malformed', 'xsd', 'malformed.xsd', [
      await file('malformed.xsd', 'xsd/malformed.xsd'),
    ]);
    const grammar = await run('grammar', 'xsd', 'grammar-errors.xsd', [
      await file('grammar-errors.xsd', 'xsd/grammar-errors.xsd'),
    ]);
    expect(malformed.status).toBe('invalid');
    expect(
      malformed.diagnostics.some(({ line, column }) => line && column),
    ).toBe(true);
    expect(grammar.status).toBe('invalid');
    expect(grammar.diagnostics.length).toBeGreaterThanOrEqual(2);
  });

  it('loads local XSD includes and imports', async () => {
    const include = await run('include', 'xsd', 'include/main.xsd', [
      await file('include/main.xsd', 'xsd/include/main.xsd'),
      await file('include/included.xsd', 'xsd/include/included.xsd'),
    ]);
    const imported = await run('import', 'xsd', 'import/main.xsd', [
      await file('import/main.xsd', 'xsd/import/main.xsd'),
      await file('import/other.xsd', 'xsd/import/other.xsd'),
    ]);
    expect(include.status).toBe('valid');
    expect(imported.status).toBe('valid');
  });

  it('resolves safe parent segments against canonical nested directories', async () => {
    const oneLevel = await run('safe-parent', 'xsd', 'entities/main.xsd', [
      inlineFile(
        'entities/main.xsd',
        schema(
          '<xs:include schemaLocation="../shared.xsd"/><xs:element name="root" type="t:Shared"/>',
        ),
      ),
      inlineFile(
        'shared.xsd',
        schema('<xs:complexType name="Shared"><xs:sequence/></xs:complexType>'),
      ),
    ]);
    const twoLevels = await run(
      'safe-nested-parent',
      'xsd',
      'one/two/main.xsd',
      [
        inlineFile(
          'one/two/main.xsd',
          schema(
            '<xs:include schemaLocation="../../shared.xsd"/><xs:element name="nested" type="t:Shared"/>',
          ),
        ),
        inlineFile(
          'shared.xsd',
          schema(
            '<xs:complexType name="Shared"><xs:sequence/></xs:complexType>',
          ),
        ),
      ],
    );
    expect(oneLevel.status).toBe('valid');
    expect(twoLevels.status).toBe('valid');
  });

  it.each([
    ['plain traversal', '../../outside.xsd'],
    ['encoded traversal', '%2e%2e/%2e%2e/outside.xsd'],
    ['double-encoded traversal', '%252e%252e/%252e%252e/outside.xsd'],
    ['triple-encoded traversal', '%25252e%25252e/%25252e%25252e/outside.xsd'],
  ])('blocks %s beyond the virtual root', async (name, reference) => {
    const result = await run(name, 'xsd', 'entities/main.xsd', [
      inlineFile(
        'entities/main.xsd',
        schema(`<xs:include schemaLocation="${reference}"/>`),
      ),
      inlineFile('outside.xsd', schema('<xs:element name="outside"/>')),
    ]);
    expect(result.status).toBe('blocked');
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'xerces:security-reference-blocked' }),
      ]),
    );
  });

  it.each([
    ['absolute', '/outside.xsd'],
    ['network', 'https://example.invalid/outside.xsd'],
    ['file URL', 'file:///outside.xsd'],
    ['drive path', 'C:/outside.xsd'],
  ])('blocks %s dependency references', async (name, reference) => {
    const result = await run(name, 'xsd', 'entities/main.xsd', [
      inlineFile(
        'entities/main.xsd',
        schema(`<xs:include schemaLocation="${reference}"/>`),
      ),
    ]);
    expect(result.status).toBe('blocked');
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'xerces:security-reference-blocked' }),
      ]),
    );
  });

  it.each([
    ['invalid percent encoding', 'bad%ZZ.xsd'],
    ['query component', 'outside.xsd?version=1'],
    ['fragment component', 'outside.xsd#component'],
    ['encoded C1 control', 'outside%C2%80.xsd'],
    ['malformed project URI', 'project:/outside.xsd'],
  ])('blocks %s as a security-policy outcome', async (name, reference) => {
    const result = await run(name, 'xsd', 'entities/main.xsd', [
      inlineFile(
        'entities/main.xsd',
        schema(`<xs:include schemaLocation="${reference}"/>`),
      ),
      inlineFile('outside.xsd', schema('<xs:element name="outside"/>')),
    ]);
    expect(result.status).toBe('blocked');
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'xerces:security-reference-blocked' }),
      ]),
    );
  });

  it('accepts the exact qualified project namespace for a supplied dependency', async () => {
    const result = await run(
      'qualified-project-reference',
      'xsd',
      'entities/main.xsd',
      [
        inlineFile(
          'entities/main.xsd',
          schema(
            '<xs:include schemaLocation="project:///shared.xsd"/><xs:element name="root" type="t:Shared"/>',
          ),
        ),
        inlineFile(
          'shared.xsd',
          schema(
            '<xs:complexType name="Shared"><xs:sequence/></xs:complexType>',
          ),
        ),
      ],
    );
    expect(result.status).toBe('valid');
  });

  it('classifies a missing local dependency separately from policy blocks', async () => {
    const name = 'missing';
    const fixturePath = 'xsd/missing-dependency.xsd';
    const result = await run(name, 'xsd', 'main.xsd', [
      await file('main.xsd', fixturePath),
    ]);
    expect(result.status).toBe('blocked');
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'xerces:missing-project-dependency' }),
      ]),
    );
  });

  it('supports advanced XSD 1.0 constructs and recursion', async () => {
    const advanced = await run('advanced', 'xsd', 'advanced.xsd', [
      await file('advanced.xsd', 'xsd/advanced.xsd'),
    ]);
    const recursive = await run('recursive', 'xsd', 'recursive.xsd', [
      await file('recursive.xsd', 'xsd/recursive.xsd'),
    ]);
    expect(advanced.status).toBe('valid');
    expect(recursive.status).toBe('valid');
  });

  it('keeps identical basenames distinct', async () => {
    const result = await run('same-basename', 'xsd', 'main.xsd', [
      await file('main.xsd', 'xsd/same-basename/main.xsd'),
      await file('a/common.xsd', 'xsd/same-basename/a/common.xsd'),
      await file('b/common.xsd', 'xsd/same-basename/b/common.xsd'),
    ]);
    expect(result.status).toBe('valid');
  });

  it('returns unsupported for an explicit XSD 1.1 requirement', async () => {
    const result = await run('xsd11', 'xsd', 'xsd-1.1.xsd', [
      await file('xsd-1.1.xsd', 'xsd/xsd-1.1.xsd'),
    ]);
    expect(result.status).toBe('unsupported');
  });

  it('preparses valid and rejects malformed standalone DTD grammars', async () => {
    const valid = await run('dtd-valid', 'dtd', 'valid.dtd', [
      await file('valid.dtd', 'dtd/valid.dtd'),
    ]);
    const invalid = await run('dtd-invalid', 'dtd', 'broken.dtd', [
      await file('broken.dtd', 'dtd/malformed-element.dtd'),
    ]);
    expect(valid.status).toBe('valid');
    expect(invalid.status).toBe('invalid');
  });

  it('resolves local parameter entities and blocks missing or remote entities', async () => {
    const local = await run('dtd-local', 'dtd', 'parameter/main.dtd', [
      await file('parameter/main.dtd', 'dtd/parameter/main.dtd'),
      await file(
        'parameter/declarations.ent',
        'dtd/parameter/declarations.ent',
      ),
    ]);
    const missing = await run('dtd-missing', 'dtd', 'missing.dtd', [
      await file('missing.dtd', 'dtd/missing-entity.dtd'),
    ]);
    const remote = await run('dtd-remote', 'dtd', 'remote.dtd', [
      await file('remote.dtd', 'dtd/remote-entity.dtd'),
    ]);
    expect(local.status).toBe('valid');
    expect(missing.status).toBe('blocked');
    expect(remote.status).toBe('blocked');
  });

  it('cleans project files between repeated attempts', async () => {
    const first = await run('first', 'xsd', 'include/main.xsd', [
      await file('include/main.xsd', 'xsd/include/main.xsd'),
      await file('include/included.xsd', 'xsd/include/included.xsd'),
    ]);
    const second = await run('second', 'xsd', 'include/main.xsd', [
      await file('include/main.xsd', 'xsd/include/main.xsd'),
    ]);
    expect(first.status).toBe('valid');
    expect(second.status).toBe('blocked');
  });
});
