import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/svelte';
import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '../app/App.svelte';
import { inspectorStore } from '../app/stores/inspectorStore';
import { navigationStore } from '../app/stores/navigationStore';
import {
  bookDtdNodeIds,
  bookDtdProject,
} from '../schema/samples/bookDtdProject';
import schemaCarouselSource from '../ui/carousel/SchemaCarousel.svelte?raw';

function currentPath(): readonly string[] {
  return get(navigationStore.navigationPathIds);
}

async function activate(name: string): Promise<void> {
  await fireEvent.click(screen.getByRole('button', { name }));
}

describe('functional schema carousel', () => {
  beforeEach(() => {
    navigationStore.initializeAt(bookDtdNodeIds.book);
    inspectorStore.close();
  });

  afterEach(() => {
    navigationStore.initializeAt(bookDtdNodeIds.book);
    inspectorStore.close();
  });

  it('renders one model-derived focus-card structure with separate controls', () => {
    render(App);

    const focus = screen.getByRole('article', { name: 'book' });
    expect(within(focus).getByText('DTD element declaration')).toBeVisible();
    expect(within(focus).getByLabelText('Content model')).toHaveTextContent(
      '(front.matter, book.content, index)',
    );
    expect(within(focus).queryByText('3 children')).not.toBeInTheDocument();
    expect(within(focus).getByText('sample.book.dtd')).toBeVisible();
    expect(within(focus).getAllByRole('button')).toHaveLength(5);
    expect(
      within(focus).getByRole('button', { name: 'Inspect book' }),
    ).toBeVisible();
    expect(within(focus).getByText('2 attributes')).toBeVisible();
  });

  it('navigates leafward in model order, extends the path, announces, and focuses the new heading', async () => {
    render(App);

    const leafward = screen.getByRole('region', {
      name: 'Leafward destinations',
    });
    expect(
      within(leafward)
        .getAllByRole('button')
        .map((button) => button.ariaLabel)
        .filter((label) => label?.startsWith('Navigate')),
    ).toEqual([
      'Navigate leafward to front.matter, DTD element declaration',
      'Navigate leafward to book.content, DTD element declaration',
      'Navigate leafward to index, DTD element declaration',
    ]);

    const status = screen.getByRole('status');
    expect(status.textContent?.trim()).toBe('');
    await activate(
      'Navigate leafward to book.content, DTD element declaration',
    );

    const heading = await screen.findByRole('heading', {
      name: 'book.content',
    });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(currentPath()).toEqual([
      bookDtdNodeIds.book,
      bookDtdNodeIds.bookContent,
    ]);
    expect(
      screen.getByRole('button', {
        name: 'Navigate leafward to chapter+, DTD element declaration',
      }),
    ).toHaveTextContent('chapter+');
    expect(status).toHaveTextContent(
      'Focused: book.content, DTD element declaration. One child.',
    );
  });

  it('centers an inline content-model reference through the shared journey route', async () => {
    render(App);

    inspectorStore.inspect(bookDtdNodeIds.index);
    const focus = screen.getByRole('article', { name: 'book' });
    await fireEvent.click(
      within(focus).getByRole('button', { name: 'Center book.content' }),
    );

    await waitFor(() =>
      expect(currentPath()).toEqual([
        bookDtdNodeIds.book,
        bookDtdNodeIds.bookContent,
      ]),
    );
    expect(get(inspectorStore.inspectedNodeId)).toBe(bookDtdNodeIds.index);
    expect(
      screen.getByRole('complementary', { name: 'Schema inspector' }),
    ).toHaveTextContent('index');
  });

  it('supports a deeper journey and truncates to any selected rootward path node', async () => {
    render(App);

    await activate(
      'Navigate leafward to book.content, DTD element declaration',
    );
    await activate('Navigate leafward to chapter+, DTD element declaration');
    await activate('Navigate leafward to section*, DTD element declaration');

    expect(currentPath()).toEqual([
      bookDtdNodeIds.book,
      bookDtdNodeIds.bookContent,
      bookDtdNodeIds.chapter,
      bookDtdNodeIds.section,
    ]);
    const rootward = screen.getByRole('region', { name: 'Rootward journey' });
    expect(
      within(rootward).getByRole('article', { name: 'Previous step chapter' }),
    ).toBeVisible();
    expect(
      within(rootward)
        .getAllByRole('button', { name: /earlier in the current path/ })
        .map((button) => button.ariaLabel),
    ).toEqual([
      'Jump to book.content, earlier in the current path',
      'Jump to book, earlier in the current path',
    ]);

    await activate('Jump to book, earlier in the current path');
    const heading = await screen.findByRole('heading', { name: 'book' });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(currentPath()).toEqual([bookDtdNodeIds.book]);
  });

  it('moves one level rootward when the nearest path card is activated', async () => {
    render(App);

    await activate(
      'Navigate leafward to book.content, DTD element declaration',
    );
    await activate('Navigate leafward to chapter+, DTD element declaration');
    await activate('Navigate leafward to section*, DTD element declaration');
    await activate('Navigate rootward to chapter, DTD element declaration');

    expect(currentPath()).toEqual([
      bookDtdNodeIds.book,
      bookDtdNodeIds.bookContent,
      bookDtdNodeIds.chapter,
    ]);
  });

  it('shows occurrence markers from relationship data at every sample branch', async () => {
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 700,
      writable: true,
    });
    render(App);

    navigationStore.initializeAt(bookDtdNodeIds.frontMatter);
    await waitFor(() =>
      expect(
        screen.getByRole('button', {
          name: 'Navigate leafward to preface?, DTD element declaration',
        }),
      ).toHaveTextContent('preface?'),
    );

    navigationStore.initializeAt(bookDtdNodeIds.bookContent);
    await waitFor(() =>
      expect(
        screen.getByRole('button', {
          name: 'Navigate leafward to chapter+, DTD element declaration',
        }),
      ).toHaveTextContent('chapter+'),
    );

    navigationStore.initializeAt(bookDtdNodeIds.chapter);
    await waitFor(() =>
      expect(
        within(screen.getByRole('region', { name: 'Leafward destinations' }))
          .getAllByRole('button')
          .map((button) => button.getAttribute('aria-label'))
          .filter((label) => label?.startsWith('Navigate')),
      ).toEqual([
        'Navigate leafward to title, DTD element declaration',
        'Navigate leafward to epigraph?, DTD element declaration',
        'Navigate leafward to section*, DTD element declaration',
      ]),
    );
    const chapterBranch = screen.getByRole('region', {
      name: 'Leafward destinations',
    });
    await fireEvent.click(
      within(chapterBranch).getByRole('button', {
        name: 'Show 2 nodes below in the leafward rail',
      }),
    );
    await fireEvent.click(
      within(chapterBranch).getByRole('button', {
        name: 'Show 1 node below in the leafward rail',
      }),
    );
    expect(
      within(chapterBranch)
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label'))
        .filter((label) => label?.startsWith('Navigate')),
    ).toEqual([
      'Navigate leafward to section*, DTD element declaration',
      'Navigate leafward to figure*, DTD element declaration',
      'Navigate leafward to note*, DTD element declaration',
    ]);

    navigationStore.initializeAt(bookDtdNodeIds.titlePage);
    await waitFor(() =>
      expect(
        screen.getByRole('button', {
          name: 'Navigate leafward to author+, DTD element declaration',
        }),
      ).toHaveTextContent('author+'),
    );

    navigationStore.initializeAt(bookDtdNodeIds.section);
    await waitFor(() =>
      expect(
        screen.getByRole('button', {
          name: 'Navigate leafward to para+, DTD element declaration',
        }),
      ).toHaveTextContent('para+'),
    );

    navigationStore.initializeAt(bookDtdNodeIds.index);
    await waitFor(() =>
      expect(
        screen.getByRole('button', {
          name: 'Navigate leafward to index.entry+, DTD element declaration',
        }),
      ).toHaveTextContent('index.entry+'),
    );
  });

  it('uses native sibling buttons while keeping inspector state separate', () => {
    render(App);

    const navigationButton = screen.getByRole('button', {
      name: 'Navigate leafward to book.content, DTD element declaration',
    });
    expect(navigationButton.tagName).toBe('BUTTON');
    expect(navigationButton).toHaveAttribute('type', 'button');
    expect(navigationButton.querySelector('button')).toBeNull();
    const contextCard = navigationButton.closest('article');
    expect(contextCard).not.toBeNull();
    expect(within(contextCard!).getAllByRole('button')).toHaveLength(2);

    const inspector = screen.getByRole('complementary', {
      name: 'Schema inspector',
    });
    expect(
      within(inspector).getByRole('heading', { name: 'Nothing inspected' }),
    ).toBeVisible();
    expect(
      within(inspector).queryByRole('button', {
        name: /^Center inspected node /,
      }),
    ).not.toBeInTheDocument();
    expect(bookDtdProject).not.toHaveProperty('inspectedNodeId');
  });

  it('contains an explicit reduced-motion suppression contract', () => {
    expect(schemaCarouselSource).toContain('prefers-reduced-motion');
    expect(schemaCarouselSource).toContain(
      'presentation-reduced-motion-commit',
    );
    expect(schemaCarouselSource).toContain('--duration-gesture-reduced');
  });
});
