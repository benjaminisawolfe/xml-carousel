<script lang="ts">
  import type { NodeCenterRequest } from '../../app/stores/navigationCentering';
  import { formatSchemaNodeKind } from '../carousel/nodePresentation';
  import InspectorNodeRow from './InspectorNodeRow.svelte';
  import InspectorSection from './InspectorSection.svelte';
  import type { InspectorOutgoingRelationshipSummary } from './inspectorSummary';

  export let sourceNodeId: string;
  export let relationships: readonly InspectorOutgoingRelationshipSummary[];
  export let showNodeKinds: boolean;
  export let onCenterNode: (request: NodeCenterRequest) => void;
</script>

<InspectorSection title="Related definitions">
  <ul aria-label="Outgoing related definitions">
    {#each relationships as relationship (relationship.relationshipId)}
      <InspectorNodeRow
        primary={relationship.displayName}
        secondary={`${relationship.relationshipLabel}${
          relationship.terminalLabel ? ` — ${relationship.terminalLabel}` : ''
        }${
          showNodeKinds ? ` · ${formatSchemaNodeKind(relationship.kind)}` : ''
        }`}
        accessibleName={relationship.disposition === 'terminalCycleClosure'
          ? undefined
          : `Follow ${relationship.relationshipLabel} to ${relationship.displayName}, ${formatSchemaNodeKind(relationship.kind)}`}
        isTerminalCycleClosure={relationship.disposition ===
          'terminalCycleClosure'}
        onActivate={relationship.disposition === 'terminalCycleClosure'
          ? undefined
          : () =>
              onCenterNode({
                targetNodeId: relationship.nodeId,
                relationshipContext: {
                  kind: 'outgoing-structural',
                  sourceNodeId,
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
