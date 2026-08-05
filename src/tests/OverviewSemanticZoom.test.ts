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
import {
  SEMANTIC_ZOOM_DESKTOP_MEDIA_QUERY,
  semanticZoomStore,
} from '../app/stores/semanticZoomStore';
import type { SchemaProject } from '../schema/model';
import {
  bookDtdNodeIds,
  bookDtdProject,
} from '../schema/samples/bookDtdProject';
import ContextCard from '../ui/carousel/ContextCard.svelte';
import RootwardHistoryRow from '../ui/carousel/RootwardHistoryRow.svelte';
import { notifyResizeObserver } from './setup';

class ControlledMediaQueryList implements MediaQueryList {
  matches: boolean;
  readonly media: string;
  onchange:
    ((this: MediaQueryList, ev: MediaQueryListEvent) => unknown) | null = null;
  readonly addListener = vi.fn();
  readonly removeListener = vi.fn();
  readonly dispatchEvent = vi.fn(() => true);
  private readonly listeners = new Set<EventListenerOrEventListenerObject>();

  constructor(media: string, matches: boolean) {
    this.media = media;
    this.matches = matches;
  }

  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
  ): void {
    if (type === 'change') this.listeners.add(listener);
  }

  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
  ): void {
    if (type === 'change') this.listeners.delete(listener);
  }

  setMatches(matches: boolean): void {
    this.matches = matches;
    const event = { matches, media: this.media } as MediaQueryListEvent;
    for (const listener of this.listeners) {
      if (typeof listener === 'function') listener(event);
      else listener.handleEvent(event);
    }
  }
}

function installMatchMedia(): ControlledMediaQueryList {
  const semantic = new ControlledMediaQueryList(
    SEMANTIC_ZOOM_DESKTOP_MEDIA_QUERY,
    true,
  );
  const reduced = new ControlledMediaQueryList(
    '(prefers-reduced-motion: reduce)',
    false,
  );
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) =>
      query === SEMANTIC_ZOOM_DESKTOP_MEDIA_QUERY ? semantic : reduced,
    ),
  );
  return semantic;
}

function restoreSample(): void {
  const result = replaceProjectSession({
    project: bookDtdProject,
    initialFocusNodeId: bookDtdNodeIds.book,
    metadata: { origin: 'sample', sourceFilename: 'book.dtd' },
  });
  if (!result.applied) throw new Error('Expected sample restoration to apply.');
}

function surface(): HTMLElement {
  const element = document.querySelector<HTMLElement>(
    '[data-carousel-gesture-viewport]',
  );
  if (!element) throw new Error('Expected carousel surface.');
  return element;
}

async function selectLevel(value: '0' | '1' | '2'): Promise<void> {
  await fireEvent.input(screen.getByRole('slider', { name: 'Semantic zoom' }), {
    target: { value },
  });
  const presentation =
    value === '0' ? 'overview' : value === '1' ? 'compact' : 'full';
  await waitFor(() =>
    expect(surface()).toHaveAttribute(
      'data-semantic-zoom-presentation',
      presentation,
    ),
  );
}

beforeEach(() => {
  restoreSample();
  inspectorStore.close();
  semanticZoomStore.reset();
  semanticZoomStore.setDesktopAvailability(false);
});

