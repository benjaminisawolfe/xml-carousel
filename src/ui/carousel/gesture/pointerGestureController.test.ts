import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  prototypeDirectionPolicyA,
  prototypeDirectionPolicyB,
} from './gestureTypes';
import {
  isAllowedGestureOrigin,
  measureRenderedLeafwardCandidates,
  PointerGestureController,
  TASK_2_2_PROTOTYPE_DIRECTION_POLICY,
  type PointerGestureSnapshot,
} from './pointerGestureController';

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

interface FrameScheduler {
  readonly request: ReturnType<
    typeof vi.fn<(callback: FrameRequestCallback) => number>
  >;
  readonly cancel: ReturnType<typeof vi.fn<(handle: number) => void>>;
  flush(): void;
  pendingCount(): number;
}

function createFrameScheduler(): FrameScheduler {
  let nextHandle = 1;
  const callbacks = new Map<number, FrameRequestCallback>();
  const request = vi.fn((callback: FrameRequestCallback) => {
    const handle = nextHandle++;
    callbacks.set(handle, callback);
    return handle;
  });
  const cancel = vi.fn((handle: number) => {
    callbacks.delete(handle);
  });

  return {
    request,
    cancel,
    flush() {
      const pending = [...callbacks.entries()];
      callbacks.clear();
      for (const [, callback] of pending) callback(0);
    },
    pendingCount: () => callbacks.size,
  };
}

function setBounds(
  element: HTMLElement,
  top: number,
  height = 80,
  width = 180,
  left = 0,
): void {
  element.getBoundingClientRect = () => ({
    x: left,
    y: top,
    top,
    right: left + width,
    bottom: top + height,
    left,
    width,
    height,
    toJSON: () => ({}),
  });
}

function pointer(
  target: Element,
  type: string,
  init: TestPointerEventInit = {},
): TestPointerEvent {
  const event = new TestPointerEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: 100,
    clientY: 200,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}

interface Harness {
  readonly surface: HTMLDivElement;
  readonly emptySpace: HTMLDivElement;
  readonly navigationAction: HTMLButtonElement;
  readonly inspectAction: HTMLButtonElement;
  readonly nestedLink: HTMLAnchorElement;
  readonly scheduler: FrameScheduler;
  readonly snapshots: PointerGestureSnapshot[];
  readonly navigateLeafward: ReturnType<typeof vi.fn<(nodeId: string) => void>>;
  readonly navigateRootward: ReturnType<typeof vi.fn<() => void>>;
  readonly setPointerCapture: ReturnType<
    typeof vi.fn<(pointerId: number) => void>
  >;
  readonly releasePointerCapture: ReturnType<
    typeof vi.fn<(pointerId: number) => void>
  >;
  readonly controller: PointerGestureController;
  setJourney(nodeIds: readonly string[]): void;
  setCandidatesEnabled(enabled: boolean): void;
}

const controllers: PointerGestureController[] = [];

function createHarness(): Harness {
  const surface = document.createElement('div');
  surface.dataset.carouselGestureViewport = '';
  const emptySpace = document.createElement('div');
  const navigationAction = document.createElement('button');
  navigationAction.dataset.carouselNavigationAction = '';
  navigationAction.textContent = 'Navigate';
  const inspectAction = document.createElement('button');
  inspectAction.dataset.carouselGestureIgnore = '';
  inspectAction.textContent = 'Inspect';
  const nestedLink = document.createElement('a');
  nestedLink.href = '#details';
  nestedLink.textContent = 'Details';
  surface.append(emptySpace, navigationAction, inspectAction, nestedLink);

  const candidates = [
    ['upper', 80],
    ['middle', 180],
    ['lower', 280],
  ] as const;
  for (const [nodeId, top] of candidates) {
    const candidate = document.createElement('article');
    candidate.dataset.carouselLeafwardCandidateId = nodeId;
    candidate.dataset.carouselVisibleOrder = String(
      candidates.findIndex(([candidateId]) => candidateId === nodeId),
    );
    setBounds(candidate, top);
    surface.append(candidate);
  }
  document.body.append(surface);

  const capturedPointers = new Set<number>();
  const setPointerCapture = vi.fn((pointerId: number) => {
    capturedPointers.add(pointerId);
  });
  const releasePointerCapture = vi.fn((pointerId: number) => {
    capturedPointers.delete(pointerId);
  });
  Object.assign(surface, {
    setPointerCapture,
    releasePointerCapture,
    hasPointerCapture: (pointerId: number) => capturedPointers.has(pointerId),
  });

  let journey: readonly string[] = ['root', 'focus'];
  let candidatesEnabled = true;
  const scheduler = createFrameScheduler();
  const snapshots: PointerGestureSnapshot[] = [];
  const navigateLeafward = vi.fn<(nodeId: string) => void>();
  const navigateRootward = vi.fn<() => void>();
  const controller = new PointerGestureController({
    surface,
    getJourneyNodeIds: () => journey,
    getRenderedLeafwardCandidates: () =>
      candidatesEnabled ? measureRenderedLeafwardCandidates(surface) : [],
    onNavigateLeafward: navigateLeafward,
    onNavigateRootward: navigateRootward,
    onSnapshot: (snapshot) => snapshots.push(snapshot),
    requestFrame: scheduler.request,
    cancelFrame: scheduler.cancel,
  });
  controllers.push(controller);

  return {
    surface,
    emptySpace,
    navigationAction,
    inspectAction,
    nestedLink,
    scheduler,
    snapshots,
    navigateLeafward,
    navigateRootward,
    setPointerCapture,
    releasePointerCapture,
    controller,
    setJourney(nodeIds) {
      journey = nodeIds;
    },
    setCandidatesEnabled(enabled) {
      candidatesEnabled = enabled;
    },
  };
}

