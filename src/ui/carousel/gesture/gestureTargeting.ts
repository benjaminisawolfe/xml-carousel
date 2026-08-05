import type {
  GestureDirectionPolicy,
  GestureNodeId,
  GesturePreviewTarget,
  LeafwardTargetCandidate,
  PhysicalHorizontalDirection,
  SemanticNavigationDirection,
} from './gestureTypes';

export function getPhysicalHorizontalDirection(
  deltaX: number,
): PhysicalHorizontalDirection | undefined {
  if (deltaX < 0) return 'negativeX';
  if (deltaX > 0) return 'positiveX';
  return undefined;
}

export function mapPhysicalDirection(
  physicalDirection: PhysicalHorizontalDirection | undefined,
  policy: GestureDirectionPolicy,
): SemanticNavigationDirection | undefined {
  return physicalDirection ? policy[physicalDirection] : undefined;
}

export function selectNearestLeafwardTarget(
  candidates: readonly LeafwardTargetCandidate[],
  pointerY: number,
): GestureNodeId | undefined {
  let selected: LeafwardTargetCandidate | undefined;
  let selectedDistance = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const distance = Math.abs(candidate.verticalCenter - pointerY);
    if (
      !selected ||
      distance < selectedDistance ||
      (distance === selectedDistance &&
        candidate.visibleOrder < selected.visibleOrder)
    ) {
      selected = candidate;
      selectedDistance = distance;
    }
  }

  return selected?.nodeId;
}

export function selectNearestLeafwardCandidate(
  candidates: readonly LeafwardTargetCandidate[],
  pointerY: number,
): LeafwardTargetCandidate | undefined {
  const nodeId = selectNearestLeafwardTarget(candidates, pointerY);
  if (!nodeId) return undefined;

  let selected: LeafwardTargetCandidate | undefined;
  let selectedDistance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    if (candidate.nodeId !== nodeId) continue;
    const distance = Math.abs(candidate.verticalCenter - pointerY);
    if (
      !selected ||
      distance < selectedDistance ||
      (distance === selectedDistance &&
        candidate.visibleOrder < selected.visibleOrder)
    ) {
      selected = candidate;
      selectedDistance = distance;
    }
  }
  return selected;
}

export function selectImmediateRootwardTarget(
  journeyNodeIds: readonly GestureNodeId[],
): GestureNodeId | undefined {
  return journeyNodeIds.length > 1
    ? journeyNodeIds[journeyNodeIds.length - 2]
    : undefined;
}

export function resolvePreviewTarget(
  semanticIntent: SemanticNavigationDirection | undefined,
  currentPointerY: number,
  journeyNodeIds: readonly GestureNodeId[],
  visibleLeafwardCandidates: readonly LeafwardTargetCandidate[],
): GestureNodeId | undefined {
  if (semanticIntent === 'rootward') {
    return selectImmediateRootwardTarget(journeyNodeIds);
  }

  if (semanticIntent === 'leafward') {
    return selectNearestLeafwardTarget(
      visibleLeafwardCandidates,
      currentPointerY,
    );
  }

  return undefined;
}

export function resolvePreviewSelection(
  semanticIntent: SemanticNavigationDirection | undefined,
  currentPointerY: number,
  journeyNodeIds: readonly GestureNodeId[],
  visibleLeafwardCandidates: readonly LeafwardTargetCandidate[],
): GesturePreviewTarget | undefined {
  if (semanticIntent === 'rootward') {
    const nodeId = selectImmediateRootwardTarget(journeyNodeIds);
    return nodeId ? { nodeId } : undefined;
  }

  if (semanticIntent === 'leafward') {
    const candidate = selectNearestLeafwardCandidate(
      visibleLeafwardCandidates,
      currentPointerY,
    );
    return candidate
      ? {
          nodeId: candidate.nodeId,
          ...(candidate.relationshipId
            ? { relationshipId: candidate.relationshipId }
            : {}),
        }
      : undefined;
  }

  return undefined;
}
