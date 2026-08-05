import { derived, get, readable, writable, type Readable } from 'svelte/store';
import {
  getSchemaNode,
  type SchemaNode,
  type SchemaNodeId,
  type SchemaProject,
  type SchemaRelationship,
} from '../../schema/model';
import { activeProject } from './projectStore';
import {
  selectHasInspectorTarget,
  selectInspectedChildren,
  selectInspectedIncomingRelationships,
  selectInspectedNode,
  selectInspectedNodeId,
} from './inspectorSelectors';
import type {
  InspectorState,
  InspectorTransitionResult,
} from './inspectorTypes';

function reject(
  state: InspectorState,
  reason: Extract<InspectorTransitionResult, { applied: false }>['reason'],
): InspectorTransitionResult {
  return { applied: false, reason, state };
}

function apply(state: InspectorState): InspectorTransitionResult {
  return { applied: true, state };
}

export function inspectNode(
  project: SchemaProject,
  state: InspectorState,
  nodeId: SchemaNodeId,
): InspectorTransitionResult {
  if (state.projectId !== project.id) {
    return reject(state, 'projectMismatch');
  }

  if (!getSchemaNode(project, nodeId)) {
    return reject(state, 'unknownNode');
  }

  return apply({ ...state, inspectedNodeId: nodeId });
}

export function closeInspector(
  state: InspectorState,
): InspectorTransitionResult {
  return apply({ projectId: state.projectId });
}

export interface InspectorStore extends Readable<InspectorState> {
  readonly inspectedNodeId: Readable<SchemaNodeId | undefined>;
  readonly inspectedNode: Readable<SchemaNode | undefined>;
  readonly hasTarget: Readable<boolean>;
  readonly containedChildren: Readable<SchemaRelationship[]>;
  readonly incomingRelationships: Readable<SchemaRelationship[]>;
  resetForProject(projectId: string): InspectorTransitionResult;
  inspect(nodeId: SchemaNodeId): InspectorTransitionResult;
  close(): InspectorTransitionResult;
}

export function createInspectorStore(
  projectSource: SchemaProject | Readable<SchemaProject>,
  initialState: InspectorState,
): InspectorStore {
  const state = writable(initialState);
  const project =
    'subscribe' in projectSource ? projectSource : readable(projectSource);

  function applyTransition(
    transition: (current: InspectorState) => InspectorTransitionResult,
  ): InspectorTransitionResult {
    const result = transition(get(state));
    if (result.applied) state.set(result.state);
    return result;
  }

  return {
    subscribe: state.subscribe,
    inspectedNodeId: derived(state, selectInspectedNodeId),
    inspectedNode: derived([state, project], ([current, active]) =>
      selectInspectedNode(active, current),
    ),
    hasTarget: derived(state, selectHasInspectorTarget),
    containedChildren: derived([state, project], ([current, active]) =>
      selectInspectedChildren(active, current),
    ),
    incomingRelationships: derived([state, project], ([current, active]) =>
      selectInspectedIncomingRelationships(active, current),
    ),
    resetForProject(projectId) {
      return applyTransition(() => closeInspector({ projectId }));
    },
    inspect(nodeId) {
      return applyTransition((current) =>
        inspectNode(get(project), current, nodeId),
      );
    },
    close() {
      return applyTransition(closeInspector);
    },
  };
}

const initialInspectorState = {
  projectId: get(activeProject).id,
} satisfies InspectorState;

export const inspectorStore = createInspectorStore(
  activeProject,
  initialInspectorState,
);
