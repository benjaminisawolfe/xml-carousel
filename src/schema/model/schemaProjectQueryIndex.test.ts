import { describe, expect, it } from 'vitest';
import type { SchemaNode } from './SchemaNode';
import type { SchemaProject } from './SchemaProject';
import { generateLargeDtdProject } from '../../tests/largeSchemaTestData';
import {
  clearSchemaProjectQueryIndexForTests,
  getSchemaProjectQueryIndexBuildCountForTests,
  getIncomingEdges,
  getNodesByKind,
  getOutgoingEdges,
  getSchemaEdge,
  getSchemaNode,
  primeSchemaProjectQueryIndex,
} from './index';

function project(nodeCount: number, edgeCount: number): SchemaProject {
  const nodes: SchemaNode[] = Array.from({ length: nodeCount }, (_, index) => ({
    id: `node:${index}`,
    kind: index % 2 === 0 ? 'dtdElement' : 'dtdAttribute',
    name: `node-${index}`,
    sourceOrder: nodeCount - index,
  }));
  const edges = Array.from({ length: edgeCount }, (_, index) => ({
    id: `edge:${index}`,
    kind: 'contains' as const,
    sourceNodeId: `node:${index % nodeCount}`,
    targetNodeId: `node:${(index + 1) % nodeCount}`,
    order: edgeCount - index,
  }));
  return {
    id: `project:${nodeCount}:${edgeCount}`,
    displayName: 'Query fixture',
    nodes,
    edges,
    rootNodeIds: ['node:0'],
  };
}

describe('schema project query index', () => {
  it('builds once, preserves identity and ordering, and returns fresh arrays', () => {
    const fixture = project(10, 30);
    clearSchemaProjectQueryIndexForTests(fixture);
    primeSchemaProjectQueryIndex(fixture);

    expect(getSchemaNode(fixture, 'node:3')).toBe(fixture.nodes[3]);
    expect(getSchemaEdge(fixture, 'edge:3')).toBe(fixture.edges[3]);
    const first = getNodesByKind(fixture, 'dtdElement');
    const second = getNodesByKind(fixture, 'dtdElement');
    expect(first).not.toBe(second);
    expect(first.map(({ sourceOrder }) => sourceOrder)).toEqual([
      2, 4, 6, 8, 10,
    ]);
    expect(getOutgoingEdges(fixture, 'node:0')).not.toBe(
      getOutgoingEdges(fixture, 'node:0'),
    );
    expect(getIncomingEdges(fixture, 'node:1')[0]).toBe(fixture.edges[20]);
    expect(getSchemaProjectQueryIndexBuildCountForTests(fixture)).toBe(1);
  });

  it('rebuilds when an indexed array identity or count changes', () => {
    const fixture = project(4, 4);
    primeSchemaProjectQueryIndex(fixture);
    (fixture.nodes as SchemaNode[]).push({
      id: 'node:4',
      kind: 'dtdElement',
      name: 'late',
    });
    expect(getSchemaNode(fixture, 'node:4')?.name).toBe('late');
    expect(getSchemaProjectQueryIndexBuildCountForTests(fixture)).toBe(2);
  });

  it('smokes 40,000 nodes and 80,000 edges without rescanning', () => {
    const fixture = generateLargeDtdProject(40_000, 80_000);
    primeSchemaProjectQueryIndex(fixture);
    for (let index = 0; index < 1_000; index += 1) {
      const nodeId = `generated:dtd:element:${index}`;
      expect(getSchemaNode(fixture, nodeId)).toBeDefined();
      getOutgoingEdges(fixture, nodeId);
      getIncomingEdges(fixture, nodeId);
    }
    expect(getSchemaProjectQueryIndexBuildCountForTests(fixture)).toBe(1);
  });
});
