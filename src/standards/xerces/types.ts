import type {
  StandardsBoundaryDiagnostic,
  StandardsEngineIdentity,
  StandardsProjectFile,
  StandardsValidationMetrics,
} from '../types';

export type {
  StandardsBoundaryDiagnostic,
  StandardsDiagnosticCategory,
  StandardsDiagnosticSeverity,
  StandardsDiagnosticSource,
  StandardsEngineIdentity,
  StandardsProjectFile,
  StandardsValidationMetrics,
} from '../types';

export type XercesValidationFormat = 'xsd' | 'dtd';

export type XercesValidationStatus =
  'valid' | 'invalid' | 'unsupported' | 'blocked' | 'internal-error';

export type XercesProjectFile = StandardsProjectFile;

export interface XercesValidationRequest {
  readonly attemptId: string;
  readonly format: XercesValidationFormat;
  readonly entryPath: string;
  readonly files: readonly XercesProjectFile[];
}

export interface XercesNativeDiagnostic {
  readonly id: string;
  readonly severity: 'error' | 'warning' | 'info';
  readonly message: string;
  readonly fileName?: string;
  readonly line?: number;
  readonly column?: number;
  readonly code?: string;
  readonly source?: 'xsd' | 'dtd' | 'xml' | 'project';
  readonly phase?: 'grammar' | 'probe' | 'document';
}

export interface XercesNativeResult {
  readonly attemptId: string;
  readonly engine: StandardsEngineIdentity & {
    readonly name: 'Apache Xerces-C++';
  };
  readonly status: XercesValidationStatus;
  readonly diagnostics: readonly XercesNativeDiagnostic[];
  readonly metrics: StandardsValidationMetrics;
}

export interface XercesValidationResult {
  readonly attemptId: string;
  readonly engine: XercesNativeResult['engine'];
  readonly status: XercesValidationStatus;
  readonly diagnostics: readonly StandardsBoundaryDiagnostic[];
  readonly metrics: XercesNativeResult['metrics'];
}

export interface XercesAdapter {
  run(request: XercesValidationRequest): XercesNativeResult;
}
