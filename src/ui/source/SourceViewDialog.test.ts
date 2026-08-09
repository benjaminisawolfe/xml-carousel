import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import type { SourceViewPresentation } from '../presentation/sourceMarkupPresentation';
import SourceViewDialog from './SourceViewDialog.svelte';
import source from './SourceViewDialog.svelte?raw';
import type { CopyText, CopyTextResult } from './copyText';

const hostileText = `  <script>alert('no')</script>\n<img src=x onerror="bad()"> & < > "quotes"\n<!-- comment -->\n<![CDATA[not active]]>`;

function presentation(
  overrides: Partial<SourceViewPresentation> = {},
): SourceViewPresentation {
  return {
    projectId: 'project',
    nodeId: 'root',
    displayName: 'root',
    nodeKind: 'dtdElement',
    nodeKindLabel: 'DTD element declaration',
    sourceIdentity: {
      kind: 'standaloneFilename',
      label: 'hostile.dtd',
    },
    location: {
      kind: 'exactLineColumn',
      line: 8,
      column: 3,
      label: 'Line 8, column 3 · exact',
    },
    syntax: 'dtd',
    fragments: [
      {
        id: 'fragment',
        text: hostileText,
        location: {
          kind: 'exactLineColumn',
          line: 8,
          column: 3,
          label: 'Line 8, column 3 · exact',
        },
      },
    ],
    sourceAvailable: true,
    ...overrides,
  };
}

const copied: CopyText = (): Promise<CopyTextResult> =>
  Promise.resolve({ succeeded: true });

function deferredCopy(): {
  copy: CopyText;
  resolve: (result: CopyTextResult) => void;
} {
  let resolvePromise!: (result: CopyTextResult) => void;
  const copy = vi.fn(
    () =>
      new Promise<CopyTextResult>((resolve) => {
        resolvePromise = resolve;
      }),
  );
  return { copy, resolve: (result) => resolvePromise(result) };
}

