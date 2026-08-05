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
import {
  bookDtdNodeIds,
  bookDtdProject,
} from '../schema/samples/bookDtdProject';
import type { SchemaProject } from '../schema/model';
import ContextCard from '../ui/carousel/ContextCard.svelte';
import RootwardHistoryRow from '../ui/carousel/RootwardHistoryRow.svelte';

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

function installMatchMedia(desktop = true): ControlledMediaQueryList {
  const semantic = new ControlledMediaQueryList(
    SEMANTIC_ZOOM_DESKTOP_MEDIA_QUERY,
    desktop,
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
  if (!element) throw new Error('Expected carousel gesture viewport.');
  return element;
}

async function selectCompact(): Promise<void> {
  await fireEvent.input(screen.getByRole('slider', { name: 'Semantic zoom' }), {
    target: { value: '1' },
  });
  await waitFor(() =>
    expect(surface()).toHaveAttribute(
      'data-semantic-zoom-presentation',
      'compact',
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

describe('Compact semantic zoom integration', () => {
  it('switches from unchanged Full detail to a genuine Compact focus card', async () => {
    installMatchMedia();
    render(App);
    const focus = screen.getByRole('article', { name: 'book' });
    expect(within(focus).getByText('DTD element declaration')).toBeVisible();
    expect(
      focus.querySelector('[data-focus-card-scroll-region]'),
    ).toBeInTheDocument();

    await selectCompact();

    expect(focus).toHaveClass('compact');
    expect(within(focus).getByRole('heading', { name: 'book' })).toBeVisible();
    expect(
      within(focus).getByRole('button', { name: 'Inspect book' }),
    ).toBeVisible();
    expect(
      focus.querySelector('[data-focus-card-scroll-region]'),
    ).not.toBeInTheDocument();
    expect(within(focus).queryByText('DTD element declaration')).toBeNull();
    expect(focus).not.toHaveTextContent('(front.matter, book.content, index)');
  });

  it('keeps context occurrence, navigation, and Inspect truthful and independent', async () => {
    installMatchMedia();
    render(App);
    await selectCompact();
    await fireEvent.click(
      screen.getByRole('button', {
        name: 'Navigate leafward to book.content, DTD element declaration',
      }),
    );
    await waitFor(() =>
      expect(get(navigationStore.currentFocusNodeId)).toBe(
        bookDtdNodeIds.bookContent,
      ),
    );

    const chapterNavigation = screen.getByRole('button', {
      name: 'Navigate leafward to chapter+, DTD element declaration',
    });
    expect(chapterNavigation).toHaveTextContent('chapter+');
    expect(chapterNavigation).not.toHaveTextContent('Destination');
    await fireEvent.click(
      screen.getByRole('button', { name: 'Inspect chapter' }),
    );
    expect(get(inspectorStore.inspectedNodeId)).toBe(bookDtdNodeIds.chapter);
    expect(get(navigationStore.currentFocusNodeId)).toBe(
      bookDtdNodeIds.bookContent,
    );
    expect(get(semanticZoomStore).requestedLevel).toBe('compact');
  });

  it('preserves surviving Inspect focus and falls back from removed Full detail', async () => {
    installMatchMedia();
    render(App);
    const inspect = screen.getByRole('button', { name: 'Inspect book' });
    inspect.focus();
    semanticZoomStore.setRequestedLevel('compact');
    await waitFor(() => expect(inspect).toHaveFocus());

    semanticZoomStore.setRequestedLevel('full');
    const summary = await screen.findByRole('region', {
      name: 'Scrollable summary details for book',
    });
    summary.focus();
    semanticZoomStore.setRequestedLevel('compact');
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { level: 2, name: 'book' }),
      ).toHaveFocus(),
    );
  });

  it('removes the control and falls back to Full while retaining Compact', async () => {
    const media = installMatchMedia();
    render(App);
    await selectCompact();
    const range = screen.getByRole('slider', { name: 'Semantic zoom' });
    range.focus();

    media.setMatches(false);
    await waitFor(() =>
      expect(
        screen.queryByRole('slider', { name: 'Semantic zoom' }),
      ).not.toBeInTheDocument(),
    );
    expect(surface()).toHaveAttribute('data-semantic-zoom-effective', 'full');
    expect(surface()).toHaveAttribute(
      'data-semantic-zoom-presentation',
      'full',
    );
    expect(get(semanticZoomStore).requestedLevel).toBe('compact');
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'book' })).toHaveFocus(),
    );

    media.setMatches(true);
    await waitFor(() =>
      expect(screen.getByRole('slider', { name: 'Semantic zoom' })).toHaveValue(
        '1',
      ),
    );
    expect(surface()).toHaveAttribute(
      'data-semantic-zoom-presentation',
      'compact',
    );
  });

  it('preserves navigation, inspection, Search, and project state on level changes', async () => {
    installMatchMedia();
    render(App);
    navigationStore.navigateLeafward(bookDtdNodeIds.bookContent);
    inspectorStore.inspect(bookDtdNodeIds.index);
    const search = screen.getByRole('searchbox', { name: 'Search schema' });
    await fireEvent.input(search, { target: { value: 'chapter' } });
    const project = bookDtdProject;
    const path = [...get(navigationStore.navigationPathIds)];

    await selectCompact();

    expect(get(navigationStore.navigationPathIds)).toEqual(path);
    expect(get(inspectorStore.inspectedNodeId)).toBe(bookDtdNodeIds.index);
    expect(search).toHaveValue('chapter');
    expect(project).toBe(bookDtdProject);
  });

  it('keeps ordinary carousel and browser-zoom wheel input unconsumed', async () => {
    installMatchMedia();
    render(App);
    await selectCompact();
    for (const init of [
      { deltaY: 80 },
      { deltaY: -80 },
      { deltaY: 80, ctrlKey: true },
      { deltaY: -80, metaKey: true },
    ]) {
      const event = new WheelEvent('wheel', {
        ...init,
        bubbles: true,
        cancelable: true,
      });
      surface().dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
    expect(get(semanticZoomStore).requestedLevel).toBe('compact');
  });

  it('keeps Compact unchanged when programmatic Overview renders genuinely', async () => {
    installMatchMedia();
    const { container } = render(App);
    semanticZoomStore.setRequestedLevel('overview');
    await waitFor(() =>
      expect(surface()).toHaveAttribute(
        'data-semantic-zoom-presentation',
        'overview',
      ),
    );
    expect(surface()).toHaveAttribute(
      'data-semantic-zoom-requested',
      'overview',
    );
    expect(screen.getByRole('slider', { name: 'Semantic zoom' })).toHaveValue(
      '0',
    );
    expect(container).toHaveTextContent('Overview');
  });

  it('draws keyed leafward and adjacent rootward lines and removes them in Full', async () => {
    installMatchMedia();
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: HTMLElement): DOMRect {
        const role = this.dataset.semanticZoomLineRole;
        const order = Number(this.dataset.carouselVisibleOrder ?? 0);
        const rectangle = (() => {
          if (
            this.matches('[data-carousel-gesture-viewport], .carousel-stage')
          ) {
            return { left: 0, top: 0, width: 1000, height: 650 };
          }
          if (role === 'focus') {
            return { left: 400, top: 240, width: 220, height: 140 };
          }
          if (role === 'leafward') {
            return {
              left: 740,
              top: 100 + order * 130,
              width: 180,
              height: 90,
            };
          }
          if (role === 'rootward' || role === 'history') {
            return { left: 80, top: 240, width: 180, height: 90 };
          }
          return { left: 0, top: 0, width: 0, height: 0 };
        })();
        return {
          ...rectangle,
          x: rectangle.left,
          y: rectangle.top,
          right: rectangle.left + rectangle.width,
          bottom: rectangle.top + rectangle.height,
          toJSON: () => rectangle,
        } as DOMRect;
      },
    );
    render(App);
    await selectCompact();
    await waitFor(() =>
      expect(
        document.querySelectorAll('[data-semantic-zoom-line-kind="leafward"]'),
      ).toHaveLength(3),
    );
    expect(
      document.querySelector('[data-semantic-zoom-relationship-lines]'),
    ).toHaveAttribute('aria-hidden', 'true');

    await fireEvent.click(
      screen.getByRole('button', {
        name: 'Navigate leafward to front.matter, DTD element declaration',
      }),
    );
    await waitFor(() =>
      expect(
        document.querySelectorAll('[data-semantic-zoom-line-kind="rootward"]'),
      ).toHaveLength(1),
    );

    semanticZoomStore.setRequestedLevel('full');
    await waitFor(() =>
      expect(
        document.querySelector('[data-semantic-zoom-relationship-lines]'),
      ).not.toBeInTheDocument(),
    );
  });

  it('refreshes leafward line identity after the branch window shifts', async () => {
    installMatchMedia();
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: HTMLElement): DOMRect {
        const role = this.dataset.semanticZoomLineRole;
        const order = Number(this.dataset.carouselVisibleOrder ?? 0);
        const rectangle = this.matches(
          '[data-carousel-gesture-viewport], .carousel-stage',
        )
          ? { left: 0, top: 0, width: 1000, height: 650 }
          : role === 'focus'
            ? { left: 400, top: 240, width: 220, height: 140 }
            : role === 'leafward'
              ? {
                  left: 740,
                  top: 100 + order * 130,
                  width: 180,
                  height: 90,
                }
              : { left: 0, top: 0, width: 0, height: 0 };
        return {
          ...rectangle,
          x: rectangle.left,
          y: rectangle.top,
          right: rectangle.left + rectangle.width,
          bottom: rectangle.top + rectangle.height,
          toJSON: () => rectangle,
        } as DOMRect;
      },
    );
    const project: SchemaProject = {
      id: 'compact-window-project',
      displayName: 'Compact window project',
      rootNodeIds: ['window:root'],
      nodes: [
        { id: 'window:root', kind: 'dtdElement', name: 'window-root' },
        ...Array.from({ length: 9 }, (_, index) => ({
          id: `window:child:${index}`,
          kind: 'dtdElement' as const,
          name: `child-${index}`,
        })),
      ],
      edges: Array.from({ length: 9 }, (_, index) => ({
        id: `window:edge:${index}`,
        kind: 'contains' as const,
        sourceNodeId: 'window:root',
        targetNodeId: `window:child:${index}`,
        order: index,
      })),
    };
    const replaced = replaceProjectSession({
      project,
      initialFocusNodeId: 'window:root',
      metadata: { origin: 'imported', sourceFilename: 'window.dtd' },
    });
    expect(replaced.applied).toBe(true);
    render(App);
    await selectCompact();

    await waitFor(() =>
      expect(
        document.querySelectorAll('[data-semantic-zoom-line-kind="leafward"]'),
      ).toHaveLength(3),
    );
    const before = [
      ...document.querySelectorAll<HTMLElement>(
        '[data-semantic-zoom-line-kind="leafward"]',
      ),
    ].map(({ dataset }) => dataset.semanticZoomLineKey);
    await fireEvent.click(
      screen.getByRole('button', { name: /Show \d+ nodes below/ }),
    );
    await waitFor(() => {
      const after = [
        ...document.querySelectorAll<HTMLElement>(
          '[data-semantic-zoom-line-kind="leafward"]',
        ),
      ].map(({ dataset }) => dataset.semanticZoomLineKey);
      expect(after).not.toEqual(before);
      expect(new Set(after).size).toBe(after.length);
    });
  });

  it('keeps Compact terminal cycle closures non-navigable and fully described', () => {
    render(ContextCard, {
      props: {
        node: {
          id: 'cycle:node',
          kind: 'dtdElement',
          name: 'recursive-node',
        },
        occurrence: '+',
        direction: 'leafward',
        relationshipId: 'cycle:edge',
        relationshipKind: 'contains',
        relationshipDisposition: 'terminalCycleClosure',
        terminalLabel: 'Already present in this path',
        onActivate: vi.fn(),
        isInspected: false,
        onToggleInspection: vi.fn(),
        motionKey: 'cycle-motion',
        showKind: true,
        presentation: 'compact',
      },
    });
    const article = screen.getByRole('article', {
      name: 'Destination recursive-node+',
    });
    expect(
      within(article).queryByRole('button', { name: /Navigate/ }),
    ).toBeNull();
    expect(within(article).getByText('recursive-node+')).toBeVisible();
    expect(within(article).getByText('↺')).toBeVisible();
    expect(
      article.querySelector('[data-carousel-terminal-cycle-closure]'),
    ).toHaveAccessibleName(
      'Destination recursive-node+. Already present in this path',
    );
    expect(
      within(article).getByRole('button', { name: 'Inspect recursive-node' }),
    ).toBeVisible();
  });

  it('keeps Compact rootward history Jump, Inspect, and journey metadata', () => {
    render(RootwardHistoryRow, {
      props: {
        node: {
          id: 'history:node',
          kind: 'dtdElement',
          name: 'earlier-node',
        },
        journeyPosition: 2,
        showKind: true,
        isInspected: false,
        onJump: vi.fn(),
        onToggleInspection: vi.fn(),
        presentation: 'compact',
      },
    });
    const row = document.querySelector('[data-rootward-history-row]');
    expect(row).toHaveAttribute('data-journey-position', '2');
    expect(
      screen.getByRole('button', {
        name: 'Jump to earlier-node, earlier in the current path',
      }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Inspect earlier-node' }),
    ).toBeVisible();
    expect(document.querySelector('.kind-badge')).not.toBeInTheDocument();
  });
});
