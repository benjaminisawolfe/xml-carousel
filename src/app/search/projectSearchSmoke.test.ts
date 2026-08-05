import { describe, expect, it } from 'vitest';
import type {
  SchemaNode,
  SchemaProject,
  SchemaSourceRange,
} from '../../schema/model';
import type { XsdMetadataByNodeId, XsdNodeMetadata } from '../../schema/xsd';
import { buildProjectSearchIndex } from './projectSearchIndex';
import { searchProjectIndex } from './projectSearchQuery';

function range(offset: number): SchemaSourceRange {
  return {
    sourceId: 'large.xsd',
    start: { offset, line: offset + 1, column: 1 },
    end: { offset: offset + 5, line: offset + 1, column: 6 },
  };
}

function metadataFor(node: SchemaNode, position: number): XsdNodeMetadata {
  return {
    kind: node.kind,
    scope: 'global',
    sourceFileId: 'large-source',
    sourceOrder: position,
    sourceRange: range(position * 10),
    startTagRange: range(position * 10),
    annotations: [
      {
        entries: [
          {
            kind: 'documentation',
            text: `Shared documentation block ${position}`,
            rawXml: `<xs:documentation>Shared documentation block ${position}</xs:documentation>`,
            sourceRange: range(position * 10 + 2),
            startTagRange: range(position * 10 + 2),
            contentRange: range(position * 10 + 3),
            sourceOrder: 0,
          },
        ],
        rawXml: '<xs:annotation />',
        sourceRange: range(position * 10 + 1),
        startTagRange: range(position * 10 + 1),
        sourceOrder: 0,
      },
    ],
  };
}

describe('moderate-schema project search smoke', () => {
  it('builds and repeatedly queries 2,000 deterministic nodes without unbounded output', () => {
    const nodes = Array.from({ length: 2_000 }, (_, position): SchemaNode => ({
      id: `node-${position}`,
      kind: position % 2 === 0 ? 'globalElement' : 'complexType',
      name: `Node ${String(position).padStart(5, '0')}`,
      sourceFileId: 'large-source',
      sourceOrder: position,
    }));
    const metadataByNodeId: Record<string, XsdNodeMetadata> = {};
    for (let position = 0; position < nodes.length; position += 10) {
      const node = nodes[position]!;
      metadataByNodeId[node.id] = metadataFor(node, position);
    }
    const project: SchemaProject = {
      id: 'search:large',
      displayName: 'Large deterministic search fixture',
      sourceFiles: [{ id: 'large-source', filename: 'large.xsd' }],
      nodes,
      edges: [],
      rootNodeIds: [nodes[0]!.id],
    };

    const index = buildProjectSearchIndex({
      project,
      xsdMetadataByNodeId: metadataByNodeId as XsdMetadataByNodeId,
    });
    const first = searchProjectIndex(index, 'shared documentation', {
      limit: 25,
    });
    const second = searchProjectIndex(index, 'shared documentation', {
      limit: 25,
    });

    expect(index.documents).toHaveLength(2_000);
    expect(
      index.documents.reduce(
        (count, document) => count + document.fields.length,
        0,
      ),
    ).toBe(4_200);
    expect(first).toHaveLength(25);
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(searchProjectIndex(index, 'Node 01999')[0]).toMatchObject({
      nodeId: 'node-1999',
      score: 1000,
    });
    expect(searchProjectIndex(index, 'large.xsd')).toHaveLength(100);
    expect(searchProjectIndex(index, 'missing vocabulary')).toEqual([]);
    expect(JSON.stringify(index)).toBeTruthy();
  });
});
