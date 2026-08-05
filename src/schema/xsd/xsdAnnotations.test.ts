import { describe, expect, it } from 'vitest';
import annotatedSource from '../../../tests/fixtures/xsd/annotations.xsd?raw';
import errorSource from '../../../tests/fixtures/xsd/annotation-errors.xsd?raw';
import {
  buildXsdSchemaProject,
  importXsdSource,
  parseXsd,
  type XsdAnnotationAst,
  type XsdMetadataByNodeId,
  type XsdSchemaAst,
} from './index';
import type { SchemaNode, SchemaProject } from '../model';

const options = {
  projectId: 'annotations',
  displayName: 'Annotations',
  sourceFileId: 'annotations.xsd',
  sourceFilename: 'annotations.xsd',
};

function parsedSchema(): XsdSchemaAst {
  const parsed = parseXsd(annotatedSource, options.sourceFileId);
  expect(parsed.status).toBe('success');
  expect(parsed.diagnostics).toEqual([]);
  expect(parsed.schema).toBeDefined();
  return parsed.schema!;
}

function imported(): {
  readonly project: SchemaProject;
  readonly metadata: XsdMetadataByNodeId;
} {
  const result = importXsdSource(annotatedSource, options);
  expect(result.status).toBe('success');
  if (result.status !== 'success') {
    throw new Error('Expected the annotation fixture to import.');
  }
  return {
    project: result.project,
    metadata: result.xsdMetadataByNodeId,
  };
}

function nodeByName(
  project: SchemaProject,
  name: string,
  kind?: SchemaNode['kind'],
): SchemaNode {
  const node = project.nodes.find(
    (candidate) =>
      candidate.name === name &&
      (kind === undefined || candidate.kind === kind),
  );
  if (!node) throw new Error(`Expected ${kind ?? 'node'} ${name}.`);
  return node;
}

function annotationsFor(
  project: SchemaProject,
  metadata: XsdMetadataByNodeId,
  name: string,
  kind?: SchemaNode['kind'],
) {
  return metadata[nodeByName(project, name, kind).id]?.annotations ?? [];
}

function allObjectKeys(value: unknown): string[] {
  if (!value || typeof value !== 'object') return [];
  const keys: string[] = [];
  if (Array.isArray(value)) {
    for (const nested of value) keys.push(...allObjectKeys(nested));
    return keys;
  }
  for (const [key, nested] of Object.entries(value)) {
    keys.push(key, ...allObjectKeys(nested));
  }
  return keys;
}

