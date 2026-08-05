import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../app/App.svelte';
import { inspectorStore } from '../app/stores/inspectorStore';
import { replaceProjectSession } from '../app/stores/projectSession';
import {
  SEMANTIC_ZOOM_DESKTOP_MEDIA_QUERY,
  isSemanticZoomDesktopViewport,
  semanticZoomStore,
} from '../app/stores/semanticZoomStore';
import {
  bookDtdNodeIds,
  bookDtdProject,
} from '../schema/samples/bookDtdProject';
import contextCardSource from '../ui/carousel/ContextCard.svelte?raw';
import semanticZoomControlSource from '../ui/carousel/SemanticZoomControl.svelte?raw';
import relationshipLinesSource from '../ui/carousel/SemanticZoomRelationshipLines.svelte?raw';

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

function installMatchMedia(reducedMotion = false): {
  semantic: ControlledMediaQueryList;
  reduced: ControlledMediaQueryList;
} {
  const semantic = new ControlledMediaQueryList(
    SEMANTIC_ZOOM_DESKTOP_MEDIA_QUERY,
    true,
  );
  const reduced = new ControlledMediaQueryList(
    '(prefers-reduced-motion: reduce)',
    reducedMotion,
  );
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) =>
      query === SEMANTIC_ZOOM_DESKTOP_MEDIA_QUERY ? semantic : reduced,
    ),
  );
  return { semantic, reduced };
}

function rectangle(
  left: number,
  top: number,
  width: number,
  height: number,
): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({ left, top, width, height }),
  } as DOMRect;
}

function installChangingGeometry(): void {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement): DOMRect {
      if (this.matches('[data-carousel-gesture-viewport], .carousel-stage')) {
        return rectangle(0, 0, 1100, 700);
      }
      if (!this.dataset.carouselMotionKey) return rectangle(0, 0, 0, 0);

      const order = Number(this.dataset.carouselVisibleOrder ?? 0);
      if (this.classList.contains('focus-card')) {
        if (this.classList.contains('overview')) {
          return rectangle(450, 310, 200, 72);
        }
        if (this.classList.contains('compact')) {
          return rectangle(420, 280, 260, 124);
        }
        return rectangle(370, 210, 360, 280);
      }
      if (this.classList.contains('overview')) {
        return rectangle(790, 70 + order * 54, 170, 44);
      }
      if (this.classList.contains('compact')) {
        return rectangle(760, 90 + order * 82, 210, 68);
      }
      return rectangle(735, 100 + order * 140, 250, 118);
    },
  );
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
  if (!element) throw new Error('Expected semantic zoom surface.');
  return element;
}

beforeEach(() => {
  restoreSample();
  inspectorStore.close();
  semanticZoomStore.reset();
  semanticZoomStore.setDesktopAvailability(false);
  installChangingGeometry();
  vi.stubGlobal('PointerEvent', TestPointerEvent);
});

