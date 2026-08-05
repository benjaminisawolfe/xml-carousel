import type { ImplementedSemanticZoomPresentation } from './semanticZoomPresentation';

export const SEMANTIC_ZOOM_TRANSITION_DURATION_MS = 180;
export const SEMANTIC_ZOOM_TRANSITION_FALLBACK_BUFFER_MS = 48;
export const SEMANTIC_ZOOM_MAXIMUM_TRANSLATION_PX = 160;
export const SEMANTIC_ZOOM_MINIMUM_SCALE = 0.82;
export const SEMANTIC_ZOOM_MAXIMUM_SCALE = 1.18;

const MOTION_SELECTOR = '[data-carousel-motion-key]';
const APPEARING_OPACITY = '0.72';

export type SemanticZoomTransitionPhase = 'idle' | 'measuring' | 'animating';

export interface SemanticZoomMotionGeometry {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface SemanticZoomInverseTransform {
  readonly deltaX: number;
  readonly deltaY: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly usesScale: boolean;
}

export interface SemanticZoomTransitionRequest {
  readonly root: HTMLElement;
  readonly from: ImplementedSemanticZoomPresentation;
  readonly to: ImplementedSemanticZoomPresentation;
  readonly reducedMotion: boolean;
  readonly commit: () => void;
  readonly waitForLayout: () => Promise<void>;
}

export interface SemanticZoomTransitionController {
  readonly phase: SemanticZoomTransitionPhase;
  readonly hasPendingWork: boolean;
  transition(request: SemanticZoomTransitionRequest): Promise<void>;
  cancel(): void;
  destroy(): void;
}

export interface SemanticZoomTransitionControllerOptions {
  readonly onPhaseChange?: (
    phase: SemanticZoomTransitionPhase,
    from?: ImplementedSemanticZoomPresentation,
    to?: ImplementedSemanticZoomPresentation,
  ) => void;
  readonly onSettled?: () => void;
  readonly requestFrame?: (callback: FrameRequestCallback) => number;
  readonly cancelFrame?: (handle: number) => void;
  readonly setTimer?: (callback: () => void, delay: number) => number;
  readonly clearTimer?: (handle: number) => void;
}

function finiteGeometry(geometry: SemanticZoomMotionGeometry): boolean {
  return (
    Number.isFinite(geometry.left) &&
    Number.isFinite(geometry.top) &&
    Number.isFinite(geometry.width) &&
    Number.isFinite(geometry.height) &&
    geometry.width > 0 &&
    geometry.height > 0
  );
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function geometryFromElement(
  element: HTMLElement,
): SemanticZoomMotionGeometry | undefined {
  const bounds = element.getBoundingClientRect();
  const geometry = {
    left: bounds.left,
    top: bounds.top,
    width: bounds.width,
    height: bounds.height,
  };
  return finiteGeometry(geometry) ? geometry : undefined;
}

export function captureSemanticZoomMotionGeometry(
  root: ParentNode,
): Readonly<Record<string, SemanticZoomMotionGeometry>> {
  const geometry: Record<string, SemanticZoomMotionGeometry> = {};
  for (const element of root.querySelectorAll<HTMLElement>(MOTION_SELECTOR)) {
    const key = element.dataset.carouselMotionKey;
    const bounds = geometryFromElement(element);
    if (!key || !bounds || geometry[key]) continue;
    geometry[key] = bounds;
  }
  return geometry;
}

export function calculateSemanticZoomInverseTransform(
  source: SemanticZoomMotionGeometry,
  destination: SemanticZoomMotionGeometry,
): SemanticZoomInverseTransform | undefined {
  if (!finiteGeometry(source) || !finiteGeometry(destination)) return undefined;

  const rawScaleX = source.width / destination.width;
  const rawScaleY = source.height / destination.height;
  const extremeScale =
    rawScaleX < 0.6 || rawScaleX > 1.65 || rawScaleY < 0.6 || rawScaleY > 1.65;

  return {
    deltaX: clamp(
      source.left +
        source.width / 2 -
        (destination.left + destination.width / 2),
      -SEMANTIC_ZOOM_MAXIMUM_TRANSLATION_PX,
      SEMANTIC_ZOOM_MAXIMUM_TRANSLATION_PX,
    ),
    deltaY: clamp(
      source.top +
        source.height / 2 -
        (destination.top + destination.height / 2),
      -SEMANTIC_ZOOM_MAXIMUM_TRANSLATION_PX,
      SEMANTIC_ZOOM_MAXIMUM_TRANSLATION_PX,
    ),
    scaleX: extremeScale
      ? 1
      : clamp(
          rawScaleX,
          SEMANTIC_ZOOM_MINIMUM_SCALE,
          SEMANTIC_ZOOM_MAXIMUM_SCALE,
        ),
    scaleY: extremeScale
      ? 1
      : clamp(
          rawScaleY,
          SEMANTIC_ZOOM_MINIMUM_SCALE,
          SEMANTIC_ZOOM_MAXIMUM_SCALE,
        ),
    usesScale: !extremeScale,
  };
}

function clearElementStyles(element: HTMLElement): void {
  element.style.removeProperty('opacity');
  element.style.removeProperty('transform');
  element.style.removeProperty('transform-origin');
  element.style.removeProperty('transition');
  element.style.removeProperty('will-change');
  delete element.dataset.semanticZoomMotion;
}

export function createSemanticZoomTransitionController(
  options: SemanticZoomTransitionControllerOptions = {},
): SemanticZoomTransitionController {
  const requestFrame =
    options.requestFrame ??
    ((callback) => window.requestAnimationFrame(callback));
  const cancelFrame =
    options.cancelFrame ?? ((handle) => window.cancelAnimationFrame(handle));
  const setTimer =
    options.setTimer ??
    ((callback, delay) => window.setTimeout(callback, delay));
  const clearTimer =
    options.clearTimer ?? ((handle) => window.clearTimeout(handle));

  let phase: SemanticZoomTransitionPhase = 'idle';
  let generation = 0;
  let firstFrame: number | undefined;
  let playFrame: number | undefined;
  let fallbackTimer: number | undefined;
  let styledElements: HTMLElement[] = [];
  let destroyed = false;

  function publish(
    nextPhase: SemanticZoomTransitionPhase,
    from?: ImplementedSemanticZoomPresentation,
    to?: ImplementedSemanticZoomPresentation,
  ): void {
    phase = nextPhase;
    options.onPhaseChange?.(nextPhase, from, to);
  }

  function clearScheduledWork(): void {
    if (firstFrame !== undefined) {
      cancelFrame(firstFrame);
      firstFrame = undefined;
    }
    if (playFrame !== undefined) {
      cancelFrame(playFrame);
      playFrame = undefined;
    }
    if (fallbackTimer !== undefined) {
      clearTimer(fallbackTimer);
      fallbackTimer = undefined;
    }
  }

  function clearStyles(): void {
    for (const element of styledElements) clearElementStyles(element);
    styledElements = [];
  }

  function settle(activeGeneration: number, notify = true): void {
    if (activeGeneration !== generation) return;
    clearScheduledWork();
    clearStyles();
    publish('idle');
    if (notify) options.onSettled?.();
  }

  function cancelCurrent(notify: boolean, publishIdle: boolean): void {
    generation += 1;
    clearScheduledWork();
    clearStyles();
    if (publishIdle && phase !== 'idle') publish('idle');
    if (notify) options.onSettled?.();
  }

  async function transition(
    request: SemanticZoomTransitionRequest,
  ): Promise<void> {
    if (destroyed) return;
    cancelCurrent(false, false);
    const activeGeneration = generation;

    if (request.from === request.to) {
      request.commit();
      publish('idle');
      return;
    }

    const before = captureSemanticZoomMotionGeometry(request.root);
    publish('measuring', request.from, request.to);
    request.commit();
    await request.waitForLayout();

    if (
      destroyed ||
      activeGeneration !== generation ||
      !request.root.isConnected
    ) {
      return;
    }

    if (request.reducedMotion) {
      settle(activeGeneration);
      return;
    }

    const elements = [
      ...request.root.querySelectorAll<HTMLElement>(MOTION_SELECTOR),
    ];
    const movingElements: HTMLElement[] = [];

    for (const element of elements) {
      const key = element.dataset.carouselMotionKey;
      const previous = key ? before[key] : undefined;
      const current = geometryFromElement(element);
      if (!current) continue;

      element.style.transition = 'none';
      element.style.willChange = previous ? 'transform' : 'opacity';
      element.dataset.semanticZoomMotion = previous ? 'matched' : 'appearing';

      if (!previous) {
        element.style.opacity = APPEARING_OPACITY;
        movingElements.push(element);
        continue;
      }

      const inverse = calculateSemanticZoomInverseTransform(previous, current);
      if (!inverse) continue;
      const moved =
        Math.abs(inverse.deltaX) > 0.5 ||
        Math.abs(inverse.deltaY) > 0.5 ||
        Math.abs(inverse.scaleX - 1) > 0.005 ||
        Math.abs(inverse.scaleY - 1) > 0.005;
      if (!moved) {
        clearElementStyles(element);
        continue;
      }

      element.style.transformOrigin = 'center center';
      element.style.transform = `translate3d(${inverse.deltaX}px, ${inverse.deltaY}px, 0) scale(${inverse.scaleX}, ${inverse.scaleY})`;
      movingElements.push(element);
    }

    styledElements = movingElements;
    if (movingElements.length === 0) {
      settle(activeGeneration);
      return;
    }

    publish('animating', request.from, request.to);
    firstFrame = requestFrame(() => {
      firstFrame = undefined;
      if (activeGeneration !== generation || destroyed) return;
      playFrame = requestFrame(() => {
        playFrame = undefined;
        if (activeGeneration !== generation || destroyed) return;

        for (const element of movingElements) {
          if (element.dataset.semanticZoomMotion === 'appearing') {
            element.style.transition =
              'opacity var(--duration-fast) var(--ease-standard)';
            element.style.opacity = '1';
          } else {
            element.style.transition =
              'transform var(--duration-panel) var(--ease-standard)';
            element.style.transform = 'translate3d(0, 0, 0) scale(1, 1)';
          }
        }

        fallbackTimer = setTimer(
          () => settle(activeGeneration),
          SEMANTIC_ZOOM_TRANSITION_DURATION_MS +
            SEMANTIC_ZOOM_TRANSITION_FALLBACK_BUFFER_MS,
        );
      });
    });
  }

  return {
    get phase() {
      return phase;
    },
    get hasPendingWork() {
      return (
        phase !== 'idle' ||
        firstFrame !== undefined ||
        playFrame !== undefined ||
        fallbackTimer !== undefined ||
        styledElements.length > 0
      );
    },
    transition,
    cancel() {
      if (destroyed) return;
      cancelCurrent(phase !== 'idle', true);
    },
    destroy() {
      if (destroyed) return;
      cancelCurrent(false, true);
      destroyed = true;
    },
  };
}
