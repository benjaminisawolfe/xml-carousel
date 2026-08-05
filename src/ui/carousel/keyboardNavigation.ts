import type { NavigationState } from '../../app/stores/navigationTypes';
import type { SchemaProject, SchemaRelationship } from '../../schema/model';
import { buildJourneyRelationshipPresentation } from '../presentation/schemaRelationshipPresentation';
import { getBranchWindow } from './carouselWindowing';

export type KeyboardSelectionDirection = -1 | 1;

export function getActionableLeafwardRelationships(
  project: SchemaProject,
  navigationState: NavigationState,
  relationships: readonly SchemaRelationship[],
): readonly SchemaRelationship[] {
  return relationships.filter(
    (relationship) =>
      buildJourneyRelationshipPresentation(
        project,
        navigationState,
        relationship,
      )?.disposition === 'advance',
  );
}

export function resolveKeyboardSelectedRelationshipId(
  relationships: readonly SchemaRelationship[],
  selectedRelationshipId?: string,
): string | undefined {
  if (
    selectedRelationshipId &&
    relationships.some(({ edge }) => edge.id === selectedRelationshipId)
  ) {
    return selectedRelationshipId;
  }

  return undefined;
}

export function moveKeyboardSelectedRelationshipId(
  relationships: readonly SchemaRelationship[],
  selectedRelationshipId: string | undefined,
  direction: KeyboardSelectionDirection,
): string | undefined {
  if (relationships.length === 0) return undefined;

  const currentRelationshipId = resolveKeyboardSelectedRelationshipId(
    relationships,
    selectedRelationshipId,
  );
  if (!currentRelationshipId) {
    return direction === 1
      ? relationships[0]?.edge.id
      : relationships[relationships.length - 1]?.edge.id;
  }

  const currentIndex = relationships.findIndex(
    ({ edge }) => edge.id === currentRelationshipId,
  );
  const nextIndex = currentIndex + direction;
  if (nextIndex < 0 || nextIndex >= relationships.length) {
    return currentRelationshipId;
  }

  return relationships[nextIndex]?.edge.id;
}

export function getKeyboardSelectionWindowStart(
  relationships: readonly SchemaRelationship[],
  selectedRelationshipId: string | undefined,
  currentStartIndex: number,
  windowSize: number,
): number {
  const currentWindow = getBranchWindow(
    relationships,
    currentStartIndex,
    windowSize,
  );
  if (!selectedRelationshipId) return currentWindow.startIndex;

  const selectedIndex = relationships.findIndex(
    ({ edge }) => edge.id === selectedRelationshipId,
  );
  if (selectedIndex < 0) return currentWindow.startIndex;

  const visibleEndIndex =
    currentWindow.startIndex + currentWindow.visible.length;
  if (selectedIndex < currentWindow.startIndex) {
    return getBranchWindow(relationships, selectedIndex, windowSize).startIndex;
  }
  if (selectedIndex >= visibleEndIndex) {
    return getBranchWindow(
      relationships,
      selectedIndex - currentWindow.size + 1,
      windowSize,
    ).startIndex;
  }

  return currentWindow.startIndex;
}
