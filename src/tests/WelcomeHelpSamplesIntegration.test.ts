import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/svelte';
import { get } from 'svelte/store';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../app/App.svelte';
import { inspectorStore } from '../app/stores/inspectorStore';
import { navigationStore } from '../app/stores/navigationStore';
import {
  activateImportedProject,
  type ProjectImportActivationOptions,
} from '../app/stores/projectSession';
import { activeProjectStore } from '../app/stores/projectStore';
import {
  WELCOME_PREFERENCE_KEY,
  WELCOME_PREFERENCE_VALUE,
} from '../app/welcome/welcomePreference';
import {
  bookDtdNodeIds,
  bookDtdProject,
} from '../schema/samples/bookDtdProject';
import { bookDtdSample } from '../schema/samples/sampleCatalog';

const sampleComment = `This is just a sample. Click any of the "Open" buttons above to load a file from your local hard drive. We don't store anything on the server side.`;

function resetBookSample(): void {
  const options: ProjectImportActivationOptions = {
    origin: 'sample',
    preparedSearchIndex: bookDtdSample.searchIndex,
  };
  const result = activateImportedProject(bookDtdSample.importResult, options);
  if (!result.applied) throw new Error('Could not reset the Book sample.');
}

function setFile(
  input: HTMLInputElement,
  file: { readonly name: string; text(): Promise<string> },
): void {
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: { 0: file, length: 1, item: () => file },
  });
}

type WelcomeCloseRoute =
  'close' | 'escape' | 'start' | 'sample-dtd' | 'sample-xsd';

async function dismissWelcome(
  dialog: HTMLElement,
  route: WelcomeCloseRoute,
): Promise<void> {
  if (route === 'escape') {
    await fireEvent.keyDown(dialog, { key: 'Escape' });
    return;
  }

  const buttonName = {
    close: 'Close XML Carousel help',
    start: 'Start exploring',
    'sample-dtd': 'Load sample DTD',
    'sample-xsd': 'Load sample XSD',
  }[route];
  await fireEvent.click(
    within(dialog).getByRole('button', { name: buttonName }),
  );
}

