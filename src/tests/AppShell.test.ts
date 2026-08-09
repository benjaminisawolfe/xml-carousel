import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/svelte';
import JSZip from 'jszip';
import { get } from 'svelte/store';
import { describe, expect, it, vi } from 'vitest';
import App from '../app/App.svelte';
import { inspectorStore } from '../app/stores/inspectorStore';
import { navigationStore } from '../app/stores/navigationStore';
import { semanticZoomStore } from '../app/stores/semanticZoomStore';
import { activeProjectStore } from '../app/stores/projectStore';
import { replaceProjectSession } from '../app/stores/projectSession';
import { sourceViewStore } from '../app/stores/sourceViewStore';
import {
  bookDtdImportResult,
  bookDtdNodeIds,
  bookDtdProject,
} from '../schema/samples/bookDtdProject';
import appShellSource from '../ui/layout/AppShell.svelte?raw';
import inspectorPanelSource from '../ui/layout/InspectorPanel.svelte?raw';
import schemaCarouselSource from '../ui/carousel/SchemaCarousel.svelte?raw';
import topBarSource from '../ui/layout/TopBar.svelte?raw';
import libraryDtd from '../../tests/fixtures/dtd/library.dtd?raw';
import basicXsd from '../../tests/fixtures/xsd/basic-structure.xsd?raw';

function restoreSampleProject(): void {
  const result = replaceProjectSession({
    project: bookDtdProject,
    initialFocusNodeId: bookDtdNodeIds.book,
    metadata: {
      origin: 'sample',
      sourceFilename: 'sample.book.dtd',
      ...(bookDtdImportResult.status === 'success'
        ? {
            sourceMarkupByNodeId: bookDtdImportResult.sourceMarkupByNodeId,
            commentsByNodeId: bookDtdImportResult.commentsByNodeId,
            dtdAttributesByNodeId: bookDtdImportResult.dtdAttributesByNodeId,
          }
        : {}),
    },
  });
  if (!result.applied) throw new Error('Expected sample restoration to apply.');
}

function installClipboard(
  writeText: (text: string) => Promise<void>,
): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
  return () => {
    if (descriptor) Object.defineProperty(navigator, 'clipboard', descriptor);
    else delete (navigator as { clipboard?: Clipboard }).clipboard;
  };
}

