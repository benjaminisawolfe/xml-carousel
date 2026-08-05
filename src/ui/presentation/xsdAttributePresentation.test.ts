import { describe, expect, it } from 'vitest';
import attributesSource from '../../../tests/fixtures/xsd/attributes.xsd?raw';
import externalSource from '../../../tests/fixtures/xsd/external-attribute-reference.xsd?raw';
import { importXsdSource } from '../../schema/xsd';
import {
  formatXsdAttributeType,
  selectDirectXsdAttributes,
  selectGlobalXsdAttributes,
} from './xsdAttributePresentation';

function imported(name: string, source: string) {
  const result = importXsdSource(source, {
    projectId: name,
    displayName: name,
    sourceFileId: `${name}.xsd`,
    sourceFilename: `${name}.xsd`,
  });
  expect(result.status).toBe('success');
  if (result.status !== 'success') throw new Error('Expected XSD import.');
  return result;
}

describe('XSD attribute presentation', () => {
  it('selects global attributes for Schema overview without exposing internals', () => {
    const result = imported('attributes', attributesSource);
    expect(
      selectGlobalXsdAttributes(result.project, result.xsdMetadataByNodeId),
    ).toEqual([
      {
        nodeId: expect.any(String),
        name: 'code',
        detailLines: ['xs:string', 'Global · urn:attributes', 'fixed "GLOBAL"'],
        order: expect.any(Number),
      },
    ]);
  });

  it('formats direct attributes in source order with type, use, form, constraints, and refs', () => {
    const result = imported('attributes', attributesSource);
    const complex = result.project.nodes.find(
      ({ kind, name }) => kind === 'complexType' && name === 'RootType',
    )!;
    const rows = selectDirectXsdAttributes(
      result.project,
      complex.id,
      result.xsdMetadataByNodeId,
    );

    expect(rows.map(({ name }) => name)).toEqual([
      'id',
      'status',
      'legacy',
      'lang',
      't:code',
      'rating',
    ]);
    expect(rows.map(({ detailLines }) => detailLines)).toEqual([
      ['xs:ID', 'required · unqualified'],
      ['StatusType', 'optional · unqualified · default "active"'],
      ['xs:anySimpleType', 'prohibited · unqualified'],
      ['xs:string', 'optional · qualified · fixed "en"'],
      ['Reference: t:code', 'optional'],
      ['Anonymous simple type', 'optional · unqualified'],
    ]);
  });

  it('formats external references and types without exposing resolution statuses', () => {
    const result = imported('external', externalSource);
    const complex = result.project.nodes.find(
      ({ kind }) => kind === 'complexType',
    )!;
    expect(
      selectDirectXsdAttributes(
        result.project,
        complex.id,
        result.xsdMetadataByNodeId,
      ).map(({ detailLines }) => detailLines),
    ).toEqual([
      ['Reference: ext:code · external', 'optional'],
      ['ext:ExternalSimple · external', 'optional · unqualified'],
    ]);
  });

  it('returns safe empty results for missing owners and stale metadata', () => {
    const result = imported('attributes', attributesSource);
    expect(selectDirectXsdAttributes(result.project, 'missing', {})).toEqual(
      [],
    );
    expect(selectGlobalXsdAttributes(result.project, {})).toEqual([]);
    const attribute = result.project.nodes.find(
      ({ kind }) => kind === 'attribute',
    )!;
    expect(
      formatXsdAttributeType(
        result.project,
        attribute.id,
        {
          ...result.xsdMetadataByNodeId[attribute.id]!,
          typeReference: {
            kind: 'type',
            raw: 't:missing',
            prefix: 't',
            localName: 'missing',
            namespaceUri: 'urn:attributes',
            range: result.xsdMetadataByNodeId[attribute.id]!.sourceRange,
            resolution: 'resolved',
            targetNodeId: 'missing',
          },
        },
        result.xsdMetadataByNodeId,
      ),
    ).toBe('t:missing');
  });
});
