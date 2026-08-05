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
import rootwardPathSource from '../ui/carousel/RootwardPath.svelte?raw';
import schemaCarouselSource from '../ui/carousel/SchemaCarousel.svelte?raw';
import appShellSource from '../ui/layout/AppShell.svelte?raw';
import inspectorPanelSource from '../ui/layout/InspectorPanel.svelte?raw';
import nodeInspectorSource from '../ui/inspector/NodeInspector.svelte?raw';

interface TestPointerEventInit extends MouseEventInit {
  readonly pointerId?: number;
  readonly isPrimary?: boolean;
  readonly pointerType?: string;
}

class TestPointerEvent extends MouseEvent {
  readonly pointerId: number;
  readonly isPrimary: boolean;
  readonly pointerType: string;

  constructor(type: string, init: TestPointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
    this.isPrimary = init.isPrimary ?? true;
    this.pointerType = init.pointerType ?? 'mouse';
  }
}

interface PendingFrame {
  readonly handle: number;
  readonly callback: FrameRequestCallback;
}

let pendingFrames: PendingFrame[];
let nextFrameHandle: number;

function dispatchPointer(
  target: Element,
  type: string,
  init: TestPointerEventInit = {},
): TestPointerEvent {
  const event = new TestPointerEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    pointerId: 1,
    isPrimary: true,
    clientX: 200,
    clientY: 200,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}

function flushFrames(): void {
  const frames = pendingFrames;
  pendingFrames = [];
  for (const { callback } of frames) callback(0);
}

function setBounds(element: HTMLElement, top: number): void {
  element.getBoundingClientRect = () => ({
    x: 900,
    y: top,
    top,
    right: 1140,
    bottom: top + 100,
    left: 900,
    width: 240,
    height: 100,
    toJSON: () => ({}),
  });
}

function prepareVisibleBranchGeometry(): HTMLElement[] {
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>(
      '[data-carousel-leafward-candidate-id]',
    ),
  );
  candidates.forEach((candidate, index) =>
    setBounds(candidate, 120 + index * 140),
  );
  return candidates;
}

function gestureSurface(): HTMLElement {
  const surface = document.querySelector<HTMLElement>(
    '[data-carousel-gesture-viewport]',
  );
  if (!surface) throw new Error('Expected the carousel gesture viewport.');
  return surface;
}

function installPointerCapture(surface: HTMLElement): {
  readonly set: ReturnType<typeof vi.fn<(pointerId: number) => void>>;
  readonly release: ReturnType<typeof vi.fn<(pointerId: number) => void>>;
} {
  const captured = new Set<number>();
  const set = vi.fn((pointerId: number) => captured.add(pointerId));
  const release = vi.fn((pointerId: number) => captured.delete(pointerId));
  Object.assign(surface, {
    setPointerCapture: set,
    releasePointerCapture: release,
    hasPointerCapture: (pointerId: number) => captured.has(pointerId),
  });
  return { set, release };
}

function currentPath(): readonly string[] {
  return get(navigationStore.navigationPathIds);
}

beforeEach(() => {
  navigationStore.initializeAt(bookDtdNodeIds.book);
  inspectorStore.close();
  pendingFrames = [];
  nextFrameHandle = 1;
  vi.stubGlobal('PointerEvent', TestPointerEvent);
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    const handle = nextFrameHandle++;
    pendingFrames.push({ handle, callback });
    return handle;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((handle) => {
    pendingFrames = pendingFrames.filter((frame) => frame.handle !== handle);
  });
});