function latestSnapshot(harness: Harness): PointerGestureSnapshot {
  const snapshot = harness.snapshots[harness.snapshots.length - 1];
  if (!snapshot) throw new Error('Expected a gesture snapshot.');
  return snapshot;
}

afterEach(() => {
  while (controllers.length > 0) controllers.pop()?.destroy();
  document.body.replaceChildren();
});

describe('gesture origins and pointer start rules', () => {
  it('allows empty carousel space, non-control card surfaces, and navigation buttons', () => {
    const article = document.createElement('article');
    const body = document.createElement('span');
    article.append(body);
    const navigation = document.createElement('button');
    navigation.dataset.carouselNavigationAction = '';

    expect(isAllowedGestureOrigin(article)).toBe(true);
    expect(isAllowedGestureOrigin(body)).toBe(true);
    expect(isAllowedGestureOrigin(navigation)).toBe(true);
  });

  it('rejects Inspect, links, form controls, and editable content', () => {
    const inspect = document.createElement('button');
    inspect.dataset.carouselGestureIgnore = '';
    const input = document.createElement('input');
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');

    expect(isAllowedGestureOrigin(inspect)).toBe(false);
    expect(isAllowedGestureOrigin(document.createElement('a'))).toBe(false);
    expect(isAllowedGestureOrigin(input)).toBe(false);
    expect(isAllowedGestureOrigin(editable)).toBe(false);
  });

  it('starts primary mouse tracking from an allowed surface and captures it', () => {
    const harness = createHarness();
    pointer(harness.emptySpace, 'pointerdown', { pointerId: 7 });

    expect(harness.controller.state).toMatchObject({
      phase: 'tracking',
      pointerId: 7,
    });
    expect(harness.setPointerCapture).toHaveBeenCalledWith(7);
    expect(latestSnapshot(harness)).toMatchObject({
      active: true,
      offsetX: 0,
    });
  });

  it('keeps card-body pointer capture on the stable surface and preserves one short click', () => {
    const harness = createHarness();
    const click = vi.fn();
    harness.navigationAction.addEventListener('click', click);
    const captured = new Set<number>();
    const setPointerCapture = vi.fn((pointerId: number) => {
      captured.add(pointerId);
    });
    const releasePointerCapture = vi.fn((pointerId: number) => {
      captured.delete(pointerId);
    });
    Object.assign(harness.navigationAction, {
      setPointerCapture,
      releasePointerCapture,
      hasPointerCapture: (pointerId: number) => captured.has(pointerId),
    });

    pointer(harness.navigationAction, 'pointerdown', { pointerId: 8 });
    pointer(harness.navigationAction, 'pointerup', {
      pointerId: 8,
      clientX: 120,
    });
    pointer(harness.navigationAction, 'click', {
      pointerId: 8,
      detail: 1,
    });

    expect(harness.setPointerCapture).toHaveBeenCalledWith(8);
    expect(harness.releasePointerCapture).toHaveBeenCalledWith(8);
    expect(setPointerCapture).not.toHaveBeenCalled();
    expect(releasePointerCapture).not.toHaveBeenCalled();
    expect(click).toHaveBeenCalledOnce();
  });

  it('does not start from a non-primary pointer or secondary button', () => {
    const harness = createHarness();
    pointer(harness.emptySpace, 'pointerdown', {
      pointerId: 2,
      isPrimary: false,
    });
    pointer(harness.emptySpace, 'pointerdown', {
      pointerId: 3,
      button: 2,
    });

    expect(harness.controller.state).toEqual({ phase: 'idle' });
    expect(harness.setPointerCapture).not.toHaveBeenCalled();
  });

  it('does not start from Inspect or another nested action', () => {
    const harness = createHarness();
    pointer(harness.inspectAction, 'pointerdown');
    pointer(harness.nestedLink, 'pointerdown');

    expect(harness.controller.state).toEqual({ phase: 'idle' });
  });

  it('ignores a second pointer while one pointer is active', () => {
    const harness = createHarness();
    pointer(harness.emptySpace, 'pointerdown', { pointerId: 4 });
    pointer(harness.emptySpace, 'pointerdown', {
      pointerId: 5,
      clientX: 500,
    });
    pointer(harness.emptySpace, 'pointermove', {
      pointerId: 5,
      clientX: 20,
    });

    expect(harness.controller.state).toMatchObject({
      phase: 'tracking',
      pointerId: 4,
      currentX: 100,
    });
    expect(harness.scheduler.pendingCount()).toBe(0);
  });
});

