import {
  stepSemanticZoom,
  type SemanticZoomLevel,
  type SemanticZoomState,
} from '../../app/stores/semanticZoomStore';

export type SemanticZoomWheelAction = 'zoomIn' | 'zoomOut';

export interface SemanticZoomWheelInput {
  readonly deltaX: number;
  readonly deltaY: number;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
}

export type SemanticZoomWheelDecision =
  | {
      readonly consumed: true;
      readonly action: SemanticZoomWheelAction;
      readonly nextLevel: SemanticZoomLevel;
    }
  | {
      readonly consumed: false;
    };

export interface SemanticZoomWheelController {
  handle(
    input: SemanticZoomWheelInput,
    state: SemanticZoomState,
  ): SemanticZoomWheelDecision;
  settle(): void;
  reset(): void;
}

export function semanticZoomWheelAction(
  input: SemanticZoomWheelInput,
): SemanticZoomWheelAction | undefined {
  if (
    input.ctrlKey ||
    input.metaKey ||
    !Number.isFinite(input.deltaX) ||
    !Number.isFinite(input.deltaY) ||
    input.deltaY === 0 ||
    Math.abs(input.deltaX) >= Math.abs(input.deltaY)
  ) {
    return undefined;
  }

  return input.deltaY > 0 ? 'zoomOut' : 'zoomIn';
}

export function decideSemanticZoomWheelStep(
  input: SemanticZoomWheelInput,
  state: SemanticZoomState,
): SemanticZoomWheelDecision {
  const action = semanticZoomWheelAction(input);
  if (!action || !state.isAvailable) return { consumed: false };

  const nextLevel = stepSemanticZoom(
    state.requestedLevel,
    action === 'zoomOut' ? 'out' : 'in',
  );
  if (nextLevel === state.requestedLevel) return { consumed: false };

  return { consumed: true, action, nextLevel };
}

/**
 * Future controls should bind this controller only to their own native button
 * group. The carousel surface deliberately has no wheel listener.
 */
export function createSemanticZoomWheelController(): SemanticZoomWheelController {
  let gestureConsumed = false;

  return {
    handle(input, state) {
      if (gestureConsumed) return { consumed: false };
      const decision = decideSemanticZoomWheelStep(input, state);
      if (decision.consumed) gestureConsumed = true;
      return decision;
    },
    settle() {
      gestureConsumed = false;
    },
    reset() {
      gestureConsumed = false;
    },
  };
}
