import type {
  SchemaNodeId,
  SchemaProject,
  SchemaSourceMarkupByNodeId,
} from '../model';
import {
  reportSchemaSourceImportProgress,
  type SchemaSourceImportExecution,
} from '../schemaSourceImportExecution';
import type {
  DtdCommentAst,
  DtdDeclarationParseResult,
  DtdExtendedConstructAst,
} from './dtdAst';
import type { DtdAttributesByNodeId } from './dtdAttributeMetadata';
import type { DtdBuildDiagnostic } from './dtdBuildDiagnostics';
import type {
  DtdCommentsByNodeId,
  DtdNormalizedComment,
} from './dtdCommentMetadata';
import type { DtdParseDiagnostic } from './dtdDiagnostics';
import { lintDtdDeclarations, type DtdLintDiagnostic } from './dtdLint';
import {
  buildDtdProjectFromDeclarations,
  type DtdNormalizedContentKind,
  type DtdProjectBuildOptions,
  type DtdProjectBuildResult,
} from './dtdProjectBuilder';
import { parseDtdDeclarations } from './dtdParser';
import type { StandardsBoundaryDiagnostic } from '../../standards/xerces';
import {
  createVisualizationResult,
  dtdBuildDiagnosticPolicy,
  dtdParseDiagnosticPolicy,
  type VisualizationFinding,
  type VisualizationFindingInput,
  type VisualizationResult,
} from '../visualization';

export type DtdImportOptions = DtdProjectBuildOptions;

export type DtdImportDiagnostic =
  | (DtdParseDiagnostic & { readonly stage: 'parse' })
  | (DtdBuildDiagnostic & { readonly stage: 'build' })
  | (DtdLintDiagnostic & { readonly stage: 'lint' })
  | VisualizationFinding
  | StandardsBoundaryDiagnostic
  | {
      readonly stage: 'import';
      readonly code: 'no-importable-elements';
      readonly severity: 'error';
      readonly message: string;
      readonly sourceId?: string;
    };

export type DtdImportResult =
  | {
      readonly status: 'success';
      readonly project: SchemaProject;
      readonly contentKindsByNodeId: Readonly<
        Record<SchemaNodeId, DtdNormalizedContentKind>
      >;
      readonly dtdAttributesByNodeId: DtdAttributesByNodeId;
      readonly comments: readonly DtdNormalizedComment[];
      readonly commentsByNodeId: DtdCommentsByNodeId;
      readonly schemaLevelComments: readonly DtdNormalizedComment[];
      readonly sourceMarkupByNodeId: SchemaSourceMarkupByNodeId;
      readonly initialFocusNodeId: SchemaNodeId;
      readonly diagnostics: readonly DtdImportDiagnostic[];
      readonly visualization: VisualizationResult;
    }
  | {
      readonly status: 'failure';
      readonly diagnostics: readonly DtdImportDiagnostic[];
    };

export interface DtdImportPipelineDependencies {
  readonly parse: (
    sourceText: string,
    sourceId?: string,
  ) => DtdDeclarationParseResult;
  readonly build: (
    declarations: DtdDeclarationParseResult['declarations'],
    sourceText: string,
    options: DtdProjectBuildOptions,
    comments: readonly DtdCommentAst[],
    constructs?: readonly DtdExtendedConstructAst[],
  ) => DtdProjectBuildResult;
}

function parseDiagnostic(diagnostic: DtdParseDiagnostic): DtdImportDiagnostic {
  return { stage: 'parse', ...diagnostic };
}

function buildDiagnostic(diagnostic: DtdBuildDiagnostic): DtdImportDiagnostic {
  return { stage: 'build', ...diagnostic };
}

function lintDiagnostic(diagnostic: DtdLintDiagnostic): DtdImportDiagnostic {
  return { stage: 'lint', ...diagnostic };
}

function sourceSlice(
  sourceText: string,
  diagnostic: DtdParseDiagnostic | DtdBuildDiagnostic,
): string | undefined {
  const range = diagnostic.range;
  if (!range || range.start.offset < 0 || range.end.offset > sourceText.length)
    return undefined;
  return sourceText.slice(range.start.offset, range.end.offset);
}

function dtdConstructIdentity(markup?: string): {
  readonly constructKind?: string;
  readonly constructName?: string;
} {
  if (!markup) return {};
  const declaration = markup.match(
    /<!\s*(ENTITY|NOTATION)\s+(%\s*)?([^\s>]+)/i,
  );
  if (declaration) {
    return {
      constructKind: declaration[2]
        ? 'parameter entity'
        : declaration[1]!.toLocaleLowerCase(),
      constructName: declaration[3],
    };
  }
  const reference = markup.match(/%\s*([^;\s]+)\s*;/);
  if (reference)
    return {
      constructKind: 'parameter entity reference',
      constructName: reference[1],
    };
  if (markup.trimStart().startsWith('<!['))
    return { constructKind: 'conditional section' };
  return { constructKind: 'DTD construct' };
}