describe('XSD annotation AST projection', () => {
  it('preserves combined source order, exact XML, mixed text, language, source, and content ranges', () => {
    const schema = parsedSchema();
    expect(schema.annotations).toHaveLength(1);
    const annotation = schema.annotations[0]!;
    expect(annotation.entries.map(({ kind }) => kind)).toEqual([
      'documentation',
      'appInfo',
      'documentation',
      'appInfo',
      'documentation',
    ]);
    expect(annotation.rawXml).toBe(
      annotatedSource.slice(
        annotation.range.start.offset,
        annotation.range.end.offset,
      ),
    );

    const documentation = annotation.entries[0]!;
    expect(documentation).toMatchObject({
      kind: 'documentation',
      text: 'Defines the persistent identity, exactly. Use <literal> as text. Entity & decoded.',
      xmlLang: { value: 'en', lexicalValue: 'en' },
      source: { value: 'docs/schema', lexicalValue: 'docs/schema' },
    });
    expect(documentation.rawXml).toBe(
      annotatedSource.slice(
        documentation.range.start.offset,
        documentation.range.end.offset,
      ),
    );
    expect(
      annotatedSource.slice(
        documentation.contentRange.start.offset,
        documentation.contentRange.end.offset,
      ),
    ).toContain('<m:em importance="high">persistent identity</m:em>');
    expect(documentation.text).not.toContain('ignored');

    const appInfo = annotation.entries[1]!;
    expect(appInfo).toMatchObject({
      kind: 'appInfo',
      text: 'alpha',
      source: { value: 'tool/schema', lexicalValue: 'tool/schema' },
    });
    expect(appInfo.rawXml).toContain(
      '<m:config enabled="true"><![CDATA[alpha]]><!-- preserved raw --></m:config>',
    );
    expect(annotation.entries[3]?.text).toBe('');
    expect(annotation.entries[4]?.text).toBe('');
    expect(annotation.entries[3]?.contentRange.start.offset).toBe(
      annotation.entries[3]?.contentRange.end.offset,
    );
    expect(annotation.entries[4]?.contentRange.start.offset).toBe(
      annotation.entries[4]?.contentRange.end.offset,
    );
    expect(
      annotation.entries.every(
        (entry, index, entries) =>
          index === 0 || entries[index - 1]!.sourceOrder < entry.sourceOrder,
      ),
    ).toBe(true);
    expect(JSON.parse(JSON.stringify(schema))).toEqual(schema);
  });

  it('recognizes only XML-namespace lang and unqualified source attributes', () => {
    const source =
      '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:m="urn:m"><xs:annotation><xs:documentation lang="plain" m:source="namespaced">text</xs:documentation><xs:appinfo m:source="namespaced"/></xs:annotation></xs:schema>';
    const parsed = parseXsd(source, 'namespaced-attributes.xsd');
    expect(parsed.status).toBe('success');
    const entries = parsed.schema?.annotations[0]?.entries ?? [];
    expect(entries[0]).toMatchObject({ kind: 'documentation', text: 'text' });
    expect(
      entries[0]?.kind === 'documentation' ? entries[0].xmlLang : undefined,
    ).toBeUndefined();
    expect(entries[0]?.source).toBeUndefined();
    expect(entries[1]?.source).toBeUndefined();
  });

  it('exposes immutable annotation arrays on every representative supported component', () => {
    const schema = parsedSchema();
    const globalAttribute = schema.declarations.find(
      ({ kind }) => kind === 'globalAttribute',
    )!;
    const simpleType = schema.declarations.find(
      ({ kind, name }) => kind === 'simpleType' && name === 'StatusType',
    );
    const baseType = schema.declarations.find(
      ({ kind, name }) => kind === 'complexType' && name === 'BaseType',
    );
    const extendedType = schema.declarations.find(
      ({ kind, name }) => kind === 'complexType' && name === 'ExtendedType',
    );
    const restrictedType = schema.declarations.find(
      ({ kind, name }) => kind === 'complexType' && name === 'RestrictedType',
    );
    const root = schema.declarations.find(
      ({ kind, name }) => kind === 'globalElement' && name === 'root',
    )!;
    if (
      simpleType?.kind !== 'simpleType' ||
      baseType?.kind !== 'complexType' ||
      extendedType?.kind !== 'complexType' ||
      restrictedType?.kind !== 'complexType'
    ) {
      throw new Error('Expected representative annotation declarations.');
    }
    const localElement = baseType.compositor?.members[0];
    if (localElement?.kind !== 'localElement') {
      throw new Error('Expected annotated local element.');
    }

    expect([
      schema.annotations.length,
      globalAttribute.annotations.length,
      simpleType.annotations.length,
      simpleType.restriction?.annotations.length,
      simpleType.restriction?.enumerations[0]?.annotations.length,
      baseType.annotations.length,
      baseType.compositor?.annotations.length,
      localElement.annotations.length,
      localElement.anonymousSimpleType?.annotations.length,
      localElement.anonymousSimpleType?.restriction?.annotations.length,
      localElement.anonymousSimpleType?.restriction?.enumerations[0]
        ?.annotations.length,
      baseType.attributes[0]?.annotations.length,
      extendedType.annotations.length,
      extendedType.complexContent?.annotations.length,
      extendedType.complexContent?.derivation?.annotations.length,
      extendedType.complexContent?.derivation?.attributes[0]?.annotations
        .length,
      restrictedType.complexContent?.derivation?.annotations.length,
      root.annotations.length,
    ]).toEqual(new Array(18).fill(1));
    expect(simpleType.restriction?.enumerations[1]?.annotations).toEqual([]);
  });

  it('diagnoses malformed placement while preserving annotations and deferred XML without throwing', () => {
    const parsed = parseXsd(errorSource, 'annotation-errors.xsd');
    expect(parsed.status).toBe('failure');
    const codes = parsed.diagnostics.map(({ code }) => code);
    expect(codes).toEqual(
      expect.arrayContaining([
        'invalid-annotation-placement',
        'invalid-documentation-placement',
        'invalid-appinfo-placement',
        'unsupported-xsd-component',
      ]),
    );
    expect(parsed.schema?.annotations).toHaveLength(2);
    expect(parsed.schema?.annotations[0]?.deferredComponents).toMatchObject([
      { localName: 'unsupported', reason: 'unsupported-xsd' },
      { localName: 'foreign', reason: 'foreign' },
    ]);
    const late = parsed.schema?.declarations.find(
      ({ kind, name }) => kind === 'complexType' && name === 'Late',
    );
    expect(late?.annotations[0]?.entries[0]).toMatchObject({
      kind: 'documentation',
      text: 'Late but preserved.',
    });
    expect(late?.deferredComponents.map(({ localName }) => localName)).toEqual(
      expect.arrayContaining(['documentation', 'appinfo']),
    );
  });
});