afterEach(() => {
  restoreSample();
  inspectorStore.close();
  semanticZoomStore.reset();
  semanticZoomStore.setDesktopAvailability(false);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Overview semantic zoom integration', () => {
  it('renders genuine names-only focus and context cards with truthful navigation', async () => {
    installMatchMedia();
    render(App);
    await selectLevel('0');

    const focus = screen.getByRole('article', { name: 'book' });
    expect(focus).toHaveClass('overview');
    expect(focus.textContent?.trim()).toBe('book');
    expect(within(focus).getByRole('heading', { name: 'book' })).toBeVisible();
    expect(within(focus).queryByRole('button')).not.toBeInTheDocument();

    const destination = screen.getByRole('article', {
      name: 'Destination book.content',
    });
    expect(destination.textContent?.trim()).toBe('book.content');
    expect(
      within(destination).getByRole('button', {
        name: 'Navigate leafward to book.content, DTD element declaration',
      }),
    ).toBeVisible();
    expect(within(destination).queryByText('Destination')).toBeNull();
    expect(
      surface().querySelector('[data-inspect-node-id]'),
    ).not.toBeInTheDocument();

    await fireEvent.click(
      within(destination).getByRole('button', { name: /Navigate leafward/u }),
    );
    await waitFor(() =>
      expect(get(navigationStore.currentFocusNodeId)).toBe(
        bookDtdNodeIds.bookContent,
      ),
    );
    const chapter = screen.getByRole('article', {
      name: 'Destination chapter+',
    });
    expect(chapter.textContent?.trim()).toBe('chapter');
    expect(
      within(chapter).getByRole('button', {
        name: 'Navigate leafward to chapter+, DTD element declaration',
      }),
    ).toBeVisible();
  });

  it('moves disappearing Inspect focus to stable navigation targets', async () => {
    installMatchMedia();
    render(App);
    await selectLevel('1');

    const contextInspect = screen.getByRole('button', {
      name: 'Inspect book.content',
    });
    contextInspect.focus();
    await selectLevel('0');
    await waitFor(() =>
      expect(
        screen.getByRole('button', {
          name: 'Navigate leafward to book.content, DTD element declaration',
        }),
      ).toHaveFocus(),
    );

    await selectLevel('1');
    const focusInspect = screen.getByRole('button', { name: 'Inspect book' });
    focusInspect.focus();
    await selectLevel('0');
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'book' })).toHaveFocus(),
    );
    expect(document.activeElement).not.toBe(document.body);
  });

  it('moves Full summary and rootward-history Inspect focus to required targets', async () => {
    installMatchMedia();
    render(App);
    const summary = screen.getByRole('region', {
      name: 'Scrollable summary details for book',
    });
    summary.focus();
    await selectLevel('0');
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'book' })).toHaveFocus(),
    );

    navigationStore.navigateLeafward(bookDtdNodeIds.bookContent);
    navigationStore.navigateLeafward(bookDtdNodeIds.chapter);
    navigationStore.navigateLeafward(bookDtdNodeIds.section);
    navigationStore.navigateLeafward(bookDtdNodeIds.para);
    await selectLevel('1');
    const historyInspect = screen.getByRole('button', {
      name: 'Inspect chapter',
    });
    historyInspect.focus();
    await selectLevel('0');
    await waitFor(() =>
      expect(
        screen.getByRole('button', {
          name: 'Jump to chapter, earlier in the current path',
        }),
      ).toHaveFocus(),
    );
  });

  it('moves terminal-cycle Inspect focus to the current heading', async () => {
    installMatchMedia();
    const cyclicProject: SchemaProject = {
      id: 'overview-cycle-focus',
      displayName: 'Overview cycle focus',
      rootNodeIds: ['one'],
      nodes: [
        { id: 'one', kind: 'dtdElement', name: 'one' },
        { id: 'two', kind: 'dtdElement', name: 'two' },
      ],
      edges: [
        {
          id: 'one-two',
          kind: 'contains',
          sourceNodeId: 'one',
          targetNodeId: 'two',
          order: 0,
        },
        {
          id: 'two-one',
          kind: 'contains',
          sourceNodeId: 'two',
          targetNodeId: 'one',
          order: 0,
        },
      ],
    };
    expect(
      replaceProjectSession({
        project: cyclicProject,
        initialFocusNodeId: 'one',
        metadata: { origin: 'imported', sourceFilename: 'cycle.dtd' },
      }).applied,
    ).toBe(true);
    render(App);
    navigationStore.navigateLeafward('two');
    await selectLevel('1');
    const compactTerminal = screen.getByRole('article', {
      name: 'Recursive child one',
    });
    const inspect = within(compactTerminal).getByRole('button', {
      name: 'Inspect one',
    });
    inspect.focus();
    await selectLevel('0');
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'two' })).toHaveFocus(),
    );
    const terminal = screen.getByRole('article', {
      name: 'Recursive child one',
    });
    expect(terminal.textContent?.trim()).toBe('one');
    expect(within(terminal).queryByRole('button')).not.toBeInTheDocument();
  });

  it('retains Overview state through inspection, Search, replacement, and responsive fallback', async () => {
    const media = installMatchMedia();
    render(App);
    await selectLevel('0');
    inspectorStore.inspect(bookDtdNodeIds.index);
    const search = screen.getByRole('searchbox', { name: 'Search schema' });
    await fireEvent.input(search, { target: { value: 'chapter' } });
    expect(get(semanticZoomStore).requestedLevel).toBe('overview');
    expect(get(inspectorStore.inspectedNodeId)).toBe(bookDtdNodeIds.index);

    restoreSample();
    expect(get(semanticZoomStore).requestedLevel).toBe('overview');
    expect(search).toHaveValue('chapter');

    const range = screen.getByRole('slider', { name: 'Semantic zoom' });
    range.focus();
    media.setMatches(false);
    await waitFor(() =>
      expect(surface()).toHaveAttribute('data-semantic-zoom-effective', 'full'),
    );
    expect(get(semanticZoomStore).requestedLevel).toBe('overview');
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'book' })).toHaveFocus(),
    );
    media.setMatches(true);
    await waitFor(() =>
      expect(surface()).toHaveAttribute(
        'data-semantic-zoom-presentation',
        'overview',
      ),
    );
  });

  it('uses the higher bounded Overview window while preserving the selected relationship', async () => {
    installMatchMedia();
    const project: SchemaProject = {
      id: 'overview-capacity',
      displayName: 'Overview capacity',
      rootNodeIds: ['root'],
      nodes: [
        { id: 'root', kind: 'dtdElement', name: 'root' },
        ...Array.from({ length: 12 }, (_, index) => ({
          id: `child:${index}`,
          kind: 'dtdElement' as const,
          name: `child-${index}`,
        })),
      ],
      edges: Array.from({ length: 12 }, (_, index) => ({
        id: `edge:${index}`,
        kind: 'contains' as const,
        sourceNodeId: 'root',
        targetNodeId: `child:${index}`,
        order: index,
      })),
    };
    expect(
      replaceProjectSession({
        project,
        initialFocusNodeId: 'root',
        metadata: { origin: 'imported', sourceFilename: 'capacity.dtd' },
      }).applied,
    ).toBe(true);
    const { container } = render(App);
    const viewport = container.querySelector<HTMLElement>(
      '[data-carousel-gesture-viewport]',
    );
    if (!viewport) throw new Error('Expected carousel viewport.');
    notifyResizeObserver(viewport, 1200, 920);
    await selectLevel('1');
    const branch = screen.getByRole('region', {
      name: 'Leafward destinations',
    });
    await waitFor(() =>
      expect(within(branch).getAllByRole('article')).toHaveLength(7),
    );

    const selected = within(branch).getByRole('button', {
      name: 'Navigate leafward to child-6, DTD element declaration',
    });
    selected.focus();
    await selectLevel('0');
    await waitFor(() =>
      expect(within(branch).getAllByRole('article')).toHaveLength(11),
    );
    expect(selected).toHaveFocus();
    expect(
      within(branch).getByRole('button', {
        name: 'Show 1 node below in the leafward rail',
      }),
    ).toBeVisible();

    const ids = [...document.querySelectorAll<HTMLElement>('[id]')].map(
      ({ id }) => id,
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps Overview terminal closures non-navigable and names-only', () => {
    render(ContextCard, {
      props: {
        node: { id: 'cycle', kind: 'dtdElement', name: 'recursive-node' },
        occurrence: '+',
        direction: 'leafward',
        relationshipId: 'cycle-edge',
        relationshipKind: 'contains',
        relationshipDisposition: 'terminalCycleClosure',
        terminalLabel: 'Already present in this path',
        onActivate: vi.fn(),
        isInspected: true,
        onToggleInspection: vi.fn(),
        motionKey: 'cycle-motion',
        showKind: true,
        presentation: 'overview',
      },
    });
    const article = screen.getByRole('article', {
      name: 'Destination recursive-node+',
    });
    expect(article.textContent?.trim()).toBe('recursive-node');
    expect(within(article).queryByRole('button')).not.toBeInTheDocument();
    expect(
      article.querySelector('[data-carousel-terminal-cycle-closure]'),
    ).toHaveAccessibleName(
      'Destination recursive-node+. Already present in this path',
    );
  });

  it('renders Overview rootward history as one truthful Jump control', () => {
    render(RootwardHistoryRow, {
      props: {
        node: {
          id: 'history-node',
          kind: 'dtdElement',
          name: 'a-very-long-earlier-node-name-that-must-wrap',
        },
        journeyPosition: 4,
        showKind: true,
        isInspected: true,
        onJump: vi.fn(),
        onToggleInspection: vi.fn(),
        presentation: 'overview',
      },
    });
    const row = document.querySelector<HTMLElement>(
      '[data-rootward-history-row]',
    );
    expect(row).toHaveAttribute('data-journey-position', '4');
    expect(row).toHaveAttribute('data-semantic-zoom-rootward-position', '4');
    expect(row?.textContent?.trim()).toBe(
      'a-very-long-earlier-node-name-that-must-wrap',
    );
    expect(
      screen.getByRole('button', {
        name: 'Jump to a-very-long-earlier-node-name-that-must-wrap, earlier in the current path',
      }),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: /Inspect/u })).toBeNull();
    expect(document.querySelector('.kind-badge')).not.toBeInTheDocument();
  });

  it('keeps hidden relationship, kind, direction, and occurrence detail in accessible names', () => {
    render(ContextCard, {
      props: {
        node: { id: 'item', kind: 'globalElement', name: 'item' },
        displayName: 'item',
        occurrence: '*',
        direction: 'leafward',
        relationshipId: 'reference-edge',
        relationshipKind: 'references',
        relationshipLabel: 'Referenced element',
        focusedNodeKind: 'complexType',
        onActivate: vi.fn(),
        isInspected: false,
        onToggleInspection: vi.fn(),
        motionKey: 'item-motion',
        showKind: true,
        presentation: 'overview',
      },
    });
    const card = screen.getByRole('article', {
      name: 'Referenced element item*',
    });
    expect(card.textContent?.trim()).toBe('item');
    expect(
      within(card).getByRole('button', {
        name: 'Navigate leafward through Referenced element to item*, Global element declaration',
      }),
    ).toBeVisible();
  });
});
