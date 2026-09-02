import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AppShell from '../ui/layout/AppShell.svelte';
import type {
  RelaxNgWorkerRequestMessage,
  RelaxNgWorkerResultMessage,
} from '../standards/relaxng/workerProtocol';
import annotationSource from '../../tests/fixtures/relax-ng-wasm-spike/synthetic/rng/annotation.rng?raw';

class RngImportWorker {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  private terminated = false;

  postMessage(message: RelaxNgWorkerRequestMessage): void {
    void Promise.resolve().then(() => {
      if (this.terminated) return;
      const source = new TextDecoder().decode(message.request.files[0]!.bytes);
      const invalid = source.includes('<broken');
      const response: RelaxNgWorkerResultMessage = {
        type: 'relaxng:result',
        result: {
          attemptId: message.request.attemptId,
          engine: { name: 'libxml2 RELAX NG', version: '2.15.3' },
          status: invalid ? 'invalid' : 'valid',
          diagnostics: invalid
            ? [
                {
                  stage: 'standards',
                  code: 'libxml2-relaxng:19:1000',
                  severity: 'error',
                  message: 'RELAX NG schema is not valid.',
                  category: 'standards-invalid',
                  fileName: message.request.entryPath,
                  line: 2,
                  source: 'rng',
                },
              ]
            : [],
          dependencyRequests: [],
          metrics: {
            elapsedMs: 1,
            fileCount: 1,
            inputBytes: message.request.files[0]!.bytes.length,
          },
        },
      };
      this.onmessage?.(new MessageEvent('message', { data: response }));
    });
  }

  terminate(): void {
    this.terminated = true;
  }
}

function setFile(
  input: HTMLInputElement,
  name: string,
  sourceText: string,
): void {
  const bytes = new TextEncoder().encode(sourceText);
  const file = {
    name,
    text: () => Promise.resolve(sourceText),
    arrayBuffer: () =>
      Promise.resolve(
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ) as ArrayBuffer,
      ),
  };
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: { 0: file, length: 1, item: () => file },
  });
}

describe('standalone RNG application workflow', () => {
  let previousWorker: typeof Worker;
  let previousClipboard: PropertyDescriptor | undefined;

  beforeEach(() => {
    previousWorker = globalThis.Worker;
    previousClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    globalThis.Worker = RngImportWorker as unknown as typeof Worker;
  });

  afterEach(() => {
    globalThis.Worker = previousWorker;
    if (previousClipboard) {
      Object.defineProperty(navigator, 'clipboard', previousClipboard);
    } else {
      Reflect.deleteProperty(navigator, 'clipboard');
    }
  });

  it('opens a valid RNG, exposes exact source, and preserves it after an invalid replacement', async () => {
    const sourceText = annotationSource;
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const { container } = render(AppShell);
    const input = container.querySelector<HTMLInputElement>('#rng-file-input')!;
    setFile(input, 'annotation.rng', sourceText);

    await fireEvent.change(input);

    const heading = await screen.findByRole('heading', {
      name: 'annotation.rng',
    });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(screen.getAllByText('RELAX NG schema').length).toBeGreaterThan(0);
    await fireEvent.click(
      screen.getByRole('button', { name: /inspect annotation\.rng/i }),
    );
    expect(heading).toBeVisible();
    expect(screen.getAllByText('RELAX NG XML syntax').length).toBeGreaterThan(
      0,
    );
    expect(
      screen.getAllByText('libxml2 RELAX NG 2.15.3').length,
    ).toBeGreaterThan(0);
    const warning = container.querySelector<HTMLElement>(
      '[data-schema-import-warning]',
    )!;
    expect(
      within(warning).getByText(
        'This RELAX NG schema is standards-valid, but semantic presentation data is unavailable; the complete retained source remains available.',
      ),
    ).toBeVisible();

    const inspector = screen.getByRole('complementary', {
      name: 'Schema inspector',
    });
    const viewSource = within(inspector).getByRole('button', {
      name: /view source/i,
    });
    await fireEvent.click(viewSource);
    const dialog = await screen.findByRole('dialog', {
      name: 'annotation.rng',
    });
    expect(
      within(dialog).getByLabelText('Retained source for annotation.rng')
        .textContent,
    ).toBe(sourceText);
    await fireEvent.click(
      within(dialog).getByRole('button', { name: 'Copy source' }),
    );
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(sourceText));
    await fireEvent.click(
      within(dialog).getByRole('button', { name: /close source/i }),
    );

    setFile(input, 'broken.rng', '<broken\n');
    await fireEvent.change(input);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('RELAX NG schema is not valid.');
    expect(heading).toBeVisible();
    expect(screen.queryByText('project:///')).not.toBeInTheDocument();
    expect(alert).not.toHaveTextContent(/column/i);

    await fireEvent.click(
      within(alert).getByRole('button', { name: /dismiss/i }),
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Open RNG' })).toHaveFocus(),
    );
  });

  it('rejects .rnc truthfully without starting the RELAX NG worker', async () => {
    const worker = vi.spyOn(RngImportWorker.prototype, 'postMessage');
    const { container } = render(AppShell);
    const input = container.querySelector<HTMLInputElement>('#rng-file-input')!;
    setFile(input, 'compact.rnc', 'start = empty');

    await fireEvent.change(input);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'RELAX NG Compact Syntax (.rnc) is not supported yet. Choose a .rng file.',
    );
    expect(worker).not.toHaveBeenCalled();
    worker.mockRestore();
  });
});
