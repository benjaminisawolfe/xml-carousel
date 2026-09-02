import type { DtdImportOptions, DtdImportResult } from '../schema/dtd';
import type { XsdImportOptions, XsdImportResult } from '../schema/xsd';
import type { SchemaPackageImportResult } from '../app/import/schemaPackage';
import type { ProjectSearchIndex } from '../app/search';
import type {
  SchemaDiagnostic,
  SchemaDiagnosticImportFormat,
} from '../app/import/schemaDiagnosticReport';
import {
  MAX_RETAINED_VISUALIZATION_FINDINGS,
  type VisualizationResult,
} from '../schema/visualization';

export type SchemaImportFormat = SchemaDiagnosticImportFormat;

export type SchemaImportWorkerRequest =
  | {
      readonly type: 'import';
      readonly requestId: string;
      readonly format: 'dtd';
      readonly filename: string;
      readonly sourceText: string;
      readonly options: DtdImportOptions;
    }
  | {
      readonly type: 'import';
      readonly requestId: string;
      readonly format: 'xsd';
      readonly filename: string;
      readonly sourceText: string;
      readonly options: XsdImportOptions;
    }
  | {
      readonly type: 'import';
      readonly requestId: string;
      readonly format: 'zip';
      readonly filename: string;
      readonly data: ArrayBuffer;
    };

export type SchemaImportProgressPhase =
  | 'preparing'
  | 'validating-standards'
  | 'parsing'
  | 'building'
  | 'discovering-package'
  | 'reading-package'
  | 'importing-package-source'
  | 'resolving-package'
  | 'indexing-search'
  | 'activating'
  | 'finalizing';

export interface SchemaImportProgress {
  readonly phase: SchemaImportProgressPhase;
  readonly format: SchemaImportFormat;
  readonly filename: string;
  readonly current?: number;
  readonly total?: number;
  readonly currentSourceFilename?: string;
}

export type SchemaWorkerImportResult =
  | {
      readonly format: 'dtd';
      readonly importResult: DtdImportResult;
      readonly diagnostics: readonly SchemaDiagnostic[];
      readonly searchIndex?: ProjectSearchIndex;
      readonly visualization?: VisualizationResult;
    }
  | {
      readonly format: 'xsd';
      readonly importResult: XsdImportResult;
      readonly diagnostics: readonly SchemaDiagnostic[];
      readonly searchIndex?: ProjectSearchIndex;
      readonly visualization?: VisualizationResult;
    }
  | {
      readonly format: 'zip';
      readonly importResult: SchemaPackageImportResult;
      readonly diagnostics: readonly SchemaDiagnostic[];
      readonly searchIndex?: ProjectSearchIndex;
      readonly visualization?: VisualizationResult;
    };

export type SchemaWorkerFailureCode =
  | 'worker-unavailable'
  | 'worker-start-failure'
  | 'worker-runtime-failure'
  | 'worker-protocol-failure'
  | 'worker-message-failure'
  | 'worker-timeout';

export interface SchemaWorkerFailureDiagnostic {
  readonly stage: 'worker';
  readonly code: SchemaWorkerFailureCode;
  readonly severity: 'error';
  readonly message: string;
  readonly category?: 'resource-limit';
}

export type SchemaImportWorkerResponse =
  | {
      readonly type: 'progress';
      readonly requestId: string;
      readonly progress: SchemaImportProgress;
    }
  | {
      readonly type: 'success';
      readonly requestId: string;
      readonly result: SchemaWorkerImportResult;
    }
  | {
      readonly type: 'failure';
      readonly requestId: string;
      readonly diagnostic: SchemaWorkerFailureDiagnostic;
    };

export type SchemaImportWorkerTaskResult =
  | {
      readonly status: 'success';
      readonly result: SchemaWorkerImportResult;
    }
  | {
      readonly status: 'failure';
      readonly diagnostic: SchemaWorkerFailureDiagnostic;
    }
  | {
      readonly status: 'cancelled';
    };

export interface SchemaImportWorkerTask {
  readonly result: Promise<SchemaImportWorkerTaskResult>;
  cancel(): void;
}

export const schemaWorkerFailureMessages: Readonly<
  Record<SchemaWorkerFailureCode, string>
> = {
  'worker-unavailable': 'Schema processing is not available in this browser.',
  'worker-start-failure': 'Schema processing could not be started.',
  'worker-runtime-failure': 'Schema processing stopped unexpectedly.',
  'worker-protocol-failure': 'Schema processing returned an invalid response.',
  'worker-message-failure': 'Schema processing could not transfer its result.',
  'worker-timeout':
    'Schema processing exceeded the 30-second worker lifetime limit.',
};

