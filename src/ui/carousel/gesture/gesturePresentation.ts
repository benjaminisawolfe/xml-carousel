export const GESTURE_PRESENTATION_DURATIONS_MS = {
  preview: 130,
  snapBack: 160,
  commit: 260,
  reducedMotion: 60,
  fallbackBuffer: 40,
} as const;

export type GesturePresentationPhase =
  | 'resting'
  | 'direct-manipulation'
  | 'settling'
  | 'committing-leafward'
  | 'committing-rootward'
  | 'reduced-motion-commit';

export type GestureCommitDirection = 'leafward' | 'rootward';

export interface GesturePresentationState {
  readonly phase: GesturePresentationPhase;
  readonly direction?: GestureCommitDirection;
}

export interface GestureSpatialContinuity {
  readonly destinationOrigin: 'left' | 'right';
  readonly formerFocusDestination: 'left' | 'right';
}

export interface GestureMotionGeometry {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface GestureInverseTransform {
  readonly deltaX: number;
  readonly deltaY: number;
  readonly scaleX: number;
  readonly scaleY: number;
}

export function calculateGestureInverseTransform(
  source: GestureMotionGeometry,
  destination: GestureMotionGeometry,
): GestureInverseTransform {
  return {
    deltaX:
      source.left +
      source.width / 2 -
      (destination.left + destination.width / 2),
    deltaY:
      source.top +
      source.height / 2 -
      (destination.top + destination.height / 2),
    scaleX: source.width / destination.width,
    scaleY: source.height / destination.height,
  };
}

export function buildJourneyMotionKey(
  journeyPosition: number,
  nodeId: string,
): string {
  return `journey:${journeyPosition}:${nodeId}`;
}

export function createRestingPresentationState(): GesturePresentationState {
  return { phase: 'resting' };
}

export function beginDirectManipulation(): GesturePresentationState {
  return { phase: 'direct-manipulation' };
}

export function beginSnapBack(): GesturePresentationState {
  return { phase: 'settling' };
}

export function beginGestureCommit(
  direction: GestureCommitDirection,
  reducedMotion: boolean,
): GesturePresentationState {
  if (reducedMotion) {
    return { phase: 'reduced-motion-commit', direction };
  }

  return {
    phase:
      direction === 'leafward' ? 'committing-leafward' : 'committing-rootward',
    direction,
  };
}

export function finishGesturePresentation(): GesturePresentationState {
  return createRestingPresentationState();
}

export function getPresentationDurationMs(
  state: GesturePresentationState,
): number {
  switch (state.phase) {
    case 'settling':
      return GESTURE_PRESENTATION_DURATIONS_MS.snapBack;
    case 'committing-leafward':
    case 'committing-rootward':
      return GESTURE_PRESENTATION_DURATIONS_MS.commit;
    case 'reduced-motion-commit':
      return GESTURE_PRESENTATION_DURATIONS_MS.reducedMotion;
    case 'resting':
    case 'direct-manipulation':
      return 0;
  }
}

export function getGestureSpatialContinuity(
  direction: GestureCommitDirection,
): GestureSpatialContinuity {
  return direction === 'leafward'
    ? { destinationOrigin: 'right', formerFocusDestination: 'left' }
    : { destinationOrigin: 'left', formerFocusDestination: 'right' };
}
