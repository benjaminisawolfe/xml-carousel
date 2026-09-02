import {
  normalizeStandardsProjectPath,
  STANDARDS_MAX_RETAINED_DIAGNOSTICS,
  validateStandardsProjectFiles,
} from '../projectResources';
import type {
  StandardsBoundaryDiagnostic,
  StandardsDiagnosticCategory,
  StandardsDiagnosticSeverity,
} from '../types';
import { createRelaxNgAdapter, type RelaxNgModuleFactory } from './adapter';
import type {
  RelaxNgAdapter,
  RelaxNgDependencyRequest,
  RelaxNgNativeDiagnostic,
  RelaxNgValidationRequest,
  RelaxNgValidationResult,
} from './types';
import {
  isRelaxNgCompactPath,
  parseRelaxNgCompactSyntax,
  type RelaxNgCompactGeneratedSource,
} from '../../schema/relaxng';

const runtimeModuleUrl = new URL(
  './runtime/libxml2-relaxng-runtime.js',
  import.meta.url,
);
const runtimeWasmUrl = new URL(
  './runtime/libxml2-relaxng-runtime.wasm',
  import.meta.url,
);
const packagedRuntimeUrls = [
  runtimeModuleUrl,
  runtimeWasmUrl,
  new URL('./runtime/runtime-manifest.json', import.meta.url),
  new URL('./runtime/LICENSE.libxml2.txt', import.meta.url),
  new URL('./runtime/LICENSE.emscripten.txt', import.meta.url),
] as const;

let productionAdapter: Promise<RelaxNgAdapter> | undefined;

export function getProductionRelaxNgAdapter(): Promise<RelaxNgAdapter> {
  if (packagedRuntimeUrls.some((url) => url.protocol.length === 0)) {
    return Promise.reject(new Error('Invalid packaged RELAX NG runtime URL.'));
  }
  productionAdapter ??= import(/* @vite-ignore */ runtimeModuleUrl.href).then(
    (module: unknown) => {
      if (
        typeof module !== 'object' ||
        module === null ||
        !('default' in module) ||
        typeof module.default !== 'function'
      ) {
        throw new Error('The RELAX NG runtime glue has no module factory.');
      }
      return createRelaxNgAdapter(
        module.default as RelaxNgModuleFactory,
        runtimeModuleUrl,
        runtimeWasmUrl,
      );
    },
  );
  return productionAdapter;
}

function metricsFor(request: RelaxNgValidationRequest) {
  return {
    elapsedMs: 0,
    fileCount: request.files.length,
    inputBytes: request.files.reduce(
      (total, file) => total + file.bytes.length,
      0,
    ),
  };
}

function policyFailureResult(
  request: RelaxNgValidationRequest,
  diagnostics: readonly StandardsBoundaryDiagnostic[],
): RelaxNgValidationResult {
  return {
    attemptId: request.attemptId,
    engine: { name: 'libxml2 RELAX NG', version: '2.15.3' },
    status: 'blocked',
    diagnostics,
    dependencyRequests: [],
    metrics: metricsFor(request),
  };
}

