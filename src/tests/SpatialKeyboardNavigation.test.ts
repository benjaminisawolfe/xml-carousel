import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/svelte';
import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../app/App.svelte';
import { inspectorStore } from '../app/stores/inspectorStore';
import { navigationStore } from '../app/stores/navigationStore';
import { replaceProjectSession } from '../app/stores/projectSession';
import type { SchemaProject } from '../schema/model';
import {
  bookDtdNodeIds,
  bookDtdProject,
} from '../schema/samples/bookDtdProject';
import contextCardSource from '../ui/carousel/ContextCard.svelte?raw';
import focusCardSource from '../ui/carousel/FocusCard.svelte?raw';
import schemaCarouselSource from '../ui/carousel/SchemaCarousel.svelte?raw';
import tokensSource from '../styles/tokens.css?raw';
import { generateMixedXsdProject } from './largeSchemaTestData';

function activateProject(
  project: SchemaProject,
  initialFocusNodeId: string,
): void {
  const result = replaceProjectSession({
    project,
    initialFocusNodeId,
    metadata: {
      origin: 'imported',
      sourceFilename: `${project.id}.dtd`,
    },
  });
  if (!result.applied) {
    throw new Error(
      `Unable to activate keyboard test project: ${result.reason}`,
    );
  }
}

function carouselRegion(): HTMLElement {
  return screen.getByRole('region', {
    name: 'Schema navigation carousel',
  });
}

function selectedRelationshipCard(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-keyboard-selected="true"]');
}

function currentPath(): readonly string[] {
  return get(navigationStore.navigationPathIds);
}

async function navigateBookToTitlePage(): Promise<HTMLElement> {
  await fireEvent.keyDown(document.body, { key: 'ArrowRight' });
  const frontMatterHeading = await screen.findByRole('heading', {
    level: 2,
    name: 'front.matter',
  });
  await waitFor(() => expect(document.activeElement).toBe(frontMatterHeading));

  await fireEvent.keyDown(frontMatterHeading, { key: 'ArrowRight' });
  const titlePageHeading = await screen.findByRole('heading', {
    level: 2,
    name: 'title.page',
  });
  await waitFor(() => expect(document.activeElement).toBe(titlePageHeading));
  return titlePageHeading;
}

function branchingProject(childCount = 9): SchemaProject {
  const root = {
    id: 'keyboard:root',
    kind: 'dtdElement' as const,
    name: 'keyboard-root',
  };
  const children = Array.from({ length: childCount }, (_, index) => ({
    id: `keyboard:child:${index}`,
    kind: 'dtdElement' as const,
    name: `child-${index}`,
  }));

  return {
    id: `keyboard:branching:${childCount}`,
    displayName: 'Keyboard branching fixture',
    nodes: [root, ...children],
    edges: children.map((child, index) => ({
      id: `keyboard:edge:${index}`,
      kind: 'contains',
      sourceNodeId: root.id,
      targetNodeId: child.id,
      order: index,
    })),
    rootNodeIds: [root.id],
  };
}

const cycleProject: SchemaProject = {
  id: 'keyboard:cycle',
  displayName: 'Keyboard cycle fixture',
  nodes: [
    {
      id: 'keyboard:cycle-root',
      kind: 'dtdElement',
      name: 'cycle-root',
    },
    {
      id: 'keyboard:cycle-leaf',
      kind: 'dtdElement',
      name: 'cycle-leaf',
    },
  ],
  edges: [
    {
      id: 'keyboard:cycle:self',
      kind: 'contains',
      sourceNodeId: 'keyboard:cycle-root',
      targetNodeId: 'keyboard:cycle-root',
      order: 0,
    },
    {
      id: 'keyboard:cycle:leaf',
      kind: 'contains',
      sourceNodeId: 'keyboard:cycle-root',
      targetNodeId: 'keyboard:cycle-leaf',
      order: 1,
    },
  ],
  rootNodeIds: ['keyboard:cycle-root'],
};

