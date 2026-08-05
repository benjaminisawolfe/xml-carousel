import { afterEach, describe, expect, it, vi } from 'vitest';
import { createXercesAdapter, type XercesModuleFactory } from './adapter';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Xerces browser WASM loading', () => {
  it('prefetches octet-stream bytes and bypasses streaming instantiation', async () => {
    const minimalWasm = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]);
    const fetchMock = vi.fn(
      async () =>
        new Response(minimalWasm, {
          headers: { 'Content-Type': 'application/octet-stream' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const streaming = vi.spyOn(WebAssembly, 'instantiateStreaming');
    const factory = vi.fn(async (options) => {
      expect(options?.instantiateWasm).toBeTypeOf('function');
      let received = false;
      const exports = options!.instantiateWasm!({}, () => {
        received = true;
      });
      expect(received).toBe(true);
      expect(exports).toEqual({});
      return {} as Awaited<ReturnType<XercesModuleFactory>>;
    }) satisfies XercesModuleFactory;

    await createXercesAdapter(
      factory,
      new URL('https://example.test/assets/xerces-runtime.js'),
      new URL('https://example.test/assets/xerces-runtime.wasm'),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      new URL('https://example.test/assets/xerces-runtime.wasm'),
      { credentials: 'same-origin' },
    );
    expect(streaming).not.toHaveBeenCalled();
  });

  it('normalizes a failed WASM fetch without exposing its URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 503 })),
    );
    await expect(
      createXercesAdapter(
        vi.fn() as XercesModuleFactory,
        new URL('https://example.test/private/xerces-runtime.js'),
        new URL('https://example.test/private/xerces-runtime.wasm'),
      ),
    ).rejects.toThrow(
      'A required standards-checker runtime module could not be loaded.',
    );
  });
});
