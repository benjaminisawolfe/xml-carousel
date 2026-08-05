import { importDtdSource, type DtdImportResult } from '../schema/dtd';
import { importXsdSource, type XsdImportResult } from '../schema/xsd';
import {
  importSchemaArchivePackage,
  type SchemaPackageImportExecution,
  type SchemaPackageImportResult,
} from '../app/import/schemaPackage';
import type {
  SchemaImportProgress,
  SchemaImportWorkerRequest,
  SchemaWorkerImportResult,
} from './schemaImportWorkerProtocol';
import { buildProjectSearchIndex } from '../app/search';
import { normalizeSchemaDiagnostics } from '../app/import/schemaDiagnosticReport';
import {
  createVisualizationFailureDiagnostic,
  validateWithProductionXerces,
  type XercesValidationRequest,
  type XercesValidationResult,
} from '../standards/xerces';

export interface SchemaImportWorkerRuntimeDependencies {
  readonly importDtd: typeof importDtdSource;
  readonly importXsd: typeof importXsdSource;
  readonly importPackage: (
    input: { readonly filename: string; readonly data: ArrayBuffer },
    execution?: SchemaPackageImportExecution,
  ) => Promise<SchemaPackageImportResult>;
  readonly buildSearchIndex?: typeof buildProjectSearchIndex;
  readonly validateStandards?: (
    request: XercesValidationRequest,
  ) => Promise<XercesValidationResult>;
}

const productionDependencies: SchemaImportWorkerRuntimeDependencies = {
  importDtd: importDtdSource,
  importXsd: importXsdSource,
  importPackage: (input, execution) =>
    importSchemaArchivePackage(input, undefined, execution),
  buildSearchIndex: buildProjectSearchIndex,
  validateStandards: validateWithProductionXerces,
};

function sourceBytes(sourceText: string): Uint8Array {
  return new TextEncoder().encode(sourceText);
}

function progressKey(progress: SchemaImportProgress): string {
  return [
    progress.phase,
    progress.format,
    progress.filename,
    progress.current ?? '',
    progress.total ?? '',
    progress.currentSourceFilename ?? '',
  ].join('\u0000');
}