afterEach(() => {
  replaceProjectSession({
    project: bookDtdProject,
    initialFocusNodeId: bookDtdNodeIds.book,
    metadata: { origin: 'sample', sourceFilename: 'book.dtd' },
  });
  inspectorStore.close();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('rendered carousel pointer integration', () => {
  it('marks the viewport, wrapper layer, allowed navigation origins, and ignored Inspect controls', () => {
    render(App);

    const surface = gestureSurface();
    const layer = surface.querySelector('[data-carousel-gesture-layer]');
    const navigation = screen.getByRole('button', {
      name: 'Navigate leafward to book.content, DTD element declaration',
    });
    const inspect = screen.getByRole('button', {
      name: 'Inspect book.content',
    });

    expect(layer).toBeInTheDocument();
    expect(
      surface.querySelector('[data-carousel-focus-anchor]'),
    ).toBeInTheDocument();
    expect(navigation).toHaveAttribute('data-carousel-navigation-action');
    expect(inspect).toHaveAttribute('data-carousel-gesture-ignore');
    expect(navigation.closest('article')).toHaveAttribute(
      'data-carousel-gesture-origin',
    );
  });

  it('captures the primary pointer and translates only the wrapper below threshold', async () => {
    render(App);
    const surface = gestureSurface();
    const capture = installPointerCapture(surface);
    const focusCard = screen.getByRole('article', { name: 'book' });
    const layer = within(surface)
      .getByRole('article', { name: 'book' })
      .closest('[data-carousel-gesture-layer]') as HTMLElement;
    const originalCardTransform = focusCard.style.transform;

    dispatchPointer(focusCard, 'pointerdown', { pointerId: 4 });
    dispatchPointer(surface, 'pointermove', {
      pointerId: 4,
      clientX: 165,
    });
    flushFrames();

    expect(capture.set).toHaveBeenCalledWith(4);
    await waitFor(() =>
      expect(surface).toHaveAttribute('data-gesture-phase', 'tracking'),
    );
    expect(layer.style.getPropertyValue('--gesture-offset')).toBe('-35px');
    expect(focusCard.style.transform).toBe(originalCardTransform);
    expect(currentPath()).toEqual([bookDtdNodeIds.book]);
  });

  it('moves leafward preview between visible cards without navigating', async () => {
    render(App);
    const surface = gestureSurface();
    installPointerCapture(surface);
    const candidates = prepareVisibleBranchGeometry();
    const focusCard = screen.getByRole('article', { name: 'book' });

    dispatchPointer(focusCard, 'pointerdown');
    dispatchPointer(surface, 'pointermove', {
      clientX: 152,
      clientY: 165,
    });
    flushFrames();
    await waitFor(() =>
      expect(candidates[0]).toHaveAttribute('data-gesture-preview', 'true'),
    );
    expect(candidates[1]).not.toHaveAttribute('data-gesture-preview');

    dispatchPointer(surface, 'pointermove', {
      clientX: 140,
      clientY: 305,
    });
    flushFrames();
    await waitFor(() =>
      expect(candidates[1]).toHaveAttribute('data-gesture-preview', 'true'),
    );
    expect(candidates[0]).not.toHaveAttribute('data-gesture-preview');
    expect(currentPath()).toEqual([bookDtdNodeIds.book]);
  });

  it('does not allow a keyboard action to race an active pointer gesture', async () => {
    render(App);
    const surface = gestureSurface();
    installPointerCapture(surface);
    const focusCard = screen.getByRole('article', { name: 'book' });

    await fireEvent.keyDown(document.body, { key: 'ArrowDown' });
    expect(
      document.querySelector('[data-keyboard-selected="true"]'),
    ).toBeInTheDocument();

    dispatchPointer(focusCard, 'pointerdown');
    await waitFor(() =>
      expect(surface).toHaveAttribute('data-gesture-phase', 'tracking'),
    );
    expect(
      document.querySelector('[data-keyboard-selected="true"]'),
    ).not.toBeInTheDocument();

    await fireEvent.keyDown(surface, { key: 'ArrowRight' });
    expect(currentPath()).toEqual([bookDtdNodeIds.book]);

    dispatchPointer(surface, 'pointercancel');
    await waitFor(() =>
      expect(surface).toHaveAttribute('data-gesture-phase', 'idle'),
    );

    await fireEvent.keyDown(surface, { key: 'ArrowRight' });
    expect(currentPath()).toEqual([
      bookDtdNodeIds.book,
      bookDtdNodeIds.frontMatter,
    ]);
  });

  it('commits touch leafward navigation from portrait-style off-canvas cards and preserves inspection', async () => {
    inspectorStore.inspect(bookDtdNodeIds.index);
    render(App);
    const surface = gestureSurface();
    const capture = installPointerCapture(surface);
    prepareVisibleBranchGeometry();
    const focusCard = screen.getByRole('article', { name: 'book' });

    dispatchPointer(focusCard, 'pointerdown', {
      pointerId: 3,
      pointerType: 'touch',
    });
    dispatchPointer(surface, 'pointerup', {
      pointerId: 3,
      clientX: 152,
      clientY: 305,
      pointerType: 'touch',
    });

    await waitFor(() =>
      expect(currentPath()).toEqual([
        bookDtdNodeIds.book,
        bookDtdNodeIds.bookContent,
      ]),
    );
    expect(get(inspectorStore.inspectedNodeId)).toBe(bookDtdNodeIds.index);
    expect(capture.release).toHaveBeenCalledWith(3);
    expect(surface).toHaveAttribute('data-gesture-phase', 'idle');
    expect(document.querySelector('[data-gesture-preview="true"]')).toBeNull();
  });

  it('settles a self-recursive gesture without navigation or announcement', async () => {
    const project: SchemaProject = {
      id: 'self-recursive-gesture',
      displayName: 'Self-recursive gesture',
      nodes: [
        {
          id: 'section',
          kind: 'dtdElement',
          name: 'section',
          compactDeclaration: '(section*)',
        },
      ],
      edges: [
        {
          id: 'section-section',
          kind: 'contains',
          sourceNodeId: 'section',
          targetNodeId: 'section',
          occurrence: { min: 0, max: 'unbounded' },
        },
      ],
      rootNodeIds: ['section'],
    };
    expect(
      replaceProjectSession({
        project,
        initialFocusNodeId: 'section',
        metadata: {
          origin: 'imported',
          sourceFilename: 'self-recursion.dtd',
        },
      }).applied,
    ).toBe(true);
    render(App);

    const surface = gestureSurface();
    installPointerCapture(surface);
    const [candidate] = prepareVisibleBranchGeometry();
    expect(candidate).toHaveAttribute(
      'data-carousel-leafward-candidate-edge-id',
      'section-section',
    );
    const focusCard = screen.getByRole('article', { name: 'section' });
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('');

    dispatchPointer(focusCard, 'pointerdown');
    dispatchPointer(surface, 'pointerup', {
      clientX: 152,
      clientY: 165,
    });

    await waitFor(() => expect(currentPath()).toEqual(['section']));
    expect(status).toHaveTextContent('');
    expect(surface).toHaveAttribute('data-gesture-phase', 'idle');
    expect(surface).toHaveAttribute('data-presentation-phase', 'settling');
    expect(document.querySelector('[data-gesture-preview="true"]')).toBeNull();
    expect(
      surface
        .querySelector<HTMLElement>('[data-carousel-gesture-layer]')
        ?.style.getPropertyValue('--gesture-offset'),
    ).toBe('0px');
  });

  it('snaps back from a nonself terminal cycle closure without changing focus', async () => {
    const project: SchemaProject = {
      id: 'mutual-recursive-gesture',
      displayName: 'Mutual-recursive gesture',
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
        },
        {
          id: 'two-one',
          kind: 'contains',
          sourceNodeId: 'two',
          targetNodeId: 'one',
        },
      ],
      rootNodeIds: ['one'],
    };
    expect(
      replaceProjectSession({
        project,
        initialFocusNodeId: 'one',
        metadata: {
          origin: 'imported',
          sourceFilename: 'mutual-recursion.dtd',
        },
      }).applied,
    ).toBe(true);
    expect(
      navigationStore.navigateStructuralRelationship({
        edgeId: 'one-two',
        sourceNodeId: 'one',
        targetNodeId: 'two',
      }),
    ).toMatchObject({ applied: true, effect: 'advanced' });
    inspectorStore.inspect('two');
    render(App);

    const surface = gestureSurface();
    installPointerCapture(surface);
    prepareVisibleBranchGeometry();
    const focusCard = screen.getByRole('article', { name: 'two' });
    const status = screen.getByRole('status');

    dispatchPointer(focusCard, 'pointerdown');
    dispatchPointer(surface, 'pointerup', {
      clientX: 152,
      clientY: 165,
    });

    await waitFor(() => expect(currentPath()).toEqual(['one', 'two']));
    expect(surface).toHaveAttribute('data-presentation-phase', 'settling');
    expect(surface).toHaveAttribute('data-gesture-phase', 'idle');
    expect(status).toHaveTextContent('');
    expect(document.querySelector('[data-gesture-preview="true"]')).toBeNull();
    expect(
      surface
        .querySelector<HTMLElement>('[data-carousel-gesture-layer]')
        ?.style.getPropertyValue('--gesture-offset'),
    ).toBe('0px');
    expect(screen.getByRole('article', { name: 'two' })).toBeVisible();
    expect(get(inspectorStore.inspectedNodeId)).toBe('two');
    expect(
      screen.getByRole('button', { name: 'Close inspection for two' }),
    ).toBeEnabled();
  });

  it('targets only the three cards in the shifted chapter window', async () => {
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 700,
      writable: true,
    });
    navigationStore.initializeAt(bookDtdNodeIds.chapter);
    inspectorStore.inspect(bookDtdNodeIds.title);
    render(App);

    const branch = screen.getByRole('region', {
      name: 'Leafward destinations',
    });
    expect(
      Array.from(
        branch.querySelectorAll<HTMLElement>(
          '[data-carousel-leafward-candidate-id]',
        ),
      ).map((candidate) => candidate.dataset.carouselLeafwardCandidateId),
    ).toEqual([
      bookDtdNodeIds.title,
      bookDtdNodeIds.epigraph,
      bookDtdNodeIds.section,
    ]);

    await fireEvent.click(
      within(branch).getByRole('button', {
        name: 'Show 2 nodes below in the leafward rail',
      }),
    );
    await fireEvent.click(
      within(branch).getByRole('button', {
        name: 'Show 1 node below in the leafward rail',
      }),
    );

    const candidates = prepareVisibleBranchGeometry();
    expect(
      candidates.map(
        (candidate) => candidate.dataset.carouselLeafwardCandidateId,
      ),
    ).toEqual([
      bookDtdNodeIds.section,
      bookDtdNodeIds.figure,
      bookDtdNodeIds.note,
    ]);

    const surface = gestureSurface();
    installPointerCapture(surface);
    const focusCard = screen.getByRole('article', { name: 'chapter' });
    dispatchPointer(focusCard, 'pointerdown', {
      pointerId: 12,
      pointerType: 'touch',
    });
    dispatchPointer(surface, 'pointerup', {
      pointerId: 12,
      pointerType: 'touch',
      clientX: 152,
      clientY: 450,
    });

    await waitFor(() =>
      expect(currentPath()).toEqual([
        bookDtdNodeIds.chapter,
        bookDtdNodeIds.note,
      ]),
    );
    expect(get(inspectorStore.inspectedNodeId)).toBe(bookDtdNodeIds.title);
  });

  it('previews and commits exactly one positional rootward step', async () => {
    render(App);
    await fireEvent.click(
      screen.getByRole('button', {
        name: 'Navigate leafward to book.content, DTD element declaration',
      }),
    );
    const surface = gestureSurface();
    installPointerCapture(surface);
    const focusCard = await screen.findByRole('article', {
      name: 'book.content',
    });
    const rootward = screen.getByRole('article', {
      name: 'Previous step book',
    });

    dispatchPointer(focusCard, 'pointerdown');
    dispatchPointer(surface, 'pointermove', { clientX: 248 });
    flushFrames();
    await waitFor(() =>
      expect(rootward).toHaveAttribute('data-gesture-preview', 'true'),
    );
    expect(currentPath()).toEqual([
      bookDtdNodeIds.book,
      bookDtdNodeIds.bookContent,
    ]);

    dispatchPointer(surface, 'pointerup', { clientX: 248 });
    await waitFor(() => expect(currentPath()).toEqual([bookDtdNodeIds.book]));
  });

  it('returns touch-rootward after Structure centring preserves its relationship', async () => {
    inspectorStore.inspect(bookDtdNodeIds.book);
    render(App);

    const inspector = screen.getByRole('complementary', {
      name: 'Schema inspector',
    });
    const structure = within(inspector).getByRole('region', {
      name: 'Structure',
    });
    await fireEvent.click(
      within(structure).getByRole('button', { name: 'Center index' }),
    );
    await waitFor(() =>
      expect(currentPath()).toEqual([
        bookDtdNodeIds.book,
        bookDtdNodeIds.index,
      ]),
    );

    const surface = gestureSurface();
    installPointerCapture(surface);
    const focusCard = await screen.findByRole('article', { name: 'index' });
    const rootward = screen.getByRole('article', {
      name: 'Previous step book',
    });

    dispatchPointer(focusCard, 'pointerdown', {
      pointerId: 6,
      pointerType: 'touch',
    });
    dispatchPointer(surface, 'pointermove', {
      pointerId: 6,
      pointerType: 'touch',
      clientX: 248,
    });
    flushFrames();
    await waitFor(() =>
      expect(rootward).toHaveAttribute('data-gesture-preview', 'true'),
    );

    dispatchPointer(surface, 'pointerup', {
      pointerId: 6,
      pointerType: 'touch',
      clientX: 248,
    });
    await waitFor(() => expect(currentPath()).toEqual([bookDtdNodeIds.book]));
    expect(get(inspectorStore.inspectedNodeId)).toBe(bookDtdNodeIds.book);
  });

  it('drags right through every ancestor of an inspector-reconstructed journey', async () => {
    inspectorStore.inspect(bookDtdNodeIds.section);
    render(App);

    const inspector = screen.getByRole('complementary', {
      name: 'Schema inspector',
    });
    const structure = within(inspector).getByRole('region', {
      name: 'Structure',
    });
    await fireEvent.click(
      within(structure).getByRole('button', { name: 'Center para+' }),
    );
    await waitFor(() =>
      expect(currentPath()).toEqual([
        bookDtdNodeIds.book,
        bookDtdNodeIds.bookContent,
        bookDtdNodeIds.chapter,
        bookDtdNodeIds.section,
        bookDtdNodeIds.para,
      ]),
    );

    const surface = gestureSurface();
    installPointerCapture(surface);
    const rootwardSteps = [
      [
        'para',
        'section',
        [
          bookDtdNodeIds.book,
          bookDtdNodeIds.bookContent,
          bookDtdNodeIds.chapter,
          bookDtdNodeIds.section,
        ],
      ],
      [
        'section',
        'chapter',
        [
          bookDtdNodeIds.book,
          bookDtdNodeIds.bookContent,
          bookDtdNodeIds.chapter,
        ],
      ],
      [
        'chapter',
        'book.content',
        [bookDtdNodeIds.book, bookDtdNodeIds.bookContent],
      ],
      ['book.content', 'book', [bookDtdNodeIds.book]],
    ] as const;

    for (const [
      stepIndex,
      [focusName, priorName, expectedPath],
    ] of rootwardSteps.entries()) {
      const focusCard = await screen.findByRole('article', { name: focusName });
      const rootward = screen.getByRole('article', {
        name: `Previous step ${priorName}`,
      });

      dispatchPointer(focusCard, 'pointerdown', {
        pointerId: 7,
        pointerType: 'touch',
      });
      dispatchPointer(surface, 'pointermove', {
        pointerId: 7,
        pointerType: 'touch',
        clientX: 248,
        clientY: 80 + stepIndex * 160,
      });
      flushFrames();
      await waitFor(() =>
        expect(rootward).toHaveAttribute('data-gesture-preview', 'true'),
      );
      for (const historyRow of screen.queryAllByRole('listitem')) {
        expect(historyRow).not.toHaveAttribute('data-gesture-preview');
      }
      dispatchPointer(surface, 'pointerup', {
        pointerId: 7,
        pointerType: 'touch',
        clientX: 248,
      });
      await waitFor(() => expect(currentPath()).toEqual(expectedPath));
    }

    expect(get(inspectorStore.inspectedNodeId)).toBe(bookDtdNodeIds.section);
    expect(
      within(inspector).getByRole('heading', { name: 'section' }),
    ).toBeVisible();
  });

  it('keeps a one-node rootward drag noncommittal and clears at release', () => {
    render(App);
    const surface = gestureSurface();
    installPointerCapture(surface);
    const focusCard = screen.getByRole('article', { name: 'book' });

    dispatchPointer(focusCard, 'pointerdown');
    dispatchPointer(surface, 'pointerup', { clientX: 248 });

    expect(currentPath()).toEqual([bookDtdNodeIds.book]);
    expect(surface).toHaveAttribute('data-gesture-phase', 'idle');
    expect(document.querySelector('[data-gesture-preview="true"]')).toBeNull();
  });

  it('does not start on Inspect and preserves its ordinary activation', async () => {
    render(App);
    const surface = gestureSurface();
    installPointerCapture(surface);
    const inspect = screen.getByRole('button', {
      name: 'Inspect book.content',
    });

    dispatchPointer(inspect, 'pointerdown');
    dispatchPointer(inspect, 'pointermove', { clientX: 120 });
    flushFrames();
    expect(surface).toHaveAttribute('data-gesture-phase', 'idle');

    await fireEvent.click(inspect);
    expect(get(inspectorStore.inspectedNodeId)).toBe(
      bookDtdNodeIds.bookContent,
    );
    expect(currentPath()).toEqual([bookDtdNodeIds.book]);
  });

  it('declares transform-only direct manipulation and bounded reduced-motion snap-back', () => {
    expect(schemaCarouselSource).toContain('translate3d(var(--gesture-offset)');
    expect(schemaCarouselSource).not.toMatch(/style:(left|right|width|top)=/);
    expect(schemaCarouselSource).toContain('touch-action: none');
    expect(schemaCarouselSource).toContain('user-select: none');
    expect(schemaCarouselSource).toContain('prefers-reduced-motion');
    expect(contextCardSource).toContain('gesture-preview');
    expect(contextCardSource).toContain('outline: 3px');
    expect(contextCardSource).toContain('transform: scale');
  });

  it('keeps compact portrait context windows rendered off-canvas without changing scoped touch behavior', () => {
    const portraitLayout = schemaCarouselSource.match(
      /@media \(max-width: 699px\) \{([\s\S]*?)\n {2}\}\n\n {2}@media \(prefers-reduced-motion/,
    )?.[1];

    expect(portraitLayout).toBeDefined();
    expect(portraitLayout).toContain('position: absolute');
    expect(portraitLayout).toContain('left: calc(100% + var(--space-4))');
    expect(portraitLayout).not.toContain('display: none');
    expect(schemaCarouselSource).toContain('container: carousel / inline-size');
    expect(schemaCarouselSource).toContain('overflow: hidden');
    expect(schemaCarouselSource).toContain('touch-action: none');
    expect(contextCardSource).toContain(
      '@media (max-width: 699px), (max-height: 699px)',
    );
  });

  it('preserves full compact names accessibly with safe wrapping for unbroken identifiers', async () => {
    render(App);
    await fireEvent.click(
      screen.getByRole('button', {
        name: 'Navigate leafward to book.content, DTD element declaration',
      }),
    );

    const chapter = screen.getByRole('button', {
      name: 'Navigate leafward to chapter+, DTD element declaration',
    });
    expect(chapter).toHaveTextContent('chapter+');
    expect(chapter.querySelector('.node-name')).toHaveAttribute(
      'title',
      'chapter+',
    );
    expect(contextCardSource).toContain('white-space: normal');
    expect(contextCardSource).toContain('overflow-wrap: anywhere');
    expect(contextCardSource).not.toContain('text-overflow: ellipsis');
    expect(contextCardSource).toContain('font-size: var(--font-size-sm)');
    expect(contextCardSource).not.toContain('word-break: break-all');
    expect(contextCardSource).toContain('min-height: var(--control-min-size)');
  });

  it('uses the compact inspector overlay, positional rootward window, and explicit focus anchor contracts', () => {
    expect(appShellSource).toContain('@media (max-width: 1099px)');
    expect(inspectorPanelSource).toContain('@media (max-width: 1099px)');
    expect(inspectorPanelSource).toContain('.inspector-panel.has-target');
    expect(rootwardPathSource).toContain('windowed.hiddenEarlierCount');
    expect(rootwardPathSource).toContain(
      'data-carousel-side-window="rootward"',
    );
    expect(rootwardPathSource).toContain('previous.journeyPosition');
    expect(schemaCarouselSource).toContain('data-carousel-focus-anchor');
    expect(schemaCarouselSource).toContain('grid-column: 2');
    expect(schemaCarouselSource).toContain('container: carousel / inline-size');
  });
});