describe('XSD annotation normalized metadata', () => {
  it('attaches annotations to the nearest normalized owners and forwards wrapper/facet annotations once', () => {
    const { project, metadata } = imported();
    const schema = project.nodes.find(({ kind }) => kind === 'schema')!;
    expect(metadata[schema.id]?.annotations).toHaveLength(1);
    expect(
      annotationsFor(project, metadata, 'globalCode', 'attribute')[0]
        ?.entries[0],
    ).toMatchObject({ kind: 'appInfo', text: 'global attribute metadata' });
    expect(
      annotationsFor(project, metadata, 'StatusType', 'simpleType')[0]
        ?.entries[0],
    ).toMatchObject({ text: 'Allowed status values.' });
    expect(
      annotationsFor(
        project,
        metadata,
        'Restriction of StatusType',
        'restriction',
      ).map(({ entries }) => entries[0]?.text),
    ).toEqual(['Restriction documentation.', '']);
    expect(
      annotationsFor(project, metadata, 'BaseType', 'complexType')[0]
        ?.entries[0]?.text,
    ).toBe('Base type documentation.');
    expect(
      annotationsFor(project, metadata, 'sequence', 'sequence')[0]?.entries[0]
        ?.text,
    ).toBe('Base sequence documentation.');
    expect(
      annotationsFor(project, metadata, 'child', 'localElement')[0]?.entries[0]
        ?.text,
    ).toBe('Local child documentation.');
    expect(
      annotationsFor(project, metadata, 'localCode', 'attribute')[0]?.entries[0]
        ?.text,
    ).toBe('Local attribute documentation.');
    expect(
      annotationsFor(project, metadata, 'ExtendedType', 'complexType').map(
        ({ entries }) => entries[0]?.text,
      ),
    ).toEqual([
      'Extended type documentation.',
      'Complex-content documentation.',
    ]);
    expect(
      annotationsFor(
        project,
        metadata,
        'Extension of ExtendedType',
        'extension',
      )[0]?.entries[0]?.text,
    ).toBe('Extension documentation.');
    expect(
      annotationsFor(
        project,
        metadata,
        'Restriction of RestrictedType',
        'restriction',
      )[0]?.entries[0]?.text,
    ).toBe('Complex restriction documentation.');

    const parsedAnnotationCount = (
      annotatedSource.match(/<xs:annotation\b/g) ?? []
    ).length;
    const attachedAnnotationCount = Object.values(metadata).reduce(
      (count, value) => count + (value.annotations?.length ?? 0),
      0,
    );
    expect(attachedAnnotationCount).toBe(parsedAnnotationCount);
  });

  it('keeps annotation metadata plain, deterministic, serializable, and graph-reachable', () => {
    const first = imported();
    const second = imported();
    expect(second).toEqual(first);
    expect(JSON.parse(JSON.stringify(first.metadata))).toEqual(first.metadata);
    expect(allObjectKeys(first.metadata)).not.toContain('document');
    expect(
      first.project.nodes.some(({ kind }) =>
        ['xsdAnnotation', 'xsdDocumentation', 'xsdAppInfo'].includes(kind),
      ),
    ).toBe(true);
    expect(
      first.project.edges.some(({ kind }) =>
        ['ownsAnnotation', 'ownsAnnotationEntry'].includes(kind),
      ),
    ).toBe(true);
  });

  it('rejects inconsistent raw XML and content ranges with deterministic build diagnostics', () => {
    const schema = JSON.parse(JSON.stringify(parsedSchema())) as XsdSchemaAst;
    const mutable = schema as unknown as {
      annotations: Array<
        XsdAnnotationAst & {
          rawXml: string;
          entries: Array<{
            rawXml: string;
            contentRange: XsdSchemaAst['range'];
          }>;
        }
      >;
    };
    mutable.annotations[0]!.rawXml = '<wrong/>';
    mutable.annotations[0]!.entries[0]!.rawXml = '<wrong-entry/>';
    mutable.annotations[0]!.entries[0]!.contentRange = schema.range;
    const built = buildXsdSchemaProject(schema, annotatedSource, options);
    expect(built.project).toBeUndefined();
    expect(built.diagnostics.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        'raw-xml-range-mismatch',
        'invalid-content-range',
      ]),
    );
  });

  it('diagnoses malformed annotation arrays instead of throwing', () => {
    const schema = JSON.parse(JSON.stringify(parsedSchema())) as XsdSchemaAst;
    delete (schema as unknown as { annotations?: unknown }).annotations;
    expect(() =>
      buildXsdSchemaProject(schema, annotatedSource, options),
    ).not.toThrow();
    const built = buildXsdSchemaProject(schema, annotatedSource, options);
    expect(built.project).toBeUndefined();
    expect(built.diagnostics.map(({ code }) => code)).toContain(
      'missing-required-ast-value',
    );
  });

  it('activates warning-only annotation children without creating placeholders', () => {
    const source =
      '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:annotation><xs:documentation>usable</xs:documentation><xs:future/></xs:annotation><xs:element name="root"/></xs:schema>';
    const result = importXsdSource(source, {
      ...options,
      projectId: 'warning-annotations',
      sourceFileId: 'warning-annotations.xsd',
      sourceFilename: 'warning-annotations.xsd',
    });
    expect(result.status).toBe('success');
    if (result.status !== 'success') {
      throw new Error('Expected warning-only annotations to activate.');
    }
    expect(result.diagnostics).toMatchObject([
      {
        code: 'unsupported-xsd-component',
        severity: 'warning',
      },
    ]);
    const schema = result.project.nodes.find(({ kind }) => kind === 'schema')!;
    expect(
      result.xsdMetadataByNodeId[schema.id]?.annotations?.[0]?.entries[0],
    ).toMatchObject({ kind: 'documentation', text: 'usable' });
    expect(result.project.nodes.some(({ name }) => name === 'future')).toBe(
      false,
    );
  });
});
