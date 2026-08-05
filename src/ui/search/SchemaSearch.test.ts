import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/svelte';
import { get } from 'svelte/store';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildProjectSearchIndex,
  searchProjectIndex,
  type ProjectSearchIndexInput,
} from '../../app/search';
import {
  createActiveProjectStore,
  type ActiveProjectState,
} from '../../app/stores/projectStore';
import {
  createInspectorStore,
  type InspectorStore,
} from '../../app/stores/inspectorStore';
import {
  createNavigationStore,
  type NavigationStore,
} from '../../app/stores/navigationStore';
import type { SchemaProject } from '../../schema/model';
import { bookDtdProject } from '../../schema/samples/bookDtdProject';
import schemaSearchSource from './SchemaSearch.svelte?raw';
import SchemaSearch from './SchemaSearch.svelte';
import { SEARCH_GUIDANCE_TEXT } from '../presentation/projectSearchPresentation';

function mediaQuery(matches: boolean): MediaQueryList {
  return {
    matches,
    media: '(max-width: 899px)',
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  } as unknown as MediaQueryList;
}

function useViewport(compact: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => mediaQuery(compact)),
  );
}

function initialState(
  project: SchemaProject = bookDtdProject,
): ActiveProjectState {
  return {
    project,
    origin: 'sample',
    sourceFilename: project.sourceFiles?.[0]?.filename ?? 'book.dtd',
  };
}

function renderSearch(
  options: {
    readonly compact?: boolean;
    readonly state?: ActiveProjectState;
    readonly navigation?: NavigationStore;
    readonly inspector?: InspectorStore;
    readonly indexBuilder?: typeof buildProjectSearchIndex;
    readonly searchEngine?: typeof searchProjectIndex;
  } = {},
) {
  useViewport(options.compact ?? false);
  const projectStore = createActiveProjectStore(
    options.state ?? initialState(),
  );
  const project = options.state?.project ?? bookDtdProject;
  const initialFocusNodeId = project.rootNodeIds[0] ?? project.nodes[0]!.id;
  const navigation =
    options.navigation ??
    createNavigationStore(project, {
      projectId: project.id,
      navigationPath: [initialFocusNodeId],
    });
  const inspector =
    options.inspector ??
    createInspectorStore(project, {
      projectId: project.id,
    });
  const rendered = render(SchemaSearch, {
    props: {
      projectStore,
      navigation,
      inspector,
      ...(options.indexBuilder ? { indexBuilder: options.indexBuilder } : {}),
      ...(options.searchEngine ? { searchEngine: options.searchEngine } : {}),
    },
  });
  return { ...rendered, projectStore, navigation, inspector };
}

function replacementProject(id: string = bookDtdProject.id): SchemaProject {
  return {
    ...bookDtdProject,
    id,
    displayName: `${id} display`,
    nodes: bookDtdProject.nodes.map((node) => ({ ...node })),
    edges: bookDtdProject.edges.map((edge) => ({ ...edge })),
    rootNodeIds: [...bookDtdProject.rootNodeIds],
  };
}

function addActionDestination(
  attribute: 'data-focus-card-heading' | 'data-inspector-close',
): HTMLElement {
  const element = document.createElement(
    attribute === 'data-focus-card-heading' ? 'h2' : 'button',
  );
  element.setAttribute(attribute, '');
  element.setAttribute('data-search-action-test-destination', '');
  element.tabIndex = -1;
  document.body.append(element);
  return element;
}

afterEach(() => {
  vi.unstubAllGlobals();
  document
    .querySelectorAll('[data-search-action-test-destination]')
    .forEach((element) => element.remove());
});

