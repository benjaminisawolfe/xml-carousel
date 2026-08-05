import {
  getOutgoingStructuralRelationships,
  getSchemaNode,
  type SchemaEdge,
  type SchemaNode,
  type SchemaNodeId,
  type SchemaProject,
  type SchemaRelationship,
} from '../../schema/model';
import type { NavigationState } from './navigationTypes';

function matchesProject(
  project: SchemaProject,
  state: NavigationState,
): boolean {
  return project.id === state.projectId;
}

export function selectCurrentFocusNodeId(state: NavigationState): SchemaNodeId {
  return state.navigationPath[state.navigationPath.length - 1];
}

export function selectCurrentFocusNode(
  project: SchemaProject,
  state: NavigationState,
): SchemaNode | undefined {
  if (!matchesProject(project, state)) {
    return undefined;
  }

  return getSchemaNode(project, selectCurrentFocusNodeId(state));
}

export function selectNavigationPathIds(
  state: NavigationState,
): NavigationState['navigationPath'] {
  return state.navigationPath;
}

export function selectNavigationPathNodes(
  project: SchemaProject,
  state: NavigationState,
): SchemaNode[] {
  if (!matchesProject(project, state)) {
    return [];
  }

  const nodes: SchemaNode[] = [];

  for (const nodeId of state.navigationPath) {
    const node = getSchemaNode(project, nodeId);
    if (node) {
      nodes.push(node);
    }
  }

  return nodes;
}

export function selectImmediateRootwardNode(
  project: SchemaProject,
  state: NavigationState,
): SchemaNode | undefined {
  if (!matchesProject(project, state) || state.navigationPath.length < 2) {
    return undefined;
  }

  return getSchemaNode(
    project,
    state.navigationPath[state.navigationPath.length - 2],
  );
}

export function selectRootwardPathNodes(
  project: SchemaProject,
  state: NavigationState,
): SchemaNode[] {
  if (!matchesProject(project, state)) {
    return [];
  }

  const nodes: SchemaNode[] = [];

  for (let index = state.navigationPath.length - 2; index >= 0; index -= 1) {
    const node = getSchemaNode(project, state.navigationPath[index]);
    if (node) {
      nodes.push(node);
    }
  }

  return nodes;
}

export function selectLeafwardRelationships(
  project: SchemaProject,
  state: NavigationState,
): SchemaRelationship[] {
  if (!matchesProject(project, state)) {
    return [];
  }

  return getOutgoingStructuralRelationships(
    project,
    selectCurrentFocusNodeId(state),
  );
}

export function selectLeafwardEdges(
  project: SchemaProject,
  state: NavigationState,
): SchemaEdge[] {
  return selectLeafwardRelationships(project, state).map(({ edge }) => edge);
}

export function selectLeafwardDestinationNodes(
  project: SchemaProject,
  state: NavigationState,
): SchemaNode[] {
  return selectLeafwardRelationships(project, state).map(({ node }) => node);
}

export function selectCanNavigateRootward(state: NavigationState): boolean {
  return state.navigationPath.length > 1;
}
