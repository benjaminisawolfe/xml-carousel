export type SchemaSourceImportPhase = 'parsing' | 'building' | 'finalizing';

export interface SchemaSourceImportExecution {
  readonly onProgress?: (phase: SchemaSourceImportPhase) => void;
}

export function reportSchemaSourceImportProgress(
  execution: SchemaSourceImportExecution | undefined,
  phase: SchemaSourceImportPhase,
): void {
  try {
    execution?.onProgress?.(phase);
  } catch {
    // Progress observers are informational and cannot change import semantics.
  }
}
