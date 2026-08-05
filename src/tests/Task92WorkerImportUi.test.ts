import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import App from '../app/App.svelte';

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolvePromise!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

function selectFile(
  input: HTMLInputElement,
  file: { readonly name: string; text(): Promise<string> },
): Promise<boolean> {
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: { 0: file, length: 1, item: () => file },
  });
  return fireEvent.change(input);
}

class HangingWorker extends EventTarget {
  static instance: HangingWorker | undefined;
  readonly terminate = vi.fn();
  request: unknown;

  constructor(
    _url: string | URL,
    readonly options?: WorkerOptions,
  ) {
    super();
    HangingWorker.instance = this;
  }

  postMessage(request: unknown): void {
    this.request = request;
  }
}

describe('Task 9.2 AppShell worker progress and cancellation', () => {
  it('shows reading progress, cancels immediately, restores focus, and ignores the late read', async () => {
    const source = deferred<string>();
    const { container } = render(App);
    const banner = screen.getByRole('banner');
    const identityBefore = within(banner).getByLabelText(
      /Current schema project:/,
    ).textContent;
    const input = container.querySelector<HTMLInputElement>('#xsd-file-input');
    if (!input) throw new Error('Expected XSD input.');
    const selection = selectFile(input, {
      name: 'slow.xsd',
      text: () => source.promise,
    });

    const status = await screen.findByRole('status', {
      name: 'Opening slow.xsd',
    });
    expect(status).toHaveTextContent('Opening slow.xsd');
    expect(status).toHaveTextContent('Reading the selected XSD file.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(
      within(banner).getByRole('button', { name: 'Opening XSD' }),
    ).toBeDisabled();
    expect(screen.getByRole('main', { name: 'Schema carousel' })).toBeVisible();

    await fireEvent.click(
      within(status).getByRole('button', {
        name: 'Cancel opening slow.xsd',
      }),
    );
    await selection;
    await waitFor(() => {
      expect(
        screen.queryByRole('status', { name: 'Opening slow.xsd' }),
      ).not.toBeInTheDocument();
      expect(
        within(banner).getByRole('button', { name: 'Open XSD' }),
      ).toHaveFocus();
    });
    expect(
      within(banner).getByLabelText(/Current schema project:/).textContent,
    ).toBe(identityBefore);

    source.resolve(
      '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:element name="late"/></xs:schema>',
    );
    await Promise.resolve();
    expect(
      within(banner).getByRole('button', { name: 'Open XSD' }),
    ).toHaveFocus();
    expect(within(banner).queryByText('slow.xsd')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows worker processing progress, terminates on Cancel, and restores the matching button', async () => {
    const previousWorker = globalThis.Worker;
    globalThis.Worker = HangingWorker as unknown as typeof Worker;
    try {
      const { container } = render(App);
      const banner = screen.getByRole('banner');
      const identityBefore = within(banner).getByLabelText(
        /Current schema project:/,
      ).textContent;
      const input =
        container.querySelector<HTMLInputElement>('#dtd-file-input');
      if (!input) throw new Error('Expected DTD input.');
      const selection = selectFile(input, {
        name: 'large.dtd',
        text: () => Promise.resolve('<!ELEMENT large EMPTY>'),
      });

      const status = await screen.findByRole('status', {
        name: 'Opening large.dtd',
      });
      expect(status).toHaveTextContent('Preparing large.dtd.');
      const worker = HangingWorker.instance;
      expect(worker?.options).toEqual({
        type: 'module',
        name: 'xml-carousel-schema-import',
      });
      worker?.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'progress',
            requestId: 'schema-import-1',
            progress: {
              phase: 'parsing',
              format: 'dtd',
              filename: 'large.dtd',
            },
          },
        }),
      );
      expect(await screen.findByText('Parsing large.dtd.')).toBeVisible();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      for (const name of ['Opening DTD', 'Open XSD', 'Open ZIP']) {
        expect(within(banner).getByRole('button', { name })).toBeDisabled();
      }

      await fireEvent.click(
        within(status).getByRole('button', {
          name: 'Cancel opening large.dtd',
        }),
      );
      await selection;
      expect(worker?.terminate).toHaveBeenCalledOnce();
      await waitFor(() =>
        expect(
          within(banner).getByRole('button', { name: 'Open DTD' }),
        ).toHaveFocus(),
      );
      expect(
        screen.queryByRole('status', { name: 'Opening large.dtd' }),
      ).not.toBeInTheDocument();
      expect(
        within(banner).getByLabelText(/Current schema project:/).textContent,
      ).toBe(identityBefore);
      worker?.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'failure',
            requestId: 'schema-import-1',
            diagnostic: { code: 'worker-runtime-failure' },
          },
        }),
      );
      await Promise.resolve();
      expect(
        within(banner).getByRole('button', { name: 'Open DTD' }),
      ).toHaveFocus();
    } finally {
      globalThis.Worker = previousWorker;
      HangingWorker.instance = undefined;
    }
  });
});
