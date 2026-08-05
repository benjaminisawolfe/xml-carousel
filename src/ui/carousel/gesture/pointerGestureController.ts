import {
  cancelGesture,
  createIdleGestureState,
  releaseGesture,
  startGesture,
  updateGesture,
} from './gestureState';
import {
  prototypeDirectionPolicyB,
  type GestureNavigationOutcome,
  type GesturePointerInput,
  type GestureState,
  type GestureUpdateContext,
  type LeafwardTargetCandidate,
  type SemanticNavigationDirection,
} from './gestureTypes';

export const TASK_2_2_PROTOTYPE_DIRECTION_POLICY = prototypeDirectionPolicyB;

const LEAFWARD_CANDIDATE_SELECTOR = '[data-carousel-leafward-candidate-id]';
const NAVIGATION_ACTION_SELECTOR = '[data-carousel-navigation-action]';
const IGNORED_ORIGIN_SELECTOR = [
  '[data-carousel-gesture-ignore]',
  'a',
  'input',
  'select',
  'textarea',
  '[contenteditable]',
].join(',');

export interface PointerGestureSnapshot {
  readonly phase: GestureState['phase'];
  readonly active: boolean;
  readonly offsetX: number;
  readonly thresholdCrossed: boolean;
  readonly semanticIntent?: SemanticNavigationDirection;
  readonly previewNodeId?: string;
  readonly previewRelationshipId?: string;
}

export interface PointerGestureControllerOptions {
  readonly surface: HTMLElement;
  readonly getJourneyNodeIds: () => readonly string[];
  readonly getRenderedLeafwardCandidates: () => readonly LeafwardTargetCandidate[];
  readonly onNavigateLeafward: (
    nodeId: string,
    relationshipId?: string,
  ) => void;
  readonly onNavigateRootward: () => void;
  readonly onSnapshot: (snapshot: PointerGestureSnapshot) => void;
  readonly requestFrame?: (callback: FrameRequestCallback) => number;
  readonly cancelFrame?: (handle: number) => void;
}

interface PendingClickSuppression {
  readonly pointerId: number;
  readonly origin: HTMLElement;
}

function toPointerInput(event: PointerEvent): GesturePointerInput {
  return {
    pointerId: event.pointerId,
    x: event.clientX,
    y: event.clientY,
  };
}

function navigationActionFromTarget(
  target: EventTarget | null,
): HTMLElement | undefined {
  if (!(target instanceof Element)) return undefined;
  return target.closest<HTMLElement>(NAVIGATION_ACTION_SELECTOR) ?? undefined;
}

export function isAllowedGestureOrigin(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest(IGNORED_ORIGIN_SELECTOR)) return false;

  const button = target.closest('button');
  return !button || button.matches(NAVIGATION_ACTION_SELECTOR);
}

export function measureRenderedLeafwardCandidates(
  surface: HTMLElement,
): readonly LeafwardTargetCandidate[] {
  const candidates: LeafwardTargetCandidate[] = [];

  for (const element of surface.querySelectorAll<HTMLElement>(
    LEAFWARD_CANDIDATE_SELECTOR,
  )) {
    const nodeId = element.dataset.carouselLeafwardCandidateId;
    const relationshipId = element.dataset.carouselLeafwardCandidateEdgeId;
    const visibleOrder = Number(element.dataset.carouselVisibleOrder);
    const bounds = element.getBoundingClientRect();

    if (
      !nodeId ||
      !Number.isInteger(visibleOrder) ||
      bounds.width <= 0 ||
      bounds.height <= 0
    ) {
      continue;
    }

    candidates.push({
      nodeId,
      ...(relationshipId ? { relationshipId } : {}),
      visibleOrder,
      verticalCenter: bounds.top + bounds.height / 2,
    });
  }

  return candidates;
}

