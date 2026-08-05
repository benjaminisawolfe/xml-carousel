import { describe, expect, it } from 'vitest';
import {
  cancelGesture,
  createIdleGestureState,
  releaseGesture,
  startGesture,
  updateGesture,
} from './gestureState';
import {
  DEFAULT_HORIZONTAL_ACTIVATION_THRESHOLD,
  prototypeDirectionPolicyA,
  prototypeDirectionPolicyB,
  type GestureState,
  type GestureUpdateContext,
} from './gestureTypes';

const candidates = [
  { nodeId: 'upper', verticalCenter: 100, visibleOrder: 0 },
  { nodeId: 'middle', verticalCenter: 200, visibleOrder: 1 },
  { nodeId: 'lower', verticalCenter: 300, visibleOrder: 2 },
] as const;

const contextA = {
  directionPolicy: prototypeDirectionPolicyA,
  journeyNodeIds: ['root', 'focus'],
  visibleLeafwardCandidates: candidates,
} as const satisfies GestureUpdateContext;

function trackingState(): GestureState {
  return startGesture(createIdleGestureState(), {
    pointerId: 7,
    x: 100,
    y: 200,
  });
}

function update(
  state: GestureState,
  x: number,
  y: number,
  context: GestureUpdateContext = contextA,
): GestureState {
  return updateGesture(state, { pointerId: 7, x, y }, context);
}

describe('gesture state and threshold tracking', () => {
  it('starts in an explicit idle state', () => {
    expect(createIdleGestureState()).toEqual({ phase: 'idle' });
  });

  it('records the active pointer and origin when tracking starts', () => {
    expect(trackingState()).toEqual({
      phase: 'tracking',
      pointerId: 7,
      originX: 100,
      originY: 200,
      currentX: 100,
      currentY: 200,
      deltaX: 0,
      deltaY: 0,
      thresholdCrossed: false,
    });
  });

  it('ignores another start while a gesture is already active', () => {
    const state = trackingState();

    expect(startGesture(state, { pointerId: 9, x: 0, y: 0 })).toBe(state);
  });

  it('updates current coordinates and both deltas for the active pointer', () => {
    expect(update(trackingState(), 130, 225)).toMatchObject({
      phase: 'tracking',
      currentX: 130,
      currentY: 225,
      deltaX: 30,
      deltaY: 25,
      physicalDirection: 'positiveX',
      semanticIntent: 'leafward',
    });
  });

  it('predictably ignores updates from a different pointer ID', () => {
    const state = trackingState();

    expect(
      updateGesture(state, { pointerId: 99, x: 200, y: 300 }, contextA),
    ).toBe(state);
  });

  it.each([-47, 47])(
    'keeps %ipx horizontal movement below threshold',
    (deltaX) => {
      expect(update(trackingState(), 100 + deltaX, 200)).toMatchObject({
        phase: 'tracking',
        thresholdCrossed: false,
        deltaX,
      });
    },
  );

  it.each([
    [-48, 'negativeX', 'rootward'],
    [48, 'positiveX', 'leafward'],
  ] as const)(
    'activates symmetrically at exactly %ipx',
    (deltaX, physicalDirection, semanticIntent) => {
      expect(update(trackingState(), 100 + deltaX, 200)).toMatchObject({
        phase: 'preview',
        thresholdCrossed: true,
        deltaX,
        physicalDirection,
        semanticIntent,
      });
    },
  );

  it.each([-80, 80])(
    'activates after moving beyond threshold at %ipx',
    (deltaX) => {
      expect(update(trackingState(), 100 + deltaX, 200)).toMatchObject({
        phase: 'preview',
        thresholdCrossed: true,
      });
    },
  );

  it('does not activate from large vertical movement alone', () => {
    expect(update(trackingState(), 147, 900)).toMatchObject({
      phase: 'tracking',
      deltaX: 47,
      deltaY: 700,
      thresholdCrossed: false,
    });
  });

  it('assigns no physical direction or semantic intent at zero delta X', () => {
    const state = update(trackingState(), 100, 280);

    expect(state).toMatchObject({
      phase: 'tracking',
      deltaX: 0,
      thresholdCrossed: false,
    });
    expect(state).not.toHaveProperty('physicalDirection');
    expect(state).not.toHaveProperty('semanticIntent');
  });

  it('uses a named default threshold of 48 CSS pixels', () => {
    expect(DEFAULT_HORIZONTAL_ACTIVATION_THRESHOLD).toBe(48);
  });

  it('accepts a configurable horizontal activation threshold', () => {
    const customContext = {
      ...contextA,
      horizontalActivationThreshold: 24,
    };

    expect(update(trackingState(), 123, 200, customContext).phase).toBe(
      'tracking',
    );
    expect(update(trackingState(), 124, 200, customContext).phase).toBe(
      'preview',
    );
  });

  it('rejects a nonpositive activation threshold', () => {
    expect(() =>
      update(trackingState(), 148, 200, {
        ...contextA,
        horizontalActivationThreshold: 0,
      }),
    ).toThrow(RangeError);
  });
});

