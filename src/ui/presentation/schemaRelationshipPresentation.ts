import {
  getSchemaNode,
  type SchemaEdgeKind,
  type SchemaNodeKind,
  type SchemaProject,
  type SchemaRelationship,
} from '../../schema/model';
import {
  classifyStructuralRelationshipForJourney,
  type StructuralJourneyDisposition,
} from '../../app/stores/navigationCentering';
import type { NavigationState } from '../../app/stores/navigationTypes';

export interface JourneyRelationshipPresentation {
  readonly disposition: 'advance' | 'terminalCycleClosure';
  readonly targetJourneyPosition?: number;
  readonly isCurrentFocusClosure: boolean;
  readonly relationshipLabel: string;
  readonly terminalLabel?: string;
  readonly edgeId: string;
}

export function formatOutgoingRelationshipLabel(
  kind: SchemaEdgeKind,
  sourceKind?: SchemaNodeKind,
  targetKind?: SchemaNodeKind,
): string {
  if (kind === 'contains' && sourceKind === 'schema') {
    switch (targetKind) {
      case 'globalElement':
        return 'Global element declaration';
      case 'complexType':
        return 'Complex type declaration';
      case 'simpleType':
        return 'Simple type declaration';
      default:
        return 'Global declaration';
    }
  }
  if (kind === 'contains' && targetKind === 'restriction') {
    return 'Restriction';
  }
  if (kind === 'contains' && targetKind === 'extension') {
    return 'Extension';
  }

  switch (kind) {
    case 'contains':
      return 'Child';
    case 'typeOf':
      return 'Type';
    case 'references':
      return 'Referenced element';
    case 'extends':
    case 'restricts':
      return 'Base type';
    case 'usesGroup':
      return 'Group';
    case 'usesAttributeGroup':
      return 'Attribute group';
    case 'substitutes':
      return 'Substitution';
    case 'imports':
      return 'Imported schema';
    case 'includes':
      return 'Included schema';
    case 'usesAttribute':
      return 'Attribute';
    case 'usedBy':
      return 'Used by';
    case 'contentModelMember':
      return 'Content-model member';
    case 'contentModelReference':
      return 'Content-model reference';
    case 'referencesElementName':
      return 'Referenced element declaration';
    case 'referencesUndeclaredElementName':
      return 'Undeclared element-name reference';
    case 'appliesAttributesToElement':
      return 'Attribute-list target';
    case 'attributeBelongsToList':
      return 'Declared attribute';
    case 'entityUsesNotation':
      return 'Notation';
    case 'attributeAllowsNotation':
      return 'Allowed notation';
    case 'dependsOnResource':
      return 'Project-local dependency';
    case 'commentAttachesTo':
      return 'Attached declaration';
    case 'sourceOrderAdjacent':
      return 'Next declaration in source order';
    case 'sourceDocumentOwns':
      return 'Schema declaration';
    case 'ownsComponent':
      return 'Owned component';
    case 'particleMember':
      return 'Particle';
    case 'ownsAnonymousType':
      return 'Anonymous type';
    case 'referencesDeclaration':
      return 'Referenced declaration';
    case 'ownsContent':
      return 'Content structure';
    case 'wildcardMember':
      return 'Wildcard';
    case 'ownsTypeVariety':
      return 'Type variety';
    case 'ownsFacet':
      return 'Facet';
    case 'derivesFrom':
      return 'Direct base type';
    case 'listItemType':
      return 'List item type';
    case 'unionMemberType':
      return 'Union member type';
    case 'ownsIdentityConstraint':
      return 'Identity constraint';
    case 'ownsSelector':
      return 'Selector';
    case 'ownsField':
      return 'Field';
    case 'keyrefTargets':
      return 'Referenced key or unique';
    case 'notationConstraint':
      return 'Notation declaration';
    case 'ownsSchemaRelationship':
      return 'Schema relationship';
    case 'ownsAnnotation':
      return 'Annotation';
    case 'ownsAnnotationEntry':
      return 'Annotation entry';
    case 'ownsForeignContent':
      return 'Preserved foreign content';
    case 'ownsXmlMetadata':
      return 'XML source metadata';
    case 'dependsOnSchema':
      return 'Dependency schema';
    case 'redefinesSchema':
      return 'Redefined schema';
    case 'redefinesComponent':
      return 'Original component';
    case 'chameleonNamespaceContext':
      return 'Effective namespace schema';
    case 'substitutionGroupMember':
      return 'Substitution-group head';
    case 'dependencyCycleMember':
      return 'Dependency cycle';
    case 'sharesDependency':
      return 'Shared dependency';
  }
}

export function formatTerminalCycleRelationshipLabel(
  kind: SchemaEdgeKind,
): string {
  switch (kind) {
    case 'contains':
      return 'Recursive child';
    case 'typeOf':
      return 'Recursive type';
    case 'references':
      return 'Recursive reference';
    case 'restricts':
    case 'extends':
      return 'Recursive base type';
    case 'derivesFrom':
      return 'Recursive direct base type';
    default:
      return 'Cycle closure';
  }
}

function formatCurrentFocusTerminalLabel(targetKind: SchemaNodeKind): string {
  switch (targetKind) {
    case 'dtdElement':
    case 'globalElement':
    case 'localElement':
      return 'Already the current element';
    case 'complexType':
    case 'simpleType':
      return 'Already the current type';
    default:
      return 'Already the current node';
  }
}

export function buildJourneyRelationshipPresentation(
  project: SchemaProject,
  state: NavigationState,
  relationship: SchemaRelationship,
): JourneyRelationshipPresentation | undefined {
  const disposition: StructuralJourneyDisposition | undefined =
    classifyStructuralRelationshipForJourney(project, state, relationship);
  if (!disposition) return undefined;

  if (disposition.kind === 'advance') {
    return {
      disposition: 'advance',
      isCurrentFocusClosure: false,
      relationshipLabel: formatOutgoingRelationshipLabel(
        relationship.edge.kind,
        getSchemaNode(project, relationship.edge.sourceNodeId)?.kind,
        relationship.node.kind,
      ),
      edgeId: relationship.edge.id,
    };
  }

  return {
    disposition: 'terminalCycleClosure',
    targetJourneyPosition: disposition.targetJourneyPosition,
    isCurrentFocusClosure: disposition.isCurrentFocus,
    relationshipLabel: formatTerminalCycleRelationshipLabel(
      relationship.edge.kind,
    ),
    terminalLabel: disposition.isCurrentFocus
      ? formatCurrentFocusTerminalLabel(relationship.node.kind)
      : 'Already present earlier in this path',
    edgeId: relationship.edge.id,
  };
}