export function createSchemaWorkerFailureDiagnostic(
  code: SchemaWorkerFailureCode,
): SchemaWorkerFailureDiagnostic {
  return {
    stage: 'worker',
    code,
    severity: 'error',
    message: schemaWorkerFailureMessages[code],
    ...(code === 'worker-timeout'
      ? { category: 'resource-limit' as const }
      : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasString(value: Record<string, unknown>, key: string): boolean {
  return typeof value[key] === 'string';
}

function isImportOptions(
  value: unknown,
  format: 'dtd' | 'xsd',
): value is DtdImportOptions | XsdImportOptions {
  if (!isRecord(value)) return false;
  if (
    !['projectId', 'displayName', 'sourceFileId', 'sourceFilename'].every(
      (key) => hasString(value, key),
    )
  ) {
    return false;
  }
  if (format === 'dtd') {
    return !('unresolvedReferencePolicy' in value);
  }
  return (
    value.unresolvedReferencePolicy === undefined ||
    value.unresolvedReferencePolicy === 'error' ||
    value.unresolvedReferencePolicy === 'deferForPackage'
  );
}

export function isPlainStructuredCloneValue(
  value: unknown,
  seen: Set<object> = new Set(),
): boolean {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    typeof value === 'number' ||
    typeof value === 'undefined'
  ) {
    return typeof value !== 'number' || Number.isFinite(value);
  }
  if (
    typeof value === 'bigint' ||
    typeof value === 'symbol' ||
    typeof value === 'function'
  ) {
    return false;
  }
  if (value instanceof ArrayBuffer) return true;
  if (typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);
  let compatible: boolean;
  if (Array.isArray(value)) {
    compatible = value.every((item) => isPlainStructuredCloneValue(item, seen));
  } else if (!isRecord(value)) {
    compatible = false;
  } else {
    compatible = Object.values(value).every((item) =>
      isPlainStructuredCloneValue(item, seen),
    );
  }
  seen.delete(value);
  return compatible;
}

export function isSchemaImportWorkerRequest(
  value: unknown,
): value is SchemaImportWorkerRequest {
  if (
    !isRecord(value) ||
    value.type !== 'import' ||
    !hasString(value, 'requestId') ||
    !hasString(value, 'filename')
  ) {
    return false;
  }
  if (value.format === 'zip') {
    return value.data instanceof ArrayBuffer;
  }
  if (value.format !== 'dtd' && value.format !== 'xsd') return false;
  return (
    typeof value.sourceText === 'string' &&
    isImportOptions(value.options, value.format)
  );
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) > 0;
}

export function isSchemaImportProgress(
  value: unknown,
): value is SchemaImportProgress {
  if (
    !isRecord(value) ||
    !hasString(value, 'filename') ||
    (value.format !== 'dtd' &&
      value.format !== 'xsd' &&
      value.format !== 'rng' &&
      value.format !== 'zip')
  ) {
    return false;
  }
  const phase = value.phase;
  const sourcePhase = phase === 'parsing' || phase === 'building';
  const packagePhase =
    phase === 'discovering-package' ||
    phase === 'reading-package' ||
    phase === 'importing-package-source' ||
    phase === 'resolving-package';
  if (
    phase !== 'preparing' &&
    phase !== 'validating-standards' &&
    phase !== 'indexing-search' &&
    phase !== 'activating' &&
    phase !== 'finalizing' &&
    !sourcePhase &&
    !packagePhase
  ) {
    return false;
  }
  if (sourcePhase && value.format === 'zip') return false;
  if (packagePhase && value.format !== 'zip') return false;
  if (phase === 'activating' && value.format === undefined) return false;

  const hasCurrent = value.current !== undefined;
  const hasTotal = value.total !== undefined;
  const hasSource = value.currentSourceFilename !== undefined;
  if (phase === 'importing-package-source') {
    return (
      isPositiveInteger(value.current) &&
      isPositiveInteger(value.total) &&
      value.current <= value.total &&
      typeof value.currentSourceFilename === 'string' &&
      value.currentSourceFilename.length > 0
    );
  }
  return !hasCurrent && !hasTotal && !hasSource;
}

export function isSchemaWorkerFailureDiagnostic(
  value: unknown,
): value is SchemaWorkerFailureDiagnostic {
  if (
    !isRecord(value) ||
    value.stage !== 'worker' ||
    value.severity !== 'error' ||
    typeof value.code !== 'string' ||
    !(value.code in schemaWorkerFailureMessages)
  ) {
    return false;
  }
  const code = value.code as SchemaWorkerFailureCode;
  return (
    value.message === schemaWorkerFailureMessages[code] &&
    (code === 'worker-timeout'
      ? value.category === 'resource-limit'
      : value.category === undefined)
  );
}

function isSchemaDiagnostic(value: unknown): value is SchemaDiagnostic {
  if (
    !isRecord(value) ||
    !hasString(value, 'id') ||
    !hasString(value, 'message') ||
    (value.severity !== 'error' &&
      value.severity !== 'warning' &&
      value.severity !== 'info')
  ) {
    return false;
  }
  if (value.fileName !== undefined && typeof value.fileName !== 'string') {
    return false;
  }
  if (value.line !== undefined && !isPositiveInteger(value.line)) return false;
  if (value.column !== undefined && !isPositiveInteger(value.column)) {
    return false;
  }
  if (value.code !== undefined && typeof value.code !== 'string') return false;
  if (
    value.source !== undefined &&
    value.source !== 'xml' &&
    value.source !== 'dtd' &&
    value.source !== 'dtd-lint' &&
    value.source !== 'xsd' &&
    value.source !== 'rng' &&
    value.source !== 'zip' &&
    value.source !== 'project' &&
    value.source !== 'visualization'
  ) {
    return false;
  }
  if (
    value.category !== undefined &&
    value.category !== 'standards-invalid' &&
    value.category !== 'blocked-dependency' &&
    value.category !== 'unsupported-standard' &&
    value.category !== 'security' &&
    value.category !== 'engine-internal' &&
    value.category !== 'resource-limit' &&
    value.category !== 'visualization-internal' &&
    value.category !== 'archive-package' &&
    value.category !== 'dtd-lint' &&
    value.category !== 'visualization'
  ) {
    return false;
  }
  return (
    value.relatedNodeId === undefined || typeof value.relatedNodeId === 'string'
  );
}

function isVisualizationResult(value: unknown): value is VisualizationResult {
  if (
    !isRecord(value) ||
    !isRecord(value.summary) ||
    !Array.isArray(value.findings)
  ) {
    return false;
  }
  const summary = value.summary;
  if (
    (summary.completeness !== 'complete' &&
      summary.completeness !== 'partial') ||
    !Number.isInteger(summary.totalFindingCount) ||
    !Number.isInteger(summary.retainedFindingCount) ||
    !Number.isInteger(summary.omittedConstructCount) ||
    !Number.isInteger(summary.placeholderCount) ||
    (summary.totalFindingCount as number) < 0 ||
    summary.retainedFindingCount !== value.findings.length ||
    (summary.retainedFindingCount as number) >
      (summary.totalFindingCount as number) ||
    (summary.retainedFindingCount as number) >
      MAX_RETAINED_VISUALIZATION_FINDINGS ||
    (summary.completeness === 'complete'
      ? summary.totalFindingCount !== 0
      : summary.totalFindingCount === 0)
  ) {
    return false;
  }
  return value.findings.every(
    (finding) =>
      isRecord(finding) &&
      hasString(finding, 'id') &&
      finding.stage === 'visualization' &&
      finding.severity === 'warning' &&
      finding.source === 'visualization' &&
      finding.category === 'visualization' &&
      hasString(finding, 'code') &&
      hasString(finding, 'message'),
  );
}

export function isSchemaWorkerImportResult(
  value: unknown,
): value is SchemaWorkerImportResult {
  if (
    !isRecord(value) ||
    (value.format !== 'dtd' &&
      value.format !== 'xsd' &&
      value.format !== 'zip') ||
    !isRecord(value.importResult) ||
    (value.importResult.status !== 'success' &&
      value.importResult.status !== 'failure') ||
    !Array.isArray(value.importResult.diagnostics) ||
    !Array.isArray(value.diagnostics) ||
    value.diagnostics.length !== value.importResult.diagnostics.length ||
    !value.diagnostics.every(isSchemaDiagnostic) ||
    new Set(value.diagnostics.map((diagnostic) => diagnostic.id)).size !==
      value.diagnostics.length
  ) {
    return false;
  }
  if (value.importResult.status === 'success') {
    if (
      !isVisualizationResult(value.visualization) ||
      !isVisualizationResult(value.importResult.visualization)
    ) {
      return false;
    }
  } else if (value.visualization !== undefined) {
    return false;
  }
  if (!isPlainStructuredCloneValue(value)) return false;
  if (value.searchIndex === undefined) return true;
  if (
    !isRecord(value.searchIndex) ||
    typeof value.searchIndex.projectId !== 'string' ||
    !Array.isArray(value.searchIndex.documents)
  ) {
    return false;
  }
  return value.searchIndex.documents.every(
    (document) =>
      isRecord(document) &&
      typeof document.nodeId === 'string' &&
      ((document.resultKind === 'schema-node' &&
        typeof document.nodeKind === 'string') ||
        (document.resultKind === 'package-entry' &&
          document.nodeKind === undefined &&
          typeof document.packageEntryId === 'string' &&
          typeof document.packageEntryKind === 'string')) &&
      typeof document.nodeCategory === 'string' &&
      typeof document.nodeName === 'string' &&
      typeof document.normalizedNodeName === 'string' &&
      typeof document.sourceOrder === 'number' &&
      Array.isArray(document.fields),
  );
}

export function isSchemaImportWorkerResponse(
  value: unknown,
): value is SchemaImportWorkerResponse {
  if (!isRecord(value) || !hasString(value, 'requestId')) return false;
  if (value.type === 'progress') {
    return isSchemaImportProgress(value.progress);
  }
  if (value.type === 'success') {
    return isSchemaWorkerImportResult(value.result);
  }
  if (value.type === 'failure') {
    return isSchemaWorkerFailureDiagnostic(value.diagnostic);
  }
  return false;
}
