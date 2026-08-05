import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/svelte';
import JSZip from 'jszip';
import { get } from 'svelte/store';
import { describe, expect, it } from 'vitest';
import App from '../app/App.svelte';
import { inspectorStore } from '../app/stores/inspectorStore';
import { navigationStore } from '../app/stores/navigationStore';
import { replaceProjectSession } from '../app/stores/projectSession';
import {
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
    metadata: { origin: 'sample', sourceFilename: 'sample.book.dtd' },
  });
  if (!result.applied) throw new Error('Expected sample restoration to apply.');
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
