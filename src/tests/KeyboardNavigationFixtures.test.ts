import { describe, expect, it } from 'vitest';
import branchingDtdSource from '../../tests/fixtures/keyboard-navigation/branching-navigation.dtd?raw';
import branchingXsdSource from '../../tests/fixtures/keyboard-navigation/branching-navigation.xsd?raw';
import { importDtdSource } from '../schema/dtd';
import { getOutgoingStructuralRelationships } from '../schema/model';
import { importXsdSource } from '../schema/xsd';

describe('Task 11.1 manual-QA fixtures', () => {
  it('imports the compact DTD with a wide root, a leaf, and a self-cycle', () => {
    const result = importDtdSource(branchingDtdSource, {
      projectId: 'fixture:keyboard:dtd',
      displayName: 'Keyboard DTD fixture',
      sourceFileId: 'fixture:keyboard:dtd:source',
      sourceFilename: 'branching-navigation.dtd',
    });

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;

    const catalog = result.project.nodes.find(({ name }) => name === 'catalog');
    const leaf = result.project.nodes.find(({ name }) => name === 'leaf');
    const recursive = result.project.nodes.find(
      ({ name }) => name === 'recursive',
    );
    expect(catalog).toBeDefined();
    expect(leaf).toBeDefined();
    expect(recursive).toBeDefined();
    expect(
      getOutgoingStructuralRelationships(result.project, catalog!.id),
    ).toHaveLength(9);
    expect(
      getOutgoingStructuralRelationships(result.project, leaf!.id),
    ).toHaveLength(0);
    expect(
      getOutgoingStructuralRelationships(result.project, recursive!.id).some(
        ({ node }) => node.id === recursive!.id,
      ),
    ).toBe(true);
  });

  it('imports the compact XSD with varied global declarations and recursive type use', () => {
    const result = importXsdSource(branchingXsdSource, {
      projectId: 'fixture:keyboard:xsd',
      displayName: 'Keyboard XSD fixture',
      sourceFileId: 'fixture:keyboard:xsd:source',
      sourceFilename: 'branching-navigation.xsd',
    });

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;

    const schema = result.project.nodes.find(({ kind }) => kind === 'schema');
    expect(schema).toBeDefined();
    expect(
      getOutgoingStructuralRelationships(result.project, schema!.id).length,
    ).toBeGreaterThan(7);
    expect(
      result.project.nodes.some(({ kind }) => kind === 'globalElement'),
    ).toBe(true);
    expect(result.project.nodes.some(({ kind }) => kind === 'simpleType')).toBe(
      true,
    );
    expect(
      result.project.nodes.some(({ kind }) => kind === 'complexType'),
    ).toBe(true);
    expect(
      result.project.edges.some(
        ({ sourceNodeId, targetNodeId }) => sourceNodeId === targetNodeId,
      ),
    ).toBe(false);
    expect(result.project.edges.some(({ kind }) => kind === 'typeOf')).toBe(
      true,
    );
  });
});
