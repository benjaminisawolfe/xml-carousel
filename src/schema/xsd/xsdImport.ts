import {
  getSchemaNode,
  type SchemaNodeId,
  type SchemaProject,
  type SchemaSourceMarkupByNodeId,
} from '../model';
import {
  reportSchemaSourceImportProgress,
  type SchemaSourceImportExecution,
} from '../schemaSourceImportExecution';
import type { XsdDiagnostic } from './xsdDiagnostics';
import {
  buildXsdSchemaProject,
  type XsdProjectBuildOptions,
} from './xsdProjectBuilder';
import type { XsdBuildDiagnostic } from './xsdBuildDiagnostics';
import type { XsdMetadataByNodeId } from './xsdProjectMetadata';
import { parseXsd } from './xsdParser';
import { selectLikelyDocumentElementIds } from './xsdQueries';
import { buildXsdSourceMarkupByNodeId } from './xsdSourceMarkup';
import type { StandardsBoundaryDiagnostic } from '../../standards/xerces';
import {
  createVisualizationResult,
  xsdBuildDiagnosticPolicy,
  xsdDiagnosticPolicy,
  type VisualizationFinding,
  type VisualizationFindingInput,
  type VisualizationResult,
} from '../visualization';

export type XsdImportOptions = XsdProjectBuildOptions;

export interface XsdImportStageDiagnostic {
  readonly stage: 'import';
  readonly code: 'no-importable-schema' | 'invalid-initial-focus';
  readonly severity: 'error';
  readonly message: string;
  readonly sourceId?: string;
}

export type XsdImportDiagnostic =
  | XsdDiagnostic
  | XsdBuildDiagnostic
  | VisualizationFinding
  | XsdImportStageDiagnostic
  | StandardsBoundaryDiagnostic;

export type XsdImportResult =
  | {
      readonly status: 'success';
      readonly project: SchemaProject;
      readonly xsdMetadataByNodeId: XsdMetadataByNodeId;
      readonly sourceMarkupByNodeId: SchemaSourceMarkupByNodeId;
      readonly initialFocusNodeId: SchemaNodeId;
      readonly diagnostics: readonly XsdImportDiagnostic[];
      readonly visualization: VisualizationResult;
    }
  | {
      readonly status: 'failure';
      readonly diagnostics: readonly XsdImportDiagnostic[];
    };

export interface XsdImportPipelineDependencies {
  readonly parse: typeof parseXsd;
  readonly build: typeof buildXsdSchemaProject;
  readonly buildSourceMarkup?: typeof buildXsdSourceMarkupByNodeId;
}

function importDiagnostic(
  code: XsdImportStageDiagnostic['code'],
  message: string,
  sourceId: string,
): XsdImportStageDiagnostic {
  return {
    stage: 'import',
    code,
    severity: 'error',
    message,
    sourceId,
  };
}

function initialSchemaFocus(
  project: SchemaProject,
  xsdMetadataByNodeId: XsdMetadataByNodeId,
  sourceId: string,
): SchemaNodeId | XsdImportStageDiagnostic {
  if (project.rootNodeIds.length !== 1) {
    return importDiagnostic(
      'invalid-initial-focus',
      'The normalized XSD project must provide exactly one schema root.',
      sourceId,
    );
  }

  const rootNodeId = project.rootNodeIds[0]!;
  const root = getSchemaNode(project, rootNodeId);
  if (!root || root.kind !== 'schema') {
    return importDiagnostic(
      'invalid-initial-focus',
      'The normalized XSD project root must resolve to a schema node.',
      sourceId,
    );
  }

  const candidateIds = selectLikelyDocumentElementIds(
    project,
    xsdMetadataByNodeId,
  );
  if (candidateIds.length === 1) {
    const candidate = getSchemaNode(project, candidateIds[0]!);
    const metadata = candidate ? xsdMetadataByNodeId[candidate.id] : undefined;
    if (
      candidate?.kind === 'globalElement' &&
      metadata?.kind === 'globalElement' &&
      metadata.scope === 'global'
    ) {
      return candidate.id;
    }
  }

  return rootNodeId;
}

function sourceSlice(
  sourceText: string,
  diagnostic: XsdDiagnostic | XsdBuildDiagnostic,
): string | undefined {
  const range = diagnostic.range;
  if (!range || range.start.offset < 0 || range.end.offset > sourceText.length)
    return undefined;
  return sourceText.slice(range.start.offset, range.end.offset);
}

