import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/svelte';
import { afterEach, beforeEach } from 'vitest';
import {
  WELCOME_PREFERENCE_KEY,
  WELCOME_PREFERENCE_VALUE,
} from '../app/welcome/welcomePreference';
import {
  createSchemaWorkerFailureDiagnostic,
  isSchemaImportWorkerRequest,
} from '../workers/schemaImportWorkerProtocol';
import { executeSchemaImportWorkerRequest } from '../workers/schemaImportWorkerRuntime';
import { importDtdSource, type DtdImportDiagnostic } from '../schema/dtd';
import { importXsdSource, type XsdImportDiagnostic } from '../schema/xsd';
import { importSchemaArchivePackage } from '../app/import/schemaPackage';
import { buildProjectSearchIndex } from '../app/search';
import type {
  StandardsBoundaryDiagnostic,
  XercesValidationRequest,
  XercesValidationResult,
} from '../standards/xerces';

function legacyDiagnosticAsStandards(
  diagnostic: DtdImportDiagnostic | XsdImportDiagnostic,
  request: XercesValidationRequest,
): StandardsBoundaryDiagnostic {
  const range = 'range' in diagnostic ? diagnostic.range : undefined;
  return {
    stage: 'standards',
    category: 'standards-invalid',
    code: diagnostic.code,
    severity: diagnostic.severity,
    message: diagnostic.message,
    fileName: request.entryPath,
    ...(range === undefined
      ? {}
      : { line: range.start.line, column: range.start.column }),
    source: request.format,
  };
}

async function validateLegacyTestSource(
  request: XercesValidationRequest,
): Promise<XercesValidationResult> {
  const sourceText = new TextDecoder().decode(request.files[0]?.bytes);
  const options = {
    projectId: 'legacy-test-project',
    displayName: request.entryPath,
    sourceFileId: 'legacy-test-source',
    sourceFilename: request.entryPath,
  };
  const checked =
    request.files.length === 1
      ? request.format === 'xsd'
        ? importXsdSource(sourceText, options)
        : importDtdSource(sourceText, options)
      : undefined;
  const diagnostics =
    checked?.status === 'failure'
      ? checked.diagnostics
          .filter(
            (diagnostic) =>
              request.format !== 'dtd' ||
              (diagnostic.code !== 'unsupported-declaration' &&
                diagnostic.code !== 'unsupported-syntax'),
          )
          .map((diagnostic) => legacyDiagnosticAsStandards(diagnostic, request))
      : [];
  return {
    attemptId: request.attemptId,
    engine: { name: 'Apache Xerces-C++', version: 'test-double' },
    status: diagnostics.length === 0 ? 'valid' : 'invalid',
    diagnostics,
    metrics: {
      elapsedMs: 0,
      fileCount: request.files.length,
      inputBytes: request.files.reduce(
        (total, file) => total + file.bytes.byteLength,
        0,
      ),
    },
  };
}

const legacyExtractionTestDependencies = {
  importDtd: importDtdSource,
  importXsd: importXsdSource,
  importPackage: (input: { filename: string; data: ArrayBuffer }, execution) =>
    importSchemaArchivePackage(input, undefined, execution),
  buildSearchIndex: buildProjectSearchIndex,
  // Existing UI/unit suites exercise extraction and state behavior. The
  // committed runtime and authoritative gate have dedicated real-WASM tests.
  validateStandards: validateLegacyTestSource,
} satisfies import('../workers/schemaImportWorkerRuntime').SchemaImportWorkerRuntimeDependencies;

class TestSchemaImportWorker extends EventTarget {
  private terminated = false;

  postMessage(message: unknown): void {
    void Promise.resolve().then(async () => {
      if (this.terminated) return;
      if (!isSchemaImportWorkerRequest(message)) {
        this.dispatchEvent(
          new MessageEvent('message', {
            data: {
              type: 'failure',
              requestId: 'invalid-request',
              diagnostic: createSchemaWorkerFailureDiagnostic(
                'worker-protocol-failure',
              ),
            },
          }),
        );
        return;
      }
      try {
        const result = await executeSchemaImportWorkerRequest(
          message,
          (progress) => {
            if (this.terminated) return;
            this.dispatchEvent(
              new MessageEvent('message', {
                data: {
                  type: 'progress',
                  requestId: message.requestId,
                  progress,
                },
              }),
            );
          },
          legacyExtractionTestDependencies,
        );
        if (this.terminated) return;
        this.dispatchEvent(
          new MessageEvent('message', {
            data: {
              type: 'success',
              requestId: message.requestId,
              result,
            },
          }),
        );
      } catch {
        if (this.terminated) return;
        this.dispatchEvent(
          new MessageEvent('message', {
            data: {
              type: 'failure',
              requestId: message.requestId,
              diagnostic: createSchemaWorkerFailureDiagnostic(
                'worker-runtime-failure',
              ),
            },
          }),
        );
      }
    });
  }

  terminate(): void {
    this.terminated = true;
  }
}

globalThis.Worker = TestSchemaImportWorker as unknown as typeof Worker;

interface ControlledResizeObserverRegistration {
  readonly callback: ResizeObserverCallback;
  readonly targets: Set<Element>;
}

const controlledResizeObservers =
  new Set<ControlledResizeObserverRegistration>();

class ControlledResizeObserver implements ResizeObserver {
  private readonly registration: ControlledResizeObserverRegistration;

  constructor(callback: ResizeObserverCallback) {
    this.registration = { callback, targets: new Set() };
    controlledResizeObservers.add(this.registration);
  }

  observe(target: Element): void {
    this.registration.targets.add(target);
  }

  unobserve(target: Element): void {
    this.registration.targets.delete(target);
  }

  disconnect(): void {
    this.registration.targets.clear();
    controlledResizeObservers.delete(this.registration);
  }
}

function resizeRect(width: number, height: number): DOMRectReadOnly {
  return {
    x: 0,
    y: 0,
    width,
    height,
    top: 0,
    right: width,
    bottom: height,
    left: 0,
    toJSON: () => ({ width, height }),
  };
}

export function notifyResizeObserver(
  target: Element,
  width: number,
  height: number,
): void {
  const contentRect = resizeRect(width, height);
  for (const registration of controlledResizeObservers) {
    if (!registration.targets.has(target)) continue;
    const entry: ResizeObserverEntry = {
      target,
      contentRect,
      borderBoxSize: [],
      contentBoxSize: [],
      devicePixelContentBoxSize: [],
    };
    registration.callback([entry], {} as ResizeObserver);
  }
}

export function observedResizeTargetCount(): number {
  return [...controlledResizeObservers].reduce(
    (count, { targets }) => count + targets.size,
    0,
  );
}

globalThis.ResizeObserver =
  ControlledResizeObserver as unknown as typeof ResizeObserver;

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(WELCOME_PREFERENCE_KEY, WELCOME_PREFERENCE_VALUE);
});

afterEach(() => {
  cleanup();
  controlledResizeObservers.clear();
  localStorage.clear();
});
