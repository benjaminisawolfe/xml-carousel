import type {
  SchemaNodeId,
  SchemaProject,
  SchemaSourceMarkupByNodeId,
  SchemaSourcePosition,
} from '../model';
import {
  createVisualizationResult,
  type VisualizationResult,
} from '../visualization';
import type {
  RelaxNgSemanticFinding,
  RelaxNgSemanticModel,
} from './relaxNgSemanticModel';

export interface StandaloneRelaxNgProjectOptions {
  readonly filename: string;
  readonly sourceText: string;
  readonly engine: {
    readonly name: 'libxml2 RELAX NG';
    readonly version: '2.15.3';
  };
  readonly semanticModel?: RelaxNgSemanticModel;
  readonly semanticFindings?: readonly RelaxNgSemanticFinding[];
}

export interface StandaloneRelaxNgImportResult {
  readonly status: 'success';
  readonly project: SchemaProject;
  readonly initialFocusNodeId: SchemaNodeId;
  readonly sourceMarkupByNodeId: SchemaSourceMarkupByNodeId;
  readonly visualization: VisualizationResult;
  readonly semanticModel?: RelaxNgSemanticModel;
  readonly semanticFindings: readonly RelaxNgSemanticFinding[];
}

export function deriveStandaloneRelaxNgSourceFileId(filename: string): string {
  return `imported-rng-source:${encodeURIComponent(filename.trim())}`;
}

function endPosition(sourceText: string): SchemaSourcePosition {
  let line = 1;
  let column = 1;
  for (let offset = 0; offset < sourceText.length; offset += 1) {
    const character = sourceText[offset]!;
    if (character === '\r') {
      if (sourceText[offset + 1] === '\n') offset += 1;
      line += 1;
      column = 1;
    } else if (character === '\n') {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }
  return { offset: sourceText.length, line, column };
}

export function buildStandaloneRelaxNgProject(
  options: StandaloneRelaxNgProjectOptions,
): StandaloneRelaxNgImportResult {
  const filename = options.filename.trim();
  const encodedFilename = encodeURIComponent(filename);
  const projectId = `imported-rng:${encodedFilename}`;
  const sourceFileId = deriveStandaloneRelaxNgSourceFileId(filename);
  const nodeId = `relaxng:schema:${encodedFilename}`;
  const range = {
    start: { offset: 0, line: 1, column: 1 },
    end: endPosition(options.sourceText),
    sourceId: sourceFileId,
  } as const;
  const project: SchemaProject = Object.freeze({
    id: projectId,
    displayName: filename,
    sourceFiles: Object.freeze([Object.freeze({ id: sourceFileId, filename })]),
    nodes: Object.freeze([
      Object.freeze({
        id: nodeId,
        kind: 'relaxNgSchema' as const,
        name: filename,
        sourceFileId,
        sourceOrder: 0,
        properties: Object.freeze([
          Object.freeze({
            label: 'Syntax',
            value: 'RELAX NG XML syntax',
          }),
          Object.freeze({
            label: 'Engine',
            value: `${options.engine.name} ${options.engine.version}`,
          }),
        ]),
      }),
    ]),
    edges: Object.freeze([]),
    rootNodeIds: Object.freeze([nodeId]),
  });
  const sourceMarkupByNodeId: SchemaSourceMarkupByNodeId = Object.freeze({
    [nodeId]: Object.freeze({
      syntax: 'rng' as const,
      fragments: Object.freeze([
        Object.freeze({
          id: `${nodeId}:source`,
          sourceFileId,
          range,
          text: options.sourceText,
        }),
      ]),
    }),
  });
  const visualization = createVisualizationResult([
    {
      code: 'relaxng:structural-visualization-unavailable',
      message:
        'This RELAX NG schema is standards-valid. Structural RELAX NG visualization is not available yet; the complete retained source remains available.',
      sourceFileId,
      range,
      constructKind: 'relaxNgSchema',
      constructName: filename,
    },
  ]);

  return Object.freeze({
    status: 'success' as const,
    project,
    initialFocusNodeId: nodeId,
    sourceMarkupByNodeId,
    visualization,
    ...(options.semanticModel === undefined
      ? {}
      : { semanticModel: options.semanticModel }),
    semanticFindings: options.semanticFindings ?? [],
  });
}