describe('candidate geometry, RAF updates, and direction policy', () => {
  it('includes rendered off-canvas candidates but excludes zero-size hidden cards in stable DOM order', () => {
    const harness = createHarness();
    const candidates = harness.surface.querySelectorAll<HTMLElement>(
      '[data-carousel-leafward-candidate-id]',
    );
    setBounds(candidates[0], 80, 80, 180, 420);
    setBounds(candidates[1], 180, 0, 0, 420);
    setBounds(candidates[2], 280, 80, 180, 420);

    expect(measureRenderedLeafwardCandidates(harness.surface)).toEqual([
      { nodeId: 'upper', visibleOrder: 0, verticalCenter: 120 },
      { nodeId: 'lower', visibleOrder: 2, verticalCenter: 320 },
    ]);
  });

  it('coalesces rapid movement into one frame and applies the latest position', () => {
    const harness = createHarness();
    pointer(harness.emptySpace, 'pointerdown');
    pointer(harness.emptySpace, 'pointermove', { clientX: 90 });
    pointer(harness.emptySpace, 'pointermove', { clientX: 72 });

    expect(harness.scheduler.request).toHaveBeenCalledTimes(1);
    expect(harness.scheduler.pendingCount()).toBe(1);
    harness.scheduler.flush();
    expect(latestSnapshot(harness).offsetX).toBe(-28);
  });

  it('updates direct horizontal offset below threshold without navigation', () => {
    const harness = createHarness();
    pointer(harness.emptySpace, 'pointerdown');
    pointer(harness.emptySpace, 'pointermove', { clientX: 53 });
    harness.scheduler.flush();

    expect(latestSnapshot(harness)).toMatchObject({
      phase: 'tracking',
      active: true,
      offsetX: -47,
      thresholdCrossed: false,
    });
    expect(harness.navigateLeafward).not.toHaveBeenCalled();
  });

  it('activates leafward at exactly negative 48px and selects nearest Y', () => {
    const harness = createHarness();
    pointer(harness.emptySpace, 'pointerdown');
    pointer(harness.emptySpace, 'pointermove', {
      clientX: 52,
      clientY: 315,
    });
    harness.scheduler.flush();

    expect(latestSnapshot(harness)).toMatchObject({
      phase: 'preview',
      offsetX: -48,
      thresholdCrossed: true,
      semanticIntent: 'leafward',
      previewNodeId: 'lower',
    });
  });

  it('moves leafward preview between visible targets as pointer Y changes', () => {
    const harness = createHarness();
    pointer(harness.emptySpace, 'pointerdown');
    pointer(harness.emptySpace, 'pointermove', {
      clientX: 52,
      clientY: 120,
    });
    harness.scheduler.flush();
    expect(latestSnapshot(harness).previewNodeId).toBe('upper');

    pointer(harness.emptySpace, 'pointermove', {
      clientX: 40,
      clientY: 225,
    });
    harness.scheduler.flush();
    expect(latestSnapshot(harness).previewNodeId).toBe('middle');
  });

  it('does not activate from large vertical movement alone', () => {
    const harness = createHarness();
    pointer(harness.emptySpace, 'pointerdown');
    pointer(harness.emptySpace, 'pointermove', {
      clientX: 53,
      clientY: 900,
    });
    harness.scheduler.flush();

    expect(latestSnapshot(harness)).toMatchObject({
      phase: 'tracking',
      thresholdCrossed: false,
    });
  });

  it('centralizes negative-X leafward and positive-X rootward while preserving the opposite policy', () => {
    expect(TASK_2_2_PROTOTYPE_DIRECTION_POLICY).toBe(prototypeDirectionPolicyB);
    expect(TASK_2_2_PROTOTYPE_DIRECTION_POLICY.negativeX).toBe('leafward');
    expect(TASK_2_2_PROTOTYPE_DIRECTION_POLICY.positiveX).toBe('rootward');
    expect(prototypeDirectionPolicyA).toEqual({
      negativeX: 'rootward',
      positiveX: 'leafward',
    });
  });

  it('selects the previous journey position for positive-X rootward preview', () => {
    const harness = createHarness();
    harness.setJourney(['a', 'b', 'a']);
    pointer(harness.emptySpace, 'pointerdown');
    pointer(harness.emptySpace, 'pointermove', { clientX: 148 });
    harness.scheduler.flush();

    expect(harness.controller.state).toMatchObject({
      phase: 'preview',
      semanticIntent: 'rootward',
      proposedTargetNodeId: 'b',
    });
  });
});

