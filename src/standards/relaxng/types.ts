import type {
  StandardsBoundaryDiagnostic,
  StandardsProjectFile,
  StandardsValidationMetrics,
} from '../types';

export type RelaxNgValidationStatus =
  'valid' | 'invalid' | 'blocked' | 'internal-error';

export type RelaxNgProjectFile = StandardsProjectFile;

export interface RelaxNgValidationRequest {
  readonly attemptId: string;
  readonly entryPath: string;
  readonly files: readonly RelaxNgProjectFile[];
}

export interface RelaxNgNativeDiagnostic {
  readonly severity: number;
  readonly domain: number;
  readonly nativeCode: number;
  readonly source: string;
  readonly line: number;
  readonly column: number;
  readonly message: string;
}

export interface RelaxNgDependencyRequest {
  readonly requested: string;
  readonly resolved: string;
  readonly outcome: 'resolved' | 'missing' | 'blocked';
}

export interface RelaxNgNativeResult {
  readonly attemptId: string;
  readonly engine: 'libxml2';
  readonly engineVersion: string;
  readonly status: RelaxNgValidationStatus;
  readonly elapsedMs: number;
  readonly fileCount: number;
  readonly inputBytes: number;
  readonly diagnostics: readonly RelaxNgNativeDiagnostic[];
  readonly dependencyRequests: readonly RelaxNgDependencyRequest[];
}

export interface RelaxNgValidationResult {
  readonly attemptId: string;
  readonly engine: {
    readonly name: 'libxml2 RELAX NG';
    readonly version: '2.15.3';
  };
  readonly status: RelaxNgValidationStatus;
  readonly diagnostics: readonly StandardsBoundaryDiagnostic[];
  readonly dependencyRequests: readonly RelaxNgDependencyRequest[];
  readonly metrics: StandardsValidationMetrics;
}

export interface RelaxNgAdapter {
  run(request: RelaxNgValidationRequest): RelaxNgNativeResult;
}
