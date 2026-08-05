import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import relationshipLinesSource from '../../../tests/fixtures/semantic-zoom/relationship-lines.xsd?raw';
import App from '../../app/App.svelte';
import { inspectorStore } from '../../app/stores/inspectorStore';
import { replaceProjectSession } from '../../app/stores/projectSession';
import {
  SEMANTIC_ZOOM_DESKTOP_MEDIA_QUERY,
  semanticZoomStore,
} from '../../app/stores/semanticZoomStore';
import {
  bookDtdNodeIds,
  bookDtdProject,
} from '../../schema/samples/bookDtdProject';
import { importXsdSource } from '../../schema/xsd';
import { observedResizeTargetCount } from '../../tests/setup';

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
}

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

function installMatchMedia(): void {
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
}

function domRect(
  left: number,
  top: number,
  width: number,
  height: number,
): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({ left, top, width, height }),
  } as DOMRect;
}

function installGeometry(): void {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement): DOMRect {
      if (this.matches('[data-carousel-gesture-viewport], .carousel-stage')) {
        return domRect(280, 160, 720, 520);
      }
      if (this.hasAttribute('data-semantic-zoom-focus-card')) {
        return domRect(440, 360, 180, 120);
      }
      if (this.hasAttribute('data-semantic-zoom-leafward-edge-id')) {
        const order = Number(this.dataset.carouselVisibleOrder ?? 0);
        const inspected = Boolean(
          this.querySelector('[data-inspect-node-id][aria-pressed="true"]'),
        );
        return domRect(660, 200 + order * 105, 160, inspected ? 110 : 90);
      }
      if (this.hasAttribute('data-semantic-zoom-rootward-position')) {
        return domRect(300, 370, 100, 100);
      }
      return domRect(0, 0, 0, 0);
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

function activateRelationshipFixture(): void {
  const imported = importXsdSource(relationshipLinesSource, {
    projectId: 'semantic-zoom:relationship-lines',
    displayName: 'relationship-lines.xsd',
    sourceFileId: 'semantic-zoom:relationship-lines:source',
    sourceFilename: 'relationship-lines.xsd',
  });
  if (imported.status !== 'success') {
    throw new Error('Expected relationship-line XSD import to succeed.');
  }
  const result = replaceProjectSession({
    project: imported.project,
    initialFocusNodeId: imported.initialFocusNodeId,
    metadata: {
      origin: 'imported',
      sourceFilename: 'relationship-lines.xsd',
      xsdMetadataByNodeId: imported.xsdMetadataByNodeId,
    },
  });
  if (!result.applied) throw new Error('Expected fixture activation to apply.');
}

async function selectCompact(): Promise<void> {
  await fireEvent.input(screen.getByRole('slider', { name: 'Semantic zoom' }), {
    target: { value: '1' },
  });
  await waitFor(() =>
    expect(
      document.querySelector('[data-carousel-gesture-viewport]'),
    ).toHaveAttribute('data-semantic-zoom-presentation', 'compact'),
  );
}

async function selectOverview(): Promise<void> {
  await fireEvent.input(screen.getByRole('slider', { name: 'Semantic zoom' }), {
    target: { value: '0' },
  });
  await waitFor(() =>
    expect(
      document.querySelector('[data-carousel-gesture-viewport]'),
    ).toHaveAttribute('data-semantic-zoom-presentation', 'overview'),
  );
}

function leafwardLines(): SVGPathElement[] {
  return [
    ...document.querySelectorAll<SVGPathElement>(
      '[data-semantic-zoom-line-kind="leafward"]',
    ),
  ];
}

function lineKeys(): string[] {
  return [
    ...document.querySelectorAll<SVGPathElement>(
      '[data-semantic-zoom-line-key]',
    ),
  ].map((line) => line.dataset.semanticZoomLineKey ?? '');
}

function dispatchPointer(target: Element, type: string, clientX: number): void {
  target.dispatchEvent(
    new TestPointerEvent(type, {
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: type === 'pointerup' ? 0 : 1,
      pointerId: 1,
      isPrimary: true,
      clientX,
      clientY: 300,
    }),
  );
}

beforeEach(() => {
  restoreSample();
  inspectorStore.close();
  semanticZoomStore.reset();
  semanticZoomStore.setDesktopAvailability(false);
  installMatchMedia();
  installGeometry();
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

describe('SemanticZoomRelationshipLines', () => {
  it('renders lighter Overview lines with unchanged endpoints and clears them in Full', async () => {
    render(App);
    await selectCompact();
    await waitFor(() => expect(leafwardLines()).toHaveLength(3));
    const compactEndpoints = leafwardLines().map((line) => [
      line.dataset.semanticZoomLineFromX,
      line.dataset.semanticZoomLineFromY,
      line.dataset.semanticZoomLineToX,
      line.dataset.semanticZoomLineToY,
    ]);

    await selectOverview();
    await waitFor(() => expect(leafwardLines()).toHaveLength(3));
    const layer = document.querySelector(
      '[data-semantic-zoom-relationship-lines]',
    );
    expect(layer).toHaveAttribute(
      'data-semantic-zoom-line-presentation',
      'overview',
    );
    expect(layer).toHaveClass('overview');
    expect(
      leafwardLines().map((line) => [
        line.dataset.semanticZoomLineFromX,
        line.dataset.semanticZoomLineFromY,
        line.dataset.semanticZoomLineToX,
        line.dataset.semanticZoomLineToY,
      ]),
    ).toEqual(compactEndpoints);

    await fireEvent.input(
      screen.getByRole('slider', { name: 'Semantic zoom' }),
      { target: { value: '2' } },
    );
    await waitFor(() =>
      expect(
        document.querySelector('[data-semantic-zoom-relationship-lines]'),
      ).not.toBeInTheDocument(),
    );
  });

  it('passes the corrected State A → B → C identity sequence in Overview', async () => {
    activateRelationshipFixture();
    render(App);
    await selectOverview();
    await waitFor(() => expect(leafwardLines().length).toBeGreaterThan(2));
    const stateAKeys = lineKeys();

    const typeCard = screen.getByRole('article', {
      name: /RelationshipLineType/u,
    });
    await fireEvent.click(
      within(typeCard).getByRole('button', { name: /Navigate leafward/u }),
    );
    await screen.findByRole('heading', { name: 'RelationshipLineType' });
    await waitFor(() =>
      expect(
        document.querySelectorAll('[data-semantic-zoom-line-kind="rootward"]'),
      ).toHaveLength(1),
    );
    const stateBKeys = lineKeys();
    expect(stateBKeys).not.toEqual(stateAKeys);
    for (const key of stateAKeys) expect(stateBKeys).not.toContain(key);

    await fireEvent.click(
      screen.getByRole('button', { name: /Navigate rootward/u }),
    );
    await waitFor(() => expect(lineKeys()).toEqual(stateAKeys));
    for (const key of stateBKeys) expect(lineKeys()).not.toContain(key);
  });

  it('shares the offset stage coordinate system and maps every line to its card identity', async () => {
    const rendered = render(App);
    await selectCompact();
    await waitFor(() => expect(leafwardLines()).toHaveLength(3));

    const svg = document.querySelector<SVGSVGElement>(
      '[data-semantic-zoom-relationship-lines]',
    );
    expect(svg).toHaveAttribute('viewBox', '0 0 720 520');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('focusable', 'false');
    expect(getComputedStyle(svg!).pointerEvents).toBe('none');

    for (const line of leafwardLines()) {
      const targetIdentity = line.dataset.semanticZoomLineTarget;
      const edgeId = targetIdentity?.replace(/^leafward:/u, '');
      const target = document.querySelector<HTMLElement>(
        `[data-semantic-zoom-leafward-edge-id="${CSS.escape(edgeId ?? '')}"]`,
      );
      expect(target).toBeInTheDocument();
      expect(line.dataset.semanticZoomLineSource).toBe('focus');
      expect(Number(line.dataset.semanticZoomLineFromX)).toBe(340);
      expect(Number(line.dataset.semanticZoomLineToX)).toBe(380);
      expect(line.getAttribute('d')).toMatch(/^M 340 260 L 380 /u);
    }

    rendered.unmount();
    expect(observedResizeTargetCount()).toBe(0);
  });

  it('redraws exact State A → State B → State C identities without stale paths', async () => {
    activateRelationshipFixture();
    render(App);
    await selectCompact();
    await waitFor(() => expect(leafwardLines().length).toBeGreaterThan(2));

    const stateAKeys = lineKeys();
    expect(stateAKeys.every((key) => key.startsWith('leafward:'))).toBe(true);
    const typeCard = screen.getByRole('article', {
      name: /RelationshipLineType/u,
    });
    await fireEvent.click(
      within(typeCard).getByRole('button', { name: /Navigate leafward/u }),
    );
    await screen.findByRole('heading', { name: 'RelationshipLineType' });
    await waitFor(() =>
      expect(
        document.querySelectorAll('[data-semantic-zoom-line-kind="rootward"]'),
      ).toHaveLength(1),
    );

    const stateBKeys = lineKeys();
    expect(stateBKeys).not.toEqual(stateAKeys);
    expect(stateBKeys.some((key) => key.startsWith('rootward:'))).toBe(true);
    expect(stateBKeys.some((key) => key.startsWith('leafward:'))).toBe(true);
    for (const key of stateAKeys) expect(stateBKeys).not.toContain(key);
    const rootward = document.querySelector<SVGPathElement>(
      '[data-semantic-zoom-line-kind="rootward"]',
    );
    expect(rootward?.dataset.semanticZoomLineSource).toMatch(/^previous:/u);
    expect(rootward?.dataset.semanticZoomLineTarget).toMatch(/^focus:/u);
    expect(Number(rootward?.dataset.semanticZoomLineFromX)).toBe(120);
    expect(Number(rootward?.dataset.semanticZoomLineToX)).toBe(160);

    const previousCard = screen.getByRole('article', {
      name: /Schema overview/u,
    });
    await fireEvent.click(
      within(previousCard).getByRole('button', { name: /Navigate rootward/u }),
    );
    await screen.findByRole('heading', { level: 2, name: 'Schema overview' });
    await waitFor(() => expect(lineKeys()).toEqual(stateAKeys));
    for (const key of stateBKeys) expect(lineKeys()).not.toContain(key);
  });

  it('clears lines during direct manipulation and restores settled geometry', async () => {
    const rendered = render(App);
    await selectCompact();
    await waitFor(() => expect(leafwardLines()).toHaveLength(3));

    const surface = document.querySelector<HTMLElement>(
      '[data-carousel-gesture-viewport]',
    );
    const focus = document.querySelector<HTMLElement>(
      '[data-semantic-zoom-focus-card]',
    );
    if (!surface || !focus) throw new Error('Expected carousel geometry.');
    const captured = new Set<number>();
    Object.assign(surface, {
      setPointerCapture: (pointerId: number) => captured.add(pointerId),
      releasePointerCapture: (pointerId: number) => captured.delete(pointerId),
      hasPointerCapture: (pointerId: number) => captured.has(pointerId),
    });

    dispatchPointer(focus, 'pointerdown', 500);
    dispatchPointer(focus, 'pointermove', 460);
    await waitFor(() =>
      expect(surface).toHaveAttribute(
        'data-presentation-phase',
        'direct-manipulation',
      ),
    );
    await waitFor(() => expect(lineKeys()).toEqual([]));

    dispatchPointer(focus, 'pointerup', 460);
    await waitFor(() => expect(leafwardLines()).toHaveLength(3), {
      timeout: 1_000,
    });
    rendered.unmount();
    expect(observedResizeTargetCount()).toBe(0);
  });

  it('refreshes after Inspect dimensions and removes stale project geometry', async () => {
    render(App);
    await selectCompact();
    await waitFor(() => expect(leafwardLines()).toHaveLength(3));
    const firstLine = leafwardLines()[0];
    const originalTargetY = Number(firstLine?.dataset.semanticZoomLineToY);

    await fireEvent.click(
      screen.getByRole('button', { name: 'Inspect front.matter' }),
    );
    await waitFor(() =>
      expect(
        Number(leafwardLines()[0]?.dataset.semanticZoomLineToY),
      ).toBeGreaterThan(originalTargetY),
    );
    await fireEvent.click(
      screen.getByRole('button', { name: 'Close inspection for front.matter' }),
    );
    await waitFor(() =>
      expect(Number(leafwardLines()[0]?.dataset.semanticZoomLineToY)).toBe(
        originalTargetY,
      ),
    );

    const staleKeys = lineKeys();
    activateRelationshipFixture();
    await waitFor(() => expect(lineKeys()).not.toEqual(staleKeys));
    for (const key of staleKeys) expect(lineKeys()).not.toContain(key);
  });
});
