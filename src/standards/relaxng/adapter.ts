import { normalizeStandardsProjectPath } from '../projectResources';
import type {
  RelaxNgAdapter,
  RelaxNgNativeResult,
  RelaxNgValidationRequest,
} from './types';

export interface RelaxNgModule {
  _malloc(size: number): number;
  _free(pointer: number): void;
  _relaxng_reset(attemptId: number): number;
  _relaxng_add_file(path: number, bytes: number, length: number): number;
  _relaxng_compile(entryPath: number): number;
  _relaxng_engine_version(): number;
  _relaxng_result_json(): number;
  UTF8ToString(pointer: number): string;
  lengthBytesUTF8(value: string): number;
  stringToUTF8(value: string, pointer: number, maximumLength: number): void;
  writeArrayToMemory(value: Uint8Array, pointer: number): void;
}

export type RelaxNgModuleFactory = (options?: {
  locateFile?: (path: string, prefix: string) => string;
  instantiateWasm?: (
    imports: WebAssembly.Imports,
    receiveInstance: (instance: WebAssembly.Instance) => void,
  ) => WebAssembly.Exports;
}) => Promise<RelaxNgModule>;

async function loadBrowserWasmBytes(
  wasmUrl: URL,
): Promise<Uint8Array<ArrayBuffer> | undefined> {
  if (wasmUrl.protocol === 'file:') return undefined;
  let response: Response;
  try {
    response = await fetch(wasmUrl, { credentials: 'same-origin' });
  } catch {
    throw new Error(
      'A required RELAX NG standards-checker runtime module could not be loaded.',
    );
  }
  if (!response.ok) {
    throw new Error(
      'A required RELAX NG standards-checker runtime module could not be loaded.',
    );
  }
  return new Uint8Array(await response.arrayBuffer());
}

function withUtf8<T>(
  module: RelaxNgModule,
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

function addFile(module: RelaxNgModule, path: string, bytes: Uint8Array): void {
  const pointer = module._malloc(Math.max(1, bytes.byteLength));
  if (!pointer) throw new Error('WASM project-file allocation failed.');
  try {
    module.writeArrayToMemory(bytes, pointer);
    const accepted = withUtf8(module, path, (pathPointer) =>
      module._relaxng_add_file(pathPointer, pointer, bytes.byteLength),
    );
    if (accepted !== 0) {
      throw new Error('The native RELAX NG adapter rejected a project file.');
    }
  } finally {
    module._free(pointer);
  }
}

export async function createRelaxNgAdapter(
  factory: RelaxNgModuleFactory,
  moduleUrl: URL,
  wasmUrl: URL,
): Promise<RelaxNgAdapter> {
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
    run(request: RelaxNgValidationRequest): RelaxNgNativeResult {
      const entryPath = normalizeStandardsProjectPath(request.entryPath);
      withUtf8(module, request.attemptId, (attemptPointer) =>
        module._relaxng_reset(attemptPointer),
      );
      try {
        request.files.forEach((file) =>
          addFile(module, normalizeStandardsProjectPath(file.path), file.bytes),
        );
        withUtf8(module, entryPath, (entryPointer) =>
          module._relaxng_compile(entryPointer),
        );
        const result = JSON.parse(
          module.UTF8ToString(module._relaxng_result_json()),
        ) as RelaxNgNativeResult;
        return { ...result, attemptId: request.attemptId };
      } finally {
        withUtf8(module, request.attemptId, (attemptPointer) =>
          module._relaxng_reset(attemptPointer),
        );
      }
    },
  };
}