describe('release, capture, and navigation outcomes', () => {
  it('returns to rest and releases capture below threshold without navigating', () => {
    const harness = createHarness();
    pointer(harness.emptySpace, 'pointerdown', { pointerId: 9 });
    pointer(harness.emptySpace, 'pointerup', {
      pointerId: 9,
      clientX: 130,
    });

    expect(latestSnapshot(harness)).toEqual({
      phase: 'idle',
      active: false,
      offsetX: 0,
      thresholdCrossed: false,
    });
    expect(harness.releasePointerCapture).toHaveBeenCalledWith(9);
    expect(harness.navigateLeafward).not.toHaveBeenCalled();
    expect(harness.navigateRootward).not.toHaveBeenCalled();
  });

  it('commits the selected leafward target exactly once on release', () => {
    const harness = createHarness();
    harness.navigateLeafward.mockImplementation(() => {
      expect(latestSnapshot(harness)).toMatchObject({
        phase: 'preview',
        active: true,
        offsetX: -48,
        semanticIntent: 'leafward',
        previewNodeId: 'middle',
      });
    });
    pointer(harness.emptySpace, 'pointerdown', { pointerType: 'touch' });
    pointer(harness.emptySpace, 'pointerup', {
      clientX: 52,
      clientY: 220,
      pointerType: 'touch',
    });

    expect(harness.navigateLeafward).toHaveBeenCalledOnce();
    expect(harness.navigateLeafward).toHaveBeenCalledWith('middle');
    expect(harness.navigateRootward).not.toHaveBeenCalled();
    expect(latestSnapshot(harness).phase).toBe('idle');
  });

  it('commits one positional rootward operation on release', () => {
    const harness = createHarness();
    harness.navigateRootward.mockImplementation(() => {
      expect(latestSnapshot(harness)).toMatchObject({
        phase: 'preview',
        active: true,
        offsetX: 48,
        semanticIntent: 'rootward',
        previewNodeId: 'root',
      });
    });
    pointer(harness.emptySpace, 'pointerdown');
    pointer(harness.emptySpace, 'pointerup', { clientX: 148 });

    expect(harness.navigateRootward).toHaveBeenCalledOnce();
    expect(harness.navigateLeafward).not.toHaveBeenCalled();
    expect(latestSnapshot(harness).phase).toBe('idle');
  });

  it('does not commit a leafward release when no visible target exists', () => {
    const harness = createHarness();
    harness.setCandidatesEnabled(false);
    pointer(harness.emptySpace, 'pointerdown');
    pointer(harness.emptySpace, 'pointerup', { clientX: 52 });

    expect(harness.navigateLeafward).not.toHaveBeenCalled();
    expect(latestSnapshot(harness).phase).toBe('idle');
  });

  it('does not invent a rootward target for a one-node journey', () => {
    const harness = createHarness();
    harness.setJourney(['root']);
    pointer(harness.emptySpace, 'pointerdown');
    pointer(harness.emptySpace, 'pointerup', { clientX: 148 });

    expect(harness.navigateRootward).not.toHaveBeenCalled();
  });

  it('ignores release from a different pointer and keeps tracking', () => {
    const harness = createHarness();
    pointer(harness.emptySpace, 'pointerdown', { pointerId: 4 });
    pointer(harness.emptySpace, 'pointerup', {
      pointerId: 8,
      clientX: 20,
    });

    expect(harness.controller.state).toMatchObject({
      phase: 'tracking',
      pointerId: 4,
    });
    expect(harness.releasePointerCapture).not.toHaveBeenCalled();
  });
});

