<script lang="ts">
  import type { NodeCenterRequest } from '../../app/stores/navigationCentering';
  import { formatSchemaNodeKind } from '../carousel/nodePresentation';
  import {
    buildInspectorChildFilterPresentation,
    INSPECTOR_CHILD_FILTER_THRESHOLD,
    INSPECTOR_CHILD_PAGE_SIZE,
  } from '../presentation/inspectorChildFilterPresentation';
  import InspectorListFilter from './InspectorListFilter.svelte';
  import InspectorNodeRow from './InspectorNodeRow.svelte';
  import InspectorSection from './InspectorSection.svelte';
  import type { InspectorSummary } from './inspectorSummary';

  export let summary: Pick<
    InspectorSummary,
    'nodeId' | 'declaration' | 'orderedDestinations' | 'isStructuralLeaf'
  >;
  export let showNodeKinds: boolean;
  export let onCenterNode: (request: NodeCenterRequest) => void;
  export let resetKey = summary.nodeId;

  let query = '';
  let visibleLimit = INSPECTOR_CHILD_PAGE_SIZE;
  let observedResetKey = '';

  $: if (resetKey !== observedResetKey) {
    observedResetKey = resetKey;
    query = '';
    visibleLimit = INSPECTOR_CHILD_PAGE_SIZE;
  }
  $: filterEnabled =
    summary.orderedDestinations.length >= INSPECTOR_CHILD_FILTER_THRESHOLD;
  $: presentation = buildInspectorChildFilterPresentation(
    summary.orderedDestinations,
    query,
    visibleLimit,
    'child structures',
    (destination) => [
      destination.displayName,
      formatSchemaNodeKind(destination.kind),
      destination.relationshipLabel ?? '',
      destination.occurrence,
      destination.terminalLabel ?? '',
    ],
  );

  function updateQuery(nextQuery: string): void {
    query = nextQuery;
    visibleLimit = INSPECTOR_CHILD_PAGE_SIZE;
  }
</script>

<InspectorSection title="Structure">
  {#if summary.declaration}
    <code class="declaration">{summary.declaration}</code>
  {/if}

  {#if summary.orderedDestinations.length > 0}
    {#if filterEnabled}
      <InspectorListFilter
        accessibleName="Filter child structures"
        {query}
        status={presentation.status}
        emptyMessage={presentation.emptyMessage}
        remainingCount={presentation.remainingCount}
        onQueryChange={updateQuery}
        onShowMore={() => (visibleLimit += INSPECTOR_CHILD_PAGE_SIZE)}
      />
    {/if}
    <ol aria-label="Ordered child structures">
      {#each filterEnabled ? presentation.rows : summary.orderedDestinations as destination (destination.relationshipId)}
        <InspectorNodeRow
          primary={`${destination.displayName}${destination.occurrence}`}
          secondary={destination.disposition === 'terminalCycleClosure'
            ? `${destination.relationshipLabel} — ${destination.terminalLabel}`
            : destination.relationshipLabel === 'Restriction'
              ? showNodeKinds
                ? `Restriction · ${formatSchemaNodeKind(destination.kind)}`
                : 'Restriction'
              : showNodeKinds
                ? formatSchemaNodeKind(destination.kind)
                : undefined}
          accessibleName={destination.disposition === 'terminalCycleClosure'
            ? undefined
            : destination.relationshipLabel === 'Restriction'
              ? `Follow Restriction to ${destination.displayName}`
              : `Center ${destination.displayName}${destination.occurrence}`}
          isTerminalCycleClosure={destination.disposition ===
            'terminalCycleClosure'}
          onActivate={destination.disposition === 'terminalCycleClosure'
            ? undefined
            : () =>
                onCenterNode({
                  targetNodeId: destination.nodeId,
                  relationshipContext: {
                    kind: 'outgoing-structural',
                    sourceNodeId: summary.nodeId,
                    edgeId: destination.relationshipId,
                  },
                })}
        />
      {/each}
    </ol>
  {:else if summary.isStructuralLeaf}
    <p data-inspector-leaf-state>No child structures</p>
  {/if}
</InspectorSection>

<style>
  .declaration {
    display: block;
    margin-bottom: var(--space-3);
    overflow-wrap: anywhere;
    color: var(--colour-text-secondary);
    font-family: var(--font-code);
    font-size: var(--font-size-sm);
  }

  ol {
    display: grid;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  p {
    margin: 0;
    color: var(--colour-text-muted);
    font-size: var(--font-size-sm);
  }
</style>
