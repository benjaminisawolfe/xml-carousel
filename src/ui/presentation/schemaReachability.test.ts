import { describe, expect, it } from 'vitest';
import { schemaPackageEntryKinds } from '../../app/import/schemaPackage/schemaPackageTypes';
import type { ProjectSearchResult } from '../../app/search';
import { schemaEdgeKinds, schemaNodeKinds } from '../../schema/model';
import { buildProjectSearchPresentation } from './projectSearchPresentation';
import {
  formatReachabilityActionLabel,
  packageEntryReachabilityContracts,
  schemaEdgeReachabilityContracts,
  schemaNodeReachabilityContracts,
  task1317PresentationRowIds,
} from './schemaReachability';

describe('Task 13.17 reachability contract', () => {
  it('records the exact 16 authoritative presentation rows deterministically', () => {
    expect(task1317PresentationRowIds).toHaveLength(16);
    expect(new Set(task1317PresentationRowIds).size).toBe(16);
    expect([...task1317PresentationRowIds]).toEqual(
      [...task1317PresentationRowIds].sort(),
    );
  });

  it('gives every supported normalized node kind an explicit complete UI route', () => {
    expect(Object.keys(schemaNodeReachabilityContracts).sort()).toEqual(
      [...schemaNodeKinds].sort(),
    );

    for (const kind of schemaNodeKinds) {
      const contract = schemaNodeReachabilityContracts[kind];
      expect(contract.kind).toBe(kind);
      expect(contract.kindLabel.trim()).not.toBe('');
      expect(contract.primaryRoute).toMatch(/^(navigation|search|inspector)$/u);
      expect(contract.search.availability).toBe('direct');
      expect(['center', 'inspect']).toContain(contract.search.action);
      expect(
        contract.carousel.action === 'center'
          ? contract.carousel.target
          : contract.carousel.availability,
      ).toBe(
        contract.carousel.action === 'center'
          ? 'schema-node'
          : 'not-applicable',
      );
      expect(contract.inspector).toEqual({
        availability: 'direct',
        action: 'inspect',
        target: 'node-inspector',
        focusResult: 'inspector-heading',
      });
      if (kind === 'builtInType') {
        expect(contract.sourceView).toEqual({
          availability: 'not-applicable',
          action: 'not-applicable',
          target: 'standard-reference',
          focusResult: 'not-applicable',
        });
      } else {
        expect(contract.sourceView).toEqual({
          availability: 'direct',
          action: 'open-source',
          target: 'node-source-markup',
          focusResult: 'source-markup',
        });
      }
    }
  });

  it('keeps declarations and references explicit in user-facing kind labels', () => {
    const declarationKinds = [
      'globalElement',
      'localElement',
      'complexType',
      'simpleType',
      'attribute',
      'attributeGroup',
      'group',
      'identityConstraint',
      'xsdNotation',
      'dtdElement',
      'dtdAttribute',
      'dtdEntity',
      'dtdParameterEntity',
      'dtdNotation',
    ] as const;
    const referenceKinds = [
      'elementReference',
      'attributeReference',
      'attributeGroupReference',
      'groupReference',
      'dtdElementReference',
    ] as const;

    for (const kind of declarationKinds) {
      expect(schemaNodeReachabilityContracts[kind].kindLabel).toMatch(
        /declaration/u,
      );
    }
    for (const kind of referenceKinds) {
      expect(schemaNodeReachabilityContracts[kind].kindLabel).toMatch(
        /reference/u,
      );
    }
    expect(schemaNodeReachabilityContracts.xsdAppInfo.kindLabel).toContain(
      'Preserved',
    );
    expect(schemaNodeReachabilityContracts.xsdForeignElement.kindLabel).toBe(
      'Preserved uninterpreted foreign element',
    );
    expect(schemaNodeReachabilityContracts.builtInType.kindLabel).toContain(
      'XML Schema',
    );
  });

  it('gives every edge kind a precise relationship contract', () => {
    expect(Object.keys(schemaEdgeReachabilityContracts).sort()).toEqual(
      [...schemaEdgeKinds].sort(),
    );

    for (const kind of schemaEdgeKinds) {
      const contract = schemaEdgeReachabilityContracts[kind];
      expect(contract.kind).toBe(kind);
      expect(contract.relationshipLabel.trim()).not.toBe('');
      expect(contract.relationshipLabel).not.toMatch(
        /^(destination|related|relationship)$/iu,
      );
      expect(contract.inspector).toBe('direct');
      expect(contract.sourceView).toBe('contextual');
    }
  });

  it('keeps package records discoverable without fabricating carousel nodes', () => {
    expect(Object.keys(packageEntryReachabilityContracts).sort()).toEqual(
      [...schemaPackageEntryKinds].sort(),
    );

    for (const kind of schemaPackageEntryKinds) {
      const contract = packageEntryReachabilityContracts[kind];
      expect(contract.primaryRoute).toBe('packageInventory');
      expect(contract.search.action).toBe('open-package-entry');
      expect(contract.carousel).toEqual({
        availability: 'not-applicable',
        action: 'not-applicable',
        target: 'not-applicable',
        focusResult: 'not-applicable',
      });
    }
    expect(packageEntryReachabilityContracts.directory.sourceView).toEqual({
      availability: 'not-applicable',
      action: 'not-applicable',
      target: 'not-applicable',
      focusResult: 'not-applicable',
    });
  });

  it('presents every searchable node kind with a truthful action and accessible name', () => {
    const results: ProjectSearchResult[] = schemaNodeKinds.map(
      (nodeKind, index) => ({
        id: `result:${nodeKind}`,
        resultKind: 'schema-node',
        nodeId: `node:${nodeKind}`,
        nodeKind,
        nodeCategory: 'other',
        nodeName: `${nodeKind} ${index}`,
        score: 1_000,
        matches: [
          {
            fieldId: `field:${nodeKind}`,
            fieldKind: 'name',
            text: `${nodeKind} ${index}`,
          },
        ],
      }),
    );
    const presentation = buildProjectSearchPresentation('kind', results);
    expect(presentation.status).toBe('results');
    if (presentation.status !== 'results') return;

    const presented = presentation.groups.flatMap(({ results }) => results);
    expect(presented).toHaveLength(schemaNodeKinds.length);
    for (const result of presented) {
      const contract = schemaNodeReachabilityContracts[result.nodeKind!];
      expect(result.primaryAction).toBe(contract.search.action);
      expect(result.secondaryAction).toBe(
        contract.search.action === 'center' ? 'inspect' : undefined,
      );
      expect(result.primaryActionLabel).toBe(
        formatReachabilityActionLabel(
          contract.search.action,
          result.name,
          result.kindLabel,
        ),
      );
      if (contract.search.action === 'center') {
        expect(result.secondaryActionLabel).toBe(
          formatReachabilityActionLabel(
            'inspect',
            result.name,
            result.kindLabel,
          ),
        );
      } else {
        expect(result.secondaryActionLabel).toBeUndefined();
      }
    }
  });

  it('makes inspector-first and source-oriented kinds explicitly non-carousel', () => {
    for (const kind of [
      'facet',
      'enumeration',
      'builtInType',
      'xsdAnnotation',
      'xsdDocumentation',
      'xsdAppInfo',
      'xsdForeignElement',
      'xsdComment',
      'xsdProcessingInstruction',
      'xsdProlog',
      'dtdComment',
      'dtdProcessingInstruction',
    ] as const) {
      const contract = schemaNodeReachabilityContracts[kind];
      expect(contract.primaryRoute).toBe('inspector');
      expect(contract.search.action).toBe('inspect');
      expect(contract.navigation.action).toBe('inspect');
      expect(contract.carousel.availability).toBe('not-applicable');
      expect(contract.inspector.target).toBe('node-inspector');
    }
  });
});
