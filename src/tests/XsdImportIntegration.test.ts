import { describe, expect, it } from 'vitest';
import { importXsdSource } from '../schema/xsd';
import basicStructure from '../../tests/fixtures/xsd/basic-structure.xsd?raw';
import externalReferences from '../../tests/fixtures/xsd/external-references.xsd?raw';
import malformedXml from '../../tests/fixtures/xsd/malformed-xml.xsd?raw';
import noTargetReferences from '../../tests/fixtures/xsd/no-target-references.xsd?raw';
import sameDocumentReferences from '../../tests/fixtures/xsd/same-document-references.xsd?raw';
import unsupportedComponents from '../../tests/fixtures/xsd/unsupported-components.xsd?raw';

function options(name: string) {
  return {
    projectId: `xsd:${name}`,
    displayName: name,
    sourceFileId: `${name}:source`,
    sourceFilename: `${name}.xsd`,
  };
}

describe('real XSD import pipeline', () => {
  it.each([
    ['basic', basicStructure],
    ['same-document', sameDocumentReferences],
    ['no-target', noTargetReferences],
  ])('imports the %s fixture with exact source identity', (name, source) => {
    const result = importXsdSource(source, options(name));
    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.project.sourceFiles).toEqual([
      { id: `${name}:source`, filename: `${name}.xsd` },
    ]);
    expect(result.project.rootNodeIds).toHaveLength(1);
    expect(
      result.project.nodes.find(
        ({ id }) => id === result.project.rootNodeIds[0],
      )?.kind,
    ).toBe('schema');
    expect(
      result.project.nodes.find(({ id }) => id === result.initialFocusNodeId)
        ?.kind,
    ).toBe('globalElement');
    expect(Object.keys(result.xsdMetadataByNodeId).length).toBe(
      result.project.nodes.length,
    );
  });

  it('keeps external builder warnings nonfatal without placeholder edges', () => {
    const result = importXsdSource(externalReferences, options('external'));
    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.diagnostics.map(({ stage }) => stage)).toContain('build');
    expect(
      result.diagnostics.every(({ severity }) => severity === 'warning'),
    ).toBe(true);
    expect(
      result.project.edges.some(({ targetNodeId }) =>
        targetNodeId.includes('External'),
      ),
    ).toBe(false);
  });

  it('extracts include and import relationships without implementation warnings', () => {
    const result = importXsdSource(
      unsupportedComponents,
      options('unsupported'),
    );
    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.diagnostics).toEqual([]);
    expect(result.project.nodes.map(({ kind }) => kind)).toEqual(
      expect.arrayContaining(['include', 'import']),
    );
  });

  it('returns no partial graph for malformed XML', () => {
    const result = importXsdSource(malformedXml, options('malformed'));
    expect(result.status).toBe('failure');
    expect(result.diagnostics.some(({ stage }) => stage === 'xml')).toBe(true);
    expect(result).not.toHaveProperty('project');
    expect(result).not.toHaveProperty('xsdMetadataByNodeId');
  });

  it('fails unresolved same-document references at the build stage', () => {
    const source =
      '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:t="urn:t" targetNamespace="urn:t"><xs:element name="root" type="t:Missing"/></xs:schema>';
    const result = importXsdSource(source, options('unresolved'));
    expect(result.status).toBe('failure');
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        stage: 'build',
        code: 'unresolved-type-reference',
        severity: 'error',
      }),
    ]);
  });

  it('retains no AST, XML document, or full source field', () => {
    const result = importXsdSource(basicStructure, options('safe'));
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('"document"');
    expect(serialized).not.toContain('"sourceText"');
    expect(serialized).not.toContain('"namespaceBindings"');
  });
});
