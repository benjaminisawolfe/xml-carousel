export type StandardsDiagnosticCategory =
  | 'standards-invalid'
  | 'blocked-dependency'
  | 'unsupported-standard'
  | 'security'
  | 'engine-internal'
  | 'resource-limit'
  | 'visualization-internal';

export type StandardsDiagnosticSeverity = 'error' | 'warning' | 'info';

export type StandardsDiagnosticSource =
  'xsd' | 'dtd' | 'rng' | 'xml' | 'project';

export interface StandardsEngineIdentity {
  readonly name: string;
  readonly version: string;
}

export interface StandardsValidationMetrics {
  readonly elapsedMs: number;
  readonly fileCount: number;
  readonly inputBytes: number;
}

export interface StandardsProjectFile {
  readonly path: string;
  readonly bytes: Uint8Array;
}

export interface StandardsBoundaryDiagnostic {
  readonly stage: 'standards' | 'visualization';
  readonly code: string;
  readonly severity: StandardsDiagnosticSeverity;
  readonly message: string;
  readonly category: StandardsDiagnosticCategory;
  readonly fileName?: string;
  readonly line?: number;
  readonly column?: number;
  readonly source?: StandardsDiagnosticSource;
}
