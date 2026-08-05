import { describe, expect, it } from 'vitest';
import {
  buildBoundedHorizontalPath,
  buildLeafwardRelationshipLines,
  buildRootwardJourneyLines,
  toStageRelativeRectangle,
  type LeafwardLineTarget,
  type SemanticZoomRectangle,
} from './semanticZoomRelationshipGeometry';

const stage: SemanticZoomRectangle = {
  left: 100,
  top: 50,
  width: 900,
  height: 600,
};
const focus: SemanticZoomRectangle = {
  left: 420,
  top: 250,
  width: 180,
  height: 120,
};

function target(
  overrides: Partial<LeafwardLineTarget> = {},
): LeafwardLineTarget {
  return {
    edgeId: 'edge:a',
    nodeId: 'node:a',
    visibleOrder: 0,
    terminal: false,
    box: { left: 760, top: 180, width: 160, height: 80 },
    ...overrides,
  };
}

describe('semantic zoom relationship geometry', () => {
  it('converts a stage at the viewport origin without changing coordinates', () => {
    expect(
      toStageRelativeRectangle(
        { left: 0, top: 0, width: 900, height: 600 },
        { left: 320, top: 200, width: 180, height: 120 },
      ),
    ).toMatchObject({ left: 320, top: 200, right: 500, bottom: 320 });
  });

  it('uses the same stage-relative coordinates at a nonzero viewport offset', () => {
    const offset = toStageRelativeRectangle(stage, focus);
    const origin = toStageRelativeRectangle(
      { left: 0, top: 0, width: 900, height: 600 },
      { left: 320, top: 200, width: 180, height: 120 },
    );
    expect(offset).toEqual(origin);
  });

  it('joins the focus right edge to the leafward left edge', () => {
    const [line] = buildLeafwardRelationshipLines(stage, focus, [target()]);
    expect(line).toMatchObject({
      sourceIdentity: 'focus',
      targetIdentity: 'leafward:edge:a',
      from: { x: 500, y: 260 },
      to: { x: 660, y: 170 },
    });
  });

  it('joins the previous-step right edge to the focus left edge', () => {
    const lines = buildRootwardJourneyLines(stage, [
      {
        nodeId: 'previous',
        journeyPosition: 0,
        role: 'previous',
        box: { left: 140, top: 220, width: 180, height: 80 },
      },
      { nodeId: 'focus', journeyPosition: 1, role: 'focus', box: focus },
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      sourceIdentity: 'previous:0:previous',
      targetIdentity: 'focus:1:focus',
      from: { x: 220, y: 210 },
      to: { x: 320, y: 260 },
    });
  });

  it('builds one correctly keyed endpoint for every stacked target', () => {
    const lines = buildLeafwardRelationshipLines(stage, focus, [
      target({
        edgeId: 'edge:0',
        box: { left: 760, top: 100, width: 160, height: 60 },
      }),
      target({
        edgeId: 'edge:1',
        visibleOrder: 1,
        box: { left: 760, top: 220, width: 160, height: 60 },
      }),
      target({
        edgeId: 'edge:2',
        visibleOrder: 2,
        box: { left: 760, top: 340, width: 160, height: 60 },
      }),
    ]);
    expect(lines.map(({ key, to }) => ({ key, to }))).toEqual([
      { key: 'leafward:edge:0', to: { x: 660, y: 80 } },
      { key: 'leafward:edge:1', to: { x: 660, y: 200 } },
      { key: 'leafward:edge:2', to: { x: 660, y: 320 } },
    ]);
  });

  it('keeps endpoints on boundaries when vertical centres differ', () => {
    const [line] = buildLeafwardRelationshipLines(stage, focus, [
      target({ box: { left: 760, top: 500, width: 160, height: 60 } }),
    ]);
    expect(line?.from).toEqual({ x: 500, y: 260 });
    expect(line?.to).toEqual({ x: 660, y: 480 });
  });

  it('uses exact boundary endpoints without clamping them', () => {
    const [line] = buildLeafwardRelationshipLines(stage, focus, [target()]);
    const focusRelative = toStageRelativeRectangle(stage, focus);
    const targetRelative = toStageRelativeRectangle(stage, target().box);
    expect(line?.from.x).toBe(focusRelative?.right);
    expect(line?.from.y).toBe(focusRelative?.centerY);
    expect(line?.to.x).toBe(targetRelative?.left);
    expect(line?.to.y).toBe(targetRelative?.centerY);
  });

  it('bounds shallow cubic controls to the horizontal endpoint interval', () => {
    const connector = buildBoundedHorizontalPath(
      { x: 100, y: 180 },
      { x: 300, y: 240 },
    );
    expect(connector?.controlPoints).toHaveLength(2);
    for (const point of connector?.controlPoints ?? []) {
      expect(point.x).toBeGreaterThanOrEqual(100);
      expect(point.x).toBeLessThanOrEqual(300);
      expect(point.y).toBeGreaterThanOrEqual(180);
      expect(point.y).toBeLessThanOrEqual(240);
    }
  });

  it('uses a straight bounded connector for a narrow card gap', () => {
    const connector = buildBoundedHorizontalPath(
      { x: 100, y: 100 },
      { x: 124, y: 220 },
    );
    expect(connector).toEqual({
      path: 'M 100 100 L 124 220',
      controlPoints: [],
    });
  });

  it('never generates a point below both cards or outside the endpoint corridor', () => {
    const [line] = buildLeafwardRelationshipLines(stage, focus, [
      target({ box: { left: 760, top: 500, width: 160, height: 60 } }),
    ]);
    const points = [line?.from, ...(line?.controlPoints ?? []), line?.to];
    for (const point of points) {
      expect(point?.x).toBeGreaterThanOrEqual(500);
      expect(point?.x).toBeLessThanOrEqual(660);
      expect(point?.y).toBeGreaterThanOrEqual(260);
      expect(point?.y).toBeLessThanOrEqual(480);
    }
  });

  it('omits endpoints outside the stage rather than clamping a runaway path', () => {
    expect(
      buildLeafwardRelationshipLines(stage, focus, [
        target({ box: { left: 760, top: 700, width: 160, height: 80 } }),
      ]),
    ).toEqual([]);
  });

  it('keeps duplicate destinations distinct by edge identity and stable order', () => {
    const lines = buildLeafwardRelationshipLines(stage, focus, [
      target({ edgeId: 'edge:second', nodeId: 'shared', visibleOrder: 1 }),
      target({ edgeId: 'edge:first', nodeId: 'shared', terminal: true }),
    ]);
    expect(lines.map(({ key }) => key)).toEqual([
      'leafward:edge:first',
      'leafward:edge:second',
    ]);
  });

  it('omits all lines when the source is missing', () => {
    expect(
      buildLeafwardRelationshipLines(stage, undefined, [target()]),
    ).toEqual([]);
  });

  it('omits a missing target collection', () => {
    expect(buildLeafwardRelationshipLines(stage, focus, [])).toEqual([]);
  });

  it('omits zero-size cards', () => {
    expect(
      buildLeafwardRelationshipLines(stage, focus, [
        target({ box: { left: 760, top: 180, width: 0, height: 80 } }),
      ]),
    ).toEqual([]);
  });

  it('omits explicitly hidden targets', () => {
    expect(
      buildLeafwardRelationshipLines(stage, focus, [
        target({ visible: false }),
      ]),
    ).toEqual([]);
  });

  it('connects only adjacent visible rootward journey positions', () => {
    const lines = buildRootwardJourneyLines(stage, [
      {
        nodeId: 'earliest',
        journeyPosition: 0,
        role: 'history',
        box: { left: 140, top: 420, width: 180, height: 60 },
      },
      {
        nodeId: 'gap',
        journeyPosition: 1,
        role: 'history',
        visible: false,
        box: { left: 140, top: 330, width: 180, height: 60 },
      },
      {
        nodeId: 'previous',
        journeyPosition: 2,
        role: 'previous',
        box: { left: 140, top: 220, width: 180, height: 80 },
      },
      { nodeId: 'focus', journeyPosition: 3, role: 'focus', box: focus },
    ]);
    expect(lines.map(({ key }) => key)).toEqual([
      'rootward:2:previous:3:focus',
    ]);
  });

  it('preserves terminal-cycle line treatment', () => {
    const [line] = buildLeafwardRelationshipLines(stage, focus, [
      target({ terminal: true }),
    ]);
    expect(line).toMatchObject({ terminal: true, kind: 'leafward' });
  });

  it('emits only finite path data and points', () => {
    const lines = buildLeafwardRelationshipLines(stage, focus, [target()]);
    for (const line of lines) {
      expect(line.path).not.toMatch(/NaN|Infinity/);
      for (const point of [line.from, ...line.controlPoints, line.to]) {
        expect(Number.isFinite(point.x)).toBe(true);
        expect(Number.isFinite(point.y)).toBe(true);
      }
    }
  });
});