function parseFinding(
  diagnostic: DtdParseDiagnostic,
  sourceText: string,
): VisualizationFindingInput {
  const sourceMarkup = sourceSlice(sourceText, diagnostic);
  return {
    code: `dtd:${diagnostic.code}`,
    message: `XML Carousel preserved but does not yet visualize this valid DTD construct. ${diagnostic.message}`,
    ...(diagnostic.sourceId === undefined
      ? {}
      : { sourceFileId: diagnostic.sourceId }),
    range: diagnostic.range,
    ...dtdConstructIdentity(sourceMarkup),
    ...(sourceMarkup === undefined ? {} : { sourceMarkup }),
  };
}

function buildFinding(
  diagnostic: DtdBuildDiagnostic,
  sourceText: string,
): VisualizationFindingInput {
  const sourceMarkup = sourceSlice(sourceText, diagnostic);
  return {
    code: `dtd:${diagnostic.code}`,
    message:
      diagnostic.code === 'unresolved-element-reference'
        ? `XML Carousel omitted the relationship to undeclared element "${diagnostic.referenceName ?? 'unknown'}" while preserving the supported declaration.`
        : diagnostic.message,
    ...(diagnostic.sourceId === undefined
      ? {}
      : { sourceFileId: diagnostic.sourceId }),
    ...(diagnostic.range === undefined ? {} : { range: diagnostic.range }),
    constructKind: 'element reference',
    ...(diagnostic.referenceName === undefined
      ? {}
      : { constructName: diagnostic.referenceName }),
    ...(sourceMarkup === undefined ? {} : { sourceMarkup }),
  };
}

export function createDtdImporter(
  dependencies: DtdImportPipelineDependencies,
): (
  sourceText: string,
  options: DtdImportOptions,
  execution?: SchemaSourceImportExecution,
) => DtdImportResult {
  return (sourceText, options, execution) => {
    reportSchemaSourceImportProgress(execution, 'parsing');
    const parseResult = dependencies.parse(sourceText, options.sourceFileId);
    const toleratedParseDiagnostics = options.standardsAccepted
      ? parseResult.diagnostics.filter(
          ({ code }) =>
            dtdParseDiagnosticPolicy[code] === 'visualization-warning',
        )
      : [];
    const fatalParseDiagnostics = parseResult.diagnostics.filter(
      (diagnostic) => !toleratedParseDiagnostics.includes(diagnostic),
    );
    const parseDiagnostics = fatalParseDiagnostics.map(parseDiagnostic);

    if (
      fatalParseDiagnostics.some(
        (diagnostic) => diagnostic.severity === 'error',
      )
    ) {
      return { status: 'failure', diagnostics: parseDiagnostics };
    }

    reportSchemaSourceImportProgress(execution, 'building');
    const buildResult = dependencies.build(
      parseResult.declarations,
      sourceText,
      options,
      parseResult.comments,
      parseResult.constructs,
    );
    const toleratedBuildDiagnostics = options.standardsAccepted
      ? buildResult.diagnostics.filter(
          ({ code }) =>
            dtdBuildDiagnosticPolicy[code] === 'visualization-warning',
        )
      : [];
    const visualization = createVisualizationResult([
      ...toleratedParseDiagnostics.map((diagnostic) =>
        parseFinding(diagnostic, sourceText),
      ),
      ...toleratedBuildDiagnostics.map((diagnostic) =>
        buildFinding(diagnostic, sourceText),
      ),
    ]);
    const diagnostics: readonly DtdImportDiagnostic[] = [
      ...parseDiagnostics,
      ...buildResult.diagnostics
        .filter((diagnostic) => !toleratedBuildDiagnostics.includes(diagnostic))
        .map(buildDiagnostic),
      ...lintDtdDeclarations(
        parseResult.declarations,
        options.sourceFileId,
      ).map(lintDiagnostic),
      ...visualization.findings,
    ];

    if (
      !buildResult.project ||
      buildResult.diagnostics.some(
        (diagnostic) => diagnostic.severity === 'error',
      )
    ) {
      return { status: 'failure', diagnostics };
    }

    const initialFocusNodeId =
      buildResult.project.rootNodeIds[0] ?? buildResult.project.nodes[0]?.id;
    if (!initialFocusNodeId) {
      return {
        status: 'failure',
        diagnostics: [
          ...diagnostics,
          {
            stage: 'import',
            code: 'no-importable-elements',
            severity: 'error',
            message: options.standardsAccepted
              ? 'This DTD is valid, but this version of XML Carousel could not create a navigable visualization from it.'
              : 'The DTD source contains no importable element declarations.',
            sourceId: options.sourceFileId,
          },
        ],
      };
    }

    reportSchemaSourceImportProgress(execution, 'finalizing');
    return {
      status: 'success',
      project: buildResult.project,
      contentKindsByNodeId: buildResult.contentKindsByNodeId,
      dtdAttributesByNodeId: buildResult.dtdAttributesByNodeId,
      comments: buildResult.comments,
      commentsByNodeId: buildResult.commentsByNodeId,
      schemaLevelComments: buildResult.schemaLevelComments,
      sourceMarkupByNodeId: buildResult.sourceMarkupByNodeId,
      initialFocusNodeId,
      diagnostics,
      visualization,
    };
  };
}

export const importDtdSource = createDtdImporter({
  parse: parseDtdDeclarations,
  build: buildDtdProjectFromDeclarations,
});