const xsdRelationshipProject: SchemaProject = {
  id: 'keyboard:xsd-labels',
  displayName: 'Keyboard XSD labels',
  nodes: [
    {
      id: 'keyboard:xsd:schema',
      kind: 'schema',
      name: 'Schema',
    },
    {
      id: 'keyboard:xsd:element',
      kind: 'globalElement',
      name: 'catalog',
    },
    {
      id: 'keyboard:xsd:type',
      kind: 'complexType',
      name: 'CatalogType',
    },
  ],
  edges: [
    {
      id: 'keyboard:xsd:element-edge',
      kind: 'contains',
      sourceNodeId: 'keyboard:xsd:schema',
      targetNodeId: 'keyboard:xsd:element',
      order: 0,
    },
    {
      id: 'keyboard:xsd:type-edge',
      kind: 'contains',
      sourceNodeId: 'keyboard:xsd:schema',
      targetNodeId: 'keyboard:xsd:type',
      order: 1,
    },
  ],
  rootNodeIds: ['keyboard:xsd:schema'],
};

beforeEach(() => {
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    value: 700,
    writable: true,
  });
  activateProject(bookDtdProject, bookDtdNodeIds.book);
  inspectorStore.close();
});

afterEach(() => {
  activateProject(bookDtdProject, bookDtdNodeIds.book);
  inspectorStore.close();
  vi.restoreAllMocks();
});

