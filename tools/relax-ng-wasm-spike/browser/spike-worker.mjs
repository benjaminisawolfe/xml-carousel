import createModule from '../dist/libxml2-relaxng.mjs';

let modulePromise;

function getModule() {
  modulePromise ??= createModule({
    locateFile: (name) => new URL(`../dist/${name}`, import.meta.url).href,
  });
  return modulePromise;
}

async function run(request) {
  const module = await getModule();
  const reset = module.cwrap('rng_reset', 'number', ['number']);
  const add = module.cwrap('rng_add_file', 'number', [
    'string',
    'number',
    'number',
  ]);
  const compile = module.cwrap('rng_compile', 'number', ['string', 'number']);
  const result = module.cwrap('rng_result_json', 'string', []);
  reset(request.attemptId);
  for (const file of request.files) {
    const bytes = new TextEncoder().encode(file.bytes);
    const pointer = module._malloc(bytes.length);
    module.writeArrayToMemory(bytes, pointer);
    const code = add(file.path, pointer, bytes.length);
    module._free(pointer);
    if (code !== 0) throw new Error(`add_file failed: ${code}`);
  }
  compile(request.entryPath, 0);
  return JSON.parse(result());
}

self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'version') {
      const module = await getModule();
      const version = module.cwrap('rng_engine_version', 'string', []);
      self.postMessage({ type: 'version', version: version() });
      return;
    }
    if (data.type === 'run') {
      if (data.delayMs)
        await new Promise((resolve) => setTimeout(resolve, data.delayMs));
      self.postMessage({ type: 'result', result: await run(data.request) });
    }
  } catch (error) {
    self.postMessage({ type: 'error', message: String(error?.stack ?? error) });
  }
};