describe('direction policy and preview resolution', () => {
  it('allows the same positive-X drag to produce opposite semantic intent', () => {
    const policyAState = update(trackingState(), 148, 200, contextA);
    const policyBState = update(trackingState(), 148, 200, {
      ...contextA,
      directionPolicy: prototypeDirectionPolicyB,
    });

    expect(policyAState).toMatchObject({
      physicalDirection: 'positiveX',
      semanticIntent: 'leafward',
      proposedTargetNodeId: 'middle',
    });
    expect(policyBState).toMatchObject({
      physicalDirection: 'positiveX',
      semanticIntent: 'rootward',
      proposedTargetNodeId: 'root',
    });
  });

  it('allows the same negative-X drag to produce opposite semantic intent', () => {
    const policyAState = update(trackingState(), 52, 200, contextA);
    const policyBState = update(trackingState(), 52, 200, {
      ...contextA,
      directionPolicy: prototypeDirectionPolicyB,
    });

    expect(policyAState).toMatchObject({
      physicalDirection: 'negativeX',
      semanticIntent: 'rootward',
      proposedTargetNodeId: 'root',
    });
    expect(policyBState).toMatchObject({
      physicalDirection: 'negativeX',
      semanticIntent: 'leafward',
      proposedTargetNodeId: 'middle',
    });
  });

  it('updates the leafward target when vertical pointer position changes', () => {
    const preview = update(trackingState(), 148, 110);
    const moved = update(preview, 160, 285);

    expect(preview).toMatchObject({ proposedTargetNodeId: 'upper' });
    expect(moved).toMatchObject({
      phase: 'preview',
      proposedTargetNodeId: 'lower',
    });
  });

  it('retains relationship identity through preview and release', () => {
    const relationshipContext = {
      ...contextA,
      visibleLeafwardCandidates: [
        {
          nodeId: 'shared',
          relationshipId: 'edge:first',
          verticalCenter: 100,
          visibleOrder: 0,
        },
        {
          nodeId: 'shared',
          relationshipId: 'edge:second',
          verticalCenter: 300,
          visibleOrder: 1,
        },
      ],
    };
    const preview = update(trackingState(), 148, 285, relationshipContext);

    expect(preview).toMatchObject({
      phase: 'preview',
      proposedTargetNodeId: 'shared',
      proposedTargetRelationshipId: 'edge:second',
    });
    expect(releaseGesture(preview)).toEqual({
      state: { phase: 'idle' },
      outcome: {
        type: 'navigate-leafward',
        targetNodeId: 'shared',
        relationshipId: 'edge:second',
      },
    });
  });

  it('resolves rootward preview from the journey and ignores branches', () => {
    const state = update(trackingState(), 52, 295);

    expect(state).toMatchObject({
      semanticIntent: 'rootward',
      proposedTargetNodeId: 'root',
    });
    expect(state).not.toMatchObject({ proposedTargetNodeId: 'lower' });
  });

  it('keeps rootward preview active without a previous journey entry', () => {
    const state = update(trackingState(), 52, 200, {
      ...contextA,
      journeyNodeIds: ['focus'],
    });

    expect(state).toMatchObject({
      phase: 'preview',
      thresholdCrossed: true,
      semanticIntent: 'rootward',
    });
    expect(state).not.toHaveProperty('proposedTargetNodeId');
  });

  it('keeps leafward preview active without visible candidates', () => {
    const state = update(trackingState(), 148, 200, {
      ...contextA,
      visibleLeafwardCandidates: [],
    });

    expect(state).toMatchObject({
      phase: 'preview',
      thresholdCrossed: true,
      semanticIntent: 'leafward',
    });
    expect(state).not.toHaveProperty('proposedTargetNodeId');
  });

  it('keeps the threshold latched while coordinates continue changing', () => {
    const preview = update(trackingState(), 148, 200);
    const movedBack = update(preview, 101, 100);

    expect(movedBack).toMatchObject({
      phase: 'preview',
      thresholdCrossed: true,
      deltaX: 1,
      proposedTargetNodeId: 'upper',
    });
  });

  it('does not mutate navigation, inspector, journey, or candidates', () => {
    const navigationFixture = Object.freeze({
      projectId: 'sample',
      navigationPath: Object.freeze(['root', 'focus']),
    });
    const inspectorFixture = Object.freeze({
      projectId: 'sample',
      inspectedNodeId: 'inspected',
    });
    const frozenCandidates = Object.freeze(
      candidates.map((candidate) => Object.freeze({ ...candidate })),
    );
    const navigationBefore = JSON.stringify(navigationFixture);
    const inspectorBefore = JSON.stringify(inspectorFixture);
    const candidatesBefore = JSON.stringify(frozenCandidates);

    const preview = update(trackingState(), 148, 250, {
      directionPolicy: prototypeDirectionPolicyA,
      journeyNodeIds: navigationFixture.navigationPath,
      visibleLeafwardCandidates: frozenCandidates,
    });
    releaseGesture(preview);

    expect(JSON.stringify(navigationFixture)).toBe(navigationBefore);
    expect(JSON.stringify(inspectorFixture)).toBe(inspectorBefore);
    expect(JSON.stringify(frozenCandidates)).toBe(candidatesBefore);
  });
});

