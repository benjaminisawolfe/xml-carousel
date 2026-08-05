import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../app/App.svelte';
import { inspectorStore } from '../app/stores/inspectorStore';
import { navigationStore } from '../app/stores/navigationStore';
import { replaceProjectSession } from '../app/stores/projectSession';
import { projectSessionResetStore } from '../app/stores/projectSessionResetStore';
import {
  SEMANTIC_ZOOM_DESKTOP_MEDIA_QUERY,
  semanticZoomStore,
} from '../app/stores/semanticZoomStore';
import {
  bookDtdNodeIds,
  bookDtdProject,
} from '../schema/samples/bookDtdProject';
import { PointerGestureController } from '../ui/carousel/gesture/pointerGestureController';

class ControlledMediaQueryList implements MediaQueryList {
  matches: boolean;
  readonly media: string;
  onchange:
    ((this: MediaQueryList, ev: MediaQueryListEvent) => unknown) | null = null;
  readonly addEventListener = vi.fn(
    (type: string, listener: EventListenerOrEventListenerObject): void => {
      if (type === 'change') this.listeners.add(listener);
    },
  );
  readonly removeEventListener = vi.fn(
    (type: string, listener: EventListenerOrEventListenerObject): void => {
      if (type === 'change') this.listeners.delete(listener);
    },
  );
  readonly addListener = vi.fn();
  readonly removeListener = vi.fn();
  readonly dispatchEvent = vi.fn(() => true);
  private readonly listeners = new Set<EventListenerOrEventListenerObject>();

  constructor(media: string, matches: boolean) {
    this.media = media;
    this.matches = matches;
  }

  setMatches(matches: boolean): void {
    this.matches = matches;
    const event = { matches, media: this.media } as MediaQueryListEvent;
    this.onchange?.call(this, event);
    for (const listener of this.listeners) {
      if (typeof listener === 'function') listener(event);
      else listener.handleEvent(event);
    }
  }
}

function installMatchMedia(desktop: boolean): {
  readonly semanticZoom: ControlledMediaQueryList;
  readonly reducedMotion: ControlledMediaQueryList;
} {
  const semanticZoom = new ControlledMediaQueryList(
    SEMANTIC_ZOOM_DESKTOP_MEDIA_QUERY,
    desktop,
  );
  const reducedMotion = new ControlledMediaQueryList(
    '(prefers-reduced-motion: reduce)',
    false,
  );
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) =>
      query === SEMANTIC_ZOOM_DESKTOP_MEDIA_QUERY
        ? semanticZoom
        : reducedMotion,
    ),
  );
  return { semanticZoom, reducedMotion };
}

function restoreSample(): void {
  const result = replaceProjectSession({
    project: bookDtdProject,
    initialFocusNodeId: bookDtdNodeIds.book,
    metadata: { origin: 'sample', sourceFilename: 'book.dtd' },
  });
  if (!result.applied) throw new Error('Expected sample restoration to apply.');
}

function zoomSurface(): HTMLElement {
  const surface = document.querySelector<HTMLElement>(
    '[data-carousel-gesture-viewport]',
  );
  if (!surface) throw new Error('Expected semantic zoom carousel surface.');
  return surface;
}

