import { normalizeProjectPath, validateProjectFiles } from './pathPolicy';
import type { XercesSpikeRequest, XercesSpikeResult } from './types';

interface XercesModule {
  _malloc(size: number): number;
  _free(pointer: number): void;
  _xerces_spike_reset_project(): void;
  _xerces_spike_add_file(path: number, bytes: number, length: number): number;
  _xerces_spike_run(attempt: number, format: number, entry: number): number;
  UTF8ToString(pointer: number): string;
  lengthBytesUTF8(value: string): number;
  stringToUTF8(value: string, pointer: number, length: number): void;
  writeArrayToMemory(value: Uint8Array, pointer: number): void;
}

type ModuleFactory = (options?: {
  locateFile?: (path: string, prefix: string) => string;
}) => Promise<XercesModule>;

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
    if (accepted !== 1)
      throw new Error(`Native adapter rejected path: ${path}`);
  } finally {
    module._free(pointer);
  }
}

export interface XercesSpikeAdapter {
  run(request: XercesSpikeRequest): XercesSpikeResult;
}

export async function createXercesSpikeAdapter(
  factory: ModuleFactory,
  moduleUrl: URL,
  wasmUrl = new URL('./xerces-spike.wasm', moduleUrl),
): Promise<XercesSpikeAdapter> {
  const module = await factory({
    locateFile: (path) =>
      path.endsWith('.wasm') ? wasmUrl.href : new URL(path, moduleUrl).href,
  });
  return {
    run(request) {
      const normalized = validateProjectFiles(
        request.files.map((file) => file.path),
      );
      const entryPath = normalizeProjectPath(request.entryPath);
      module._xerces_spike_reset_project();
      request.files.forEach((file, index) =>
        addFile(module, normalized[index], file.bytes),
      );
      return withUtf8(module, request.attemptId, (attemptPointer) =>
        withUtf8(module, request.format, (formatPointer) =>
          withUtf8(module, entryPath, (entryPointer) => {
            const resultPointer = module._xerces_spike_run(
              attemptPointer,
              formatPointer,
              entryPointer,
            );
            const result = JSON.parse(
              module.UTF8ToString(resultPointer),
            ) as XercesSpikeResult;
            return result;
          }),
        ),
      );
    },
  };
}
