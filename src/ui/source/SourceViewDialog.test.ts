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
    expect(source).not.toContain('clipboard');
    expect(source).toContain('white-space: pre');
    expect(source).toContain('overflow: auto');
    expect(source).toContain('@media (forced-colors: active)');
  });

  it('shows discontiguous fragments as separate labelled regions', async () => {
    render(SourceViewDialog, {
      props: {
        open: true,
        presentation: presentation({
          location: {
            kind: 'multipleFragments',
            label: 'Multiple retained source fragments',
          },
          fragments: [
            presentation().fragments[0]!,
            {
              id: 'second',
              text: '<!ATTLIST root id ID #IMPLIED>',
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
    await waitFor(() => expect(close).toHaveFocus());
    await fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(sourceRegion).toHaveFocus();
    await fireEvent.keyDown(sourceRegion, { key: 'Tab' });
    expect(close).toHaveFocus();
    await fireEvent.keyDown(sourceRegion, { key: 'ArrowDown' });
    await fireEvent.keyDown(close, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledWith('escape');
    await fireEvent.click(close);
    expect(onClose).toHaveBeenCalledWith('close');
  });
});