describe('welcome, Help, and built-in sample integration', () => {
  beforeEach(() => {
    resetBookSample();
  });

  it('opens unchecked on a fresh profile, closes for the page without persistence, and reopens on the next load', async () => {
    localStorage.removeItem(WELCOME_PREFERENCE_KEY);
    const rendered = render(App);
    const dialog = await screen.findByRole('dialog');
    const appShell = document.querySelector<HTMLElement>('.app-shell')!;
    const checkbox = within(dialog).getByRole('checkbox', {
      name: "Don't Show This Again",
    });

    expect(appShell).toHaveProperty('inert', true);
    expect(checkbox).not.toBeChecked();
    expect(get(activeProjectStore)).toMatchObject({
      origin: 'sample',
      sourceFilename: 'sample.book.dtd',
    });
    expect(
      get(activeProjectStore).sourceMarkupByNodeId?.[bookDtdNodeIds.book],
    ).toBeDefined();
    await waitFor(() =>
      expect(
        within(dialog).getByRole('button', {
          name: 'Close XML Carousel help',
        }),
      ).toHaveFocus(),
    );

    await fireEvent.click(
      within(dialog).getByRole('button', {
        name: 'Close XML Carousel help',
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: 'Open DTD' })).toHaveFocus();
    expect(localStorage.getItem(WELCOME_PREFERENCE_KEY)).toBeNull();

    rendered.unmount();
    const reloaded = render(App);
    const reopened = await screen.findByRole('dialog');
    const reopenedCheckbox = within(reopened).getByRole('checkbox', {
      name: "Don't Show This Again",
    });
    expect(reopenedCheckbox).not.toBeChecked();

    await fireEvent.click(reopenedCheckbox);
    await fireEvent.click(
      within(reopened).getByRole('button', { name: 'Start exploring' }),
    );
    expect(localStorage.getItem(WELCOME_PREFERENCE_KEY)).toBe(
      WELCOME_PREFERENCE_VALUE,
    );

    reloaded.unmount();
    render(App);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('initializes Help from persistence and removes suppression through an unchecked Escape dismissal', async () => {
    const rendered = render(App);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    const help = screen.getByRole('button', {
      name: 'Open XML Carousel help',
    });
    await fireEvent.click(help);
    const dialog = await screen.findByRole('dialog');
    const checkbox = within(dialog).getByRole('checkbox', {
      name: "Don't Show This Again",
    });
    expect(checkbox).toBeChecked();
    expect(localStorage.getItem(WELCOME_PREFERENCE_KEY)).toBe(
      WELCOME_PREFERENCE_VALUE,
    );

    await fireEvent.click(checkbox);
    await fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(help).toHaveFocus());
    expect(localStorage.getItem(WELCOME_PREFERENCE_KEY)).toBeNull();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    rendered.unmount();
    render(App);
    const reopenedCheckbox = await screen.findByRole('checkbox', {
      name: "Don't Show This Again",
    });
    expect(reopenedCheckbox).not.toBeChecked();
    await fireEvent.click(reopenedCheckbox);
    await fireEvent.click(
      screen.getByRole('button', { name: 'Close XML Carousel help' }),
    );
    expect(localStorage.getItem(WELCOME_PREFERENCE_KEY)).toBe(
      WELCOME_PREFERENCE_VALUE,
    );
  });

  it.each([
    { route: 'close' as const, checked: false },
    { route: 'close' as const, checked: true },
    { route: 'escape' as const, checked: false },
    { route: 'escape' as const, checked: true },
    { route: 'start' as const, checked: false },
    { route: 'start' as const, checked: true },
    { route: 'sample-dtd' as const, checked: false },
    { route: 'sample-dtd' as const, checked: true },
    { route: 'sample-xsd' as const, checked: false },
    { route: 'sample-xsd' as const, checked: true },
  ])(
    'applies $route with checked=$checked to the next fresh application instance',
    async ({ route, checked }) => {
      localStorage.removeItem(WELCOME_PREFERENCE_KEY);
      const currentPage = render(App);
      const dialog = await screen.findByRole('dialog');
      const checkbox = within(dialog).getByRole('checkbox', {
        name: "Don't Show This Again",
      });
      expect(checkbox).not.toBeChecked();
      if (checked) await fireEvent.click(checkbox);

      await dismissWelcome(dialog, route);
      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
      );
      expect(localStorage.getItem(WELCOME_PREFERENCE_KEY)).toBe(
        checked ? WELCOME_PREFERENCE_VALUE : null,
      );

      currentPage.unmount();
      const nextPage = render(App);
      if (checked) {
        await waitFor(() =>
          expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
        );
        await fireEvent.click(
          screen.getByRole('button', { name: 'Open XML Carousel help' }),
        );
        expect(
          await screen.findByRole('checkbox', {
            name: "Don't Show This Again",
          }),
        ).toBeChecked();
      } else {
        expect(
          await screen.findByRole('checkbox', {
            name: "Don't Show This Again",
          }),
        ).not.toBeChecked();
      }
      nextPage.unmount();
    },
  );

  it('treats storage read failure as unsuppressed on every fresh application instance', async () => {
    localStorage.removeItem(WELCOME_PREFERENCE_KEY);
    const getItem = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('denied');
      });

    const currentPage = render(App);
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByRole('checkbox', {
        name: "Don't Show This Again",
      }),
    ).not.toBeChecked();
    await dismissWelcome(dialog, 'close');
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    currentPage.unmount();
    render(App);
    expect(
      await screen.findByRole('checkbox', {
        name: "Don't Show This Again",
      }),
    ).not.toBeChecked();
    getItem.mockRestore();
  });

  it('reopens from Help, preserves session state and Search, blocks carousel arrows, and restores Help focus', async () => {
    navigationStore.navigateLeafward(bookDtdNodeIds.frontMatter);
    inspectorStore.inspect(bookDtdNodeIds.index);
    render(App);
    const search = screen.getByRole('searchbox', { name: 'Search schema' });
    await fireEvent.input(search, { target: { value: 'chapter' } });
    const beforePath = [...get(navigationStore).navigationPath];
    const beforeProject = get(activeProjectStore).project;
    const help = screen.getByRole('button', {
      name: 'Open XML Carousel help',
    });

    await fireEvent.click(help);
    const dialog = await screen.findByRole('dialog');
    await fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });

    expect(get(navigationStore).navigationPath).toEqual(beforePath);
    expect(get(inspectorStore).inspectedNodeId).toBe(bookDtdNodeIds.index);
    expect(get(activeProjectStore).project).toBe(beforeProject);
    expect(search).toHaveValue('chapter');

    await fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(help).toHaveFocus());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('exposes the renamed filename, exact attached comment, Search match, source markup, and attributes on the initial Book DTD', async () => {
    render(App);
    expect(
      within(screen.getByRole('banner')).getByText('sample.book.dtd'),
    ).toBeVisible();
    expect(
      within(
        screen.getByRole('navigation', { name: 'Schema navigation' }),
      ).getByText('sample.book.dtd'),
    ).toBeVisible();
    const focusCard = screen.getByRole('article', { name: 'book' });
    expect(within(focusCard).getByText(sampleComment)).toBeVisible();
    expect(
      within(focusCard).getByText('Line 1, column 1 · exact'),
    ).toBeVisible();

    await fireEvent.click(screen.getByRole('button', { name: 'Inspect book' }));
    const inspector = screen.getByRole('complementary', {
      name: 'Schema inspector',
    });

    expect(
      within(inspector).getByRole('heading', { name: 'DTD comments' }),
    ).toBeVisible();
    expect(
      within(inspector).getByRole('heading', { name: 'Attributes' }),
    ).toBeVisible();
    expect(
      within(
        within(inspector).getByRole('region', { name: 'Attributes' }),
      ).getByText('isbn'),
    ).toBeVisible();
    expect(
      within(
        inspector.querySelector<HTMLElement>('[data-inspector-comments]')!,
      ).getByText(sampleComment),
    ).toBeVisible();
    expect(
      within(inspector).getAllByText(/sample\.book\.dtd/).length,
    ).toBeGreaterThan(0);
    await fireEvent.click(
      within(inspector).getByRole('button', { name: 'View source for book' }),
    );
    const sourceDialog = await screen.findByRole('dialog', { name: 'book' });
    expect(within(sourceDialog).getByText(/<!ELEMENT book/)).toBeVisible();
    expect(within(sourceDialog).getByText(/<!ATTLIST book/)).toBeVisible();
    expect(sourceDialog.querySelector('code')).toHaveTextContent(sampleComment);
    await fireEvent.click(
      within(sourceDialog).getByRole('button', {
        name: 'Close source for book',
      }),
    );

    const search = screen.getByRole('searchbox', { name: 'Search schema' });
    await fireEvent.input(search, { target: { value: 'local hard drive' } });
    const results = await screen.findByRole('region', {
      name: 'Search results',
    });
    expect(
      within(results).getByRole('button', {
        name: 'Center book, DTD element declaration',
      }),
    ).toBeVisible();
    expect(within(results).getByText('sample.book.dtd')).toBeVisible();
  });

  it('loads both fully hydrated samples, resets session state, clears Search, and focuses the new card', async () => {
    render(App);
    const search = screen.getByRole('searchbox', { name: 'Search schema' });
    await fireEvent.input(search, { target: { value: 'chapter' } });
    inspectorStore.inspect(bookDtdNodeIds.index);
    navigationStore.navigateLeafward(bookDtdNodeIds.frontMatter);

    await fireEvent.click(
      screen.getByRole('button', { name: 'Open XML Carousel help' }),
    );
    await fireEvent.click(
      await screen.findByRole('button', { name: 'Load sample XSD' }),
    );
    await waitFor(() =>
      expect(get(activeProjectStore)).toMatchObject({
        origin: 'sample',
        sourceFilename: 'library.xsd',
      }),
    );
    expect(localStorage.getItem(WELCOME_PREFERENCE_KEY)).toBe(
      WELCOME_PREFERENCE_VALUE,
    );
    expect(get(navigationStore).navigationPath).toHaveLength(1);
    expect(get(inspectorStore).inspectedNodeId).toBeUndefined();
    expect(search).toHaveValue('');
    expect(get(activeProjectStore).xsdMetadataByNodeId).toBeDefined();
    expect(
      get(activeProjectStore).sourceMarkupByNodeId?.[
        get(navigationStore).navigationPath[0]
      ],
    ).toBeDefined();
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { level: 2, name: 'library' }),
      ).toHaveFocus(),
    );

    await fireEvent.click(
      screen.getByRole('button', { name: 'Open XML Carousel help' }),
    );
    await fireEvent.click(
      await screen.findByRole('checkbox', {
        name: "Don't Show This Again",
      }),
    );
    await fireEvent.click(
      await screen.findByRole('button', { name: 'Load sample DTD' }),
    );
    await waitFor(() =>
      expect(get(activeProjectStore)).toMatchObject({
        project: bookDtdProject,
        origin: 'sample',
        sourceFilename: 'sample.book.dtd',
      }),
    );
    expect(localStorage.getItem(WELCOME_PREFERENCE_KEY)).toBeNull();
    expect(get(activeProjectStore).commentsByNodeId).toBeDefined();
    expect(
      get(activeProjectStore).commentsByNodeId?.[bookDtdNodeIds.book]?.map(
        ({ text }) => text.trim(),
      ),
    ).toEqual([sampleComment]);
    expect(get(activeProjectStore).dtdAttributesByNodeId).toBeDefined();
    expect(
      get(activeProjectStore).sourceMarkupByNodeId?.[bookDtdNodeIds.book],
    ).toBeDefined();
    expect(
      get(activeProjectStore).sourceMarkupByNodeId?.[
        bookDtdNodeIds.book
      ]?.fragments.some(({ text }) => text.includes(sampleComment)),
    ).toBe(true);
  });

  it('keeps Help available and sample actions disabled while a file read is pending', async () => {
    let resolveRead: ((source: string) => void) | undefined;
    const pending = new Promise<string>((resolve) => {
      resolveRead = resolve;
    });
    const { container } = render(App);
    const input = container.querySelector<HTMLInputElement>('#dtd-file-input')!;
    setFile(input, { name: 'pending.dtd', text: () => pending });

    await fireEvent.change(input);
    const help = screen.getByRole('button', {
      name: 'Open XML Carousel help',
    });
    expect(help).toBeEnabled();
    await fireEvent.click(help);
    const dialog = await screen.findByRole('dialog');
    const checkbox = within(dialog).getByRole('checkbox', {
      name: "Don't Show This Again",
    });
    expect(checkbox).toBeChecked();
    await fireEvent.click(checkbox);
    expect(
      within(dialog).getByRole('button', { name: 'Load sample DTD' }),
    ).toBeDisabled();
    expect(
      within(dialog).getByRole('button', { name: 'Load sample XSD' }),
    ).toBeDisabled();
    await fireEvent.click(
      within(dialog).getByRole('button', {
        name: 'Close XML Carousel help',
      }),
    );
    expect(localStorage.getItem(WELCOME_PREFERENCE_KEY)).toBeNull();
    expect(screen.getByRole('button', { name: 'Opening DTD' })).toBeDisabled();

    resolveRead?.('<!ELEMENT pending EMPTY>');
    await waitFor(() =>
      expect(get(activeProjectStore).sourceFilename).toBe('pending.dtd'),
    );
  });

  it('clears an obsolete import failure only after successful sample activation', async () => {
    const { container } = render(App);
    const input = container.querySelector<HTMLInputElement>('#dtd-file-input')!;
    setFile(input, {
      name: 'broken.dtd',
      text: () => Promise.resolve('<!ELEMENT broken ('),
    });
    await fireEvent.change(input);
    await screen.findByRole('alert');

    await fireEvent.click(
      screen.getByRole('button', { name: 'Dismiss import error' }),
    );
    expect(
      screen.getByRole('button', {
        name: 'Open retained problem report for broken.dtd, 2 problems',
      }),
    ).toBeVisible();

    await fireEvent.click(
      screen.getByRole('button', { name: 'Open XML Carousel help' }),
    );
    await fireEvent.click(
      await screen.findByRole('button', { name: 'Load sample XSD' }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('alert')).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByRole('button', { name: /retained problem report/i }),
    ).toBeNull();
    expect(get(activeProjectStore).sourceFilename).toBe('library.xsd');
  });
});