function dispatchTransformTransitionEnd(target: Element): void {
  const event = new Event('transitionend', { bubbles: true });
  Object.defineProperty(event, 'propertyName', { value: 'transform' });
  target.dispatchEvent(event);
}

function motionRect(
  left: number,
  top: number,
  width: number,
  height: number,
): DOMRect {
  return {
    x: left,
    y: top,
    top,
    right: left + width,
    bottom: top + height,
    left,
    width,
    height,
    toJSON: () => ({}),
  } as DOMRect;
}

function installMotionLayoutGeometry(): void {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      if (!this.hasAttribute('data-carousel-motion-key')) {
        return motionRect(0, 0, 0, 0);
      }
      if (this.classList.contains('focus-card')) {
        return motionRect(300, 160, 360, 260);
      }
      if (this.classList.contains('rootward')) {
        return motionRect(40, 180, 180, 100);
      }

      const visibleOrder = Number(this.dataset.carouselVisibleOrder ?? 0);
      return motionRect(720, 100 + visibleOrder * 120, 180, 100);
    },
  );
}

function installReducedMotionPreference(initialMatches: boolean): {
  setMatches(matches: boolean): void;
} {
  let matches = initialMatches;
  let changeListener: ((event: MediaQueryListEvent) => void) | undefined;
  const mediaQuery = {
    get matches() {
      return matches;
    },
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addEventListener(
      type: string,
      listener: (event: MediaQueryListEvent) => void,
    ) {
      if (type === 'change') changeListener = listener;
    },
    removeEventListener(
      type: string,
      listener: (event: MediaQueryListEvent) => void,
    ) {
      if (type === 'change' && changeListener === listener) {
        changeListener = undefined;
      }
    },
  } as unknown as MediaQueryList;

  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => mediaQuery),
  );
  return {
    setMatches(nextMatches) {
      matches = nextMatches;
      changeListener?.({ matches } as MediaQueryListEvent);
    },
  };
}