describe('release and cancellation', () => {
  it('releases below threshold with no navigation and returns idle', () => {
    expect(releaseGesture(update(trackingState(), 147, 200))).toEqual({
      state: { phase: 'idle' },
      outcome: { type: 'none' },
    });
  });

  it('releases active preview without a target noncommittally', () => {
    const preview = update(trackingState(), 148, 200, {
      ...contextA,
      visibleLeafwardCandidates: [],
    });

    expect(releaseGesture(preview)).toEqual({
      state: { phase: 'idle' },
      outcome: { type: 'none' },
    });
  });

  it('proposes the immediate rootward target without navigating', () => {
    expect(releaseGesture(update(trackingState(), 52, 200))).toEqual({
      state: { phase: 'idle' },
      outcome: { type: 'navigate-rootward', targetNodeId: 'root' },
    });
  });

  it('proposes the selected leafward target without navigating', () => {
    expect(releaseGesture(update(trackingState(), 148, 285))).toEqual({
      state: { phase: 'idle' },
      outcome: { type: 'navigate-leafward', targetNodeId: 'lower' },
    });
  });

  it('cancels below threshold with no navigation and clears state', () => {
    expect(cancelGesture(update(trackingState(), 130, 220))).toEqual({
      state: { phase: 'idle' },
      outcome: { type: 'none' },
    });
  });

  it('cancels during preview with no navigation and clears the target', () => {
    const preview = update(trackingState(), 148, 285);
    expect(preview).toMatchObject({ proposedTargetNodeId: 'lower' });

    expect(cancelGesture(preview)).toEqual({
      state: { phase: 'idle' },
      outcome: { type: 'none' },
    });
  });
});
