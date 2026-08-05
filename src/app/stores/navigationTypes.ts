import type {
  SchemaNodeId,
  SchemaPath,
  SchemaProjectId,
} from '../../schema/model';

/** A non-empty simple path through the schema graph. */
export type NavigationPath = SchemaPath &
  readonly [SchemaNodeId, ...SchemaNodeId[]];

/** The final navigationPath entry is the sole source of carousel focus. */
export interface NavigationState {
  readonly projectId: SchemaProjectId;
  readonly navigationPath: NavigationPath;
}

export type NavigationFailureReason =
  | 'unknownNode'
  | 'projectMismatch'
  | 'notLeafwardDestination'
  | 'rootwardUnavailable'
  | 'notInRootwardPath'
  | 'invalidRelationship'
  | 'invalidStructuralJourney'
  | 'ambiguousRelationship'
  | 'terminalCycleClosure'
  | 'alreadyFocused';

export type NavigationInitializationResult =
  | {
      readonly applied: true;
      readonly state: NavigationState;
    }
  | {
      readonly applied: false;
      readonly reason: 'unknownNode';
    };

export type NavigationTransitionResult =
  | {
      readonly applied: true;
      readonly effect?: 'advanced';
      readonly state: NavigationState;
    }
  | {
      readonly applied: false;
      readonly reason: NavigationFailureReason;
      readonly state: NavigationState;
    };

export type StructuralRelationshipNavigationResult =
  | {
      readonly applied: true;
      readonly effect: 'advanced';
      readonly state: NavigationState;
    }
  | {
      readonly applied: false;
      readonly reason:
        | 'terminalCycleClosure'
        | 'projectMismatch'
        | 'unknownNode'
        | 'invalidRelationship'
        | 'ambiguousRelationship';
      readonly state: NavigationState;
    };
