import { createXercesAdapter, type XercesModuleFactory } from './adapter';
import {
  XERCES_MAX_DEPENDENCY_DEPTH,
  XERCES_MAX_RETAINED_DIAGNOSTICS,
} from './limits';
import {
  normalizeXercesProjectPath,
  resolveXercesProjectReference,
  validateXercesProjectFiles,
} from './pathPolicy';
import type {
  StandardsBoundaryDiagnostic,
  StandardsDiagnosticCategory,
  XercesAdapter,
  XercesNativeDiagnostic,
  XercesValidationFormat,
  XercesValidationRequest,
  XercesValidationResult,
} from './types';

const runtimeModuleUrl = new URL(
  './runtime/xerces-runtime.js',
  import.meta.url,
);
const runtimeWasmUrl = new URL(
  './runtime/xerces-runtime.wasm',
  import.meta.url,
);
const packagedRuntimeUrls = [
  runtimeModuleUrl,
  runtimeWasmUrl,
  new URL('./runtime/runtime-manifest.json', import.meta.url),
  new URL('./runtime/LICENSE.xerces.txt', import.meta.url),
  new URL('./runtime/NOTICE.xerces.txt', import.meta.url),
  new URL('./runtime/LICENSE.emscripten.txt', import.meta.url),
] as const;

let productionAdapter: Promise<XercesAdapter> | undefined;

export function getProductionXercesAdapter(): Promise<XercesAdapter> {
  if (packagedRuntimeUrls.some((url) => url.protocol.length === 0)) {
    return Promise.reject(new Error('Invalid packaged Xerces runtime URL.'));
  }
  productionAdapter ??= import(/* @vite-ignore */ runtimeModuleUrl.href).then(
    (module: unknown) => {
      if (
        typeof module !== 'object' ||
        module === null ||
        !('default' in module) ||
        typeof module.default !== 'function'
      ) {
        throw new Error('The Xerces runtime glue has no module factory.');
      }
      return createXercesAdapter(
        module.default as XercesModuleFactory,
        runtimeModuleUrl,
        runtimeWasmUrl,
      );
    },
  );
  return productionAdapter;
}

function categoryFor(
  status: XercesValidationResult['status'],
  code: string | undefined,
): StandardsDiagnosticCategory {
  if (code?.startsWith('xerces:resource-')) return 'resource-limit';
  if (code?.startsWith('xerces:security-')) return 'security';
  if (status === 'invalid') return 'standards-invalid';
  if (status === 'blocked') return 'blocked-dependency';
  if (status === 'unsupported') return 'unsupported-standard';
  if (status === 'internal-error') return 'engine-internal';
  return 'standards-invalid';
}

function safeDiagnosticFileName(
  candidate: string | undefined,
  projectPaths: readonly string[],
): string | undefined {
  if (!candidate) return undefined;
  let decoded = candidate;
  try {
    decoded = decodeURIComponent(candidate);
  } catch {
    return undefined;
  }
  decoded = decoded.replace(/^file:\/\/?/iu, '').replace(/\\/gu, '/');
  const exact = projectPaths.find((path) => decoded === path);
  if (exact) return exact;
  return projectPaths.find(
    (path) => decoded.endsWith(`/${path}`) || decoded === `/${path}`,
  );
}

function normalizeNativeDiagnostic(
  diagnostic: XercesNativeDiagnostic,
  status: XercesValidationResult['status'],
  projectPaths: readonly string[],
): StandardsBoundaryDiagnostic {
  const fileName = safeDiagnosticFileName(diagnostic.fileName, projectPaths);
  const message = diagnostic.message.replace(
    'the spike supports XSD 1.0',
    'XML Carousel supports XSD 1.0 validation',
  );
  return {
    stage: 'standards',
    code: diagnostic.code ?? `xerces:${status}`,
    severity: diagnostic.severity,
    message,
    category: categoryFor(status, diagnostic.code),
    ...(fileName === undefined ? {} : { fileName }),
    ...(diagnostic.line === undefined ? {} : { line: diagnostic.line }),
    ...(diagnostic.column === undefined ? {} : { column: diagnostic.column }),
    ...(diagnostic.source === undefined ? {} : { source: diagnostic.source }),
  };
}

const PROBE_ONLY_VALIDITY_CODES = new Set([
  'xerces-validity:2',
  'xerces-validity:6',
  'xerces-validity:7',
  'xerces-validity:16',
  'xerces-validity:21',
  'xerces-validity:75',
]);

