import { get, readable, writable, type Readable } from 'svelte/store';
import {
  getSchemaNode,
  type SchemaNodeId,
  type SchemaProject,
} from '../../schema/model';
import { activeProject } from './projectStore';

export type SourceViewOrigin = 'focused-card' | 'inspector' | 'search-result';

export interface SourceViewState {
  readonly projectId: string;
  readonly nodeId?: SchemaNodeId;
  readonly origin?: SourceViewOrigin;
}

export type SourceViewTransitionResult =
  | { readonly applied: true; readonly state: SourceViewState }
  | {
      readonly applied: false;
      readonly reason: 'projectMismatch' | 'unknownNode' | 'sourceUnavailable';
      readonly state: SourceViewState;
    };

export interface SourceViewOpenTarget {
  readonly projectId: string;
  readonly nodeId: SchemaNodeId;
  readonly sourceAvailable: boolean;
}

export interface SourceViewStore extends Readable<SourceViewState> {
  open(
    target: SourceViewOpenTarget,
    origin: SourceViewOrigin,
  ): SourceViewTransitionResult;
  close(): SourceViewTransitionResult;
  resetForProject(projectId: string): SourceViewTransitionResult;
}

function applied(state: SourceViewState): SourceViewTransitionResult {
  return { applied: true, state };
}

function rejected(
  state: SourceViewState,
  reason: Extract<SourceViewTransitionResult, { applied: false }>['reason'],
): SourceViewTransitionResult {
  return { applied: false, reason, state };
}

export function openSourceView(
  project: SchemaProject,
  state: SourceViewState,
  target: SourceViewOpenTarget,
  origin: SourceViewOrigin,
): SourceViewTransitionResult {
  if (state.projectId !== project.id || target.projectId !== project.id) {
    return rejected(state, 'projectMismatch');
  }
  if (!getSchemaNode(project, target.nodeId)) {
    return rejected(state, 'unknownNode');
  }
  if (!target.sourceAvailable) {
    return rejected(state, 'sourceUnavailable');
  }
  return applied({ projectId: project.id, nodeId: target.nodeId, origin });
}

export function closeSourceView(
  state: SourceViewState,
): SourceViewTransitionResult {
  return applied({ projectId: state.projectId });
}

export function createSourceViewStore(
  projectSource: SchemaProject | Readable<SchemaProject>,
  initialState: SourceViewState,
): SourceViewStore {
  const state = writable(initialState);
  const project =
    'subscribe' in projectSource ? projectSource : readable(projectSource);

  function apply(
    transition: (current: SourceViewState) => SourceViewTransitionResult,
  ): SourceViewTransitionResult {
    const result = transition(get(state));
    if (result.applied) state.set(result.state);
    return result;
  }

  return {
    subscribe: state.subscribe,
    open(target, origin) {
      return apply((current) =>
        openSourceView(get(project), current, target, origin),
      );
    },
    close() {
      return apply(closeSourceView);
    },
    resetForProject(projectId) {
      return apply(() => closeSourceView({ projectId }));
    },
  };
}

export const sourceViewStore = createSourceViewStore(activeProject, {
  projectId: get(activeProject).id,
});
