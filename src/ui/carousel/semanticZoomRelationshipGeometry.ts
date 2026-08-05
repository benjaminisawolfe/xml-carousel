export interface SemanticZoomRectangle {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface SemanticZoomLinePoint {
  readonly x: number;
  readonly y: number;
}

export interface StageRelativeRectangle extends SemanticZoomRectangle {
  readonly right: number;
  readonly bottom: number;
  readonly centerX: number;
  readonly centerY: number;
}

export interface SemanticZoomRelationshipLine {
  readonly key: string;
  readonly kind: 'leafward' | 'rootward';
  readonly terminal: boolean;
  readonly sourceIdentity: string;
  readonly targetIdentity: string;
  readonly from: SemanticZoomLinePoint;
  readonly to: SemanticZoomLinePoint;
  readonly controlPoints: readonly SemanticZoomLinePoint[];
  readonly path: string;
}

export interface LeafwardLineTarget {
  readonly edgeId: string;
  readonly nodeId: string;
  readonly visibleOrder: number;
  readonly terminal: boolean;
  readonly visible?: boolean;
  readonly box: SemanticZoomRectangle;
}

export interface RootwardLineItem {
  readonly nodeId: string;
  readonly journeyPosition: number;
  readonly role: 'history' | 'previous' | 'focus';
  readonly visible?: boolean;
  readonly box: SemanticZoomRectangle;
}

const STRAIGHT_CONNECTOR_MAXIMUM_GAP = 48;
const HORIZONTAL_CONTROL_POINT_FACTOR = 0.35;

function finiteRectangle(rectangle: SemanticZoomRectangle): boolean {
  return (
    Number.isFinite(rectangle.left) &&
    Number.isFinite(rectangle.top) &&
    Number.isFinite(rectangle.width) &&
    Number.isFinite(rectangle.height) &&
    rectangle.width > 0 &&
    rectangle.height > 0
  );
}

export function toStageRelativeRectangle(
  stage: SemanticZoomRectangle,
  rectangle: SemanticZoomRectangle,
): StageRelativeRectangle | undefined {
  if (!finiteRectangle(stage) || !finiteRectangle(rectangle)) return undefined;

  const left = rectangle.left - stage.left;
  const top = rectangle.top - stage.top;
  const right = left + rectangle.width;
  const bottom = top + rectangle.height;
  if (right <= 0 || bottom <= 0 || left >= stage.width || top >= stage.height) {
    return undefined;
  }

  return {
    left,
    top,
    right,
    bottom,
    width: rectangle.width,
    height: rectangle.height,
    centerX: left + rectangle.width / 2,
    centerY: top + rectangle.height / 2,
  };
}

function pointInsideStage(
  stage: SemanticZoomRectangle,
  point: SemanticZoomLinePoint,
): boolean {
  return (
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    point.x >= 0 &&
    point.x <= stage.width &&
    point.y >= 0 &&
    point.y <= stage.height
  );
}

function rounded(value: number): string {
  return String(Math.round(value * 100) / 100);
}

interface ConnectorPath {
  readonly path: string;
  readonly controlPoints: readonly SemanticZoomLinePoint[];
}

export function buildBoundedHorizontalPath(
  from: SemanticZoomLinePoint,
  to: SemanticZoomLinePoint,
): ConnectorPath | undefined {
  const horizontalGap = to.x - from.x;
  if (
    !Number.isFinite(horizontalGap) ||
    horizontalGap <= 0 ||
    !Number.isFinite(from.y) ||
    !Number.isFinite(to.y)
  ) {
    return undefined;
  }

  if (horizontalGap <= STRAIGHT_CONNECTOR_MAXIMUM_GAP) {
    return {
      path: `M ${rounded(from.x)} ${rounded(from.y)} L ${rounded(to.x)} ${rounded(to.y)}`,
      controlPoints: [],
    };
  }

  const first = {
    x: from.x + horizontalGap * HORIZONTAL_CONTROL_POINT_FACTOR,
    y: from.y,
  };
  const second = {
    x: to.x - horizontalGap * HORIZONTAL_CONTROL_POINT_FACTOR,
    y: to.y,
  };
  return {
    path: `M ${rounded(from.x)} ${rounded(from.y)} C ${rounded(first.x)} ${rounded(first.y)}, ${rounded(second.x)} ${rounded(second.y)}, ${rounded(to.x)} ${rounded(to.y)}`,
    controlPoints: [first, second],
  };
}

function buildVerticalPath(
  from: SemanticZoomLinePoint,
  to: SemanticZoomLinePoint,
): ConnectorPath {
  return {
    path: `M ${rounded(from.x)} ${rounded(from.y)} L ${rounded(to.x)} ${rounded(to.y)}`,
    controlPoints: [],
  };
}

function visibleEndpointPair(
  stage: SemanticZoomRectangle,
  from: SemanticZoomLinePoint,
  to: SemanticZoomLinePoint,
): boolean {
  return pointInsideStage(stage, from) && pointInsideStage(stage, to);
}

export function buildLeafwardRelationshipLines(
  stage: SemanticZoomRectangle,
  focusBox: SemanticZoomRectangle | undefined,
  targets: readonly LeafwardLineTarget[],
): readonly SemanticZoomRelationshipLine[] {
  if (!focusBox) return [];
  const focus = toStageRelativeRectangle(stage, focusBox);
  if (!focus) return [];

  return [...targets]
    .sort(
      (first, second) =>
        first.visibleOrder - second.visibleOrder ||
        first.edgeId.localeCompare(second.edgeId),
    )
    .flatMap((target) => {
      if (target.visible === false) return [];
      const box = toStageRelativeRectangle(stage, target.box);
      if (!box) return [];
      const from = { x: focus.right, y: focus.centerY };
      const to = { x: box.left, y: box.centerY };
      if (!visibleEndpointPair(stage, from, to)) return [];
      const connector = buildBoundedHorizontalPath(from, to);
      if (!connector) return [];
      return [
        {
          key: `leafward:${target.edgeId}`,
          kind: 'leafward' as const,
          terminal: target.terminal,
          sourceIdentity: 'focus',
          targetIdentity: `leafward:${target.edgeId}`,
          from,
          to,
          controlPoints: connector.controlPoints,
          path: connector.path,
        },
      ];
    });
}

export function buildRootwardJourneyLines(
  stage: SemanticZoomRectangle,
  items: readonly RootwardLineItem[],
): readonly SemanticZoomRelationshipLine[] {
  const ordered = [...items]
    .filter(({ visible }) => visible !== false)
    .sort(
      (first, second) =>
        first.journeyPosition - second.journeyPosition ||
        first.nodeId.localeCompare(second.nodeId),
    );
  const lines: SemanticZoomRelationshipLine[] = [];

  for (let index = 0; index < ordered.length - 1; index += 1) {
    const source = ordered[index];
    const target = ordered[index + 1];
    if (!source || !target) continue;
    if (target.journeyPosition - source.journeyPosition !== 1) continue;

    const isImmediateStep =
      source.role === 'previous' && target.role === 'focus';
    const isHistoryStep =
      source.role === 'history' &&
      (target.role === 'history' || target.role === 'previous');
    if (!isImmediateStep && !isHistoryStep) continue;

    const sourceBox = toStageRelativeRectangle(stage, source.box);
    const targetBox = toStageRelativeRectangle(stage, target.box);
    if (!sourceBox || !targetBox) continue;

    const sourceAbove = sourceBox.centerY <= targetBox.centerY;
    const from = isImmediateStep
      ? { x: sourceBox.right, y: sourceBox.centerY }
      : {
          x: sourceBox.centerX,
          y: sourceAbove ? sourceBox.bottom : sourceBox.top,
        };
    const to = isImmediateStep
      ? { x: targetBox.left, y: targetBox.centerY }
      : {
          x: targetBox.centerX,
          y: sourceAbove ? targetBox.top : targetBox.bottom,
        };
    if (!visibleEndpointPair(stage, from, to)) continue;

    const connector = isImmediateStep
      ? buildBoundedHorizontalPath(from, to)
      : buildVerticalPath(from, to);
    if (!connector) continue;

    lines.push({
      key: `rootward:${source.journeyPosition}:${source.nodeId}:${target.journeyPosition}:${target.nodeId}`,
      kind: 'rootward',
      terminal: false,
      sourceIdentity: `${source.role}:${source.journeyPosition}:${source.nodeId}`,
      targetIdentity: `${target.role}:${target.journeyPosition}:${target.nodeId}`,
      from,
      to,
      controlPoints: connector.controlPoints,
      path: connector.path,
    });
  }

  return lines;
}
