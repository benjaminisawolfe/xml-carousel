import type {
  RelaxNgValidationRequest,
  RelaxNgValidationResult,
} from './types';

export interface RelaxNgWorkerRequestMessage {
  readonly type: 'relaxng:validate';
  readonly request: RelaxNgValidationRequest;
}

export interface RelaxNgWorkerResultMessage {
  readonly type: 'relaxng:result';
  readonly result: RelaxNgValidationResult;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isRelaxNgWorkerRequestMessage(
  value: unknown,
): value is RelaxNgWorkerRequestMessage {
  if (!isRecord(value) || value.type !== 'relaxng:validate') return false;
  const request = value.request;
  if (
    !isRecord(request) ||
    typeof request.attemptId !== 'string' ||
    request.attemptId.length === 0 ||
    typeof request.entryPath !== 'string' ||
    !Array.isArray(request.files)
  ) {
    return false;
  }
  return request.files.every(
    (file) =>
      isRecord(file) &&
      typeof file.path === 'string' &&
      file.bytes instanceof Uint8Array,
  );
}

export function isRelaxNgWorkerResultMessage(
  value: unknown,
): value is RelaxNgWorkerResultMessage {
  if (!isRecord(value) || value.type !== 'relaxng:result') return false;
  const result = value.result;
  if (
    !isRecord(result) ||
    typeof result.attemptId !== 'string' ||
    !isRecord(result.engine) ||
    result.engine.name !== 'libxml2 RELAX NG' ||
    result.engine.version !== '2.15.3' ||
    !['valid', 'invalid', 'blocked', 'internal-error'].includes(
      String(result.status),
    ) ||
    !Array.isArray(result.diagnostics) ||
    !Array.isArray(result.dependencyRequests) ||
    !isRecord(result.metrics)
  ) {
    return false;
  }
  const diagnosticsAreValid = result.diagnostics.every(
    (diagnostic) =>
      isRecord(diagnostic) &&
      ['standards', 'visualization'].includes(String(diagnostic.stage)) &&
      typeof diagnostic.code === 'string' &&
      ['error', 'warning', 'info'].includes(String(diagnostic.severity)) &&
      typeof diagnostic.message === 'string' &&
      [
        'standards-invalid',
        'blocked-dependency',
        'unsupported-standard',
        'security',
        'engine-internal',
        'resource-limit',
        'visualization-internal',
      ].includes(String(diagnostic.category)),
  );
  const dependencyRequestsAreValid = result.dependencyRequests.every(
    (request) =>
      isRecord(request) &&
      typeof request.requested === 'string' &&
      typeof request.resolved === 'string' &&
      ['resolved', 'missing', 'blocked'].includes(String(request.outcome)),
  );
  return (
    diagnosticsAreValid &&
    dependencyRequestsAreValid &&
    typeof result.metrics.elapsedMs === 'number' &&
    Number.isFinite(result.metrics.elapsedMs) &&
    typeof result.metrics.fileCount === 'number' &&
    Number.isInteger(result.metrics.fileCount) &&
    result.metrics.fileCount >= 0 &&
    typeof result.metrics.inputBytes === 'number' &&
    Number.isInteger(result.metrics.inputBytes) &&
    result.metrics.inputBytes >= 0
  );
}