export function filterProbeOnlyXercesDiagnostics(
  diagnostics: readonly XercesNativeDiagnostic[],
): readonly XercesNativeDiagnostic[] {
  return diagnostics.filter(
    (diagnostic) =>
      diagnostic.phase !== 'probe' ||
      !PROBE_ONLY_VALIDITY_CODES.has(diagnostic.code ?? ''),
  );
}

function policyFailureResult(
  request: XercesValidationRequest,
  diagnostics: readonly StandardsBoundaryDiagnostic[],
): XercesValidationResult {
  return {
    attemptId: request.attemptId,
    engine: { name: 'Apache Xerces-C++', version: '3.3.0' },
    status: 'blocked',
    diagnostics,
    metrics: {
      elapsedMs: 0,
      fileCount: request.files.length,
      inputBytes: request.files.reduce(
        (total, file) => total + file.bytes.length,
        0,
      ),
    },
  };
}

function sourceReferences(
  format: XercesValidationFormat,
  bytes: Uint8Array,
): readonly string[] {
  const source = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  const references: string[] = [];
  if (format === 'xsd') {
    const markup = source
      .replace(/<!--[\s\S]*?-->/gu, '')
      .replace(/<!\[CDATA\[[\s\S]*?\]\]>/gu, '');
    const schema =
      /<(?:([:_\p{L}\p{Nl}][-.\u00b7:_\p{L}\p{Nl}\p{M}\p{Nd}]*):)?schema\b([^>]*)>/iu.exec(
        markup,
      );
    if (!schema) return references;
    const prefix = schema[1];
    const attributes = schema[2] ?? '';
    const escapedPrefix = prefix?.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    const namespace = prefix
      ? new RegExp(
          `\\bxmlns:${escapedPrefix}\\s*=\\s*(['"])http://www\\.w3\\.org/2001/XMLSchema\\1`,
          'iu',
        )
      : /\bxmlns\s*=\s*(['"])http:\/\/www\.w3\.org\/2001\/XMLSchema\1/iu;
    if (!namespace.test(attributes)) return references;
    const expression = new RegExp(
      `<${escapedPrefix ? `${escapedPrefix}:` : ''}(?:include|import|redefine)\\b[^>]*\\bschemaLocation\\s*=\\s*(['"])(.*?)\\1[^>]*>`,
      'giu',
    );
    for (const match of markup.matchAll(expression)) references.push(match[2]!);
    return references;
  }
  const markup = source.replace(/<!--[\s\S]*?-->/gu, '');
  const system = /\bSYSTEM\s+(['"])(.*?)\1/giu;
  for (const match of markup.matchAll(system)) references.push(match[2]!);
  const publicSystem = /\bPUBLIC\s+(['"])(.*?)\1\s+(['"])(.*?)\3/giu;
  for (const match of markup.matchAll(publicSystem)) references.push(match[4]!);
  return references;
}

function resolveProjectReference(basePath: string, reference: string): string {
  return resolveXercesProjectReference(basePath, reference);
}

function dependencyDepthDiagnostic(
  request: XercesValidationRequest,
  normalizedPaths: readonly string[],
): StandardsBoundaryDiagnostic | undefined {
  const files = new Map(
    request.files.map((file, index) => [normalizedPaths[index]!, file]),
  );
  const active = new Set<string>();

  function visit(path: string, depth: number): boolean {
    if (depth > XERCES_MAX_DEPENDENCY_DEPTH) return false;
    if (active.has(path)) return true;
    const file = files.get(path);
    if (!file) return true;
    active.add(path);
    for (const reference of sourceReferences(request.format, file.bytes)) {
      let resolved: string;
      try {
        resolved = resolveProjectReference(path, reference);
      } catch {
        continue;
      }
      if (files.has(resolved) && !visit(resolved, depth + 1)) return false;
    }
    active.delete(path);
    return true;
  }

  if (visit(request.entryPath, 0)) return undefined;
  return {
    stage: 'standards',
    code: 'xerces:resource-dependency-depth',
    severity: 'error',
    message: `The schema dependency graph exceeds the ${XERCES_MAX_DEPENDENCY_DEPTH}-level standards-engine limit.`,
    category: 'resource-limit',
    source: 'project',
    fileName: request.entryPath,
  };
}

export function retainXercesDiagnostics(
  diagnostics: readonly StandardsBoundaryDiagnostic[],
): readonly StandardsBoundaryDiagnostic[] {
  if (diagnostics.length <= XERCES_MAX_RETAINED_DIAGNOSTICS) {
    return diagnostics;
  }
  return [
    ...diagnostics.slice(0, XERCES_MAX_RETAINED_DIAGNOSTICS - 1),
    {
      stage: 'standards',
      code: 'xerces:resource-diagnostic-limit',
      severity: 'error',
      message: `Xerces produced more than ${XERCES_MAX_RETAINED_DIAGNOSTICS} diagnostics; the retained report was explicitly truncated at the safety limit.`,
      category: 'resource-limit',
      source: 'project',
    },
  ];
}

export async function validateWithProductionXerces(
  request: XercesValidationRequest,
  adapterProvider: () => Promise<XercesAdapter> = getProductionXercesAdapter,
): Promise<XercesValidationResult> {
  const policy = validateXercesProjectFiles(request.files);
  if (!policy.accepted) return policyFailureResult(request, policy.diagnostics);

  let entryPath: string;
  try {
    entryPath = normalizeXercesProjectPath(request.entryPath);
  } catch {
    return policyFailureResult(request, [
      {
        stage: 'standards',
        code: 'xerces:unsafe-entry-path',
        severity: 'error',
        message:
          'The selected schema entry is outside the controlled project boundary.',
        category: 'security',
        source: 'project',
      },
    ]);
  }
  if (!policy.normalizedPaths.includes(entryPath)) {
    return policyFailureResult(request, [
      {
        stage: 'standards',
        code: 'xerces:missing-entry-path',
        severity: 'error',
        message: `The selected schema entry ${entryPath} is not present in the supplied project.`,
        category: 'blocked-dependency',
        source: 'project',
        fileName: entryPath,
      },
    ]);
  }

  const normalizedRequest = {
    ...request,
    entryPath,
    files: request.files.map((file, index) => ({
      path: policy.normalizedPaths[index]!,
      bytes: file.bytes,
    })),
  };
  const depthDiagnostic = dependencyDepthDiagnostic(
    normalizedRequest,
    policy.normalizedPaths,
  );
  if (depthDiagnostic) return policyFailureResult(request, [depthDiagnostic]);

  let adapter: XercesAdapter;
  try {
    adapter = await adapterProvider();
  } catch {
    return {
      attemptId: request.attemptId,
      engine: { name: 'Apache Xerces-C++', version: '3.3.0' },
      status: 'internal-error',
      diagnostics: [
        {
          stage: 'standards',
          code: 'xerces:initialization-failure',
          severity: 'error',
          message:
            "XML Carousel's standards checker could not start, so this file was not checked.",
          category: 'engine-internal',
          source: 'project',
        },
        {
          stage: 'standards',
          code: 'xerces:runtime-module-load-failure',
          severity: 'error',
          message:
            'A required standards-checker runtime module could not be loaded.',
          category: 'engine-internal',
          source: 'project',
        },
      ],
      metrics: {
        elapsedMs: 0,
        fileCount: request.files.length,
        inputBytes: request.files.reduce(
          (total, file) => total + file.bytes.length,
          0,
        ),
      },
    };
  }

  try {
    const native = adapter.run(normalizedRequest);
    const diagnostics = retainXercesDiagnostics(
      filterProbeOnlyXercesDiagnostics(native.diagnostics).map((diagnostic) =>
        normalizeNativeDiagnostic(
          diagnostic,
          native.status,
          policy.normalizedPaths,
        ),
      ),
    );
    return { ...native, diagnostics };
  } catch {
    return {
      attemptId: request.attemptId,
      engine: { name: 'Apache Xerces-C++', version: '3.3.0' },
      status: 'internal-error',
      diagnostics: [
        {
          stage: 'standards',
          code: 'xerces:initialization-or-runtime-failure',
          severity: 'error',
          message:
            "XML Carousel's standards checker could not complete the check, so this file was not checked.",
          category: 'engine-internal',
          source: 'project',
        },
      ],
      metrics: {
        elapsedMs: 0,
        fileCount: request.files.length,
        inputBytes: request.files.reduce(
          (total, file) => total + file.bytes.length,
          0,
        ),
      },
    };
  }
}

export function createVisualizationFailureDiagnostic(
  format: XercesValidationFormat | 'zip',
  fileName: string,
): StandardsBoundaryDiagnostic {
  const standard =
    format === 'dtd'
      ? 'standalone DTD grammar'
      : format === 'xsd'
        ? 'XSD 1.0'
        : 'schema package';
  return {
    stage: 'visualization',
    code: 'xml-carousel:visualization-extraction-failed',
    severity: 'error',
    message: `Apache Xerces-C++ accepted this ${standard}, but XML Carousel could not build a visualization for it.`,
    category: 'visualization-internal',
    source: 'project',
    fileName,
  };
}