describe('click suppression', () => {
  it('suppresses the pointer click associated with an activated drag', () => {
    const harness = createHarness();
    const click = vi.fn();
    harness.navigationAction.addEventListener('click', click);
    pointer(harness.navigationAction, 'pointerdown', { pointerId: 6 });
    pointer(harness.navigationAction, 'pointerup', {
      pointerId: 6,
      clientX: 52,
      clientY: 220,
    });
    const clickEvent = pointer(harness.navigationAction, 'click', {
      pointerId: 6,
      detail: 1,
    });

    expect(click).not.toHaveBeenCalled();
    expect(clickEvent.defaultPrevented).toBe(true);
  });

  it('suppresses an activated no-target drag click', () => {
    const harness = createHarness();
    harness.setCandidatesEnabled(false);
    const click = vi.fn();
    harness.navigationAction.addEventListener('click', click);
    pointer(harness.navigationAction, 'pointerdown', { pointerId: 3 });
    pointer(harness.navigationAction, 'pointerup', {
      pointerId: 3,
      clientX: 52,
    });
    pointer(harness.navigationAction, 'click', {
      pointerId: 3,
      detail: 1,
    });

    expect(click).not.toHaveBeenCalled();
    expect(harness.navigateLeafward).not.toHaveBeenCalled();
  });

  it('preserves the ordinary click below threshold', () => {
    const harness = createHarness();
    const click = vi.fn();
    harness.navigationAction.addEventListener('click', click);
    pointer(harness.navigationAction, 'pointerdown');
    pointer(harness.navigationAction, 'pointerup', { clientX: 120 });
    pointer(harness.navigationAction, 'click', { detail: 1 });

    expect(click).toHaveBeenCalledOnce();
  });

  it('suppresses only one activated click and permits a later click', () => {
    const harness = createHarness();
    const click = vi.fn();
    harness.navigationAction.addEventListener('click', click);
    pointer(harness.navigationAction, 'pointerdown');
    pointer(harness.navigationAction, 'pointerup', { clientX: 52 });
    pointer(harness.navigationAction, 'click', { detail: 1 });
    pointer(harness.navigationAction, 'click', { detail: 1 });

    expect(click).toHaveBeenCalledOnce();
  });

  it('never suppresses keyboard click activation or Inspect activation', () => {
    const harness = createHarness();
    const navigationClick = vi.fn();
    const inspectClick = vi.fn();
    harness.navigationAction.addEventListener('click', navigationClick);
    harness.inspectAction.addEventListener('click', inspectClick);
    pointer(harness.navigationAction, 'pointerdown');
    pointer(harness.navigationAction, 'pointerup', { clientX: 52 });
    harness.navigationAction.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, detail: 0 }),
    );
    harness.inspectAction.click();

    expect(navigationClick).toHaveBeenCalledOnce();
    expect(inspectClick).toHaveBeenCalledOnce();
  });
});