describe('gesture motion and accessibility refinement', () => {
  it('exposes one concise gesture description without obsolete drag ARIA', () => {
    render(App);

    const surface = gestureSurface();
    expect(surface).toHaveAttribute(
      'aria-describedby',
      'carousel-gesture-description',
    );
    expect(
      document.getElementById('carousel-gesture-description'),
    ).toHaveTextContent(
      'Drag left to move leafward. Move up or down while dragging to choose a branch. Drag right to move rootward. Cards can also be activated directly.',
    );
    expect(surface).not.toHaveAttribute('aria-grabbed');
    expect(surface).toHaveAttribute('data-presentation-phase', 'resting');
  });

  it('uses direct manipulation without easing and a bounded snap-back that returns to resting', async () => {
    render(App);
    const surface = gestureSurface();
    installPointerCapture(surface);
    const focusCard = screen.getByRole('article', { name: 'book' });
    const layer = surface.querySelector<HTMLElement>(
      '[data-carousel-gesture-layer]',
    );
    if (!layer) throw new Error('Expected the gesture layer.');

    dispatchPointer(focusCard, 'pointerdown');
    await waitFor(() =>
      expect(surface).toHaveAttribute(
        'data-presentation-phase',
        'direct-manipulation',
      ),
    );
    dispatchPointer(surface, 'pointermove', { clientX: 170 });
    flushFrames();
    await waitFor(() =>
      expect(layer.style.getPropertyValue('--gesture-offset')).toBe('-30px'),
    );

    dispatchPointer(surface, 'pointerup', { clientX: 170 });
    await waitFor(() =>
      expect(surface).toHaveAttribute('data-presentation-phase', 'settling'),
    );
    expect(currentPath()).toEqual([bookDtdNodeIds.book]);
    expect(layer.style.getPropertyValue('--gesture-offset')).toBe('0px');

    dispatchTransformTransitionEnd(layer);
    await waitFor(() =>
      expect(surface).toHaveAttribute('data-presentation-phase', 'resting'),
    );
  });

  it('commits leafward immediately, animates the positional destination once, and finishes at identity', async () => {
    installMotionLayoutGeometry();
    render(App);
    const surface = gestureSurface();
    installPointerCapture(surface);
    prepareVisibleBranchGeometry();
    const focusCard = screen.getByRole('article', { name: 'book' });

    dispatchPointer(focusCard, 'pointerdown');
    dispatchPointer(surface, 'pointerup', {
      clientX: 152,
      clientY: 305,
    });

    await waitFor(() =>
      expect(currentPath()).toEqual([
        bookDtdNodeIds.book,
        bookDtdNodeIds.bookContent,
      ]),
    );
    expect(surface).toHaveAttribute(
      'data-presentation-phase',
      'committing-leafward',
    );
    const newFocus = screen.getByRole('article', { name: 'book.content' });
    await waitFor(() =>
      expect(newFocus.style.transform).toContain('translate3d('),
    );
    expect(newFocus.style.transition).toBe('none');

    dispatchTransformTransitionEnd(newFocus);
    expect(surface).toHaveAttribute(
      'data-presentation-phase',
      'committing-leafward',
    );

    flushFrames();
    flushFrames();
    expect(newFocus.style.transition).toContain('--duration-gesture-commit');
    expect(newFocus.style.transform).toBe('translate3d(0, 0, 0) scale(1, 1)');
    expect(currentPath()).toEqual([
      bookDtdNodeIds.book,
      bookDtdNodeIds.bookContent,
    ]);

    dispatchTransformTransitionEnd(newFocus);
    await waitFor(() =>
      expect(surface).toHaveAttribute('data-presentation-phase', 'resting'),
    );
    expect(newFocus.style.transform).toBe('');
  });

  it('preserves the final direct offset until commit setup captures source geometry', async () => {
    installMotionLayoutGeometry();
    render(App);
    const surface = gestureSurface();
    installPointerCapture(surface);
    prepareVisibleBranchGeometry();
    const layer = surface.querySelector<HTMLElement>(
      '[data-carousel-gesture-layer]',
    );
    if (!layer) throw new Error('Expected the gesture layer.');
    const focusCard = screen.getByRole('article', { name: 'book' });

    dispatchPointer(focusCard, 'pointerdown');
    dispatchPointer(surface, 'pointermove', {
      clientX: 152,
      clientY: 305,
    });
    flushFrames();
    expect(layer.style.getPropertyValue('--gesture-offset')).toBe('-48px');

    dispatchPointer(surface, 'pointerup', {
      clientX: 152,
      clientY: 305,
    });

    expect(currentPath()).toEqual([
      bookDtdNodeIds.book,
      bookDtdNodeIds.bookContent,
    ]);
    await waitFor(() =>
      expect(surface).toHaveAttribute(
        'data-presentation-phase',
        'committing-leafward',
      ),
    );
    const newFocus = await screen.findByRole('article', {
      name: 'book.content',
    });
    await waitFor(() =>
      expect(newFocus.style.transform).toContain('translate3d('),
    );
    expect(newFocus.style.transition).toBe('none');
    expect(layer.style.getPropertyValue('--gesture-offset')).toBe('0px');
  });

  it('keeps the legend outside an explicit constrained motion stage', () => {
    render(App);
    const surface = gestureSurface();
    const motionStage = surface.closest('[data-carousel-motion-stage]');
    const legend = screen
      .getByText('current focus')
      .closest<HTMLElement>('.spatial-model');

    expect(motionStage).toBeInTheDocument();
    expect(motionStage).toContainElement(surface);
    expect(motionStage).not.toContainElement(legend);
    expect(schemaCarouselSource).toContain(
      'grid-template-rows: minmax(0, 1fr)',
    );
    expect(schemaCarouselSource).toContain('height: 100%');
    expect(schemaCarouselSource).toContain('max-height: 100%');
    expect(focusCardSource).toContain(
      'grid-template-rows: auto auto minmax(0, 1fr)',
    );
    expect(focusCardSource).toContain('overflow-y: auto');
    expect(focusCardSource).toContain('scrollbar-gutter: stable');
  });

  it('declares constrained-landscape focus and context variants without hiding required controls', () => {
    expect(focusCardSource).toContain(
      '@media (orientation: landscape) and (max-height: 520px)',
    );
    expect(focusCardSource).toContain('font-size: var(--font-size-xl)');
    expect(focusCardSource).toContain('min-height: var(--control-min-size)');
    expect(contextCardSource).toContain(
      '@media (orientation: landscape) and (max-height: 520px)',
    );
    expect(contextCardSource).toContain(
      'grid-template-columns: minmax(0, 1fr) minmax(60px, auto)',
    );
  });

  it('declares a full-width independently scrolling portrait inspector sheet', () => {
    expect(inspectorPanelSource).toContain(
      '@media (max-width: 699px) and (orientation: portrait)',
    );
    expect(inspectorPanelSource).toContain('left: max(');
    expect(inspectorPanelSource).toContain('right: max(');
    expect(inspectorPanelSource).toContain('width: auto');
    expect(inspectorPanelSource).toContain('max-height: 66dvh');
    expect(inspectorPanelSource).toContain('overflow-y: hidden');
    expect(nodeInspectorSource).toContain('overflow-y: auto');
    expect(inspectorPanelSource).toContain('overscroll-behavior: contain');
  });

  it('commits rootward from the left while preserving independent inspection', async () => {
    installMotionLayoutGeometry();
    inspectorStore.inspect(bookDtdNodeIds.index);
    render(App);
    await fireEvent.click(
      screen.getByRole('button', {
        name: 'Navigate leafward to book.content, DTD element declaration',
      }),
    );

    const surface = gestureSurface();
    installPointerCapture(surface);
    const rootward = screen.getByRole('article', {
      name: 'Previous step book',
    });
    setBounds(rootward, 180);
    rootward.getBoundingClientRect = () => ({
      x: -240,
      y: 180,
      top: 180,
      right: -60,
      bottom: 260,
      left: -240,
      width: 180,
      height: 80,
      toJSON: () => ({}),
    });
    const focusCard = screen.getByRole('article', { name: 'book.content' });

    dispatchPointer(focusCard, 'pointerdown');
    dispatchPointer(surface, 'pointerup', { clientX: 248 });

    await waitFor(() => expect(currentPath()).toEqual([bookDtdNodeIds.book]));
    expect(surface).toHaveAttribute(
      'data-presentation-phase',
      'committing-rootward',
    );
    const newFocus = screen.getByRole('article', { name: 'book' });
    await waitFor(() =>
      expect(newFocus.style.transform).toMatch(/^translate3d\(-/),
    );
    expect(get(inspectorStore.inspectedNodeId)).toBe(bookDtdNodeIds.index);
  });

  it('moves owned keyboard focus with preventScroll after a committed gesture but preserves it on cancellation', async () => {
    render(App);
    const surface = gestureSurface();
    installPointerCapture(surface);
    prepareVisibleBranchGeometry();
    const navigation = screen.getByRole('button', {
      name: 'Navigate leafward to book.content, DTD element declaration',
    });
    const focusSpy = vi.spyOn(HTMLElement.prototype, 'focus');
    navigation.focus();
    focusSpy.mockClear();

    dispatchPointer(navigation, 'pointerdown');
    dispatchPointer(surface, 'pointerup', {
      clientX: 152,
      clientY: 305,
    });

    const heading = await screen.findByRole('heading', {
      name: 'book.content',
    });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });

    const chapter = screen.getByRole('button', {
      name: 'Navigate leafward to chapter+, DTD element declaration',
    });
    chapter.focus();
    dispatchPointer(chapter, 'pointerdown', { pointerId: 9 });
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(chapter).toHaveFocus();
  });

  it('does not steal inspector focus when a gesture begins from empty carousel space', async () => {
    inspectorStore.inspect(bookDtdNodeIds.index);
    render(App);
    const surface = gestureSurface();
    installPointerCapture(surface);
    prepareVisibleBranchGeometry();
    const closeInspector = screen.getByRole('button', {
      name: 'Close inspector for index',
    });
    closeInspector.focus();

    dispatchPointer(surface, 'pointerdown');
    dispatchPointer(surface, 'pointerup', {
      clientX: 152,
      clientY: 305,
    });

    await waitFor(() =>
      expect(currentPath()).toEqual([
        bookDtdNodeIds.book,
        bookDtdNodeIds.bookContent,
      ]),
    );
    expect(closeInspector).toHaveFocus();
    expect(get(inspectorStore.inspectedNodeId)).toBe(bookDtdNodeIds.index);
  });

  it('keeps preview and cancellation silent while announcing a committed destination only once', async () => {
    render(App);
    const surface = gestureSurface();
    installPointerCapture(surface);
    prepareVisibleBranchGeometry();
    const status = screen.getByRole('status');
    const focusCard = screen.getByRole('article', { name: 'book' });

    dispatchPointer(focusCard, 'pointerdown');
    dispatchPointer(surface, 'pointermove', {
      clientX: 152,
      clientY: 165,
    });
    flushFrames();
    expect(status.textContent?.trim()).toBe('');
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(status.textContent?.trim()).toBe('');

    dispatchPointer(focusCard, 'pointerdown', { pointerId: 5 });
    dispatchPointer(surface, 'pointerup', {
      pointerId: 5,
      clientX: 152,
      clientY: 305,
    });
    await waitFor(() =>
      expect(status).toHaveTextContent(
        'Focused: book.content, DTD element declaration. One child.',
      ),
    );
    const committedAnnouncement = status.textContent;
    const newFocus = screen.getByRole('article', { name: 'book.content' });
    dispatchTransformTransitionEnd(newFocus);
    expect(status.textContent).toBe(committedAnnouncement);
  });

  it('suppresses committed travel in reduced motion and responds to a live preference change', async () => {
    const reducedMotion = installReducedMotionPreference(true);
    render(App);
    const surface = gestureSurface();
    installPointerCapture(surface);
    prepareVisibleBranchGeometry();
    const focusCard = screen.getByRole('article', { name: 'book' });

    dispatchPointer(focusCard, 'pointerdown');
    dispatchPointer(surface, 'pointerup', {
      clientX: 152,
      clientY: 305,
    });

    await waitFor(() =>
      expect(currentPath()).toEqual([
        bookDtdNodeIds.book,
        bookDtdNodeIds.bookContent,
      ]),
    );
    expect(surface).toHaveAttribute('data-reduced-motion', 'true');
    expect(surface).toHaveAttribute(
      'data-presentation-phase',
      'reduced-motion-commit',
    );
    expect(
      screen.getByRole('article', { name: 'book.content' }).style.transform,
    ).toBe('');

    reducedMotion.setMatches(false);
    await waitFor(() =>
      expect(surface).toHaveAttribute('data-reduced-motion', 'false'),
    );
    expect(surface).toHaveAttribute('data-presentation-phase', 'resting');
  });

  it('uses its bounded fallback and allows a new gesture to interrupt settling', async () => {
    render(App);
    const surface = gestureSurface();
    installPointerCapture(surface);
    const focusCard = screen.getByRole('article', { name: 'book' });

    dispatchPointer(focusCard, 'pointerdown', { pointerId: 2 });
    dispatchPointer(surface, 'pointerup', {
      pointerId: 2,
      clientX: 170,
    });
    await waitFor(() =>
      expect(surface).toHaveAttribute('data-presentation-phase', 'settling'),
    );

    dispatchPointer(focusCard, 'pointerdown', { pointerId: 3 });
    await waitFor(() =>
      expect(surface).toHaveAttribute(
        'data-presentation-phase',
        'direct-manipulation',
      ),
    );
    dispatchPointer(surface, 'pointercancel', { pointerId: 3 });

    await waitFor(
      () =>
        expect(surface).toHaveAttribute('data-presentation-phase', 'resting'),
      { timeout: 500 },
    );
  });

  it('clears pending presentation frames when the component is destroyed', async () => {
    installMotionLayoutGeometry();
    const rendered = render(App);
    const surface = gestureSurface();
    installPointerCapture(surface);
    prepareVisibleBranchGeometry();
    const focusCard = screen.getByRole('article', { name: 'book' });

    dispatchPointer(focusCard, 'pointerdown');
    dispatchPointer(surface, 'pointerup', {
      clientX: 152,
      clientY: 305,
    });
    await waitFor(() => expect(pendingFrames.length).toBeGreaterThan(0));

    rendered.unmount();
    expect(pendingFrames).toHaveLength(0);
  });

  it('declares transform-only bounded motion without bounce, inertia, or permanent will-change', () => {
    expect(schemaCarouselSource).toContain('--duration-gesture-commit');
    expect(schemaCarouselSource).toContain('--duration-gesture-return');
    expect(schemaCarouselSource).toContain('--duration-gesture-reduced');
    expect(schemaCarouselSource).toContain('cursor: grab');
    expect(schemaCarouselSource).toContain('cursor: grabbing');
    expect(schemaCarouselSource).not.toMatch(
      /\b(bounce|spring|inertia|overshoot|perspective|blur)\b/i,
    );
    expect(schemaCarouselSource).not.toMatch(
      /^\s*\.gesture-layer\s*\{[^}]*will-change/m,
    );
  });
});
