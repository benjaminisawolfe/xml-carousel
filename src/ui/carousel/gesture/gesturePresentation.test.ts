import { describe, expect, it } from 'vitest';
import {
  beginDirectManipulation,
  beginGestureCommit,
  beginSnapBack,
  buildJourneyMotionKey,
  calculateGestureInverseTransform,
  createRestingPresentationState,
  finishGesturePresentation,
  GESTURE_PRESENTATION_DURATIONS_MS,
  getGestureSpatialContinuity,
  getPresentationDurationMs,
} from './gesturePresentation';

describe('gesture presentation phases', () => {
  it('begins and finishes at the resting presentation state', () => {
    expect(createRestingPresentationState()).toEqual({ phase: 'resting' });
    expect(finishGesturePresentation()).toEqual({ phase: 'resting' });
  });

  it('separates direct manipulation and snap-back from semantic gesture state', () => {
    expect(beginDirectManipulation()).toEqual({
      phase: 'direct-manipulation',
    });
    expect(beginSnapBack()).toEqual({ phase: 'settling' });
  });

  it('identifies normal leafward and rootward commit phases', () => {
    expect(beginGestureCommit('leafward', false)).toEqual({
      phase: 'committing-leafward',
      direction: 'leafward',
    });
    expect(beginGestureCommit('rootward', false)).toEqual({
      phase: 'committing-rootward',
      direction: 'rootward',
    });
  });

  it('uses one shortened phase for reduced-motion commits without changing direction', () => {
    expect(beginGestureCommit('leafward', true)).toEqual({
      phase: 'reduced-motion-commit',
      direction: 'leafward',
    });
    expect(beginGestureCommit('rootward', true)).toEqual({
      phase: 'reduced-motion-commit',
      direction: 'rootward',
    });
  });

  it('centralizes bounded preview, snap-back, commit, and reduced-motion durations', () => {
    expect(GESTURE_PRESENTATION_DURATIONS_MS).toEqual({
      preview: 130,
      snapBack: 160,
      commit: 260,
      reducedMotion: 60,
      fallbackBuffer: 40,
    });
    expect(getPresentationDurationMs(beginDirectManipulation())).toBe(0);
    expect(getPresentationDurationMs(beginSnapBack())).toBe(160);
    expect(
      getPresentationDurationMs(beginGestureCommit('leafward', false)),
    ).toBe(260);
    expect(
      getPresentationDurationMs(beginGestureCommit('rootward', true)),
    ).toBe(60);
  });

  it('encodes only the accepted spatial continuity directions', () => {
    expect(getGestureSpatialContinuity('leafward')).toEqual({
      destinationOrigin: 'right',
      formerFocusDestination: 'left',
    });
    expect(getGestureSpatialContinuity('rootward')).toEqual({
      destinationOrigin: 'left',
      formerFocusDestination: 'right',
    });
  });

  it('keeps repeated journey IDs positionally distinct while matching cards across roles', () => {
    expect(buildJourneyMotionKey(1, 'repeated-node')).toBe(
      'journey:1:repeated-node',
    );
    expect(buildJourneyMotionKey(2, 'repeated-node')).toBe(
      'journey:2:repeated-node',
    );
    expect(buildJourneyMotionKey(1, 'repeated-node')).not.toBe(
      buildJourneyMotionKey(2, 'repeated-node'),
    );
  });

  it('uses centre-to-centre deltas so scaled inverse geometry reproduces the release box', () => {
    expect(
      calculateGestureInverseTransform(
        { left: 537.5, top: 227.75, width: 213.5, height: 46 },
        { left: 277.5, top: 134.453125, width: 360, height: 206.578125 },
      ),
    ).toEqual({
      deltaX: 186.75,
      deltaY: 13.0078125,
      scaleX: 213.5 / 360,
      scaleY: 46 / 206.578125,
    });
  });
});
