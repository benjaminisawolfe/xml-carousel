export const DEFAULT_HORIZONTAL_ACTIVATION_THRESHOLD = 48;

export type GestureNodeId = string;

export type PhysicalHorizontalDirection = 'negativeX' | 'positiveX';

export type SemanticNavigationDirection = 'rootward' | 'leafward';

export interface GestureDirectionPolicy {
  readonly negativeX: SemanticNavigationDirection;
  readonly positiveX: SemanticNavigationDirection;
}

export const prototypeDirectionPolicyA = {
  negativeX: 'rootward',
  positiveX: 'leafward',
} as const satisfies GestureDirectionPolicy;

export const prototypeDirectionPolicyB = {
  negativeX: 'leafward',
  positiveX: 'rootward',
} as const satisfies GestureDirectionPolicy;

export interface GesturePoint {
  readonly x: number;
  readonly y: number;
}

export interface GesturePointerInput extends GesturePoint {
  readonly pointerId: number;
}

export interface LeafwardTargetCandidate {
  readonly nodeId: GestureNodeId;
  readonly relationshipId?: string;
  readonly verticalCenter: number;
  readonly visibleOrder: number;
}

export interface GesturePreviewTarget {
  readonly nodeId: GestureNodeId;
  readonly relationshipId?: string;
}

export interface GestureUpdateContext {
  readonly directionPolicy: GestureDirectionPolicy;
  readonly horizontalActivationThreshold?: number;
  readonly journeyNodeIds: readonly GestureNodeId[];
  readonly visibleLeafwardCandidates: readonly LeafwardTargetCandidate[];
}

interface GesturePointerGeometry {
  readonly pointerId: number;
  readonly originX: number;
  readonly originY: number;
  readonly currentX: number;
  readonly currentY: number;
  readonly deltaX: number;
  readonly deltaY: number;
  readonly physicalDirection?: PhysicalHorizontalDirection;
  readonly semanticIntent?: SemanticNavigationDirection;
}

export interface IdleGestureState {
  readonly phase: 'idle';
}

export interface TrackingGestureState extends GesturePointerGeometry {
  readonly phase: 'tracking';
  readonly thresholdCrossed: false;
  readonly proposedTargetNodeId?: undefined;
}

export interface PreviewGestureState extends GesturePointerGeometry {
  readonly phase: 'preview';
  readonly thresholdCrossed: true;
  readonly proposedTargetNodeId?: GestureNodeId;
  readonly proposedTargetRelationshipId?: string;
}

export type ActiveGestureState = TrackingGestureState | PreviewGestureState;

export type GestureState = IdleGestureState | ActiveGestureState;

export type GestureNavigationOutcome =
  | { readonly type: 'none' }
  | {
      readonly type: 'navigate-rootward';
      readonly targetNodeId: GestureNodeId;
    }
  | {
      readonly type: 'navigate-leafward';
      readonly targetNodeId: GestureNodeId;
      readonly relationshipId?: string;
    };

export interface GestureCompletion {
  readonly state: IdleGestureState;
  readonly outcome: GestureNavigationOutcome;
}