function safeProjectPath(
  candidate: string,
  projectPaths: readonly string[],
): string | undefined {
  if (!candidate) return undefined;
  let decoded: string;
  try {
    decoded = decodeURIComponent(candidate).replace(/\\/gu, '/');
  } catch {
    return undefined;
  }
  decoded = decoded.replace(/^project:\/\/\//iu, '');
  return projectPaths.includes(decoded) ? decoded : undefined;
}

function severityFor(nativeLevel: number): StandardsDiagnosticSeverity {
  if (nativeLevel >= 2) return 'error';
  if (nativeLevel === 1) return 'warning';
  return 'info';
}

function isIncludeLimitDiagnostic(
  diagnostic: RelaxNgNativeDiagnostic,
): boolean {
  return /(?:include|external).*(?:depth|limit)|(?:depth|limit).*(?:include|external)|diagnostic.*limit|diagnostics?.*truncat/iu.test(
    diagnostic.message,
  );
}

function categoryFor(
  status: RelaxNgValidationResult['status'],
  diagnostic: RelaxNgNativeDiagnostic,
  dependencyRequests: readonly RelaxNgDependencyRequest[],
): StandardsDiagnosticCategory {
  if (isIncludeLimitDiagnostic(diagnostic)) return 'resource-limit';
  if (dependencyRequests.some((request) => request.outcome === 'blocked')) {
    return 'security';
  }
  if (dependencyRequests.some((request) => request.outcome === 'missing')) {
    return 'blocked-dependency';
  }
  if (status === 'invalid') return 'standards-invalid';
  if (status === 'blocked') return 'blocked-dependency';
  if (status === 'internal-error') return 'engine-internal';
  return 'standards-invalid';
}

function normalizeDependencyRequest(
  request: RelaxNgDependencyRequest,
  projectPaths: readonly string[],
): RelaxNgDependencyRequest {
  const requested = /^(?:https?|file):/iu.test(request.requested)
    ? `${request.requested.slice(0, request.requested.indexOf(':')).toLowerCase()}:[blocked external reference]`
    : /^(?:\/|\\|[a-z]:)/iu.test(request.requested)
      ? '[blocked absolute reference]'
      : request.requested;
  return {
    requested,
    resolved: safeProjectPath(request.resolved, projectPaths) ?? '',
    outcome: request.outcome,
  };
}

function safeDiagnosticMessage(message: string): string {
  return message
    .replace(/project:\/\/\//giu, '')
    .replace(
      /\b(?:https?|file):\/\/[^\s"'<>]+/giu,
      '[blocked external reference]',
    )
    .replace(/\b[A-Za-z]:[\\/][^\s"'<>]+/gu, '[local path]');
}

function normalizeNativeDiagnostic(
  diagnostic: RelaxNgNativeDiagnostic,
  status: RelaxNgValidationResult['status'],
  projectPaths: readonly string[],
  dependencyRequests: readonly RelaxNgDependencyRequest[],
  compactSources: ReadonlyMap<string, RelaxNgCompactGeneratedSource>,
): StandardsBoundaryDiagnostic {
  const fileName = safeProjectPath(diagnostic.source, projectPaths);
  const compactSource =
    fileName === undefined ? undefined : compactSources.get(fileName);
  const compactRange =
    compactSource === undefined || diagnostic.line <= 0
      ? undefined
      : compactSource.lineRanges[diagnostic.line];
  return {
    stage: 'standards',
    code: `libxml2-relaxng:${diagnostic.domain}:${diagnostic.nativeCode}`,
    severity: severityFor(diagnostic.severity),
    message: safeDiagnosticMessage(diagnostic.message),
    category: categoryFor(status, diagnostic, dependencyRequests),
    ...(fileName === undefined ? {} : { fileName }),
    ...(compactRange === undefined
      ? compactSource === undefined && diagnostic.line > 0
        ? { line: diagnostic.line }
        : {}
      : {
          line: compactRange.start.line,
          column: compactRange.start.column,
        }),
    source: 'rng',
  };
}

export function retainRelaxNgDiagnostics(
  diagnostics: readonly StandardsBoundaryDiagnostic[],
): readonly StandardsBoundaryDiagnostic[] {
  if (diagnostics.length <= STANDARDS_MAX_RETAINED_DIAGNOSTICS) {
    return diagnostics;
  }
  return [
    ...diagnostics.slice(0, STANDARDS_MAX_RETAINED_DIAGNOSTICS - 1),
    {
      stage: 'standards',
      code: 'relaxng:resource-diagnostic-limit',
      severity: 'error',
      message: `libxml2 RELAX NG produced more than ${STANDARDS_MAX_RETAINED_DIAGNOSTICS} diagnostics; the retained report was explicitly truncated at the safety limit.`,
      category: 'resource-limit',
      source: 'project',
    },
  ];
}

export async function validateWithProductionRelaxNg(
  request: RelaxNgValidationRequest,
  adapterProvider: () => Promise<RelaxNgAdapter> = getProductionRelaxNgAdapter,
): Promise<RelaxNgValidationResult> {
  const policy = validateStandardsProjectFiles(request.files, 'relaxng');
  if (!policy.accepted) return policyFailureResult(request, policy.diagnostics);

  let entryPath: string;
  try {
    entryPath = normalizeStandardsProjectPath(request.entryPath);
  } catch {
    return policyFailureResult(request, [
      {
        stage: 'standards',
        code: 'relaxng:unsafe-entry-path',
        severity: 'error',
        message:
          'The selected RELAX NG entry is outside the controlled project boundary.',
        category: 'security',
        source: 'project',
      },
    ]);
  }
  if (!policy.normalizedPaths.includes(entryPath)) {
    return policyFailureResult(request, [
      {
        stage: 'standards',
        code: 'relaxng:missing-entry-path',
        severity: 'error',
        message: `The selected RELAX NG entry ${entryPath} is not present in the supplied project.`,
        category: 'blocked-dependency',
        source: 'project',
        fileName: entryPath,
      },
    ]);
  }

  const compactSources = new Map<string, RelaxNgCompactGeneratedSource>();
  const translatedFiles: RelaxNgValidationRequest['files'][number][] = [];
  for (let index = 0; index < request.files.length; index += 1) {
    const file = request.files[index]!;
    const path = policy.normalizedPaths[index]!;
    if (!isRelaxNgCompactPath(path)) {
      translatedFiles.push({ path, bytes: file.bytes });
      continue;
    }
    let sourceText: string;
    try {
      sourceText = new TextDecoder('utf-8', { fatal: true }).decode(file.bytes);
    } catch {
      return {
        attemptId: request.attemptId,
        engine: { name: 'libxml2 RELAX NG', version: '2.15.3' },
        status: 'invalid',
        diagnostics: [
          {
            stage: 'standards',
            code: 'rnc:invalid-utf8',
            severity: 'error',
            message: 'RELAX NG Compact Syntax source must be valid UTF-8.',
            category: 'standards-invalid',
            fileName: path,
            source: 'rng',
          },
        ],
        dependencyRequests: [],
        metrics: metricsFor(request),
      };
    }
    const parsed = parseRelaxNgCompactSyntax(
      sourceText,
      `relax-ng-validation:${path}`,
    );
    if (parsed.diagnostics.length > 0 || !parsed.generated) {
      return {
        attemptId: request.attemptId,
        engine: { name: 'libxml2 RELAX NG', version: '2.15.3' },
        status: 'invalid',
        diagnostics: parsed.diagnostics.map((diagnostic) => ({
          stage: 'standards' as const,
          code: diagnostic.code,
          severity: 'error' as const,
          message: `Compact Syntax ${diagnostic.kind} error: ${diagnostic.message}`,
          category: 'standards-invalid' as const,
          fileName: path,
          line: diagnostic.range.start.line,
          column: diagnostic.range.start.column,
          source: 'rng' as const,
        })),
        dependencyRequests: [],
        metrics: metricsFor(request),
      };
    }
    compactSources.set(path, parsed.generated);
    translatedFiles.push({
      path,
      bytes: new TextEncoder().encode(parsed.generated.xml),
    });
  }

  const normalizedRequest = {
    ...request,
    entryPath,
    files: translatedFiles,
  };

  let adapter: RelaxNgAdapter;
  try {
    adapter = await adapterProvider();
  } catch {
    return {
      attemptId: request.attemptId,
      engine: { name: 'libxml2 RELAX NG', version: '2.15.3' },
      status: 'internal-error',
      diagnostics: [
        {
          stage: 'standards',
          code: 'relaxng:initialization-failure',
          severity: 'error',
          message:
            "XML Carousel's RELAX NG standards checker could not start, so this schema was not checked.",
          category: 'engine-internal',
          source: 'project',
        },
        {
          stage: 'standards',
          code: 'relaxng:runtime-module-load-failure',
          severity: 'error',
          message:
            'A required RELAX NG standards-checker runtime module could not be loaded.',
          category: 'engine-internal',
          source: 'project',
        },
      ],
      dependencyRequests: [],
      metrics: metricsFor(request),
    };
  }

  try {
    const native = adapter.run(normalizedRequest);
    if (native.engine !== 'libxml2' || native.engineVersion !== '2.15.3') {
      throw new Error('Unexpected RELAX NG engine identity.');
    }
    const dependencyRequests = native.dependencyRequests.map((dependency) =>
      normalizeDependencyRequest(dependency, policy.normalizedPaths),
    );
    const diagnostics = retainRelaxNgDiagnostics(
      native.diagnostics.map((diagnostic) =>
        normalizeNativeDiagnostic(
          diagnostic,
          native.status,
          policy.normalizedPaths,
          dependencyRequests,
          compactSources,
        ),
      ),
    );
    return {
      attemptId: request.attemptId,
      engine: { name: 'libxml2 RELAX NG', version: '2.15.3' },
      status: native.status,
      diagnostics,
      dependencyRequests,
      metrics: {
        elapsedMs: native.elapsedMs,
        fileCount: request.files.length,
        inputBytes: request.files.reduce(
          (total, file) => total + file.bytes.length,
          0,
        ),
      },
    };
  } catch {
    return {
      attemptId: request.attemptId,
      engine: { name: 'libxml2 RELAX NG', version: '2.15.3' },
      status: 'internal-error',
      diagnostics: [
        {
          stage: 'standards',
          code: 'relaxng:initialization-or-runtime-failure',
          severity: 'error',
          message:
            "XML Carousel's RELAX NG standards checker could not complete the check, so this schema was not checked.",
          category: 'engine-internal',
          source: 'project',
        },
      ],
      dependencyRequests: [],
      metrics: metricsFor(request),
    };
  }
}
