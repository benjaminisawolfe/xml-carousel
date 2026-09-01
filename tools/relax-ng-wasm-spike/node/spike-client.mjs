import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dist = resolve(here, '../dist');

export async function createSpike() {
  const { default: createModule } = await import('../dist/libxml2-relaxng.mjs');
  const wasmBinary = await readFile(resolve(dist, 'libxml2-relaxng.wasm'));
  const module = await createModule({ wasmBinary });
  const reset = module.cwrap('rng_reset', 'number', ['number']);
  const add = module.cwrap('rng_add_file', 'number', [
    'string',
    'number',
    'number',
  ]);
  const compile = module.cwrap('rng_compile', 'number', ['string', 'number']);
  const version = module.cwrap('rng_engine_version', 'string', []);
  const result = module.cwrap('rng_result_json', 'string', []);
  return {
    version: version(),
    memoryBytes: () => module.HEAPU8.buffer.byteLength,
    run({ attemptId, entryPath, files, parserMode = 0 }) {
      reset(attemptId);
      for (const file of files) {
        const bytes =
          typeof file.bytes === 'string'
            ? new TextEncoder().encode(file.bytes)
            : file.bytes;
        const pointer = module._malloc(bytes.length);
        module.writeArrayToMemory(bytes, pointer);
        const code = add(file.path, pointer, bytes.length);
        module._free(pointer);
        if (code !== 0)
          throw new Error(`add_file failed for ${file.path}: ${code}`);
      }
      compile(entryPath, parserMode);
      return JSON.parse(result());
    },
  };
}
