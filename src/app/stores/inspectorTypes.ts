import type { SchemaNodeId, SchemaProjectId } from '../../schema/model';

export interface InspectorState {
  readonly projectId: SchemaProjectId;
  readonly inspectedNodeId?: SchemaNodeId;
}

export type InspectorTransitionResult =
  | {
      readonly applied: true;
      readonly state: InspectorState;
    }
  | {
      readonly applied: false;
      readonly reason: 'projectMismatch' | 'unknownNode';
      readonly state: InspectorState;
    };
