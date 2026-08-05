import { describe, expect, it } from 'vitest';
import { bookDtdProject } from '../samples/bookDtdProject';
import { importXsdSource } from './xsdImport';
import { selectLikelyDocumentElementIds } from './xsdQueries';

const schemaStart =
  '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:t="urn:test" targetNamespace="urn:test">';
const schemaEnd = '</xs:schema>';

function importSource(name: string, body: string) {
  const result = importXsdSource(`${schemaStart}${body}${schemaEnd}`, {
    projectId: `query:${name}`,
    displayName: name,
    sourceFileId: `${name}:source`,
    sourceFilename: `${name}.xsd`,
  });
  expect(result.status).toBe('success');
  if (result.status !== 'success') {
    throw new Error(`Expected ${name} to import successfully.`);
  }
  return result;
}

function candidateNames(name: string, body: string): readonly string[] {
  const imported = importSource(name, body);
  const ids = selectLikelyDocumentElementIds(
    imported.project,
    imported.xsdMetadataByNodeId,
  );
  return ids.map(
    (id) => imported.project.nodes.find((node) => node.id === id)!.name,
  );
}

describe('likely XSD document elements', () => {
  it('returns one global element and preserves multiple globals in source order', () => {
    expect(candidateNames('one', '<xs:element name="root"/>')).toEqual([
      'root',
    ]);
    expect(
      candidateNames(
        'several',
        '<xs:element name="zeta"/><xs:element name="alpha"/><xs:element name="middle"/>',
      ),
    ).toEqual(['zeta', 'alpha', 'middle']);
  });

  it('excludes a helper global referenced beneath another global', () => {
    expect(
      candidateNames(
        'helper',
        '<xs:element name="root"><xs:complexType><xs:sequence><xs:element ref="t:helper"/></xs:sequence></xs:complexType></xs:element><xs:element name="helper"/>',
      ),
    ).toEqual(['root']);
  });

  it('does not disqualify a self-recursive global', () => {
    expect(
      candidateNames(
        'self',
        '<xs:element name="node"><xs:complexType><xs:sequence><xs:element ref="t:node" minOccurs="0"/></xs:sequence></xs:complexType></xs:element>',
      ),
    ).toEqual(['node']);
  });

  it('returns no candidate for mutually recursive globals', () => {
    expect(
      candidateNames(
        'mutual',
        '<xs:element name="one"><xs:complexType><xs:sequence><xs:element ref="t:two"/></xs:sequence></xs:complexType></xs:element><xs:element name="two"><xs:complexType><xs:sequence><xs:element ref="t:one"/></xs:sequence></xs:complexType></xs:element>',
      ),
    ).toEqual([]);
  });

  it('traverses a shared named type once per outer global and excludes its helper', () => {
    expect(
      candidateNames(
        'shared',
        '<xs:element name="first" type="t:Shared"/><xs:element name="second" type="t:Shared"/><xs:element name="helper"/><xs:complexType name="Shared"><xs:sequence><xs:element ref="t:helper"/></xs:sequence></xs:complexType>',
      ),
    ).toEqual(['first', 'second']);
  });

  it('handles repeated references without changing the result', () => {
    expect(
      candidateNames(
        'repeated',
        '<xs:element name="root"><xs:complexType><xs:sequence><xs:element ref="t:helper"/><xs:element ref="t:helper"/></xs:sequence></xs:complexType></xs:element><xs:element name="helper"/>',
      ),
    ).toEqual(['root']);
  });

  it('returns no candidates for no globals, stale metadata, or a DTD project', () => {
    expect(
      candidateNames(
        'none',
        '<xs:complexType name="OnlyType"><xs:sequence/></xs:complexType>',
      ),
    ).toEqual([]);

    const imported = importSource('stale', '<xs:element name="root"/>');
    expect(selectLikelyDocumentElementIds(imported.project, {})).toEqual([]);
    expect(selectLikelyDocumentElementIds(bookDtdProject, {})).toEqual([]);
  });

  it('is deterministic, cycle-safe, and does not mutate project or metadata', () => {
    const imported = importSource(
      'stable',
      '<xs:element name="node"><xs:complexType><xs:sequence><xs:element ref="t:node"/><xs:element ref="t:helper"/></xs:sequence></xs:complexType></xs:element><xs:element name="helper"/>',
    );
    const before = JSON.stringify(imported);

    const first = selectLikelyDocumentElementIds(
      imported.project,
      imported.xsdMetadataByNodeId,
    );
    const second = selectLikelyDocumentElementIds(
      imported.project,
      imported.xsdMetadataByNodeId,
    );

    expect(first).toEqual(second);
    expect(
      first.map(
        (id) => imported.project.nodes.find((node) => node.id === id)!.name,
      ),
    ).toEqual(['node']);
    expect(JSON.stringify(imported)).toBe(before);
  });
});
