import type {
  SchemaEdge,
  SchemaNode,
  SchemaProject,
  SchemaSourceFile,
} from '../schema/model';

export function generateDtdSource(elementCount: number): string {
  return Array.from(
    { length: elementCount },
    (_, index) => `<!ELEMENT element-${index} EMPTY>`,
  ).join('\n');
}

export function generateLargeDtdProject(
  nodeCount: number,
  edgeCount = Math.max(0, nodeCount - 1),
): SchemaProject {
  const nodes: SchemaNode[] = Array.from({ length: nodeCount }, (_, index) => ({
    id: `generated:dtd:element:${index}`,
    kind: 'dtdElement',
    name: `element-${index}`,
    sourceFileId: 'generated:dtd:source',
    sourceOrder: index,
  }));
  const edges: SchemaEdge[] =
    nodeCount === 0
      ? []
      : Array.from({ length: edgeCount }, (_, index) => ({
          id: `generated:dtd:edge:${index}`,
          kind: 'contains',
          sourceNodeId: nodes[index % nodeCount]!.id,
          targetNodeId: nodes[(index + 1) % nodeCount]!.id,
          order: index,
        }));
  return {
    id: `generated:dtd:${nodeCount}:${edgeCount}`,
    displayName: `Generated ${nodeCount}-element DTD`,
    sourceFiles: [
      { id: 'generated:dtd:source', filename: 'generated-large.dtd' },
    ],
    nodes,
    edges,
    rootNodeIds: nodes.length > 0 ? [nodes[0]!.id] : [],
  };
}

export function generateMixedXsdProject(nodeCount: number): SchemaProject {
  const sourceFileId = 'generated:xsd:source';
  const kinds = [
    'globalElement',
    'complexType',
    'simpleType',
    'attribute',
  ] as const;
  const schemaNode: SchemaNode = {
    id: 'generated:xsd:schema',
    kind: 'schema',
    name: 'Schema',
    sourceFileId,
    sourceOrder: 0,
  };
  const nodes: SchemaNode[] = [
    schemaNode,
    ...Array.from({ length: Math.max(0, nodeCount - 1) }, (_, index) => ({
      id: `generated:xsd:node:${index}`,
      kind: kinds[index % kinds.length],
      name: `declaration-${index}`,
      sourceFileId,
      sourceOrder: index + 1,
    })),
  ];
  return {
    id: `generated:xsd:${nodeCount}`,
    displayName: `Generated ${nodeCount}-node XSD`,
    sourceFiles: [{ id: sourceFileId, filename: 'generated-large.xsd' }],
    nodes,
    edges: nodes.slice(1).map((node, index) => ({
      id: `generated:xsd:contains:${index}`,
      kind: 'contains',
      sourceNodeId: schemaNode.id,
      targetNodeId: node.id,
      order: index,
    })),
    rootNodeIds: [schemaNode.id],
  };
}

export function generateMultiFileSchemaProject(
  nodeCount: number,
  sourceCount = 20,
): SchemaProject {
  const boundedSourceCount = Math.max(1, Math.floor(sourceCount));
  const sourceFiles: SchemaSourceFile[] = Array.from(
    { length: boundedSourceCount },
    (_, index) => ({
      id: `generated:package:source:${index}`,
      filename: `schemas/source-${index}.xsd`,
    }),
  );
  const nodes: SchemaNode[] = Array.from({ length: nodeCount }, (_, index) => ({
    id: `generated:package:node:${index}`,
    kind: index % 3 === 0 ? 'globalElement' : 'complexType',
    name: `component-${index}`,
    sourceFileId: sourceFiles[index % sourceFiles.length]!.id,
    sourceOrder: index,
  }));
  return {
    id: `generated:package:${nodeCount}:${boundedSourceCount}`,
    displayName: 'Generated schema package',
    sourceFiles,
    nodes,
    edges: [],
    rootNodeIds: nodes.length > 0 ? [nodes[0]!.id] : [],
  };
}
