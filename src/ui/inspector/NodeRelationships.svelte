<script lang="ts">
  import type { NodeCenterRequest } from '../../app/stores/navigationCentering';
  import {
    formatSchemaEdgeKind,
    formatSchemaNodeKind,
  } from '../carousel/nodePresentation';
  import InspectorNodeRow from './InspectorNodeRow.svelte';
  import InspectorSection from './InspectorSection.svelte';
  import type { InspectorIncomingRelationshipSummary } from './inspectorSummary';

  export let inspectedNodeId: string;
  export let relationships: readonly InspectorIncomingRelationshipSummary[];
  export let showNodeKinds: boolean;
  export let onCenterNode: (request: NodeCenterRequest) => void;
</script>

<InspectorSection title="Used by">
  <ul aria-label="Incoming structural relationships">
    {#each relationships as relationship (relationship.relationshipId)}
      <InspectorNodeRow
        primary={relationship.displayName}
        secondary={`${showNodeKinds ? `${formatSchemaNodeKind(relationship.kind)} · ` : ''}${formatSchemaEdgeKind(relationship.relationshipKind)}`}
        accessibleName={`Center ${relationship.displayName}`}
        onActivate={() =>
          onCenterNode({
            targetNodeId: relationship.nodeId,
            relationshipContext: {
              kind: 'incoming-structural',
              inspectedNodeId,
              sourceNodeId: relationship.nodeId,
              edgeId: relationship.relationshipId,
            },
          })}
      />
    {/each}
  </ul>
</InspectorSection>

<style>
  ul {
    display: grid;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }
</style>
