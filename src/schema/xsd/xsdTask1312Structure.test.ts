import { describe, expect, it } from 'vitest';
import source from '../../../tests/fixtures/xsd/task-13.12-structural.xsd?raw';
import {
  getOutgoingStructuralRelationships,
  getNodesByKind,
  validateSchemaProject,
} from '../model';
import { buildProjectSearchIndex } from '../../app/search/projectSearchIndex';
import { selectXsdNavigationGroups } from '../../ui/presentation/xsdMetadataPresentation';
import { importXsdSource } from './xsdImport';

const options = {
  projectId: 'task-13.12-structural',
  displayName: 'Task 13.12 structural fixture',
  sourceFileId: 'task-13.12-structural.xsd',
  sourceFilename: 'task-13.12-structural.xsd',
  standardsAccepted: true,
} as const;

function imported() {
  const result = importXsdSource(source, options);
  expect(result.status).toBe('success');
  if (result.status !== 'success') throw new Error('Fixture import failed.');
  return result;
}

describe('Task 13.12 complete XSD structural normalization', () => {
  it('retains definitions, references, content wrappers, wildcards, and exact particle kinds', () => {
    const result = imported();
    const expectedKinds = [
      'schema',
      'globalElement',
      'localElement',
      'elementReference',
      'complexType',
      'simpleType',
      'attribute',
      'attributeReference',
      'attributeGroup',
      'attributeGroupReference',
      'group',
      'groupReference',
      'sequence',
      'choice',
      'all',
      'simpleContent',
      'complexContent',
      'elementWildcard',
      'attributeWildcard',
      'extension',
      'restriction',
    ] as const;
    for (const kind of expectedKinds) {
      expect(getNodesByKind(result.project, kind).length, kind).toBeGreaterThan(
        0,
      );
    }
    expect(validateSchemaProject(result.project)).toEqual([]);
    expect(result.visualization.summary.totalFindingCount).toBe(0);
    expect(Object.keys(result.sourceMarkupByNodeId)).toHaveLength(
      result.project.nodes.filter(({ kind }) => kind !== 'builtInType').length,
    );
  });

  it('preserves structural controls, owners, wildcard rules, and use-site occurrence', () => {
    const result = imported();
    const metadata = Object.values(result.xsdMetadataByNodeId);
    expect(metadata.find(({ kind }) => kind === 'schema')).toMatchObject({
      elementFormDefault: 'qualified',
      attributeFormDefault: 'unqualified',
      block: ['#all'],
      final: ['extension', 'restriction', 'list', 'union'],
    });
    expect(
      metadata.find(
        ({ kind, declarationRole }) =>
          kind === 'globalElement' && declarationRole === 'declaration',
      ),
    ).toBeDefined();
    expect(
      metadata.find(({ kind }) => kind === 'elementReference'),
    ).toMatchObject({
      declarationRole: 'reference',
      occurrence: { min: 0, max: 'unbounded' },
    });
    expect(
      metadata.find(({ kind }) => kind === 'groupReference'),
    ).toMatchObject({
      declarationRole: 'reference',
      occurrence: { min: 1, max: 3 },
      groupReference: { resolution: 'resolved', raw: 't:contentGroup' },
    });
    expect(
      metadata.find(({ kind }) => kind === 'attributeGroupReference'),
    ).toMatchObject({
      declarationRole: 'reference',
      attributeGroupReference: {
        resolution: 'resolved',
        raw: 't:commonAttributes',
      },
    });
    expect(metadata.filter(({ kind }) => kind === 'elementWildcard')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          wildcardNamespace: ['##local', 'urn:other'],
          processContents: 'skip',
        }),
        expect.objectContaining({
          wildcardNamespace: ['##targetNamespace'],
          processContents: 'strict',
        }),
        expect.objectContaining({
          wildcardNamespace: ['##any'],
          processContents: 'lax',
        }),
        expect.objectContaining({
          wildcardNamespace: ['##other'],
          processContents: 'lax',
        }),
      ]),
    );
  });

  it('exposes complete navigation, Search, inspector facts, and bounded structural routes', () => {
    const result = imported();
    const groups = selectXsdNavigationGroups(
      result.project,
      result.xsdMetadataByNodeId,
    );
    expect(groups.globalAttributes).toHaveLength(1);
    expect(groups.modelGroups).toHaveLength(1);
    expect(groups.attributeGroups).toHaveLength(1);
    const search = buildProjectSearchIndex({
      project: result.project,
      sourceFilename: options.sourceFilename,
      xsdMetadataByNodeId: result.xsdMetadataByNodeId,
    });
    expect(search.documents).toHaveLength(result.project.nodes.length);
    expect(
      search.documents.some(({ fields }) =>
        fields.some(({ text }) => text === 't:contentGroup'),
      ),
    ).toBe(true);
    const groupReference = getNodesByKind(result.project, 'groupReference')[0]!;
    expect(groupReference.properties).toEqual(
      expect.arrayContaining([
        { label: 'Role', value: 'Reference' },
        { label: 'Occurs', value: '1..3' },
      ]),
    );
    expect(
      getOutgoingStructuralRelationships(result.project, groupReference.id).map(
        ({ edge }) => edge.kind,
      ),
    ).toEqual(expect.arrayContaining(['usesGroup', 'referencesDeclaration']));
  });

  it('is plain, deterministic, source-aware, and worker-serializable', () => {
    const first = imported();
    const second = imported();
    expect(second).toEqual(first);
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
    expect(new Set(first.project.nodes.map(({ id }) => id)).size).toBe(
      first.project.nodes.length,
    );
    expect(
      first.project.nodes.every(
        ({ kind, sourceFileId }) =>
          kind === 'builtInType' || sourceFileId === options.sourceFileId,
      ),
    ).toBe(true);
  });
});
