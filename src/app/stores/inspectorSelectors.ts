import {
  getContainedChildren,
  getIncomingRelationships,
  getSchemaNode,
  type SchemaNode,
  type SchemaNodeId,
  type SchemaProject,
  type SchemaRelationship,
} from '../../schema/model';
import type { InspectorState } from './inspectorTypes';

function matchesProject(
  project: SchemaProject,
  state: InspectorState,
): boolean {
  return project.id === state.projectId;
}

export function selectInspectedNodeId(
  state: InspectorState,
): SchemaNodeId | undefined {
  return state.inspectedNodeId;
}

export function selectHasInspectorTarget(state: InspectorState): boolean {
  return state.inspectedNodeId !== undefined;
}

export function selectInspectedNode(
  project: SchemaProject,
  state: InspectorState,
): SchemaNode | undefined {
  if (!matchesProject(project, state) || !state.inspectedNodeId) {
    return undefined;
  }

  return getSchemaNode(project, state.inspectedNodeId);
}

export function selectInspectedChildren(
  project: SchemaProject,
  state: InspectorState,
): SchemaRelationship[] {
  if (!matchesProject(project, state) || !state.inspectedNodeId) {
    return [];
  }

  return getContainedChildren(project, state.inspectedNodeId);
}

export function selectInspectedIncomingRelationships(
  project: SchemaProject,
  state: InspectorState,
): SchemaRelationship[] {
  if (!matchesProject(project, state) || !state.inspectedNodeId) {
    return [];
  }

  return getIncomingRelationships(project, state.inspectedNodeId);
}
