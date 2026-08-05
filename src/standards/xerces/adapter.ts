import { normalizeXercesProjectPath } from './pathPolicy';
import type {
  XercesAdapter,
  XercesNativeResult,
  XercesValidationRequest,
} from './types';

export interface XercesModule {
  _malloc(size: number): number;
  _free(pointer: number): void;
  _xerces_spike_reset_project(): void;
  _xerces_spike_add_file(path: number, bytes: number, length: number): number;
  _xerces_spike_run(attempt: number, format: number, entry: number): number;
  UTF8ToString(pointer: number): string;
  lengthBytesUTF8(value: string): number;
  stringToUTF8(value: string, pointer: number, maximumLength: number): void;
  writeArrayToMemory(value: Uint8Array, pointer: number): void;
}

export type XercesModuleFactory = (options?: {
  locateFile?: (path: string, prefix: string) => string;
  instantiateWasm?: (
    imports: WebAssembly.Imports,
    receiveInstance: (instance: WebAssembly.Instance) => void,
  ) => WebAssembly.Exports;
}) => Promise<XercesModule>;

async function loadBrowserWasmBytes(
  wasmUrl: URL,
): Promise<Uint8Array<ArrayBuffer> | undefined> {
  if (wasmUrl.protocol === 'file:') return undefined;
  let response: Response;
  try {
    response = await fetch(wasmUrl, { credentials: 'same-origin' });
  } catch {
    throw new Error(
      'A required standards-checker runtime module could not be loaded.',
    );
  }
  if (!response.ok) {
    throw new Error(
      'A required standards-checker runtime module could not be loaded.',
    );
  }
  return new Uint8Array(await response.arrayBuffer());
}

function withUtf8<T>(
  module: XercesModule,
  value: string,
  callback: (pointer: number) => T,
): T {
  const length = module.lengthBytesUTF8(value) + 1;
  const pointer = module._malloc(length);
  if (!pointer) throw new Error('WASM string allocation failed.');
  try {
    module.stringToUTF8(value, pointer, length);
    return callback(pointer);
  } finally {
    module._free(pointer);
  }
}

function addFile(module: XercesModule, path: string, bytes: Uint8Array): void {
  const pointer = module._malloc(Math.max(1, bytes.byteLength));
  if (!pointer) throw new Error(`WASM file allocation failed: ${path}`);
  try {
    module.writeArrayToMemory(bytes, pointer);
    const accepted = withUtf8(module, path, (pathPointer) =>
      module._xerces_spike_add_file(pathPointer, pointer, bytes.byteLength),
    );
    if (accepted !== 1) {
      throw new Error(`Native adapter rejected path: ${path}`);
    }
  } finally {
    module._free(pointer);
  }
}

export async function createXercesAdapter(
  factory: XercesModuleFactory,
  moduleUrl: URL,
  wasmUrl: URL,
): Promise<XercesAdapter> {
  const wasmBinary = await loadBrowserWasmBytes(wasmUrl);
  const compiledWasm =
    wasmBinary === undefined
      ? undefined
      : await WebAssembly.compile(wasmBinary);
  const module = await factory({
    locateFile: (path) =>
      path.endsWith('.wasm') ? wasmUrl.href : new URL(path, moduleUrl).href,
    ...(compiledWasm === undefined
      ? {}
      : {
          instantiateWasm: (imports, receiveInstance) => {
            const instance = new WebAssembly.Instance(compiledWasm, imports);
            receiveInstance(instance);
            return instance.exports;
          },
        }),
  });
  return {
    run(request: XercesValidationRequest): XercesNativeResult {
      const entryPath = normalizeXercesProjectPath(request.entryPath);
      module._xerces_spike_reset_project();
      try {
        request.files.forEach((file) =>
          addFile(module, normalizeXercesProjectPath(file.path), file.bytes),
        );
        return withUtf8(module, request.attemptId, (attemptPointer) =>
          withUtf8(module, request.format, (formatPointer) =>
            withUtf8(module, entryPath, (entryPointer) => {
              const resultPointer = module._xerces_spike_run(
                attemptPointer,
                formatPointer,
                entryPointer,
              );
              return JSON.parse(
                module.UTF8ToString(resultPointer),
              ) as XercesNativeResult;
            }),
          ),
        );
      } finally {
        module._xerces_spike_reset_project();
      }
    },
  };
}
