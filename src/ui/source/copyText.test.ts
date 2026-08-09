import { describe, expect, it, vi } from 'vitest';
import { copyText, type ClipboardTextWriter } from './copyText';
import source from './copyText.ts?raw';

describe('copyText', () => {
  it('passes exact retained source text to the Clipboard API', async () => {
    const retained =
      '\t<!-- retained -->\r\n<!ATTLIST ns:book title CDATA "A &amp; B">\r\n';
    const writeText = vi.fn(() => Promise.resolve());

    await expect(copyText(retained, { writeText })).resolves.toEqual({
      succeeded: true,
    });
    expect(writeText).toHaveBeenCalledOnce();
    expect(writeText).toHaveBeenCalledWith(retained);
  });

  it('reports unavailable clipboard and unavailable writeText truthfully', async () => {
    await expect(copyText('source', undefined)).resolves.toEqual({
      succeeded: false,
      reason: 'unavailable',
    });
    await expect(
      copyText('source', {} as ClipboardTextWriter),
    ).resolves.toEqual({ succeeded: false, reason: 'unavailable' });
  });

  it.each([
    ['rejected write', vi.fn(() => Promise.reject(new Error('denied')))],
    [
      'synchronous throw',
      vi.fn(() => {
        throw new Error('blocked');
      }),
    ],
  ])('reports a %s without claiming success', async (_case, writeText) => {
    await expect(copyText('private source', { writeText })).resolves.toEqual({
      succeeded: false,
      reason: 'failed',
    });
  });

  it('has no fallback, network, logging, or persistence side effects', async () => {
    const request = vi.spyOn(globalThis, 'fetch');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const writeText = vi.fn(() => Promise.resolve());

    await copyText('<!ELEMENT private EMPTY>', { writeText });

    expect(request).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(source).not.toContain('execCommand');
    expect(source).not.toContain('fetch(');
    expect(source).not.toContain('localStorage');
    expect(source).not.toContain('sessionStorage');
    expect(source).not.toContain('indexedDB');
    request.mockRestore();
    log.mockRestore();
    error.mockRestore();
  });
});
