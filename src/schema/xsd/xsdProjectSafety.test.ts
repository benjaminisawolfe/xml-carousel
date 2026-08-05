import { describe, expect, it } from 'vitest';
import type { SchemaSourceRange } from '../model';
import type { XsdSchemaAst } from './xsdAst';
import { parseXsd } from './xsdParser';
import {
  buildXsdSchemaProject,
  type XsdProjectBuildOptions,
} from './xsdProjectBuilder';
import basicStructure from '../../../tests/fixtures/xsd/basic-structure.xsd?raw';
import externalReferences from '../../../tests/fixtures/xsd/external-references.xsd?raw';

const options: XsdProjectBuildOptions = {
  projectId: 'safe-project',
  displayName: 'Safe project',
  sourceFileId: 'safe.xsd',
  sourceFilename: 'safe.xsd',
};

function schemaFor(source: string): XsdSchemaAst {
  const result = parseXsd(source, options.sourceFileId);
  expect(result.status).toBe('success');
  return result.schema!;
}

function deepFreeze(value: unknown, seen = new Set<object>()): void {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  Object.freeze(value);
}

function forbiddenPublicValue(
  value: unknown,
  seen = new Set<object>(),
): string | undefined {
  if (typeof value === 'function') return 'function';
  if (typeof value === 'symbol') return 'symbol';
  if (!value || typeof value !== 'object') return undefined;
  if (seen.has(value)) return 'cycle';
  seen.add(value);
  if (value instanceof Map) return 'Map';
  if (value instanceof Set) return 'Set';
  const constructor = Object.getPrototypeOf(value)?.constructor;
  if (constructor !== Object && constructor !== Array) {
    return constructor?.name ?? 'class instance';
  }
  for (const child of Object.values(value)) {
    const forbidden = forbiddenPublicValue(child, seen);
    if (forbidden) return forbidden;
  }
  seen.delete(value);
  return undefined;
}

describe('XSD project builder determinism and plain-data safety', () => {
  it.each([
    ['success', basicStructure],
    ['warnings', externalReferences],
    [
      'failure',
      '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:t="urn:t" targetNamespace="urn:t"><xs:element name="root" type="t:Missing"/></xs:schema>',
    ],
  ])('JSON serializes a %s result', (_name, source) => {
    const result = buildXsdSchemaProject(schemaFor(source), source, options);
    expect(() => JSON.stringify(result)).not.toThrow();
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it('produces deep-equal output across repeated builds', () => {
    const schema = schemaFor(basicStructure);
    expect(buildXsdSchemaProject(schema, basicStructure, options)).toEqual(
      buildXsdSchemaProject(structuredClone(schema), basicStructure, {
        ...options,
      }),
    );
  });

  it('does not mutate or retain caller-owned AST and options', () => {
    const schema = schemaFor(basicStructure);
    const schemaSnapshot = structuredClone(schema);
    const optionSnapshot = { ...options };
    deepFreeze(schema);
    deepFreeze(options);
    const result = buildXsdSchemaProject(schema, basicStructure, options);
    expect(schema).toEqual(schemaSnapshot);
    expect(options).toEqual(optionSnapshot);
    expect(result.metadataByNodeId).not.toBe(schema);
    for (const metadata of Object.values(result.metadataByNodeId)) {
      expect(
        schema.declarations.some(
          (declaration) => (declaration as unknown) === metadata,
        ),
      ).toBe(false);
    }
  });

  it('contains no function, class, Map, Set, symbol, or cycle publicly', () => {
    const result = buildXsdSchemaProject(
      schemaFor(externalReferences),
      externalReferences,
      options,
    );
    expect(forbiddenPublicValue(result)).toBeUndefined();
  });

  it('retains copied ranges instead of AST range identity', () => {
    const schema = schemaFor(basicStructure);
    const result = buildXsdSchemaProject(schema, basicStructure, options);
    expect(result.project).toBeDefined();
    const schemaNodeId = result.project!.rootNodeIds[0]!;
    const normalizedRange = result.metadataByNodeId[schemaNodeId]?.sourceRange;
    expect(normalizedRange).toEqual(schema.range);
    expect(normalizedRange).not.toBe(schema.range);
    expect(normalizedRange?.start).not.toBe(schema.range.start);
  });

  it('returns no partial project or metadata on a range failure', () => {
    const schema = schemaFor(basicStructure);
    const invalidRange: SchemaSourceRange = {
      ...schema.range,
      end: { ...schema.range.end, offset: basicStructure.length + 10 },
    };
    const result = buildXsdSchemaProject(
      { ...schema, range: invalidRange },
      basicStructure,
      options,
    );
    expect(result.project).toBeUndefined();
    expect(result.metadataByNodeId).toEqual({});
  });

  it('uses no browser, framework, store, import, DTD, or network APIs', async () => {
    const productionSources = await Promise.all([
      import('./xsdBuildDiagnostics.ts?raw').then(
        ({ default: source }) => source,
      ),
      import('./xsdProjectMetadata.ts?raw').then(
        ({ default: source }) => source,
      ),
      import('./xsdProjectBuilder.ts?raw').then(
        ({ default: source }) => source,
      ),
    ]);
    for (const source of productionSources) {
      for (const forbidden of [
        'svelte',
        'DOMParser',
        'XMLSerializer',
        'FileReader',
        'showOpenFilePicker',
        'fetch(',
        'XMLHttpRequest',
        'WebSocket',
        '/stores/',
        '/import/',
        '/ui/',
        '/dtd/',
      ]) {
        expect(source).not.toContain(forbidden);
      }
    }
  });

  it('uses no random ID generator', async () => {
    const source = await import('./xsdProjectBuilder.ts?raw').then(
      ({ default: text }) => text,
    );
    expect(source).not.toContain('Math.random');
    expect(source).not.toContain('randomUUID');
    expect(source).not.toContain('crypto.');
  });
});