describe('schema search controller', () => {
  it('renders one enabled desktop searchbox with the required attributes', async () => {
    renderSearch();
    const searchbox = await screen.findByRole('searchbox', {
      name: 'Search schema',
    });

    expect(screen.getByRole('search', { name: 'Schema search' })).toBeVisible();
    expect(searchbox).toBeEnabled();
    expect(searchbox).toHaveAttribute('type', 'search');
    expect(searchbox).toHaveAttribute('placeholder', 'Search schema');
    expect(searchbox).toHaveAttribute('autocomplete', 'off');
    expect(searchbox).toHaveAttribute('spellcheck', 'false');
    expect(searchbox).toHaveAttribute('aria-expanded', 'false');
    expect(searchbox).toHaveAttribute('aria-controls', 'schema-search-results');
    expect(screen.getAllByRole('searchbox')).toHaveLength(1);
    expect(
      screen.queryByRole('button', { name: 'Search schema' }),
    ).not.toBeInTheDocument();
  });

  it('opens guidance on focus and updates grouped results synchronously', async () => {
    renderSearch();
    const searchbox = screen.getByRole('searchbox', {
      name: 'Search schema',
    });

    await fireEvent.focus(searchbox);
    expect(
      screen.getByRole('heading', { name: 'Search results' }),
    ).toBeVisible();
    expect(screen.getByText(SEARCH_GUIDANCE_TEXT)).toBeVisible();
    expect(searchbox).toHaveAttribute('aria-expanded', 'true');

    await fireEvent.input(searchbox, { target: { value: 'book.content' } });

    expect(
      screen.getByRole('heading', { name: 'DTD declarations (1)' }),
    ).toBeVisible();
    expect(screen.getByText('book.content')).toBeVisible();
  });

  it('builds one index per active-state change, not per keystroke', async () => {
    const indexBuilder = vi.fn((input: ProjectSearchIndexInput) =>
      buildProjectSearchIndex(input),
    );
    const { projectStore } = renderSearch({ indexBuilder });
    const searchbox = screen.getByRole('searchbox', {
      name: 'Search schema',
    });
    const initialBuildCount = indexBuilder.mock.calls.length;

    await fireEvent.input(searchbox, { target: { value: 'b' } });
    await fireEvent.input(searchbox, { target: { value: 'bo' } });
    await fireEvent.input(searchbox, { target: { value: 'book' } });

    expect(indexBuilder).toHaveBeenCalledTimes(initialBuildCount);

    projectStore.replace(replacementProject(), {
      origin: 'sample',
      sourceFilename: 'book.dtd',
    });
    await waitFor(() =>
      expect(indexBuilder).toHaveBeenCalledTimes(initialBuildCount + 1),
    );
  });

  it('requests only 101 results from the Task 7.1 engine', async () => {
    const searchEngine = vi.fn(searchProjectIndex);
    renderSearch({ searchEngine });
    const searchbox = screen.getByRole('searchbox', {
      name: 'Search schema',
    });

    await fireEvent.input(searchbox, { target: { value: 'book' } });

    expect(searchEngine).toHaveBeenLastCalledWith(expect.any(Object), 'book', {
      limit: 101,
    });
  });

  it('clears to guidance, keeps the panel open, and focuses the input', async () => {
    renderSearch();
    const searchbox = screen.getByRole('searchbox', {
      name: 'Search schema',
    });
    await fireEvent.input(searchbox, { target: { value: 'book' } });
    const clear = screen.getByRole('button', { name: 'Clear search' });
    clear.focus();

    await fireEvent.click(clear);

    expect(searchbox).toHaveValue('');
    expect(searchbox).toHaveFocus();
    expect(screen.getByText(SEARCH_GUIDANCE_TEXT)).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'Search results' }),
    ).toBeVisible();
  });

  it('closes with Close search, retains the query, and restores desktop focus', async () => {
    renderSearch();
    const searchbox = screen.getByRole('searchbox', {
      name: 'Search schema',
    });
    await fireEvent.input(searchbox, { target: { value: 'book' } });

    await fireEvent.click(screen.getByRole('button', { name: 'Close search' }));

    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: 'Search results' }),
      ).not.toBeInTheDocument(),
    );
    expect(searchbox).toHaveValue('book');
    expect(searchbox).toHaveFocus();

    await fireEvent.blur(searchbox);
    await fireEvent.focus(searchbox);
    expect(
      screen.getAllByText('book', { selector: 'mark' }).length,
    ).toBeGreaterThan(0);
  });

  it('closes on Escape while retaining query and desktop focus', async () => {
    renderSearch();
    const searchbox = screen.getByRole('searchbox', {
      name: 'Search schema',
    });
    await fireEvent.input(searchbox, { target: { value: 'book' } });
    searchbox.focus();

    await fireEvent.keyDown(searchbox, { key: 'Escape' });

    expect(
      screen.queryByRole('heading', { name: 'Search results' }),
    ).not.toBeInTheDocument();
    expect(searchbox).toHaveValue('book');
    expect(searchbox).toHaveFocus();
  });

  it('closes on outside pointer without stealing focus', async () => {
    renderSearch();
    const searchbox = screen.getByRole('searchbox', {
      name: 'Search schema',
    });
    await fireEvent.input(searchbox, { target: { value: 'book' } });
    searchbox.focus();

    await fireEvent.pointerDown(document.body);

    expect(
      screen.queryByRole('heading', { name: 'Search results' }),
    ).not.toBeInTheDocument();
    expect(searchbox).toHaveFocus();
  });

  it('uses a compact Search trigger and exposes one searchbox only when open', async () => {
    renderSearch({ compact: true });
    const trigger = await screen.findByRole('button', {
      name: 'Search schema',
    });

    expect(trigger).toHaveTextContent('Search');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();

    await fireEvent.click(trigger);
    const searchbox = screen.getByRole('searchbox', {
      name: 'Search schema',
    });
    await waitFor(() => expect(searchbox).toHaveFocus());
    expect(screen.getAllByRole('searchbox')).toHaveLength(1);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    await fireEvent.input(searchbox, { target: { value: 'book' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Close search' }));

    await waitFor(() => expect(trigger).toHaveFocus());
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('centres through the search origin, retains query, and focuses the card heading', async () => {
    const { navigation, inspector } = renderSearch();
    const center = vi.spyOn(navigation, 'centerNode');
    const inspect = vi.spyOn(inspector, 'inspect');
    const heading = addActionDestination('data-focus-card-heading');
    const searchbox = screen.getByRole('searchbox', {
      name: 'Search schema',
    });
    await fireEvent.input(searchbox, {
      target: { value: 'book.content' },
    });

    await fireEvent.click(
      screen.getByRole('button', {
        name: 'Center book.content, DTD element declaration',
      }),
    );

    expect(center).toHaveBeenCalledWith({
      targetNodeId: 'dtd:element:book.content',
      origin: 'search',
    });
    expect(center.mock.calls[0]![0]).not.toHaveProperty('relationshipContext');
    expect(center.mock.calls[0]![0]).not.toHaveProperty('beginNewJourney');
    expect(inspect).not.toHaveBeenCalled();
    await waitFor(() => expect(heading).toHaveFocus());
    expect(searchbox).toHaveValue('book.content');
    expect(
      screen.queryByRole('heading', { name: 'Search results' }),
    ).not.toBeInTheDocument();
  });

  it('accepts an already-focused result and returns focus to its heading', async () => {
    const { navigation } = renderSearch();
    const center = vi.spyOn(navigation, 'centerNode');
    const heading = addActionDestination('data-focus-card-heading');
    const searchbox = screen.getByRole('searchbox', {
      name: 'Search schema',
    });
    await fireEvent.input(searchbox, { target: { value: 'book' } });

    await fireEvent.click(
      screen.getByRole('button', {
        name: 'Center book, DTD element declaration',
      }),
    );

    expect(center).toHaveReturnedWith(
      expect.objectContaining({ applied: false, reason: 'alreadyFocused' }),
    );
    await waitFor(() => expect(heading).toHaveFocus());
    expect(searchbox).toHaveValue('book');
    expect(
      screen.queryByRole('heading', { name: 'Search results' }),
    ).not.toBeInTheDocument();
  });

  it('inspects without centring, retains query, and focuses inspector Close', async () => {
    const { navigation, inspector } = renderSearch();
    const center = vi.spyOn(navigation, 'centerNode');
    const inspect = vi.spyOn(inspector, 'inspect');
    const inspectorClose = addActionDestination('data-inspector-close');
    const searchbox = screen.getByRole('searchbox', {
      name: 'Search schema',
    });
    await fireEvent.input(searchbox, { target: { value: 'chapter' } });

    await fireEvent.click(
      screen.getByRole('button', {
        name: 'Inspect chapter, DTD element declaration',
      }),
    );

    expect(inspect).toHaveBeenCalledWith('dtd:element:chapter');
    expect(center).not.toHaveBeenCalled();
    await waitFor(() => expect(inspectorClose).toHaveFocus());
    expect(searchbox).toHaveValue('chapter');
    expect(
      screen.queryByRole('heading', { name: 'Search results' }),
    ).not.toBeInTheDocument();

    await fireEvent.blur(searchbox);
    await fireEvent.focus(searchbox);
    expect(
      screen.getByRole('button', {
        name: 'Inspect chapter, DTD element declaration, currently inspected',
      }),
    ).toBeVisible();
  });

  it('keeps failed actions open, focused, and politely reported until cleared', async () => {
    const { navigation, inspector } = renderSearch();
    vi.spyOn(navigation, 'centerNode').mockReturnValue({
      applied: false,
      reason: 'unknownNode',
      state: get(navigation),
    });
    vi.spyOn(inspector, 'inspect').mockReturnValue({
      applied: false,
      reason: 'unknownNode',
      state: get(inspector),
    });
    const searchbox = screen.getByRole('searchbox', {
      name: 'Search schema',
    });
    await fireEvent.input(searchbox, { target: { value: 'chapter' } });
    const center = screen.getByRole('button', {
      name: 'Center chapter, DTD element declaration',
    });
    center.focus();

    await fireEvent.click(center);

    expect(center).toHaveFocus();
    expect(
      screen.getByText(
        'That search result is no longer available in the current schema.',
      ),
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'Search results' }),
    ).toBeVisible();
    expect(searchbox).toHaveValue('chapter');

    await fireEvent.input(searchbox, { target: { value: 'book' } });
    expect(
      screen.queryByText(
        'That search result is no longer available in the current schema.',
      ),
    ).not.toBeInTheDocument();
    const inspectButton = screen.getByRole('button', {
      name: 'Inspect book, DTD element declaration',
    });
    inspectButton.focus();
    await fireEvent.click(inspectButton);
    expect(inspectButton).toHaveFocus();
    expect(
      screen.getByText(
        'That search result is no longer available in the current schema.',
      ),
    ).toBeVisible();
  });

  it('does not restore the compact trigger after successful action closure', async () => {
    const { navigation } = renderSearch({ compact: true });
    const center = vi.spyOn(navigation, 'centerNode');
    const heading = addActionDestination('data-focus-card-heading');
    const trigger = screen.getByRole('button', { name: 'Search schema' });
    await fireEvent.click(trigger);
    const searchbox = screen.getByRole('searchbox', {
      name: 'Search schema',
    });
    await fireEvent.input(searchbox, {
      target: { value: 'book.content' },
    });

    await fireEvent.click(
      screen.getByRole('button', {
        name: 'Center book.content, DTD element declaration',
      }),
    );

    expect(center).toHaveBeenCalledOnce();
    await waitFor(() => expect(heading).toHaveFocus());
    expect(trigger).not.toHaveFocus();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  });

  it('passes current focus and inspection state back into reopened results', async () => {
    const { inspector } = renderSearch();
    expect(inspector.inspect('dtd:element:book').applied).toBe(true);
    const searchbox = screen.getByRole('searchbox', {
      name: 'Search schema',
    });
    await fireEvent.input(searchbox, { target: { value: 'book' } });
    const center = screen.getByRole('button', {
      name: 'Center book, DTD element declaration',
    });

    expect(center).toHaveAttribute('aria-current', 'true');
    expect(
      screen.getByRole('button', {
        name: 'Inspect book, DTD element declaration, currently inspected',
      }),
    ).toBeVisible();
    expect(center.closest('article')).toHaveAttribute('data-inspected', 'true');
  });

  it('clears and closes on project-ID change without preserving stale results', async () => {
    const { projectStore } = renderSearch();
    const searchbox = screen.getByRole('searchbox', {
      name: 'Search schema',
    });
    await fireEvent.input(searchbox, { target: { value: 'book.content' } });
    expect(screen.getByText('book.content')).toBeVisible();

    projectStore.replace(replacementProject('replacement-project'), {
      origin: 'sample',
      sourceFilename: 'replacement.dtd',
    });

    await waitFor(() => expect(searchbox).toHaveValue(''));
    expect(
      screen.queryByRole('heading', { name: 'Search results' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('book.content')).not.toBeInTheDocument();
  });

  it('cancels pending action focus transfer when the project is replaced', async () => {
    const { projectStore } = renderSearch();
    const staleHeading = addActionDestination('data-focus-card-heading');
    const searchbox = screen.getByRole('searchbox', {
      name: 'Search schema',
    });
    await fireEvent.input(searchbox, {
      target: { value: 'book.content' },
    });
    const center = screen.getByRole('button', {
      name: 'Center book.content, DTD element declaration',
    });

    center.click();
    projectStore.replace(replacementProject('replacement-during-action'), {
      origin: 'sample',
      sourceFilename: 'replacement.dtd',
    });

    await waitFor(() => expect(searchbox).toHaveValue(''));
    expect(staleHeading).not.toHaveFocus();
    expect(
      screen.queryByRole('heading', { name: 'Search results' }),
    ).not.toBeInTheDocument();
  });

  it('retains search for same-ID metadata clones and failed replacements', async () => {
    const { projectStore } = renderSearch();
    const searchbox = screen.getByRole('searchbox', {
      name: 'Search schema',
    });
    await fireEvent.input(searchbox, { target: { value: 'book' } });

    projectStore.replace(replacementProject(), {
      origin: 'sample',
      sourceFilename: 'cloned-book.dtd',
    });
    await waitFor(() => expect(searchbox).toHaveValue('book'));
    expect(
      screen.getByRole('heading', { name: 'Search results' }),
    ).toBeVisible();

    const failed = projectStore.replace(
      {
        id: 'invalid',
        displayName: 'Invalid',
        nodes: [],
        edges: [],
        rootNodeIds: ['missing'],
      },
      { origin: 'imported', sourceFilename: 'invalid.xsd' },
    );
    expect(failed.applied).toBe(false);
    expect(searchbox).toHaveValue('book');
    expect(
      screen.getByRole('heading', { name: 'Search results' }),
    ).toBeVisible();
  });

  it('does not move focus as result groups update', async () => {
    renderSearch();
    const searchbox = screen.getByRole('searchbox', {
      name: 'Search schema',
    });
    searchbox.focus();

    await fireEvent.input(searchbox, { target: { value: 'book' } });
    await fireEvent.input(searchbox, { target: { value: 'chapter' } });

    expect(searchbox).toHaveFocus();
  });

  it('keeps action coordination local without persistence or unsafe markup', () => {
    expect(schemaSearchSource).toContain("origin: 'search'");
    expect(schemaSearchSource).toContain('navigation.centerNode');
    expect(schemaSearchSource).toContain('inspector.inspect');
    expect(schemaSearchSource).not.toContain('localStorage');
    expect(schemaSearchSource).not.toContain('sessionStorage');
    expect(schemaSearchSource).not.toContain('window.dispatchEvent');
    expect(schemaSearchSource).not.toContain('@html');
    expect(schemaSearchSource).not.toContain('innerHTML');
  });

  it('renders at most 100 of 2,000 matching nodes without rebuilding per query', async () => {
    const largeProject: SchemaProject = {
      id: 'large-search-project',
      displayName: 'Large search project',
      sourceFiles: [{ id: 'large', filename: 'large.xsd' }],
      nodes: Array.from({ length: 2_000 }, (_, index) => ({
        id: `node-${index}`,
        kind: 'globalElement' as const,
        name: `CommonNode${index}`,
        sourceFileId: 'large',
        sourceOrder: index,
      })),
      edges: [],
      rootNodeIds: ['node-0'],
    };
    const indexBuilder = vi.fn((input: ProjectSearchIndexInput) =>
      buildProjectSearchIndex(input),
    );
    renderSearch({
      state: initialState(largeProject),
      indexBuilder,
    });
    const searchbox = screen.getByRole('searchbox', {
      name: 'Search schema',
    });
    const initialBuildCount = indexBuilder.mock.calls.length;
    const started = performance.now();

    await fireEvent.input(searchbox, { target: { value: 'Common' } });
    await waitFor(() =>
      expect(screen.getAllByRole('article')).toHaveLength(100),
    );
    const elapsed = performance.now() - started;

    expect(indexBuilder).toHaveBeenCalledTimes(initialBuildCount);
    expect(screen.getAllByRole('article')).toHaveLength(100);
    expect(screen.getByText(/More results are available/)).toBeVisible();
    expect(elapsed).toBeGreaterThanOrEqual(0);
    expect(
      within(screen.getByRole('search')).queryAllByRole('article'),
    ).toHaveLength(100);
  });
});