function accessibleCardNames(): readonly string[] {
  return screen
    .getAllByRole('article')
    .map((article) => article.getAttribute('aria-label') ?? '');
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

describe('semantic zoom carousel foundation', () => {
  it('renders Full hooks before browser availability can resolve', () => {
    vi.stubGlobal('matchMedia', undefined);
    render(App);

    expect(zoomSurface()).toHaveAttribute(
      'data-semantic-zoom-requested',
      'full',
    );
    expect(zoomSurface()).toHaveAttribute(
      'data-semantic-zoom-effective',
      'full',
    );
    expect(zoomSurface()).toHaveAttribute(
      'data-semantic-zoom-available',
      'false',
    );
  });

  it('reflects the centralized desktop media-query result', async () => {
    const media = installMatchMedia(true);
    const rendered = render(App);

    await waitFor(() =>
      expect(zoomSurface()).toHaveAttribute(
        'data-semantic-zoom-available',
        'true',
      ),
    );
    expect(window.matchMedia).toHaveBeenCalledWith(
      SEMANTIC_ZOOM_DESKTOP_MEDIA_QUERY,
    );
    expect(media.semanticZoom.addEventListener).toHaveBeenCalledWith(
      'change',
      expect.any(Function),
    );

    rendered.unmount();
    expect(media.semanticZoom.removeEventListener).toHaveBeenCalledWith(
      'change',
      expect.any(Function),
    );
  });

  it.each(['compact', 'overview'] as const)(
    'preserves requested %s while constrained and restores it on desktop',
    async (level) => {
      const media = installMatchMedia(false);
      semanticZoomStore.setRequestedLevel(level);
      render(App);

      expect(zoomSurface()).toHaveAttribute(
        'data-semantic-zoom-requested',
        level,
      );
      expect(zoomSurface()).toHaveAttribute(
        'data-semantic-zoom-effective',
        'full',
      );
      expect(zoomSurface()).toHaveAttribute(
        'data-semantic-zoom-available',
        'false',
      );

      media.semanticZoom.setMatches(true);
      await waitFor(() =>
        expect(zoomSurface()).toHaveAttribute(
          'data-semantic-zoom-effective',
          level,
        ),
      );
      media.semanticZoom.setMatches(false);
      await waitFor(() =>
        expect(zoomSurface()).toHaveAttribute(
          'data-semantic-zoom-effective',
          'full',
        ),
      );
      expect(get(semanticZoomStore).requestedLevel).toBe(level);
    },
  );

  it('cancels transient gesture presentation when effective level changes', async () => {
    installMatchMedia(true);
    const cancel = vi.spyOn(PointerGestureController.prototype, 'cancel');
    render(App);
    const layer = zoomSurface().querySelector<HTMLElement>(
      '[data-carousel-gesture-layer]',
    );
    if (!layer) throw new Error('Expected gesture layer.');
    layer.style.setProperty('--gesture-offset', '42px');
    cancel.mockClear();

    semanticZoomStore.setRequestedLevel('compact');

    await waitFor(() => expect(cancel).toHaveBeenCalledOnce());
    expect(layer.style.getPropertyValue('--gesture-offset')).toBe('0px');
    expect(zoomSurface()).toHaveAttribute('data-gesture-phase', 'idle');
    expect(zoomSurface()).toHaveAttribute('data-presentation-phase', 'resting');
  });

  it('preserves focus, navigation, inspector, and Search state', async () => {
    installMatchMedia(true);
    render(App);
    navigationStore.navigateLeafward(bookDtdNodeIds.bookContent);
    inspectorStore.inspect(bookDtdNodeIds.index);
    const search = screen.getByRole('searchbox', { name: 'Search schema' });
    await fireEvent.input(search, { target: { value: 'chapter' } });
    const inspect = await screen.findByRole('button', {
      name: 'Inspect chapter',
    });
    inspect.focus();
    const path = [...get(navigationStore.navigationPathIds)];

    semanticZoomStore.setRequestedLevel('overview');

    await waitFor(() =>
      expect(zoomSurface()).toHaveAttribute(
        'data-semantic-zoom-effective',
        'overview',
      ),
    );
    expect(get(navigationStore.navigationPathIds)).toEqual(path);
    expect(get(navigationStore.currentFocusNodeId)).toBe(
      bookDtdNodeIds.bookContent,
    );
    expect(get(inspectorStore.inspectedNodeId)).toBe(bookDtdNodeIds.index);
    expect(search).toHaveValue('chapter');
    expect(inspect).toHaveFocus();
  });

  it('persists requested zoom through project replacement and session reset', async () => {
    installMatchMedia(true);
    render(App);
    semanticZoomStore.setRequestedLevel('compact');

    restoreSample();
    projectSessionResetStore.reset(bookDtdNodeIds.book);

    await waitFor(() =>
      expect(get(semanticZoomStore)).toMatchObject({
        requestedLevel: 'compact',
        effectiveLevel: 'compact',
      }),
    );
  });

  it('renders no control and leaves Full card content and names unchanged', async () => {
    installMatchMedia(true);
    const { container } = render(App);
    const originalText = container.textContent;
    const originalNames = accessibleCardNames();
    const originalButtons = screen
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label') ?? button.textContent);

    semanticZoomStore.setRequestedLevel('overview');
    await waitFor(() =>
      expect(zoomSurface()).toHaveAttribute(
        'data-semantic-zoom-effective',
        'overview',
      ),
    );

    expect(container.textContent).toBe(originalText);
    expect(accessibleCardNames()).toEqual(originalNames);
    expect(
      screen
        .getAllByRole('button')
        .map(
          (button) => button.getAttribute('aria-label') ?? button.textContent,
        ),
    ).toEqual(originalButtons);
    expect(
      screen.queryByRole('button', {
        name: /Full detail|Compact|Overview/,
      }),
    ).not.toBeInTheDocument();
    expect(container).not.toHaveTextContent('Full detail');
  });

  it('keeps spatial keyboard navigation operational at future levels', async () => {
    installMatchMedia(true);
    render(App);
    semanticZoomStore.setRequestedLevel('overview');

    await fireEvent.keyDown(document.body, { key: 'ArrowRight' });

    await waitFor(() =>
      expect(get(navigationStore.navigationPathIds)).toEqual([
        bookDtdNodeIds.book,
        bookDtdNodeIds.frontMatter,
      ]),
    );
    expect(get(semanticZoomStore).requestedLevel).toBe('overview');
  });

  it('does not bind ordinary or browser-zoom wheel input to the carousel', () => {
    installMatchMedia(true);
    render(App);
    semanticZoomStore.setRequestedLevel('compact');
    const surface = zoomSurface();

    for (const init of [
      { deltaY: 120 },
      { deltaY: -120 },
      { deltaY: 120, ctrlKey: true },
      { deltaY: -120, metaKey: true },
    ]) {
      const event = new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        ...init,
      });
      expect(surface.dispatchEvent(event)).toBe(true);
      expect(event.defaultPrevented).toBe(false);
    }

    expect(get(semanticZoomStore).requestedLevel).toBe('compact');
  });
});