function xsdFinding(
  diagnostic: XsdDiagnostic | XsdBuildDiagnostic,
  sourceText: string,
): VisualizationFindingInput {
  const sourceMarkup = sourceSlice(sourceText, diagnostic);
  const startTag = sourceMarkup?.match(/^\s*<\s*(?:[\w.-]+:)?([\w.-]+)/);
  const name = sourceMarkup?.match(/\bname\s*=\s*(['"])(.*?)\1/);
  const attributeName = sourceMarkup?.match(/^\s*([\w.-]+)\s*=/);
  return {
    code: `xsd:${diagnostic.code}`,
    message: `XML Carousel preserved but does not yet fully visualize this valid XSD construct. ${diagnostic.message}`,
    ...(diagnostic.sourceId === undefined
      ? {}
      : { sourceFileId: diagnostic.sourceId }),
    ...(diagnostic.range === undefined ? {} : { range: diagnostic.range }),
    ...(startTag?.[1] === undefined && attributeName?.[1] === undefined
      ? {}
      : { constructKind: startTag?.[1] ?? attributeName?.[1] }),
    ...(name?.[2] === undefined ? {} : { constructName: name[2] }),
    ...(sourceMarkup === undefined ? {} : { sourceMarkup }),
  };
}

export function createXsdImporter(
  dependencies: XsdImportPipelineDependencies,
): (
  sourceText: string,
  options: XsdImportOptions,
  execution?: SchemaSourceImportExecution,
) => XsdImportResult {
  return (sourceText, options, execution) => {
    reportSchemaSourceImportProgress(execution, 'parsing');
    const parseResult = dependencies.parse(sourceText, options.sourceFileId);
    const toleratedParseDiagnostics = options.standardsAccepted
      ? parseResult.diagnostics.filter(
          ({ code }) => xsdDiagnosticPolicy[code] === 'visualization-warning',
        )
      : [];
    const parseDiagnostics = parseResult.diagnostics.filter(
      (diagnostic) => !toleratedParseDiagnostics.includes(diagnostic),
    );
    if (parseDiagnostics.some(({ severity }) => severity === 'error')) {
      return { status: 'failure', diagnostics: parseDiagnostics };
    }

    if (!parseResult.schema) {
      return {
        status: 'failure',
        diagnostics: [
          ...parseDiagnostics,
          importDiagnostic(
            'no-importable-schema',
            'The XSD parser did not produce an importable schema.',
            options.sourceFileId,
          ),
        ],
      };
    }

    reportSchemaSourceImportProgress(execution, 'building');
    const buildResult = dependencies.build(
      parseResult.schema,
      sourceText,
      options,
    );
    const toleratedBuildDiagnostics = options.standardsAccepted
      ? buildResult.diagnostics.filter(
          ({ code }) =>
            xsdBuildDiagnosticPolicy[code] === 'visualization-warning',
        )
      : [];
    const buildDiagnostics = buildResult.diagnostics.filter(
      (diagnostic) => !toleratedBuildDiagnostics.includes(diagnostic),
    );
    const visualization = createVisualizationResult([
      ...toleratedParseDiagnostics.map((diagnostic) =>
        xsdFinding(diagnostic, sourceText),
      ),
      ...toleratedBuildDiagnostics.map((diagnostic) =>
        xsdFinding(diagnostic, sourceText),
      ),
    ]);
    const diagnostics: readonly XsdImportDiagnostic[] = [
      ...parseDiagnostics,
      ...buildDiagnostics,
      ...visualization.findings,
    ];
    if (
      buildDiagnostics.some(({ severity }) => severity === 'error') ||
      !buildResult.project
    ) {
      return {
        status: 'failure',
        diagnostics: buildResult.project
          ? diagnostics
          : [
              ...diagnostics,
              ...(buildDiagnostics.some(({ severity }) => severity === 'error')
                ? []
                : [
                    importDiagnostic(
                      'no-importable-schema',
                      'The XSD builder did not produce an importable schema project.',
                      options.sourceFileId,
                    ),
                  ]),
            ],
      };
    }

    const initialFocusNodeId = initialSchemaFocus(
      buildResult.project,
      buildResult.metadataByNodeId,
      options.sourceFileId,
    );
    if (typeof initialFocusNodeId !== 'string') {
      return {
        status: 'failure',
        diagnostics: [...diagnostics, initialFocusNodeId],
      };
    }

    reportSchemaSourceImportProgress(execution, 'finalizing');
    const sourceMarkupByNodeId = (
      dependencies.buildSourceMarkup ?? buildXsdSourceMarkupByNodeId
    )(
      buildResult.project,
      buildResult.metadataByNodeId,
      sourceText,
      options.sourceFileId,
    );

    return {
      status: 'success',
      project: buildResult.project,
      xsdMetadataByNodeId: buildResult.metadataByNodeId,
      sourceMarkupByNodeId,
      initialFocusNodeId,
      diagnostics,
      visualization,
    };
  };
}

export const importXsdSource = createXsdImporter({
  parse: parseXsd,
  build: buildXsdSchemaProject,
});
