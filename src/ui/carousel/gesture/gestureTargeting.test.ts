import { describe, expect, it } from 'vitest';
import {
  getPhysicalHorizontalDirection,
  mapPhysicalDirection,
  resolvePreviewSelection,
  selectImmediateRootwardTarget,
  selectNearestLeafwardCandidate,
  selectNearestLeafwardTarget,
} from './gestureTargeting';
import {
  prototypeDirectionPolicyA,
  prototypeDirectionPolicyB,
  type LeafwardTargetCandidate,
} from './gestureTypes';
import { bookDtdNodeIds } from '../../../schema/samples/bookDtdProject';

const visibleCandidates = [
  { nodeId: 'upper', verticalCenter: 100, visibleOrder: 0 },
  { nodeId: 'middle', verticalCenter: 200, visibleOrder: 1 },
  { nodeId: 'lower', verticalCenter: 300, visibleOrder: 2 },
] as const satisfies readonly LeafwardTargetCandidate[];

const chapterCandidates = [
  { nodeId: bookDtdNodeIds.title, verticalCenter: 100, visibleOrder: 0 },
  { nodeId: bookDtdNodeIds.epigraph, verticalCenter: 200, visibleOrder: 1 },
  { nodeId: bookDtdNodeIds.section, verticalCenter: 300, visibleOrder: 2 },
  { nodeId: bookDtdNodeIds.figure, verticalCenter: 400, visibleOrder: 3 },
  { nodeId: bookDtdNodeIds.note, verticalCenter: 500, visibleOrder: 4 },
] as const satisfies readonly LeafwardTargetCandidate[];

describe('gesture direction mapping', () => {
  it('distinguishes negative, positive, and absent horizontal movement', () => {
    expect(getPhysicalHorizontalDirection(-1)).toBe('negativeX');
    expect(getPhysicalHorizontalDirection(1)).toBe('positiveX');
    expect(getPhysicalHorizontalDirection(0)).toBeUndefined();
  });

  it('maps both physical directions through prototype Policy A', () => {
    expect(mapPhysicalDirection('negativeX', prototypeDirectionPolicyA)).toBe(
      'rootward',
    );
    expect(mapPhysicalDirection('positiveX', prototypeDirectionPolicyA)).toBe(
      'leafward',
    );
  });

  it('maps the same physical directions oppositely through Policy B', () => {
    expect(mapPhysicalDirection('negativeX', prototypeDirectionPolicyB)).toBe(
      'leafward',
    );
    expect(mapPhysicalDirection('positiveX', prototypeDirectionPolicyB)).toBe(
      'rootward',
    );
  });

  it('does not assign semantic intent without physical direction', () => {
    expect(mapPhysicalDirection(undefined, prototypeDirectionPolicyA)).toBe(
      undefined,
    );
  });
});

describe('leafward target selection', () => {
  it('returns no target when no visible candidates are supplied', () => {
    expect(selectNearestLeafwardTarget([], 200)).toBeUndefined();
  });

  it('always selects the only supplied candidate', () => {
    expect(selectNearestLeafwardTarget([visibleCandidates[1]], -500)).toBe(
      'middle',
    );
    expect(selectNearestLeafwardTarget([visibleCandidates[1]], 900)).toBe(
      'middle',
    );
  });

  it('selects the topmost candidate above the visible range', () => {
    expect(selectNearestLeafwardTarget(visibleCandidates, 20)).toBe('upper');
  });

  it('selects the bottommost candidate below the visible range', () => {
    expect(selectNearestLeafwardTarget(visibleCandidates, 480)).toBe('lower');
  });

  it.each([
    [115, 'upper'],
    [185, 'middle'],
    [280, 'lower'],
  ])('selects the nearest centre at pointer Y %i', (pointerY, expected) => {
    expect(selectNearestLeafwardTarget(visibleCandidates, pointerY)).toBe(
      expected,
    );
  });

  it('breaks exact-distance ties by the lowest stable visible order', () => {
    const tied = [
      { nodeId: 'later', verticalCenter: 100, visibleOrder: 4 },
      { nodeId: 'earlier', verticalCenter: 200, visibleOrder: 2 },
    ] as const;

    expect(selectNearestLeafwardTarget(tied, 150)).toBe('earlier');
  });

  it.each([
    [80, bookDtdNodeIds.title],
    [305, bookDtdNodeIds.section],
    [540, bookDtdNodeIds.note],
  ])(
    'selects the top, middle, and bottom chapter branch at pointer Y %i',
    (pointerY, expected) => {
      expect(selectNearestLeafwardTarget(chapterCandidates, pointerY)).toBe(
        expected,
      );
    },
  );

  it('does not reorder or mutate candidate inputs', () => {
    const candidates = Object.freeze([
      Object.freeze({
        nodeId: 'second',
        verticalCenter: 200,
        visibleOrder: 1,
      }),
      Object.freeze({
        nodeId: 'first',
        verticalCenter: 100,
        visibleOrder: 0,
      }),
    ]);
    const before = JSON.stringify(candidates);

    expect(selectNearestLeafwardTarget(candidates, 110)).toBe('first');
    expect(JSON.stringify(candidates)).toBe(before);
    expect(candidates.map(({ nodeId }) => nodeId)).toEqual(['second', 'first']);
  });

  it('cannot select a hidden branch that was not supplied', () => {
    const visibleOnly = [visibleCandidates[0], visibleCandidates[2]];

    expect(selectNearestLeafwardTarget(visibleOnly, 200)).toBe('upper');
    expect(visibleOnly).not.toContainEqual(
      expect.objectContaining({ nodeId: 'middle' }),
    );
  });

  it('selects repeated target nodes by relationship identity and geometry', () => {
    const repeated = [
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
    ] as const satisfies readonly LeafwardTargetCandidate[];

    expect(selectNearestLeafwardCandidate(repeated, 280)).toEqual(repeated[1]);
    expect(
      resolvePreviewSelection('leafward', 280, ['root'], repeated),
    ).toEqual({
      nodeId: 'shared',
      relationshipId: 'edge:second',
    });
  });
});

describe('rootward target selection', () => {
  it('returns no target for a journey containing only the focus', () => {
    expect(selectImmediateRootwardTarget(['focus'])).toBeUndefined();
  });

  it('selects the entry immediately before the final focus', () => {
    expect(selectImmediateRootwardTarget(['root', 'parent', 'focus'])).toBe(
      'parent',
    );
  });

  it('handles repeated IDs by journey position', () => {
    expect(selectImmediateRootwardTarget(['a', 'b', 'a'])).toBe('b');
  });

  it('does not mutate or truncate the journey', () => {
    const journey = Object.freeze(['root', 'parent', 'focus']);
    const before = [...journey];

    selectImmediateRootwardTarget(journey);

    expect(journey).toEqual(before);
  });
});
