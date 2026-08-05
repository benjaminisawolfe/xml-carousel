import { writable, type Readable } from 'svelte/store';
import type { SchemaNodeId } from '../../schema/model';

export interface ProjectSessionResetState {
  readonly revision: number;
  readonly initialFocusNodeId?: SchemaNodeId;
}

export interface ProjectSessionResetStore extends Readable<ProjectSessionResetState> {
  reset(initialFocusNodeId: SchemaNodeId): ProjectSessionResetState;
}

export function createProjectSessionResetStore(): ProjectSessionResetStore {
  const state = writable<ProjectSessionResetState>({ revision: 0 });
  let revision = 0;

  return {
    subscribe: state.subscribe,
    reset(initialFocusNodeId) {
      revision += 1;
      const next = { revision, initialFocusNodeId };
      state.set(next);
      return next;
    },
  };
}

export const projectSessionResetStore = createProjectSessionResetStore();