afterEach(() => {
  restoreSample();
  inspectorStore.close();
  semanticZoomStore.reset();
  semanticZoomStore.setDesktopAvailability(false);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('semantic zoom UX hardening', () => {
  it('keeps the exact desktop threshold and declares narrow, touch, and forced-colour policies', () => {
    expect(isSemanticZoomDesktopViewport(1024, 600)).toBe(true);
    expect(isSemanticZoomDesktopViewport(1023, 600)).toBe(false);
    expect(isSemanticZoomDesktopViewport(1024, 599)).toBe(false);
    expect(semanticZoomControlSource).toContain(
      '@container carousel (max-width: 760px)',
    );
    expect(semanticZoomControlSource).toContain('touch-action: manipulation');
    expect(semanticZoomControlSource).toContain(
      '@media (forced-colors: active)',
    );
    expect(contextCardSource).toContain('@media (forced-colors: active)');
    expect(contextCardSource).toContain('border-right: 4px double Highlight');
    expect(contextCardSource).toContain('outline: 3px dotted Highlight');
    expect(relationshipLinesSource).toContain('stroke-dasharray: none');
    expect(relationshipLinesSource).toContain('stroke-dasharray: 2 4');
    expect(relationshipLinesSource).toContain('stroke-dasharray: 9 4');
  });

  it('animates only the moving layer while keeping control focus and lines settled-only', async () => {
    installMatchMedia();
    render(App);
    const zoomOut = screen.getByRole('button', {
      name: 'Zoom out to Compact',
    });
    zoomOut.focus();

    await fireEvent.click(zoomOut);
    await waitFor(() =>
      expect(surface()).toHaveAttribute(
        'data-semantic-zoom-transition',
        'animating',
      ),
    );
    expect(surface()).toHaveAttribute(
      'data-semantic-zoom-transition-from',
      'full',
    );
    expect(surface()).toHaveAttribute(
      'data-semantic-zoom-transition-to',
      'compact',
    );
    expect(zoomOut).toHaveFocus();
    expect(
      document.querySelectorAll('[data-semantic-zoom-line-key]'),
    ).toHaveLength(0);
    expect(
      document.querySelectorAll('[data-semantic-zoom-motion]'),
    ).not.toHaveLength(0);

    await waitFor(
      () =>
        expect(surface()).toHaveAttribute(
          'data-semantic-zoom-transition',
          'idle',
        ),
      { timeout: 1_000 },
    );
    expect(
      document.querySelector('[data-semantic-zoom-motion]'),
    ).not.toBeInTheDocument();
    expect(zoomOut).toHaveFocus();
  });

  it('restores range focus after a boundary button becomes disabled', async () => {
    installMatchMedia();
    render(App);

    await fireEvent.click(
      screen.getByRole('button', { name: 'Zoom out to Compact' }),
    );
    await waitFor(
      () =>
        expect(surface()).toHaveAttribute(
          'data-semantic-zoom-transition',
          'idle',
        ),
      { timeout: 1_000 },
    );

    const boundaryButton = screen.getByRole('button', {
      name: 'Zoom out to Overview',
    });
    boundaryButton.focus();
    await fireEvent.click(boundaryButton);
    await waitFor(
      () => {
        expect(surface()).toHaveAttribute(
          'data-semantic-zoom-presentation',
          'overview',
        );
        expect(surface()).toHaveAttribute(
          'data-semantic-zoom-transition',
          'idle',
        );
      },
      { timeout: 1_000 },
    );
    expect(screen.getByRole('slider', { name: 'Semantic zoom' })).toHaveFocus();
  });

  it('cancels superseded changes so the latest valid range request wins', async () => {
    installMatchMedia();
    render(App);
    const range = screen.getByRole<HTMLInputElement>('slider', {
      name: 'Semantic zoom',
    });
    range.focus();

    await fireEvent.input(range, { target: { value: '1' } });
    await waitFor(() =>
      expect(surface()).toHaveAttribute(
        'data-semantic-zoom-transition',
        'animating',
      ),
    );
    await fireEvent.input(range, { target: { value: '0' } });
    await fireEvent.input(range, { target: { value: '2' } });

    await waitFor(() =>
      expect(surface()).toHaveAttribute(
        'data-semantic-zoom-presentation',
        'full',
      ),
    );
    await waitFor(
      () =>
        expect(surface()).toHaveAttribute(
          'data-semantic-zoom-transition',
          'idle',
        ),
      { timeout: 1_000 },
    );
    expect(get(semanticZoomStore).requestedLevel).toBe('full');
    expect(range).toHaveFocus();
    expect(
      document.querySelector('[data-semantic-zoom-motion]'),
    ).not.toBeInTheDocument();
  });

  it('settles reduced-motion user changes immediately without temporary motion styles', async () => {
    installMatchMedia(true);
    render(App);

    await fireEvent.click(
      screen.getByRole('button', { name: 'Zoom out to Compact' }),
    );
    await waitFor(() =>
      expect(surface()).toHaveAttribute(
        'data-semantic-zoom-presentation',
        'compact',
      ),
    );
    await waitFor(() =>
      expect(surface()).toHaveAttribute(
        'data-semantic-zoom-transition',
        'idle',
      ),
    );
    expect(surface()).toHaveAttribute('data-reduced-motion', 'true');
    expect(
      document.querySelector('[data-semantic-zoom-motion]'),
    ).not.toBeInTheDocument();
  });

  it('cancels an active transition for responsive fallback and restores without animation', async () => {
    const media = installMatchMedia();
    render(App);
    await fireEvent.click(
      screen.getByRole('button', { name: 'Zoom out to Compact' }),
    );
    await waitFor(() =>
      expect(surface()).toHaveAttribute(
        'data-semantic-zoom-transition',
        'animating',
      ),
    );

    media.semantic.setMatches(false);
    await waitFor(() =>
      expect(surface()).toHaveAttribute('data-semantic-zoom-effective', 'full'),
    );
    expect(surface()).toHaveAttribute('data-semantic-zoom-transition', 'idle');
    expect(get(semanticZoomStore).requestedLevel).toBe('compact');
    expect(
      document.querySelector('[data-semantic-zoom-motion]'),
    ).not.toBeInTheDocument();

    media.semantic.setMatches(true);
    await waitFor(() =>
      expect(surface()).toHaveAttribute(
        'data-semantic-zoom-presentation',
        'compact',
      ),
    );
    expect(surface()).toHaveAttribute('data-semantic-zoom-transition', 'idle');
  });

  it('settles semantic zoom before a carousel drag starts', async () => {
    installMatchMedia();
    render(App);
    await fireEvent.click(
      screen.getByRole('button', { name: 'Zoom out to Compact' }),
    );
    await waitFor(() =>
      expect(surface()).toHaveAttribute(
        'data-semantic-zoom-transition',
        'animating',
      ),
    );

    const focus = document.querySelector<HTMLElement>(
      '[data-semantic-zoom-focus-card]',
    );
    if (!focus) throw new Error('Expected focus motion element.');
    focus.dispatchEvent(
      new TestPointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        pointerId: 7,
        isPrimary: true,
        clientX: 500,
        clientY: 320,
      }),
    );

    await waitFor(() =>
      expect(surface()).toHaveAttribute(
        'data-presentation-phase',
        'direct-manipulation',
      ),
    );
    expect(surface()).toHaveAttribute('data-semantic-zoom-transition', 'idle');
    expect(
      document.querySelector('[data-semantic-zoom-motion]'),
    ).not.toBeInTheDocument();
  });
});