describe('SourceViewDialog', () => {
  it('opens as a large named reading surface with truthful metadata and inert source text', async () => {
    render(SourceViewDialog, {
      props: { open: true, presentation: presentation() },
    });
    const dialog = await screen.findByRole('dialog', { name: 'root' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveTextContent('DTD element declaration');
    expect(dialog).toHaveTextContent('hostile.dtd');
    expect(dialog).toHaveTextContent('Line 8, column 3 · exact');
    const readingRegion = within(dialog).getByLabelText(
      'Retained source for root',
    );
    expect(readingRegion.textContent).toBe(hostileText);
    expect(readingRegion.textContent?.startsWith('  ')).toBe(true);
    expect(dialog.querySelector('script')).toBeNull();
    expect(dialog.querySelector('img')).toBeNull();
    expect(source).not.toContain('{@html');
    expect(source).not.toContain('innerHTML');
    expect(source).not.toContain('execCommand');
    expect(source).toContain('white-space: pre');
    expect(source).toContain('overflow: auto');
    expect(source).toContain('flex-wrap: wrap');
    expect(source).toContain('min-height: var(--control-min-size)');
    expect(source).toContain('@media (max-width: 699px)');
    expect(source).toContain('@media (forced-colors: active)');
  });

  it('shows discontiguous fragments as separate labelled regions', async () => {
    const copySourceText = vi.fn(copied);
    const first = '<!-- root documentation -->\r\n<!ELEMENT root EMPTY>';
    const second = '\t<!ATTLIST root title CDATA "A &amp; B">';
    const unrelated = '<!ENTITY unrelated "must stay excluded">';
    render(SourceViewDialog, {
      props: {
        open: true,
        copySourceText,
        presentation: presentation({
          location: {
            kind: 'multipleFragments',
            label: 'Multiple retained source fragments',
          },
          fragments: [
            { ...presentation().fragments[0]!, text: first },
            {
              id: 'second',
              text: second,
              location: {
                kind: 'exactLineColumn',
                line: 22,
                column: 1,
                label: 'Line 22, column 1 · exact',
              },
            },
          ],
        }),
      },
    });
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Multiple retained source fragments');
    expect(
      within(dialog).getByRole('heading', { name: 'Retained fragment 1' }),
    ).toBeVisible();
    expect(
      within(dialog).getByRole('heading', { name: 'Retained fragment 2' }),
    ).toBeVisible();
    expect(
      within(dialog).getAllByLabelText(/Retained source fragment/),
    ).toHaveLength(2);
    const readingRegions = within(dialog).getAllByLabelText(
      /Retained source fragment/,
    );
    const copyActions = within(dialog).getAllByRole('button', {
      name: /Copy source fragment \d for root/,
    });
    const close = within(dialog).getByRole('button', {
      name: 'Close source for root',
    });
    expect(copyActions).toHaveLength(2);
    expect(
      within(dialog).queryByRole('button', { name: /^Copy source$/ }),
    ).toBeNull();
    await waitFor(() => expect(close).toHaveFocus());
    copyActions[0]!.focus();
    await fireEvent.click(copyActions[0]!);
    expect(copyActions[0]).toHaveFocus();
    expect(copySourceText).toHaveBeenLastCalledWith(first);
    await fireEvent.click(copyActions[1]!);
    expect(copySourceText).toHaveBeenLastCalledWith(second);
    expect(copySourceText).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(copySourceText.mock.calls)).not.toContain(unrelated);
    expect(within(dialog).getAllByRole('status')).toHaveLength(1);
    close.focus();
    await fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(readingRegions[1]).toHaveFocus();
    await fireEvent.keyDown(readingRegions[1]!, { key: 'Tab' });
    expect(close).toHaveFocus();
  });

  it('copies exact single-fragment DTD source only after deliberate activation', async () => {
    const dtdSource =
      '\t<!-- Book &amp; notes -->\r\n<!ELEMENT ns:book (chapter+)>\r\n<!ATTLIST ns:book title CDATA "A &lt; B">\r\n';
    const copySourceText = vi.fn(copied);
    const request = vi.spyOn(globalThis, 'fetch');
    render(SourceViewDialog, {
      props: {
        open: true,
        presentation: presentation({
          fragments: [
            {
              ...presentation().fragments[0]!,
              text: dtdSource,
            },
          ],
        }),
        copySourceText,
      },
    });
    const dialog = await screen.findByRole('dialog');
    const copy = within(dialog).getByRole('button', { name: 'Copy source' });
    const close = within(dialog).getByRole('button', {
      name: 'Close source for root',
    });

    expect(copySourceText).not.toHaveBeenCalled();
    await waitFor(() => expect(close).toHaveFocus());
    copy.focus();
    await fireEvent.click(copy);

    expect(copySourceText).toHaveBeenCalledOnce();
    expect(copySourceText).toHaveBeenCalledWith(dtdSource);
    expect(copy).toHaveFocus();
    expect(dialog).toBeVisible();
    expect(within(dialog).getByRole('status')).toHaveTextContent(
      'Copied source',
    );
    expect(request).not.toHaveBeenCalled();
    request.mockRestore();
  });

  it('never copies automatically on open, target change, or close', async () => {
    const copySourceText = vi.fn(copied);
    const rendered = render(SourceViewDialog, {
      props: { open: true, presentation: presentation(), copySourceText },
    });
    await screen.findByRole('dialog');
    expect(copySourceText).not.toHaveBeenCalled();

    await rendered.rerender({
      open: true,
      presentation: presentation({ nodeId: 'other', displayName: 'other' }),
      copySourceText,
    });
    expect(copySourceText).not.toHaveBeenCalled();
    await rendered.rerender({
      open: false,
      presentation: presentation({ nodeId: 'other', displayName: 'other' }),
      copySourceText,
    });
    expect(copySourceText).not.toHaveBeenCalled();
  });

  it('copies exact XSD package source without adding source identity metadata', async () => {
    const xsdSource =
      '  <xs:complexType name="BookType">\n\t<xs:annotation><!-- &lt;note> --></xs:annotation>\n  </xs:complexType>';
    const copySourceText = vi.fn(copied);
    render(SourceViewDialog, {
      props: {
        open: true,
        presentation: presentation({
          syntax: 'xsd',
          sourceIdentity: {
            kind: 'packageRelativePath',
            label: 'schemas/types/book.xsd',
          },
          fragments: [
            {
              ...presentation().fragments[0]!,
              text: xsdSource,
            },
          ],
        }),
        copySourceText,
      },
    });
    const dialog = await screen.findByRole('dialog');

    await fireEvent.click(
      within(dialog).getByRole('button', { name: 'Copy source' }),
    );

    expect(copySourceText).toHaveBeenCalledWith(xsdSource);
    expect(copySourceText.mock.calls[0]?.[0]).not.toContain(
      'schemas/types/book.xsd',
    );
  });

  it('keeps one polite status region and updates success and failures truthfully', async () => {
    const copySourceText = vi
      .fn<CopyText>()
      .mockResolvedValueOnce({ succeeded: true })
      .mockResolvedValueOnce({ succeeded: true })
      .mockResolvedValueOnce({ succeeded: false, reason: 'failed' })
      .mockResolvedValueOnce({ succeeded: false, reason: 'unavailable' })
      .mockResolvedValueOnce({ succeeded: true });
    render(SourceViewDialog, {
      props: { open: true, presentation: presentation(), copySourceText },
    });
    const dialog = await screen.findByRole('dialog');
    const copy = within(dialog).getByRole('button', { name: 'Copy source' });
    const status = within(dialog).getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveAttribute('aria-atomic', 'true');

    await fireEvent.click(copy);
    await fireEvent.click(copy);
    expect(within(dialog).getAllByRole('status')).toEqual([status]);
    expect(status).toHaveTextContent('Copied source');
    await fireEvent.click(copy);
    expect(status).toHaveTextContent("Couldn't copy source");
    expect(status).not.toHaveTextContent('Copied source');
    await fireEvent.click(copy);
    expect(status).toHaveTextContent('Copy unavailable');
    await fireEvent.click(copy);
    expect(status).toHaveTextContent('Copied source');
    expect(status).not.toHaveFocus();
  });

  it('clears feedback across close and target changes and ignores stale writes', async () => {
    const pending = deferredCopy();
    const rendered = render(SourceViewDialog, {
      props: {
        open: true,
        presentation: presentation(),
        copySourceText: pending.copy,
      },
    });
    let dialog = await screen.findByRole('dialog');
    await fireEvent.click(
      within(dialog).getByRole('button', { name: 'Copy source' }),
    );

    await rendered.rerender({
      open: false,
      presentation: presentation(),
      copySourceText: pending.copy,
    });
    pending.resolve({ succeeded: true });
    await Promise.resolve();
    await rendered.rerender({
      open: true,
      presentation: presentation({
        projectId: 'replacement-project',
        nodeId: 'replacement-node',
        displayName: 'replacement',
      }),
      copySourceText: vi.fn(copied),
    });

    dialog = await screen.findByRole('dialog', { name: 'replacement' });
    expect(within(dialog).getByRole('status')).toHaveTextContent('');
    expect(dialog).not.toHaveTextContent('Copied source');
    expect(dialog).not.toHaveTextContent(hostileText);
  });

  it('moves focus inside, traps both Tab directions, and handles Escape and Close', async () => {
    const onClose = vi.fn();
    render(SourceViewDialog, {
      props: { open: true, presentation: presentation(), onClose },
    });
    const dialog = await screen.findByRole('dialog');
    const close = within(dialog).getByRole('button', {
      name: 'Close source for root',
    });
    const sourceRegion = within(dialog).getByLabelText(
      'Retained source for root',
    );
    const copy = within(dialog).getByRole('button', { name: 'Copy source' });
    await waitFor(() => expect(close).toHaveFocus());
    copy.focus();
    await fireEvent.keyDown(copy, { key: 'Tab', shiftKey: true });
    expect(sourceRegion).toHaveFocus();
    await fireEvent.keyDown(sourceRegion, { key: 'Tab' });
    expect(copy).toHaveFocus();
    close.focus();
    expect(close).toHaveFocus();
    await fireEvent.keyDown(sourceRegion, { key: 'ArrowDown' });
    await fireEvent.keyDown(close, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledWith('escape');
    await fireEvent.click(close);
    expect(onClose).toHaveBeenCalledWith('close');
  });
});