function snapshotFromState(state: GestureState): PointerGestureSnapshot {
  if (state.phase === 'idle') {
    return {
      phase: 'idle',
      active: false,
      offsetX: 0,
      thresholdCrossed: false,
    };
  }

  return {
    phase: state.phase,
    active: true,
    offsetX: state.deltaX,
    thresholdCrossed: state.thresholdCrossed,
    ...(state.semanticIntent ? { semanticIntent: state.semanticIntent } : {}),
    ...(state.phase === 'preview' && state.proposedTargetNodeId
      ? { previewNodeId: state.proposedTargetNodeId }
      : {}),
    ...(state.phase === 'preview' && state.proposedTargetRelationshipId
      ? { previewRelationshipId: state.proposedTargetRelationshipId }
      : {}),
  };
}

export class PointerGestureController {
  readonly #surface: HTMLElement;
  readonly #getJourneyNodeIds: () => readonly string[];
  readonly #getRenderedLeafwardCandidates: () => readonly LeafwardTargetCandidate[];
  readonly #onNavigateLeafward: (
    nodeId: string,
    relationshipId?: string,
  ) => void;
  readonly #onNavigateRootward: () => void;
  readonly #onSnapshot: (snapshot: PointerGestureSnapshot) => void;
  readonly #requestFrame: (callback: FrameRequestCallback) => number;
  readonly #cancelFrame: (handle: number) => void;

  #state: GestureState = createIdleGestureState();
  #visibleLeafwardCandidates: readonly LeafwardTargetCandidate[] = [];
  #pendingPointerInput: GesturePointerInput | undefined;
  #pendingFrame: number | undefined;
  #gestureOriginAction: HTMLElement | undefined;
  #pendingClickSuppression: PendingClickSuppression | undefined;
  #suppressNextContextMenu = false;
  #destroyed = false;

  constructor(options: PointerGestureControllerOptions) {
    this.#surface = options.surface;
    this.#getJourneyNodeIds = options.getJourneyNodeIds;
    this.#getRenderedLeafwardCandidates = options.getRenderedLeafwardCandidates;
    this.#onNavigateLeafward = options.onNavigateLeafward;
    this.#onNavigateRootward = options.onNavigateRootward;
    this.#onSnapshot = options.onSnapshot;
    this.#requestFrame =
      options.requestFrame ?? ((callback) => requestAnimationFrame(callback));
    this.#cancelFrame =
      options.cancelFrame ?? ((handle) => cancelAnimationFrame(handle));

    this.#surface.addEventListener('pointerdown', this.#handlePointerDown);
    this.#surface.addEventListener('pointermove', this.#handlePointerMove);
    this.#surface.addEventListener('pointerup', this.#handlePointerUp);
    this.#surface.addEventListener('pointercancel', this.#handlePointerCancel);
    this.#surface.addEventListener(
      'lostpointercapture',
      this.#handleLostPointerCapture,
    );
    this.#surface.addEventListener('contextmenu', this.#handleContextMenu);
    this.#surface.addEventListener('click', this.#handleClick, true);
    window.addEventListener('keydown', this.#handleKeyDown);
    window.addEventListener('resize', this.#handleResponsiveRelayout);
    window.addEventListener(
      'orientationchange',
      this.#handleResponsiveRelayout,
    );
    this.#publish();
  }

  get state(): GestureState {
    return this.#state;
  }

  cancel(): void {
    if (this.#destroyed) return;
    this.#cancelPendingFrame();
    this.#safeReleasePointerCapture();
    this.#state = cancelGesture(this.#state).state;
    this.#pendingClickSuppression = undefined;
    this.#suppressNextContextMenu = false;
    this.#resetInteraction();
    this.#publish();
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#cancelPendingFrame();
    this.#safeReleasePointerCapture();
    this.#state = cancelGesture(this.#state).state;
    this.#surface.removeEventListener('pointerdown', this.#handlePointerDown);
    this.#surface.removeEventListener('pointermove', this.#handlePointerMove);
    this.#surface.removeEventListener('pointerup', this.#handlePointerUp);
    this.#surface.removeEventListener(
      'pointercancel',
      this.#handlePointerCancel,
    );
    this.#surface.removeEventListener(
      'lostpointercapture',
      this.#handleLostPointerCapture,
    );
    this.#surface.removeEventListener('contextmenu', this.#handleContextMenu);
    this.#surface.removeEventListener('click', this.#handleClick, true);
    window.removeEventListener('keydown', this.#handleKeyDown);
    window.removeEventListener('resize', this.#handleResponsiveRelayout);
    window.removeEventListener(
      'orientationchange',
      this.#handleResponsiveRelayout,
    );
  }

  #buildUpdateContext(): GestureUpdateContext {
    return {
      directionPolicy: TASK_2_2_PROTOTYPE_DIRECTION_POLICY,
      journeyNodeIds: this.#getJourneyNodeIds(),
      visibleLeafwardCandidates: this.#visibleLeafwardCandidates,
    };
  }

  #publish(): void {
    this.#onSnapshot(snapshotFromState(this.#state));
  }

  #processPointerInput(input: GesturePointerInput): void {
    this.#state = updateGesture(this.#state, input, this.#buildUpdateContext());
    this.#publish();
  }

  #cancelPendingFrame(): void {
    if (this.#pendingFrame !== undefined) {
      this.#cancelFrame(this.#pendingFrame);
      this.#pendingFrame = undefined;
    }
    this.#pendingPointerInput = undefined;
  }

  #flushPendingMove(finalInput?: GesturePointerInput): void {
    if (this.#pendingFrame !== undefined) {
      this.#cancelFrame(this.#pendingFrame);
      this.#pendingFrame = undefined;
    }

    const input = finalInput ?? this.#pendingPointerInput;
    this.#pendingPointerInput = undefined;
    if (input) this.#processPointerInput(input);
  }

  #safeSetPointerCapture(pointerId: number): void {
    try {
      this.#surface.setPointerCapture?.(pointerId);
    } catch {
      // Capture can be unavailable or already lost without invalidating state.
    }
  }

  #safeReleasePointerCapture(pointerId?: number): void {
    const resolvedPointerId =
      pointerId ??
      (this.#state.phase === 'idle' ? undefined : this.#state.pointerId);
    if (resolvedPointerId === undefined) return;
    try {
      if (
        typeof this.#surface.hasPointerCapture === 'function' &&
        !this.#surface.hasPointerCapture(resolvedPointerId)
      ) {
        return;
      }
      this.#surface.releasePointerCapture?.(resolvedPointerId);
    } catch {
      // Lost capture and unsupported capture APIs are safe cancellation paths.
    }
  }

  #rememberClickSuppression(): void {
    if (this.#state.phase === 'idle' || !this.#gestureOriginAction) return;
    this.#pendingClickSuppression = {
      pointerId: this.#state.pointerId,
      origin: this.#gestureOriginAction,
    };
  }

  #resetInteraction(): void {
    this.#visibleLeafwardCandidates = [];
    this.#gestureOriginAction = undefined;
    this.#pendingPointerInput = undefined;
  }

  #cancelActiveGesture(suppressOriginClick: boolean): void {
    if (this.#state.phase === 'idle') return;
    const pointerId = this.#state.pointerId;
    this.#cancelPendingFrame();
    if (suppressOriginClick) this.#rememberClickSuppression();
    this.#state = cancelGesture(this.#state).state;
    this.#safeReleasePointerCapture(pointerId);
    this.#resetInteraction();
    this.#publish();
  }

  #applyOutcome(outcome: GestureNavigationOutcome): void {
    if (outcome.type === 'navigate-leafward') {
      if (outcome.relationshipId) {
        this.#onNavigateLeafward(outcome.targetNodeId, outcome.relationshipId);
      } else {
        this.#onNavigateLeafward(outcome.targetNodeId);
      }
    } else if (outcome.type === 'navigate-rootward') {
      this.#onNavigateRootward();
    }
  }

  readonly #handlePointerDown = (event: PointerEvent): void => {
    if (this.#state.phase !== 'idle') {
      if (event.button !== 0) {
        this.#suppressNextContextMenu = true;
        this.#cancelActiveGesture(true);
      }
      return;
    }

    this.#pendingClickSuppression = undefined;
    this.#suppressNextContextMenu = false;
    if (!event.isPrimary || event.button !== 0) return;
    if (!isAllowedGestureOrigin(event.target)) return;

    this.#visibleLeafwardCandidates = this.#getRenderedLeafwardCandidates();
    this.#gestureOriginAction = navigationActionFromTarget(event.target);
    this.#state = startGesture(this.#state, toPointerInput(event));
    this.#safeSetPointerCapture(event.pointerId);
    this.#publish();
  };

  readonly #handlePointerMove = (event: PointerEvent): void => {
    if (
      this.#state.phase === 'idle' ||
      event.pointerId !== this.#state.pointerId
    ) {
      return;
    }

    this.#pendingPointerInput = toPointerInput(event);
    if (this.#pendingFrame !== undefined) return;

    this.#pendingFrame = this.#requestFrame(() => {
      this.#pendingFrame = undefined;
      const input = this.#pendingPointerInput;
      this.#pendingPointerInput = undefined;
      if (input) this.#processPointerInput(input);
    });
  };

  readonly #handlePointerUp = (event: PointerEvent): void => {
    if (
      this.#state.phase === 'idle' ||
      event.pointerId !== this.#state.pointerId
    ) {
      return;
    }

    this.#flushPendingMove(toPointerInput(event));
    const activated = this.#state.phase === 'preview';
    if (activated) this.#rememberClickSuppression();
    const clickOrigin = activated ? undefined : this.#gestureOriginAction;
    const pointerId = this.#state.pointerId;
    const completion = releaseGesture(this.#state);
    this.#state = completion.state;
    this.#safeReleasePointerCapture(pointerId);
    this.#resetInteraction();
    this.#applyOutcome(completion.outcome);
    this.#publish();

    if (clickOrigin) {
      // Pointer capture stays on the stable surface. Replaying the allowed
      // navigation action preserves a short tap, while the associated native
      // click is suppressed below so it cannot navigate twice.
      this.#pendingClickSuppression = {
        pointerId,
        origin: clickOrigin,
      };
      clickOrigin.click();
    }
  };

  readonly #handlePointerCancel = (event: PointerEvent): void => {
    if (
      this.#state.phase !== 'idle' &&
      event.pointerId === this.#state.pointerId
    ) {
      this.#cancelActiveGesture(true);
    }
  };

  readonly #handleLostPointerCapture = (event: PointerEvent): void => {
    if (
      this.#state.phase !== 'idle' &&
      event.pointerId === this.#state.pointerId
    ) {
      this.#cancelActiveGesture(true);
    }
  };

  readonly #handleContextMenu = (event: MouseEvent): void => {
    if (this.#state.phase !== 'idle') {
      event.preventDefault();
      this.#cancelActiveGesture(true);
      return;
    }

    if (this.#suppressNextContextMenu) {
      event.preventDefault();
      this.#suppressNextContextMenu = false;
    }
  };

  readonly #handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || this.#state.phase === 'idle') return;
    event.preventDefault();
    this.#cancelActiveGesture(true);
  };

  readonly #handleResponsiveRelayout = (): void => {
    this.#cancelActiveGesture(true);
  };

  readonly #handleClick = (event: MouseEvent): void => {
    const suppression = this.#pendingClickSuppression;
    if (!suppression || event.detail === 0) return;

    const pointerId =
      'pointerId' in event && typeof event.pointerId === 'number'
        ? event.pointerId
        : undefined;
    const targetMatches =
      event.target instanceof Node && suppression.origin.contains(event.target);
    const pointerMatches =
      pointerId === undefined || pointerId === suppression.pointerId;

    this.#pendingClickSuppression = undefined;
    if (!pointerMatches || !targetMatches) return;

    event.preventDefault();
    event.stopImmediatePropagation();
  };
}