async function zipBytes(): Promise<ArrayBuffer> {
  const archive = new JSZip();
  archive.file(
    'root.dtd',
    '<!ELEMENT root (child)>\n<!ELEMENT child (#PCDATA)>',
  );
  const bytes = await archive.generateAsync({
    type: 'uint8array',
    compression: 'STORE',
  });
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

describe('application shell', () => {
  it('opens source outside the inert shell and restores focus without mutating app state', async () => {
    restoreSampleProject();
    const request = vi.spyOn(globalThis, 'fetch');
    const { container } = render(App);
    const beforeNavigation = get(navigationStore);
    const beforeInspector = get(inspectorStore);
    const beforeZoom = get(semanticZoomStore);
    const sourceAction = screen.getByRole('button', {
      name: 'View source for book',
    });

    await fireEvent.click(sourceAction);

    const dialog = await screen.findByRole('dialog', { name: 'book' });
    const shell = container.querySelector('.app-shell');
    expect(shell).toHaveProperty('inert', true);
    expect(dialog.closest('.app-shell')).toBeNull();
    expect(dialog).toHaveTextContent('sample.book.dtd');
    expect(dialog).toHaveTextContent('Line 1, column 1 · exact');
    expect(get(navigationStore)).toEqual(beforeNavigation);
    expect(get(inspectorStore)).toEqual(beforeInspector);
    expect(get(semanticZoomStore)).toEqual(beforeZoom);
    expect(request).not.toHaveBeenCalled();

    await fireEvent.click(
      within(dialog).getByRole('button', { name: 'Close source for book' }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(sourceAction).toHaveFocus();
    expect(shell).toHaveProperty('inert', false);
    request.mockRestore();
  });

  it('copies only exact retained source without mutating application state or requesting a network resource', async () => {
    restoreSampleProject();
    const writeText = vi.fn(() => Promise.resolve());
    const restoreClipboard = installClipboard(writeText);
    const request = vi.spyOn(globalThis, 'fetch');
    try {
      render(App);
      const beforeProject = get(activeProjectStore);
      const beforeNavigation = get(navigationStore);
      const beforeInspector = get(inspectorStore);
      const beforeZoom = get(semanticZoomStore);
      await fireEvent.click(
        screen.getByRole('button', { name: 'View source for book' }),
      );
      const dialog = await screen.findByRole('dialog', { name: 'book' });
      const beforeSourceView = get(sourceViewStore);
      const retained = within(dialog).getByLabelText(
        'Retained source for book',
      ).textContent;

      await fireEvent.click(
        within(dialog).getByRole('button', { name: 'Copy source' }),
      );

      expect(writeText).toHaveBeenCalledOnce();
      expect(writeText).toHaveBeenCalledWith(retained);
      expect(within(dialog).getByRole('status')).toHaveTextContent(
        'Copied source',
      );
      expect(get(activeProjectStore)).toBe(beforeProject);
      expect(get(navigationStore)).toEqual(beforeNavigation);
      expect(get(inspectorStore)).toEqual(beforeInspector);
      expect(get(semanticZoomStore)).toEqual(beforeZoom);
      expect(get(sourceViewStore)).toEqual(beforeSourceView);
      expect(request).not.toHaveBeenCalled();
    } finally {
      request.mockRestore();
      restoreClipboard();
    }
  });

  it('restores Inspector-origin focus while focus and inspection remain independent', async () => {
    restoreSampleProject();
    render(App);
    const navigationPath = get(navigationStore).navigationPath;
    const focusedNodeId = navigationPath[navigationPath.length - 1];
    expect(inspectorStore.inspect(bookDtdNodeIds.chapter).applied).toBe(true);
    const inspectedNodeId = get(inspectorStore).inspectedNodeId;
    const sourceAction = await screen.findByRole('button', {
      name: 'View source for chapter',
    });
    await fireEvent.click(sourceAction);
    const dialog = await screen.findByRole('dialog', { name: 'chapter' });

    let currentPath = get(navigationStore).navigationPath;
    expect(currentPath[currentPath.length - 1]).toBe(focusedNodeId);
    expect(get(inspectorStore).inspectedNodeId).toBe(inspectedNodeId);
    await fireEvent.click(
      within(dialog).getByRole('button', {
        name: 'Close source for chapter',
      }),
    );
    await waitFor(() => expect(sourceAction).toHaveFocus());
    currentPath = get(navigationStore).navigationPath;
    expect(currentPath[currentPath.length - 1]).toBe(focusedNodeId);
    expect(get(inspectorStore).inspectedNodeId).toBe(inspectedNodeId);
  });

  it('preserves Search beneath source view and restores the exact result action', async () => {
    restoreSampleProject();
    render(App);
    const beforeNavigation = get(navigationStore);
    const beforeInspector = get(inspectorStore);
    const searchbox = screen.getByRole('searchbox', { name: 'Search schema' });
    await fireEvent.input(searchbox, { target: { value: 'chapter' } });
    const sourceAction = screen.getByRole('button', {
      name: 'View source for chapter',
    });
    await fireEvent.click(sourceAction);
    const dialog = await screen.findByRole('dialog', { name: 'chapter' });

    expect(searchbox).toHaveValue('chapter');
    expect(
      screen.getByRole('heading', { name: 'Search results' }),
    ).toBeInTheDocument();
    expect(get(navigationStore)).toEqual(beforeNavigation);
    expect(get(inspectorStore)).toEqual(beforeInspector);
    await fireEvent.click(
      within(dialog).getByRole('button', {
        name: 'Close source for chapter',
      }),
    );
    await waitFor(() => expect(sourceAction).toHaveFocus());
    expect(searchbox).toHaveValue('chapter');
    expect(
      screen.getByRole('heading', { name: 'Search results' }),
    ).toBeVisible();
  });

  it('clears an open source target during a pending copy and ignores its stale result after project replacement', async () => {
    restoreSampleProject();
    let resolveCopy!: () => void;
    const writeText = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveCopy = resolve;
        }),
    );
    const restoreClipboard = installClipboard(writeText);
    try {
      const { container } = render(App);
      await fireEvent.click(
        screen.getByRole('button', { name: 'View source for book' }),
      );
      const dialog = await screen.findByRole('dialog', { name: 'book' });
      await fireEvent.click(
        within(dialog).getByRole('button', { name: 'Copy source' }),
      );
      expect(writeText).toHaveBeenCalledOnce();

      const result = replaceProjectSession({
        project: bookDtdProject,
        initialFocusNodeId: bookDtdNodeIds.chapter,
        metadata: { origin: 'sample', sourceFilename: 'replacement.dtd' },
      });
      expect(result.applied).toBe(true);
      expect(get(activeProjectStore).sourceFilename).toBe('replacement.dtd');

      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      resolveCopy();
      await Promise.resolve();
      expect(container.querySelector('.app-shell')).not.toHaveAttribute(
        'inert',
      );
      expect(screen.queryByText('<!ELEMENT book')).not.toBeInTheDocument();
      expect(screen.queryByText('Copied source')).not.toBeInTheDocument();
      expect(get(sourceViewStore).nodeId).toBeUndefined();
    } finally {
      restoreClipboard();
      restoreSampleProject();
    }
  });

  it('renders the four required semantic regions', () => {
    render(App);

    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(
      screen.getByRole('navigation', { name: 'Schema navigation' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('main', { name: 'Schema carousel' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('complementary', { name: 'Schema inspector' }),
    ).toBeInTheDocument();
  });

  it('renders accessible logo branding and model-derived file identity', () => {
    render(App);

    const topBar = screen.getByRole('banner');
    const heading = within(topBar).getByRole('heading', {
      level: 1,
      name: 'XML Carousel',
    });
    const logo = within(topBar).getByRole('img', { name: 'XML Carousel' });

    expect(logo).toBeVisible();
    expect(heading).toContainElement(logo);
    expect(heading).toHaveTextContent('');
    expect(within(topBar).queryByText('XML Carousel')).not.toBeInTheDocument();
    expect(
      within(topBar).queryByText('Sample project'),
    ).not.toBeInTheDocument();
    expect(within(topBar).getByText('sample.book.dtd')).toBeInTheDocument();
    expect(
      within(topBar).queryByText('No schema loaded'),
    ).not.toBeInTheDocument();
  });

  it('enables all implemented schema opening controls', () => {
    render(App);

    const topBar = screen.getByRole('banner');
    expect(
      within(topBar).getByRole('button', { name: 'Open DTD' }),
    ).toBeEnabled();
    expect(
      within(topBar).getByRole('button', { name: 'Open XSD' }),
    ).toBeEnabled();
    expect(
      within(topBar).getByRole('button', { name: 'Open ZIP' }),
    ).toBeEnabled();
    expect(
      within(topBar).getByRole('searchbox', { name: 'Search schema' }),
    ).toBeEnabled();
    expect(
      within(topBar).getAllByRole('searchbox', { name: 'Search schema' }),
    ).toHaveLength(1);
    expect(
      within(topBar).getAllByRole('search', { name: 'Schema search' }),
    ).toHaveLength(1);
    expect(
      within(topBar).getByRole('button', {
        name: 'Open XML Carousel help',
      }),
    ).toBeEnabled();
    expect(within(topBar).queryByText('Settings')).not.toBeInTheDocument();
  });

  it('uses one coordinated controller and one format-neutral alert path', () => {
    expect(
      appShellSource.match(/createSchemaFileImportController\(/g),
    ).toHaveLength(1);
    expect(appShellSource).not.toContain('createDtdFileImportController');
    expect(appShellSource).toContain('importController.openDtd(file)');
    expect(appShellSource).toContain('importController.openXsd(file)');
    expect(appShellSource).toContain('importController.openZip(file)');
    expect(appShellSource).toContain('topBar.focusOpenButton(format)');
    expect(appShellSource.match(/<ImportErrorAlert/g)).toHaveLength(1);
    expect(appShellSource.match(/onDestroy\(/g)).toHaveLength(1);
    expect(appShellSource).toContain('importController.destroy()');
    expect(appShellSource).not.toContain('importDtdSource');
    expect(appShellSource).not.toContain('importXsdSource');
    expect(appShellSource).not.toContain('.text()');
    expect(appShellSource).not.toContain('.arrayBuffer()');
    expect(appShellSource).toMatch(
      /if \(outcome\.status === 'failure'\)[\s\S]*?return;[\s\S]*?applyWelcomePreference/,
    );
  });

  it('owns one responsive navigation drawer and its focus coordination', () => {
    render(App);
    const toggle = screen.getByRole('button', {
      name: 'Open schema navigation',
      hidden: true,
    });
    const navigation = screen.getByRole('navigation', {
      name: 'Schema navigation',
    });

    expect(toggle).toHaveAttribute('aria-controls', navigation.id);
    expect(appShellSource).toContain('isNavigationOpen');
    expect(appShellSource).toContain('navigation-backdrop');
    expect(appShellSource).toContain('projectSessionResetStore');
    expect(appShellSource).toContain('[data-navigation-close]');
    expect(appShellSource).toContain('[data-focus-card-heading]');
    expect(appShellSource).toContain('[data-inspector-close]');
  });

  it('opens and closes the drawer with Close, Escape, backdrop, and Search', async () => {
    const { container } = render(App);
    const toggle = screen.getByRole('button', {
      name: 'Open schema navigation',
      hidden: true,
    });
    await fireEvent.click(toggle);
    const close = screen.getByRole('button', { name: 'Close' });
    await waitFor(() => expect(close).toHaveFocus());
    await fireEvent.click(close);
    await waitFor(() => expect(toggle).toHaveFocus());

    await fireEvent.click(toggle);
    await fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(toggle).toHaveFocus());

    await fireEvent.click(toggle);
    const backdrop = container.querySelector<HTMLElement>(
      '.navigation-backdrop',
    )!;
    expect(backdrop).toHaveAttribute('aria-hidden', 'true');
    expect(backdrop).not.toHaveAttribute('tabindex');
    await fireEvent.pointerDown(backdrop);
    await waitFor(() => expect(toggle).toHaveFocus());

    await fireEvent.click(toggle);
    await fireEvent.pointerDown(
      screen.getByRole('searchbox', { name: 'Search schema' }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Close' }),
      ).not.toBeInTheDocument(),
    );
  });

  it('renders the named carousel and focused placeholder card', () => {
    render(App);

    const carousel = screen.getByRole('main', { name: 'Schema carousel' });
    expect(
      within(carousel).queryByRole('heading', { name: 'sample.book.dtd' }),
    ).not.toBeInTheDocument();
    expect(
      within(carousel).queryByText('Local schema view', { exact: false }),
    ).not.toBeInTheDocument();
    expect(
      within(carousel).queryByText('Schema carousel', { exact: true }),
    ).not.toBeInTheDocument();
    expect(
      within(carousel).queryByText('Showing Book DTD sample.', {
        exact: true,
      }),
    ).not.toBeInTheDocument();
    expect(
      within(carousel).getByRole('heading', { level: 2, name: 'book' }),
    ).toBeInTheDocument();
    const focus = within(carousel).getByRole('article', { name: 'book' });
    expect(
      within(focus).getByText('DTD element declaration'),
    ).toBeInTheDocument();
    expect(within(carousel).getByLabelText('Content model')).toHaveTextContent(
      '(front.matter, book.content, index)',
    );
  });

  it('renders a concise inspector empty state without fake sections', () => {
    render(App);

    const inspector = screen.getByRole('complementary', {
      name: 'Schema inspector',
    });
    expect(
      within(inspector).getByRole('heading', { name: 'Nothing inspected' }),
    ).toBeInTheDocument();
    expect(within(inspector).queryByRole('heading', { level: 3 })).toBeNull();
  });

  it('keeps stable compact-desktop and portrait-sheet layout contracts', () => {
    expect(appShellSource).toContain(
      '@media (min-width: 1280px) and (max-width: 1399px)',
    );
    expect(appShellSource).toContain(
      '/ min(20vw, 280px) minmax(0, 1fr) min(25vw, 340px)',
    );
    expect(schemaCarouselSource).not.toContain(
      '@media (min-width: 1280px) and (max-width: 1399px)',
    );
    expect(inspectorPanelSource).toContain(
      '@media (max-width: 699px) and (orientation: portrait)',
    );
    expect(inspectorPanelSource).toContain('data-inspector-close');
    expect(topBarSource).toContain('@media (max-width: 699px)');
    expect(topBarSource.match(/<SchemaSearch/g)).toHaveLength(1);
  });

  it('does not render package implementation IDs in the initial UI', () => {
    const { container } = render(App);
    expect(container.textContent).not.toMatch(
      /schema-package-(?:source|node|edge):/,
    );
  });

  it.each([
    ['dtd', 'library.dtd', 'library'],
    ['xsd', 'basic-structure.xsd', 'book'],
    ['zip', 'schemas.zip', 'root'],
  ] as const)(
    'hands successful %s import focus to the new current origin and accepts an immediate arrow',
    async (format, filename, initialNodeName) => {
      restoreSampleProject();
      const { container } = render(App);
      const input = container.querySelector<HTMLInputElement>(
        `#${format}-file-input`,
      );
      if (!input) throw new Error(`Expected ${format} file input.`);
      const file =
        format === 'zip'
          ? { name: filename, arrayBuffer: zipBytes }
          : {
              name: filename,
              text: () =>
                Promise.resolve(format === 'dtd' ? libraryDtd : basicXsd),
            };
      Object.defineProperty(input, 'files', {
        configurable: true,
        value: { 0: file, length: 1, item: () => file },
      });
      const openButton = screen.getByRole('button', {
        name: `Open ${format.toUpperCase()}`,
      });
      openButton.focus();

      await fireEvent.change(input);

      await waitFor(() =>
        expect(
          screen.getByRole('heading', {
            level: 2,
            name: initialNodeName,
          }),
        ).toHaveFocus(),
      );
      const focusHeading = screen.getByRole('heading', {
        level: 2,
        name: initialNodeName,
      });
      expect(focusHeading).toHaveAttribute('tabindex', '-1');
      expect(openButton).not.toHaveFocus();
      expect(input).not.toHaveFocus();
      expect(get(navigationStore).navigationPath).toHaveLength(1);
      expect(get(inspectorStore).inspectedNodeId).toBeUndefined();
      expect(
        screen.getByRole('heading', { name: 'Nothing inspected' }),
      ).toBeVisible();

      await fireEvent.keyDown(focusHeading, { key: 'ArrowRight' });

      await waitFor(() =>
        expect(get(navigationStore).navigationPath).toHaveLength(2),
      );
      expect(get(inspectorStore).inspectedNodeId).toBeUndefined();
    },
  );
});
