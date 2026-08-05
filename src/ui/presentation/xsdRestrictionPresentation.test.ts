import { describe, expect, it } from 'vitest';
import { importXsdSource } from '../../schema/xsd';
import enumerationsSource from '../../../tests/fixtures/xsd/simple-type-enumerations.xsd?raw';
import externalSource from '../../../tests/fixtures/xsd/external-restriction-base.xsd?raw';
import {
  formatXsdRestrictionBase,
  selectXsdRestrictionPresentation,
} from './xsdRestrictionPresentation';

function importFixture(name: string, source: string) {
  const result = importXsdSource(source, {
    projectId: `restriction-presentation:${name}`,
    displayName: name,
    sourceFileId: `${name}:source`,
    sourceFilename: `${name}.xsd`,
  });
  expect(result.status).toBe('success');
  if (result.status !== 'success') {
    throw new Error(`Expected ${name} to import.`);
  }
  return result;
}

describe('XSD restriction presentation', () => {
  it('presents built-in bases and ordered values without internal metadata', () => {
    const imported = importFixture('enumerations', enumerationsSource);
    const statusType = imported.project.nodes.find(
      ({ kind, name }) => kind === 'simpleType' && name === 'StatusType',
    )!;
    const restriction = imported.project.nodes.find(
      (node) =>
        node.kind === 'restriction' &&
        imported.project.edges.some(
          ({ kind, sourceNodeId, targetNodeId }) =>
            kind === 'contains' &&
            sourceNodeId === statusType.id &&
            targetNodeId === node.id,
        ),
    )!;
    const simplePresentation = selectXsdRestrictionPresentation(
      imported.project,
      statusType.id,
      imported.xsdMetadataByNodeId,
    );
    const restrictionPresentation = selectXsdRestrictionPresentation(
      imported.project,
      restriction.id,
      imported.xsdMetadataByNodeId,
    );

    for (const presentation of [simplePresentation, restrictionPresentation]) {
      expect(presentation?.base).toEqual({
        text: 'xs:string',
        navigable: false,
      });
      expect(
        presentation?.enumerationValues.map(
          ({ value, displayValue, accessibleLabel }) => [
            value,
            displayValue,
            accessibleLabel,
          ],
        ),
      ).toEqual([
        ['active', 'active', 'active'],
        ['paused', 'paused', 'paused'],
        ['active', 'active', 'active'],
        ['', '(empty string)', 'Empty string allowed value'],
        [
          'a-very-long-status-value-that-must-wrap-safely-in-the-inspector',
          'a-very-long-status-value-that-must-wrap-safely-in-the-inspector',
          'a-very-long-status-value-that-must-wrap-safely-in-the-inspector',
        ],
      ]);
      expect(presentation?.enumerationCount).toBe(5);
      expect(JSON.stringify(presentation)).not.toMatch(
        /sourceRange|sourceOrder|targetNodeId|resolution|offset/,
      );
    }
  });

  it('resolves a named base display name and leaves external bases inert', () => {
    const imported = importFixture('enumerations', enumerationsSource);
    const identifierType = imported.project.nodes.find(
      ({ kind, name }) => kind === 'simpleType' && name === 'IdentifierType',
    )!;
    const named = selectXsdRestrictionPresentation(
      imported.project,
      identifierType.id,
      imported.xsdMetadataByNodeId,
    );
    expect(named?.base).toMatchObject({
      text: 'BaseToken',
      navigable: true,
    });
    expect(
      imported.project.nodes.find(({ id }) => id === named?.base?.targetNodeId),
    ).toMatchObject({ kind: 'simpleType', name: 'BaseToken' });

    const external = importFixture('external', externalSource);
    const externalRestriction = external.project.nodes.find(
      ({ kind }) => kind === 'restriction',
    )!;
    expect(
      selectXsdRestrictionPresentation(
        external.project,
        externalRestriction.id,
        external.xsdMetadataByNodeId,
      )?.base,
    ).toEqual({
      text: 'ext:ExternalToken (external)',
      navigable: false,
    });
  });

  it('returns safe empty results for absent, stale, and mismatched metadata', () => {
    const imported = importFixture('safe', enumerationsSource);
    const statusType = imported.project.nodes.find(
      ({ kind, name }) => kind === 'simpleType' && name === 'StatusType',
    )!;

    expect(
      selectXsdRestrictionPresentation(imported.project, 'missing', {}),
    ).toBeUndefined();
    expect(
      selectXsdRestrictionPresentation(imported.project, statusType.id, {}),
    ).toBeUndefined();
    expect(
      selectXsdRestrictionPresentation(imported.project, statusType.id, {
        [statusType.id]: {
          ...imported.xsdMetadataByNodeId[statusType.id]!,
          kind: 'complexType',
        },
      }),
    ).toBeUndefined();
    expect(
      formatXsdRestrictionBase(imported.project, undefined),
    ).toBeUndefined();
  });
});
