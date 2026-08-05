export type XercesSpikeFormat = 'xsd' | 'dtd' | 'xml';
export type XercesSpikeStatus =
  'valid' | 'invalid' | 'unsupported' | 'blocked' | 'internal-error';

export interface XercesSpikeFile {
  readonly path: string;
  readonly bytes: Uint8Array;
}

export interface XercesSpikeRequest {
  readonly attemptId: string;
  readonly format: XercesSpikeFormat;
  readonly entryPath: string;
  readonly files: readonly XercesSpikeFile[];
}

export interface XercesSpikeDiagnostic {
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

export interface XercesSpikeResult {
  readonly attemptId: string;
  readonly engine: {
    readonly name: 'Apache Xerces-C++';
    readonly version: string;
  };
  readonly status: XercesSpikeStatus;
  readonly diagnostics: readonly XercesSpikeDiagnostic[];
  readonly metrics: {
    readonly elapsedMs: number;
    readonly fileCount: number;
    readonly inputBytes: number;
  };
}
