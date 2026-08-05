import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

const root = path.resolve('tools/xerces-wasm-spike');
const modulePath = path.join(root, 'dist/xerces-spike.mjs');
const wasmPath = path.join(root, 'dist/xerces-spike.wasm');
const factory = (await import(pathToFileURL(modulePath).href)).default;
const wasmBytes = await readFile(wasmPath);

function percentile(values, ratio) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[
    Math.min(ordered.length - 1, Math.floor(ordered.length * ratio))
  ];
}

function summarize(values) {
  return {
    minimumMs: Math.min(...values),
    medianMs: percentile(values, 0.5),
    p95Ms: percentile(values, 0.95),
    maximumMs: Math.max(...values),
  };
}

async function instantiate() {
  let memory;
  const started = performance.now();
  const module = await factory({
    locateFile: () => pathToFileURL(wasmPath).href,
    instantiateWasm(imports, receiveInstance) {
      void WebAssembly.instantiate(wasmBytes, imports).then(({ instance }) => {
        memory = instance.exports.memory;
        receiveInstance(instance);
      });
    },
  });
  return { module, memory, elapsedMs: performance.now() - started };
}

function withUtf8(module, value, callback) {
  const size = module.lengthBytesUTF8(value) + 1;
  const pointer = module._malloc(size);
  try {
    module.stringToUTF8(value, pointer, size);
    return callback(pointer);
  } finally {
    module._free(pointer);
  }
}

function validate(module, attemptId, entryPath, bytes) {
  const started = performance.now();
  module._xerces_spike_reset_project();
  const bytePointer = module._malloc(Math.max(1, bytes.byteLength));
  try {
    module.writeArrayToMemory(bytes, bytePointer);
    withUtf8(module, entryPath, (pathPointer) => {
      if (
        module._xerces_spike_add_file(
          pathPointer,
          bytePointer,
          bytes.byteLength,
        ) !== 1
      ) {
        throw new Error(`Native adapter rejected ${entryPath}.`);
      }
    });
    const result = withUtf8(module, attemptId, (attemptPointer) =>
      withUtf8(module, 'xsd', (formatPointer) =>
        withUtf8(module, entryPath, (entryPointer) =>
          JSON.parse(
            module.UTF8ToString(
              module._xerces_spike_run(
                attemptPointer,
                formatPointer,
                entryPointer,
              ),
            ),
          ),
        ),
      ),
    );
    return { elapsedMs: performance.now() - started, result };
  } finally {
    module._free(bytePointer);
  }
}

const smallBytes = await readFile(
  path.resolve('tests/fixtures/xerces-wasm-spike/xsd/valid.xsd'),
);
const largeBytes = await readFile(
  path.resolve('tests/fixtures/xsd/large-40000.xsd'),
);
const cold = [];
for (let index = 0; index < 5; index += 1)
  cold.push((await instantiate()).elapsedMs);

const active = await instantiate();
const memoryAfterInitialization = active.memory.buffer.byteLength;
const warmSmall = [];
for (let index = 0; index < 25; index += 1) {
  const measurement = validate(
    active.module,
    `small-${index}`,
    'valid.xsd',
    smallBytes,
  );
  if (measurement.result.status !== 'valid')
    throw new Error('Small fixture did not validate.');
  warmSmall.push(measurement.elapsedMs);
}
const memoryAfterSmall = active.memory.buffer.byteLength;
const warmLarge = [];
for (let index = 0; index < 5; index += 1) {
  const measurement = validate(
    active.module,
    `large-${index}`,
    'large.xsd',
    largeBytes,
  );
  warmLarge.push(measurement.elapsedMs);
}
const memoryAfterLarge = active.memory.buffer.byteLength;

console.log(
  JSON.stringify(
    {
      environment: `${process.platform} ${process.arch}, Node ${process.version}`,
      samples: {
        coldInstantiation: cold.length,
        warmSmall: warmSmall.length,
        warmLarge: warmLarge.length,
      },
      coldInstantiation: summarize(cold),
      warmSmallValidation: summarize(warmSmall),
      warmLargeValidation: summarize(warmLarge),
      inputs: {
        smallBytes: smallBytes.byteLength,
        largeBytes: largeBytes.byteLength,
      },
      wasmMemoryBytes: {
        afterInitialization: memoryAfterInitialization,
        afterSmallRuns: memoryAfterSmall,
        afterLargeRuns: memoryAfterLarge,
      },
    },
    null,
    2,
  ),
);