export async function executeSchemaImportWorkerRequest(
  request: SchemaImportWorkerRequest,
  reportProgress: (progress: SchemaImportProgress) => void,
  dependencies: SchemaImportWorkerRuntimeDependencies = productionDependencies,
): Promise<SchemaWorkerImportResult> {
  let previousProgressKey: string | undefined;
  const report = (progress: SchemaImportProgress): void => {
    const key = progressKey(progress);
    if (key === previousProgressKey) return;
    previousProgressKey = key;
    try {
      reportProgress(progress);
    } catch {
      // A progress observer cannot change the import result.
    }
  };

  report({
    phase: 'preparing',
    format: request.format,
    filename: request.filename,
  });

  if (request.format === 'dtd') {
    report({
      phase: 'validating-standards',
      format: 'dtd',
      filename: request.filename,
    });
    const standards = await (
      dependencies.validateStandards ?? validateWithProductionXerces
    )({
      attemptId: request.requestId,
      format: 'dtd',
      entryPath: request.filename,
      files: [
        { path: request.filename, bytes: sourceBytes(request.sourceText) },
      ],
    });
    if (standards.status !== 'valid') {
      const importResult: DtdImportResult = {
        status: 'failure',
        diagnostics: standards.diagnostics,
      };
      const diagnostics = normalizeSchemaDiagnostics(importResult.diagnostics, {
        attemptId: request.requestId,
        format: 'dtd',
        attemptedFileName: request.filename,
      });
      return { format: 'dtd', importResult, diagnostics };
    }
    const extracted = dependencies.importDtd(
      request.sourceText,
      { ...request.options, standardsAccepted: true },
      {
        onProgress: (phase) =>
          phase === 'finalizing'
            ? undefined
            : report({
                phase,
                format: 'dtd',
                filename: request.filename,
              }),
      },
    );
    const importResult: DtdImportResult =
      extracted.status === 'failure'
        ? {
            status: 'failure',
            diagnostics: [
              ...standards.diagnostics,
              ...extracted.diagnostics,
              createVisualizationFailureDiagnostic('dtd', request.filename),
            ],
          }
        : {
            ...extracted,
            diagnostics: [...standards.diagnostics, ...extracted.diagnostics],
          };
    const diagnostics = normalizeSchemaDiagnostics(importResult.diagnostics, {
      attemptId: request.requestId,
      format: 'dtd',
      attemptedFileName: request.filename,
    });
    if (importResult.status === 'failure') {
      return { format: 'dtd', importResult, diagnostics };
    }
    report({
      phase: 'indexing-search',
      format: 'dtd',
      filename: request.filename,
    });
    const searchIndex = (
      dependencies.buildSearchIndex ?? buildProjectSearchIndex
    )({
      project: importResult.project,
      sourceFilename: request.filename,
      commentsByNodeId: importResult.commentsByNodeId,
      dtdAttributesByNodeId: importResult.dtdAttributesByNodeId,
    });
    report({
      phase: 'finalizing',
      format: 'dtd',
      filename: request.filename,
    });
    return {
      format: 'dtd',
      importResult,
      diagnostics,
      searchIndex,
      visualization: importResult.visualization,
    };
  }

  if (request.format === 'xsd') {
    report({
      phase: 'validating-standards',
      format: 'xsd',
      filename: request.filename,
    });
    const standards = await (
      dependencies.validateStandards ?? validateWithProductionXerces
    )({
      attemptId: request.requestId,
      format: 'xsd',
      entryPath: request.filename,
      files: [
        { path: request.filename, bytes: sourceBytes(request.sourceText) },
      ],
    });
    if (standards.status !== 'valid') {
      const importResult: XsdImportResult = {
        status: 'failure',
        diagnostics: standards.diagnostics,
      };
      const diagnostics = normalizeSchemaDiagnostics(importResult.diagnostics, {
        attemptId: request.requestId,
        format: 'xsd',
        attemptedFileName: request.filename,
      });
      return { format: 'xsd', importResult, diagnostics };
    }
    const extracted = dependencies.importXsd(
      request.sourceText,
      { ...request.options, standardsAccepted: true },
      {
        onProgress: (phase) =>
          phase === 'finalizing'
            ? undefined
            : report({
                phase,
                format: 'xsd',
                filename: request.filename,
              }),
      },
    );
    const importResult: XsdImportResult =
      extracted.status === 'failure'
        ? {
            status: 'failure',
            diagnostics: [
              ...standards.diagnostics,
              ...extracted.diagnostics,
              createVisualizationFailureDiagnostic('xsd', request.filename),
            ],
          }
        : {
            ...extracted,
            diagnostics: [...standards.diagnostics, ...extracted.diagnostics],
          };
    const diagnostics = normalizeSchemaDiagnostics(importResult.diagnostics, {
      attemptId: request.requestId,
      format: 'xsd',
      attemptedFileName: request.filename,
    });
    if (importResult.status === 'failure') {
      return { format: 'xsd', importResult, diagnostics };
    }
    report({
      phase: 'indexing-search',
      format: 'xsd',
      filename: request.filename,
    });
    const searchIndex = (
      dependencies.buildSearchIndex ?? buildProjectSearchIndex
    )({
      project: importResult.project,
      sourceFilename: request.filename,
      xsdMetadataByNodeId: importResult.xsdMetadataByNodeId,
    });
    report({
      phase: 'finalizing',
      format: 'xsd',
      filename: request.filename,
    });
    return {
      format: 'xsd',
      importResult,
      diagnostics,
      searchIndex,
      visualization: importResult.visualization,
    };
  }

  const importResult = await dependencies.importPackage(
    { filename: request.filename, data: request.data },
    {
      onProgress: (progress) =>
        progress.phase === 'finalizing'
          ? undefined
          : report({
              ...progress,
              format: 'zip',
              filename: request.filename,
            }),
      validateStandards: async ({ files, roots }) => {
        const results: XercesValidationResult[] = [];
        for (let index = 0; index < roots.length; index += 1) {
          const root = roots[index]!;
          results.push(
            await (
              dependencies.validateStandards ?? validateWithProductionXerces
            )({
              attemptId: `${request.requestId}:root:${index + 1}`,
              format: root.format,
              entryPath: root.entryPath,
              files,
            }),
          );
        }
        return results;
      },
    },
  );
  const diagnostics = normalizeSchemaDiagnostics(importResult.diagnostics, {
    attemptId: request.requestId,
    format: 'zip',
    attemptedFileName: request.filename,
  });
  if (importResult.status === 'failure') {
    return { format: 'zip', importResult, diagnostics };
  }
  report({
    phase: 'indexing-search',
    format: 'zip',
    filename: request.filename,
  });
  const searchIndex = (
    dependencies.buildSearchIndex ?? buildProjectSearchIndex
  )({
    project: importResult.project,
    sourceFilename: request.filename,
    xsdMetadataByNodeId: importResult.xsdMetadataByNodeId,
    commentsByNodeId: importResult.commentsByNodeId,
    dtdAttributesByNodeId: importResult.dtdAttributesByNodeId,
    packageEntries: importResult.entries,
  });
  report({
    phase: 'finalizing',
    format: 'zip',
    filename: request.filename,
  });
  return {
    format: 'zip',
    importResult,
    diagnostics,
    searchIndex,
    visualization: importResult.visualization,
  };
}