describe('spatial keyboard navigation', () => {
  it('uses the centered node implicitly without a dedicated tab stop or initial selection', () => {
    render(App);

    const region = carouselRegion();
    const description = document.getElementById('carousel-gesture-description');
    const heading = screen.getByRole('heading', { level: 2, name: 'book' });

    expect(region).not.toHaveAttribute('tabindex');
    expect(region).not.toHaveAttribute('data-carousel-keyboard-surface');
    expect(region).toHaveAttribute(
      'data-keyboard-cursor-state',
      'current-focus',
    );
    expect(region).toHaveAttribute(
      'aria-keyshortcuts',
      'ArrowUp ArrowDown ArrowLeft ArrowRight Enter Space',
    );
    expect(heading).toHaveAttribute('tabindex', '-1');
    expect(selectedRelationshipCard()).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('');
    expect(description).toHaveTextContent(
      'The centered node is the keyboard origin.',
    );
    expect(description).toHaveTextContent(
      'Enter or Space activates only an explicitly selected destination.',
    );
    expect(
      within(region).getByRole('button', {
        name: 'Navigate leafward to front.matter, DTD element declaration',
      }),
    ).toHaveAttribute('data-carousel-navigation-action');
    expect(
      within(region).getByRole('button', {
        name: 'Inspect front.matter',
      }),
    ).toBeVisible();
  });

  it('uses one green selected-card treatment without dotted, dashed, or viewport outlines', () => {
    expect(contextCardSource).toContain(
      'border-color: var(--colour-keyboard-selection)',
    );
    expect(contextCardSource).toContain(
      'background: var(--colour-keyboard-selection-soft)',
    );
    expect(contextCardSource).not.toMatch(
      /\.context-card\.keyboard-selected\s*\{[^}]*outline/,
    );
    expect(tokensSource).toContain('--colour-keyboard-selection:');
    expect(tokensSource).toContain('--colour-keyboard-selection-soft:');
    expect(schemaCarouselSource).not.toContain(
      '.gesture-viewport:focus-visible',
    );
    expect(schemaCarouselSource).not.toContain('tabindex="0"');
    expect(focusCardSource).toContain('h2:focus');
    expect(focusCardSource).toContain('outline: none');
  });

  it('works from body focus and from the programmatically focused current heading', async () => {
    render(App);
    expect(document.activeElement).toBe(document.body);

    await fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    const frontMatterHeading = await screen.findByRole('heading', {
      level: 2,
      name: 'front.matter',
    });
    await waitFor(() =>
      expect(document.activeElement).toBe(frontMatterHeading),
    );
    expect(currentPath()).toEqual([
      bookDtdNodeIds.book,
      bookDtdNodeIds.frontMatter,
    ]);
    expect(selectedRelationshipCard()).toBeNull();

    await fireEvent.keyDown(frontMatterHeading, { key: 'ArrowRight' });
    expect(currentPath()).toEqual([
      bookDtdNodeIds.book,
      bookDtdNodeIds.frontMatter,
      bookDtdNodeIds.titlePage,
    ]);
  });

  it('selects first with Down and last with Up without navigating', async () => {
    render(App);

    const downHandled = await fireEvent.keyDown(document.body, {
      key: 'ArrowDown',
    });
    expect(downHandled).toBe(false);
    expect(currentPath()).toEqual([bookDtdNodeIds.book]);
    expect(carouselRegion()).toHaveAttribute(
      'data-keyboard-cursor-state',
      'leafward-selection',
    );
    expect(selectedRelationshipCard()).toHaveAttribute(
      'data-carousel-leafward-candidate-edge-id',
      'dtd:contains:book:front.matter',
    );
    expect(selectedRelationshipCard()).toHaveClass('keyboard-selected');
    expect(
      await screen.findByText(
        'Selected leafward destination 1 of 3: front.matter, DTD element declaration. Press Right Arrow, Enter, or Space to navigate. Press Left Arrow to return to book.',
      ),
    ).toBeInTheDocument();

    await fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(selectedRelationshipCard()).toBeNull();

    await fireEvent.keyDown(document.body, {
      key: 'ArrowUp',
    });
    expect(currentPath()).toEqual([bookDtdNodeIds.book]);
    expect(selectedRelationshipCard()).toHaveAttribute(
      'data-carousel-leafward-candidate-edge-id',
      'dtd:contains:book:index',
    );
  });

  it('moves explicit selection without wrapping and leaves the path unchanged', async () => {
    render(App);

    await fireEvent.keyDown(document.body, { key: 'ArrowDown' });
    await fireEvent.keyDown(document.body, { key: 'ArrowUp' });
    expect(selectedRelationshipCard()).toHaveAttribute(
      'data-carousel-leafward-candidate-edge-id',
      'dtd:contains:book:front.matter',
    );

    await fireEvent.keyDown(document.body, { key: 'ArrowDown' });
    expect(selectedRelationshipCard()).toHaveAttribute(
      'data-carousel-leafward-candidate-edge-id',
      'dtd:contains:book:book.content',
    );
    expect(
      await screen.findByText(
        'Selected leafward destination 2 of 3: book.content, DTD element declaration. Press Right Arrow, Enter, or Space to navigate. Press Left Arrow to return to book.',
      ),
    ).toBeInTheDocument();

    await fireEvent.keyDown(document.body, { key: 'ArrowDown' });
    await fireEvent.keyDown(document.body, { key: 'ArrowDown' });
    expect(selectedRelationshipCard()).toHaveAttribute(
      'data-carousel-leafward-candidate-edge-id',
      'dtd:contains:book:index',
    );
    expect(currentPath()).toEqual([bookDtdNodeIds.book]);
  });

  it('Left and Escape clear an explicit selection without changing the path', async () => {
    render(App);
    const initialPath = currentPath();

    await fireEvent.keyDown(document.body, { key: 'ArrowDown' });
    await fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
    expect(selectedRelationshipCard()).toBeNull();
    expect(currentPath()).toEqual(initialPath);
    expect(
      await screen.findByText('Keyboard focus returned to current node: book.'),
    ).toBeInTheDocument();

    await fireEvent.keyDown(document.body, { key: 'ArrowUp' });
    await fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(selectedRelationshipCard()).toBeNull();
    expect(currentPath()).toEqual(initialPath);
  });

  it('Right from current focus navigates the first exact relationship and preserves inspection', async () => {
    render(App);
    const navigate = vi.spyOn(
      navigationStore,
      'navigateStructuralRelationship',
    );
    inspectorStore.inspect(bookDtdNodeIds.index);

    await fireEvent.keyDown(document.body, { key: 'ArrowRight' });

    expect(navigate).toHaveBeenCalledWith({
      edgeId: 'dtd:contains:book:front.matter',
      sourceNodeId: bookDtdNodeIds.book,
      targetNodeId: bookDtdNodeIds.frontMatter,
    });
    expect(get(inspectorStore.inspectedNodeId)).toBe(bookDtdNodeIds.index);
    expect(selectedRelationshipCard()).toBeNull();
  });

  it('Right from an explicit selection navigates the selected exact relationship', async () => {
    render(App);
    const navigate = vi.spyOn(
      navigationStore,
      'navigateStructuralRelationship',
    );

    await fireEvent.keyDown(document.body, { key: 'ArrowDown' });
    await fireEvent.keyDown(document.body, { key: 'ArrowDown' });
    await fireEvent.keyDown(document.body, { key: 'ArrowRight' });

    expect(navigate).toHaveBeenCalledWith({
      edgeId: 'dtd:contains:book:book.content',
      sourceNodeId: bookDtdNodeIds.book,
      targetNodeId: bookDtdNodeIds.bookContent,
    });
    expect(currentPath()).toEqual([
      bookDtdNodeIds.book,
      bookDtdNodeIds.bookContent,
    ]);
    expect(selectedRelationshipCard()).toBeNull();
  });

  it.each(['Enter', ' '])(
    'activates an explicit selection with %s but does not invent a current-focus choice',
    async (key) => {
      render(App);

      const untouched = await fireEvent.keyDown(document.body, { key });
      expect(untouched).toBe(true);
      expect(currentPath()).toEqual([bookDtdNodeIds.book]);

      await fireEvent.keyDown(document.body, { key: 'ArrowDown' });
      const handled = await fireEvent.keyDown(document.body, { key });

      expect(handled).toBe(false);
      expect(currentPath()).toEqual([
        bookDtdNodeIds.book,
        bookDtdNodeIds.frontMatter,
      ]);
    },
  );

  it('follows the title-page journey one exact step at a time', async () => {
    render(App);
    const titlePageHeading = await navigateBookToTitlePage();
    const titlePagePath = [
      bookDtdNodeIds.book,
      bookDtdNodeIds.frontMatter,
      bookDtdNodeIds.titlePage,
    ];

    expect(currentPath()).toEqual(titlePagePath);
    expect(selectedRelationshipCard()).toBeNull();

    await fireEvent.keyDown(titlePageHeading, { key: 'ArrowDown' });
    expect(selectedRelationshipCard()).toHaveAttribute(
      'data-carousel-leafward-candidate-edge-id',
      'dtd:contains:title.page:title',
    );
    await fireEvent.keyDown(titlePageHeading, { key: 'ArrowDown' });
    expect(selectedRelationshipCard()).toHaveAttribute(
      'data-carousel-leafward-candidate-edge-id',
      'dtd:contains:title.page:subtitle',
    );

    await fireEvent.keyDown(titlePageHeading, { key: 'ArrowLeft' });
    expect(selectedRelationshipCard()).toBeNull();
    expect(currentPath()).toEqual(titlePagePath);

    await fireEvent.keyDown(titlePageHeading, { key: 'ArrowDown' });
    await fireEvent.keyDown(titlePageHeading, { key: 'ArrowDown' });
    await fireEvent.keyDown(titlePageHeading, { key: 'ArrowRight' });
    const subtitleHeading = await screen.findByRole('heading', {
      level: 2,
      name: 'subtitle',
    });
    const subtitlePath = [...titlePagePath, bookDtdNodeIds.subtitle];
    expect(currentPath()).toEqual(subtitlePath);

    const beforeRootwardLength = currentPath().length;
    await fireEvent.keyDown(subtitleHeading, { key: 'ArrowLeft' });
    const returnedPath = currentPath();
    const returnedFocus = returnedPath[returnedPath.length - 1];
    expect(returnedPath).toEqual(titlePagePath);
    expect(returnedPath).toHaveLength(beforeRootwardLength - 1);
    expect(returnedFocus).toBe(bookDtdNodeIds.titlePage);
    expect(returnedFocus).not.toBe(bookDtdNodeIds.frontMatter);
    expect(returnedFocus).not.toBe(bookDtdNodeIds.book);

    const returnedTitlePageHeading = await screen.findByRole('heading', {
      level: 2,
      name: 'title.page',
    });
    await fireEvent.keyDown(returnedTitlePageHeading, { key: 'ArrowLeft' });
    expect(currentPath()).toEqual([
      bookDtdNodeIds.book,
      bookDtdNodeIds.frontMatter,
    ]);
  });

  it.each(['Enter', ' '])(
    'enters subtitle from an explicit title-page selection with %s',
    async (key) => {
      render(App);
      const titlePageHeading = await navigateBookToTitlePage();

      await fireEvent.keyDown(titlePageHeading, { key: 'ArrowDown' });
      await fireEvent.keyDown(titlePageHeading, { key: 'ArrowDown' });
      await fireEvent.keyDown(titlePageHeading, { key });

      expect(currentPath()).toEqual([
        bookDtdNodeIds.book,
        bookDtdNodeIds.frontMatter,
        bookDtdNodeIds.titlePage,
        bookDtdNodeIds.subtitle,
      ]);
    },
  );

  it('announces unavailable rootward movement without changing state', async () => {
    render(App);
    await fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
    expect(currentPath()).toEqual([bookDtdNodeIds.book]);
    expect(selectedRelationshipCard()).toBeNull();
    expect(
      await screen.findByText('No previous journey step is available.'),
    ).toBeInTheDocument();
  });

  it('announces unavailable leafward movement without changing state', async () => {
    activateProject(bookDtdProject, bookDtdNodeIds.para);
    render(App);

    await fireEvent.keyDown(document.body, { key: 'ArrowRight' });

    expect(currentPath()).toEqual([bookDtdNodeIds.para]);
    expect(selectedRelationshipCard()).toBeNull();
    expect(
      await screen.findByText(
        'No leafward destination is available from the current focus.',
      ),
    ).toBeInTheDocument();
  });

  it('skips and cannot activate a terminal cycle closure', async () => {
    activateProject(cycleProject, 'keyboard:cycle-root');
    render(App);

    const terminal = document.querySelector<HTMLElement>(
      '[data-carousel-terminal-cycle-closure]',
    );
    expect(terminal).toBeInTheDocument();
    expect(terminal?.closest('article')).not.toHaveAttribute(
      'data-keyboard-selected',
    );
    expect(selectedRelationshipCard()).toBeNull();

    await fireEvent.keyDown(document.body, { key: 'ArrowDown' });
    expect(selectedRelationshipCard()).toHaveAttribute(
      'data-carousel-leafward-candidate-edge-id',
      'keyboard:cycle:leaf',
    );

    await fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    expect(currentPath()).toEqual([
      'keyboard:cycle-root',
      'keyboard:cycle-leaf',
    ]);
  });

  it('announces meaningful XSD relationship labels', async () => {
    activateProject(xsdRelationshipProject, 'keyboard:xsd:schema');
    render(App);

    await fireEvent.keyDown(document.body, { key: 'ArrowUp' });

    expect(
      await screen.findByText(
        'Selected leafward destination 2 of 2: Complex type declaration to CatalogType, Complex type declaration. Press Right Arrow, Enter, or Space to navigate. Press Left Arrow to return to Schema.',
      ),
    ).toBeInTheDocument();
  });

  it('crosses a bounded window and preserves selection through responsive relayout', async () => {
    activateProject(branchingProject(), 'keyboard:root');
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 520,
      writable: true,
    });
    render(App);

    for (let index = 0; index < 6; index += 1) {
      await fireEvent.keyDown(document.body, { key: 'ArrowDown' });
    }

    expect(selectedRelationshipCard()).toHaveAttribute(
      'data-carousel-leafward-candidate-edge-id',
      'keyboard:edge:5',
    );
    expect(
      document.querySelectorAll(
        '[data-carousel-side-window="leafward"] .context-card',
      ),
    ).toHaveLength(3);

    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 900,
      writable: true,
    });
    await fireEvent(window, new Event('resize'));

    expect(selectedRelationshipCard()).toHaveAttribute(
      'data-carousel-leafward-candidate-edge-id',
      'keyboard:edge:5',
    );
    expect(
      document.querySelectorAll(
        '[data-carousel-side-window="leafward"] .context-card',
      ).length,
    ).toBeLessThanOrEqual(7);
  });

  it('resets stale selection when the project session is replaced', async () => {
    render(App);
    await fireEvent.keyDown(document.body, { key: 'ArrowDown' });
    expect(selectedRelationshipCard()).toHaveAttribute(
      'data-carousel-leafward-candidate-edge-id',
      'dtd:contains:book:front.matter',
    );

    activateProject(branchingProject(4), 'keyboard:root');

    await waitFor(() => expect(selectedRelationshipCard()).toBeNull());
    expect(carouselRegion()).toHaveAttribute(
      'data-keyboard-cursor-state',
      'current-focus',
    );
  });

  it('leaves Search, outline filters, buttons, modifiers, Tab, and Shift+Tab native', async () => {
    activateProject(branchingProject(60), 'keyboard:root');
    render(App);
    const initialPath = currentPath();
    const search = screen.getByRole('searchbox', {
      name: 'Search schema',
    });
    const filter = screen.getByRole('searchbox', {
      name: 'Filter DTD elements',
    });
    const inspect = screen.getByRole('button', {
      name: 'Inspect child-0',
    });
    const branchAction = screen.getByRole('button', {
      name: 'Navigate leafward to child-0, DTD element declaration',
    });

    for (const control of [search, filter, inspect, branchAction]) {
      control.focus();
      expect(await fireEvent.keyDown(control, { key: 'ArrowDown' })).toBe(true);
      expect(await fireEvent.keyDown(control, { key: 'ArrowLeft' })).toBe(true);
      expect(await fireEvent.keyDown(control, { key: 'Enter' })).toBe(true);
    }

    document.body.focus();
    expect(await fireEvent.keyDown(document.body, { key: 'Tab' })).toBe(true);
    expect(
      await fireEvent.keyDown(document.body, {
        key: 'Tab',
        shiftKey: true,
      }),
    ).toBe(true);
    expect(
      await fireEvent.keyDown(document.body, {
        key: 'ArrowRight',
        ctrlKey: true,
      }),
    ).toBe(true);
    expect(currentPath()).toEqual(initialPath);
  });

  it('keeps initial and post-navigation carousel DOM bounded for 40,000 nodes', async () => {
    const project = generateMixedXsdProject(40_000);
    activateProject(project, 'generated:xsd:schema');
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 900,
      writable: true,
    });
    render(App);

    expect(
      document.querySelectorAll(
        '[data-carousel-side-window="leafward"] .context-card',
      ),
    ).toHaveLength(7);
    expect(
      document.querySelectorAll('[data-schema-outline-row]').length,
    ).toBeLessThanOrEqual(200);

    await fireEvent.keyDown(document.body, { key: 'ArrowRight' });

    expect(currentPath()).toHaveLength(2);
    expect(
      document.querySelectorAll(
        '[data-carousel-side-window="leafward"] .context-card',
      ).length,
    ).toBeLessThanOrEqual(7);
    expect(
      document.querySelectorAll('[data-schema-outline-row]').length,
    ).toBeLessThanOrEqual(200);
  });
});
