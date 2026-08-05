export type XercesValidationFormat = 'xsd' | 'dtd';

export type XercesValidationStatus =
  'valid' | 'invalid' | 'unsupported' | 'blocked' | 'internal-error';

export type StandardsDiagnosticCategory =
  | 'standards-invalid'
  | 'blocked-dependency'
  | 'unsupported-standard'
  | 'security'
  | 'engine-internal'
  | 'resource-limit'
  | 'visualization-internal';

export interface XercesProjectFile {
  readonly path: string;
  readonly bytes: Uint8Array;
}

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
  readonly engine: {
    readonly name: 'Apache Xerces-C++';
    readonly version: string;
  };
  readonly status: XercesValidationStatus;
  readonly diagnostics: readonly XercesNativeDiagnostic[];
  readonly metrics: {
    readonly elapsedMs: number;
    readonly fileCount: number;
    readonly inputBytes: number;
  };
}

export interface StandardsBoundaryDiagnostic {
  readonly stage: 'standards' | 'visualization';
  readonly code: string;
  readonly severity: 'error' | 'warning' | 'info';
  readonly message: string;
  readonly category: StandardsDiagnosticCategory;
  readonly fileName?: string;
  readonly line?: number;
  readonly column?: number;
  readonly source?: 'xsd' | 'dtd' | 'xml' | 'project';
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