describe('cancellation and teardown', () => {
  it.each(['tracking', 'preview'] as const)(
    'Escape cancels %s, releases capture, and never navigates',
    (phase) => {
      const harness = createHarness();
      pointer(harness.navigationAction, 'pointerdown', { pointerId: 2 });
      if (phase === 'preview') {
        pointer(harness.navigationAction, 'pointermove', {
          pointerId: 2,
          clientX: 52,
        });
        harness.scheduler.flush();
      }
      const event = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      });
      window.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
      expect(latestSnapshot(harness).phase).toBe('idle');
      expect(harness.releasePointerCapture).toHaveBeenCalledWith(2);
      expect(harness.navigateLeafward).not.toHaveBeenCalled();
      expect(harness.navigateRootward).not.toHaveBeenCalled();
    },
  );

  it('does not intercept Escape while idle', () => {
    createHarness();
    const event = new KeyboardEvent('keydown', {
      key: 'Escape',
      cancelable: true,
    });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });

  it('right click cancels and suppresses only its active context menu', () => {
    const harness = createHarness();
    pointer(harness.emptySpace, 'pointerdown');
    pointer(harness.emptySpace, 'pointerdown', { button: 2 });
    const contextMenu = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
    });
    harness.emptySpace.dispatchEvent(contextMenu);

    expect(contextMenu.defaultPrevented).toBe(true);
    expect(latestSnapshot(harness)).toEqual({
      phase: 'idle',
      active: false,
      offsetX: 0,
      thresholdCrossed: false,
    });
  });

  it('does not disable context menus while idle', () => {
    const harness = createHarness();
    const contextMenu = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
    });
    harness.emptySpace.dispatchEvent(contextMenu);

    expect(contextMenu.defaultPrevented).toBe(false);
  });

  it.each(['pointercancel', 'lostpointercapture'])(
    '%s cancels the active pointer without navigation',
    (eventType) => {
      const harness = createHarness();
      pointer(harness.emptySpace, 'pointerdown', { pointerId: 12 });
      pointer(harness.emptySpace, 'pointermove', {
        pointerId: 12,
        clientX: 52,
      });
      harness.scheduler.flush();
      pointer(harness.surface, eventType, { pointerId: 12 });

      expect(latestSnapshot(harness).phase).toBe('idle');
      expect(harness.navigateLeafward).not.toHaveBeenCalled();
      expect(harness.navigateRootward).not.toHaveBeenCalled();
    },
  );

  it.each(['resize', 'orientationchange'])(
    '%s cancels active translation for responsive relayout',
    (eventType) => {
      const harness = createHarness();
      pointer(harness.emptySpace, 'pointerdown', { pointerId: 14 });
      pointer(harness.emptySpace, 'pointermove', {
        pointerId: 14,
        clientX: 52,
      });
      harness.scheduler.flush();
      window.dispatchEvent(new Event(eventType));

      expect(latestSnapshot(harness)).toEqual({
        phase: 'idle',
        active: false,
        offsetX: 0,
        thresholdCrossed: false,
      });
      expect(harness.releasePointerCapture).toHaveBeenCalledWith(14);
      expect(harness.navigateLeafward).not.toHaveBeenCalled();
      expect(harness.navigateRootward).not.toHaveBeenCalled();
    },
  );

  it('ignores cancellation from another pointer', () => {
    const harness = createHarness();
    pointer(harness.emptySpace, 'pointerdown', { pointerId: 2 });
    pointer(harness.surface, 'pointercancel', { pointerId: 9 });

    expect(harness.controller.state).toMatchObject({
      phase: 'tracking',
      pointerId: 2,
    });
  });

  it('exposes a bounded cancellation hook for project-session replacement', () => {
    const harness = createHarness();
    pointer(harness.emptySpace, 'pointerdown', { pointerId: 16 });
    pointer(harness.emptySpace, 'pointermove', {
      pointerId: 16,
      clientX: 52,
    });

    harness.controller.cancel();

    expect(harness.scheduler.pendingCount()).toBe(0);
    expect(harness.releasePointerCapture).toHaveBeenCalledWith(16);
    expect(harness.controller.state).toEqual({ phase: 'idle' });
    expect(latestSnapshot(harness)).toEqual({
      phase: 'idle',
      active: false,
      offsetX: 0,
      thresholdCrossed: false,
    });
    expect(harness.navigateLeafward).not.toHaveBeenCalled();
    expect(harness.navigateRootward).not.toHaveBeenCalled();
  });

  it('cancels pending frames and safely releases capture when destroyed', () => {
    const harness = createHarness();
    pointer(harness.emptySpace, 'pointerdown', { pointerId: 5 });
    pointer(harness.emptySpace, 'pointermove', { pointerId: 5, clientX: 52 });
    harness.controller.destroy();

    expect(harness.scheduler.pendingCount()).toBe(0);
    expect(harness.scheduler.cancel).toHaveBeenCalled();
    expect(harness.releasePointerCapture).toHaveBeenCalledWith(5);
    expect(harness.controller.state).toEqual({ phase: 'idle' });
  });
});
