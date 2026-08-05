import {
  getPhysicalHorizontalDirection,
  mapPhysicalDirection,
  resolvePreviewSelection,
} from './gestureTargeting';
import {
  DEFAULT_HORIZONTAL_ACTIVATION_THRESHOLD,
  type GestureCompletion,
  type GestureNavigationOutcome,
  type GesturePointerInput,
  type GestureState,
  type GestureUpdateContext,
  type IdleGestureState,
  type TrackingGestureState,
} from './gestureTypes';

export function createIdleGestureState(): IdleGestureState {
  return { phase: 'idle' };
}

export function startGesture(
  state: GestureState,
  input: GesturePointerInput,
): GestureState {
  if (state.phase !== 'idle') return state;

  return {
    phase: 'tracking',
    pointerId: input.pointerId,
    originX: input.x,
    originY: input.y,
    currentX: input.x,
    currentY: input.y,
    deltaX: 0,
    deltaY: 0,
    thresholdCrossed: false,
  };
}

function resolveThreshold(context: GestureUpdateContext): number {
  const threshold =
    context.horizontalActivationThreshold ??
    DEFAULT_HORIZONTAL_ACTIVATION_THRESHOLD;

  if (!Number.isFinite(threshold) || threshold <= 0) {
    throw new RangeError('Horizontal activation threshold must be positive.');
  }

  return threshold;
}

export function updateGesture(
  state: GestureState,
  input: GesturePointerInput,
  context: GestureUpdateContext,
): GestureState {
  if (state.phase === 'idle' || state.pointerId !== input.pointerId) {
    return state;
  }

  const deltaX = input.x - state.originX;
  const deltaY = input.y - state.originY;
  const physicalDirection = getPhysicalHorizontalDirection(deltaX);
  const semanticIntent = mapPhysicalDirection(
    physicalDirection,
    context.directionPolicy,
  );
  const thresholdCrossed =
    state.thresholdCrossed || Math.abs(deltaX) >= resolveThreshold(context);

  const geometry: TrackingGestureState = {
    phase: 'tracking',
    pointerId: state.pointerId,
    originX: state.originX,
    originY: state.originY,
    currentX: input.x,
    currentY: input.y,
    deltaX,
    deltaY,
    ...(physicalDirection ? { physicalDirection } : {}),
    ...(semanticIntent ? { semanticIntent } : {}),
    thresholdCrossed: false,
  };

  if (!thresholdCrossed) return geometry;

  const proposedTarget = resolvePreviewSelection(
    semanticIntent,
    input.y,
    context.journeyNodeIds,
    context.visibleLeafwardCandidates,
  );

  return {
    ...geometry,
    phase: 'preview',
    thresholdCrossed: true,
    ...(proposedTarget
      ? {
          proposedTargetNodeId: proposedTarget.nodeId,
          ...(proposedTarget.relationshipId
            ? {
                proposedTargetRelationshipId: proposedTarget.relationshipId,
              }
            : {}),
        }
      : {}),
  };
}

function noNavigation(): GestureNavigationOutcome {
  return { type: 'none' };
}

export function releaseGesture(state: GestureState): GestureCompletion {
  let outcome = noNavigation();

  if (state.phase === 'preview' && state.proposedTargetNodeId !== undefined) {
    if (state.semanticIntent === 'rootward') {
      outcome = {
        type: 'navigate-rootward',
        targetNodeId: state.proposedTargetNodeId,
      };
    } else if (state.semanticIntent === 'leafward') {
      outcome = {
        type: 'navigate-leafward',
        targetNodeId: state.proposedTargetNodeId,
        ...(state.proposedTargetRelationshipId
          ? { relationshipId: state.proposedTargetRelationshipId }
          : {}),
      };
    }
  }

  return { state: createIdleGestureState(), outcome };
}

export function cancelGesture(state: GestureState): GestureCompletion {
  return {
    state: state.phase === 'idle' ? state : createIdleGestureState(),
    outcome: noNavigation(),
  };
}
