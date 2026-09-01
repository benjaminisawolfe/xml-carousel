import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRelaxNgAdapter, type RelaxNgModule } from './adapter';

const emptyWasmModule = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
]);

function unusedModule(): RelaxNgModule {
  return {
    _malloc: () => 1,
    _free: () => undefined,
    _relaxng_reset: () => 0,
    _relaxng_add_file: () => 0,
    _relaxng_compile: () => 0,
    _relaxng_engine_version: () => 0,
    _relaxng_result_json: () => 0,
    UTF8ToString: () => '',
    lengthBytesUTF8: () => 0,
    stringToUTF8: () => undefined,
    writeArrayToMemory: () => undefined,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('RELAX NG production adapter loading', () => {
  it('prefetches bytes and instantiates WASM independently of its hostile MIME type', async () => {
    const fetch = vi.fn(
      async () =>
        new Response(emptyWasmModule, {
          status: 200,
          headers: { 'content-type': 'application/octet-stream' },
        }),
    );
    vi.stubGlobal('fetch', fetch);
    let usedInstantiationHook = false;
    await createRelaxNgAdapter(
      async (options) => {
        expect(options?.locateFile?.('module.wasm', '/ignored/')).toBe(
          'https://example.test/assets/module.wasm',
        );
        options?.instantiateWasm?.({}, (instance) => {
          expect(instance).toBeInstanceOf(WebAssembly.Instance);
          usedInstantiationHook = true;
        });
        return unusedModule();
      },
      new URL('https://example.test/assets/module.js'),
      new URL('https://example.test/assets/module.wasm'),
    );
    expect(fetch).toHaveBeenCalledWith(
      new URL('https://example.test/assets/module.wasm'),
      { credentials: 'same-origin' },
    );
    expect(usedInstantiationHook).toBe(true);
  });

  it('maps byte-fetch failures to a fixed safe error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 404 })),
    );
    await expect(
      createRelaxNgAdapter(
        async () => unusedModule(),
        new URL('https://example.test/assets/module.js'),
        new URL('https://example.test/private/module.wasm'),
      ),
    ).rejects.toThrow(
      'A required RELAX NG standards-checker runtime module could not be loaded.',
    );
  });
});
