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
  import type { InspectorDeclarationSummary } from './inspectorSummary';

  export let sourceNodeId: string;
  export let declarations: readonly InspectorDeclarationSummary[];
  export let onCenterNode: (request: NodeCenterRequest) => void;
  export let resetKey = sourceNodeId;

  let query = '';
  let visibleLimit = INSPECTOR_CHILD_PAGE_SIZE;
  let observedResetKey = '';

  $: if (resetKey !== observedResetKey) {
    observedResetKey = resetKey;
    query = '';
    visibleLimit = INSPECTOR_CHILD_PAGE_SIZE;
  }
  $: filterEnabled = declarations.length >= INSPECTOR_CHILD_FILTER_THRESHOLD;
  $: presentation = buildInspectorChildFilterPresentation(
    declarations,
    query,
    visibleLimit,
    'declarations',
    (declaration) => [
      declaration.displayName,
      formatSchemaNodeKind(declaration.kind),
      declaration.relationshipLabel,
    ],
  );

  function updateQuery(nextQuery: string): void {
    query = nextQuery;
    visibleLimit = INSPECTOR_CHILD_PAGE_SIZE;
  }
</script>

<InspectorSection title="Declarations">
  {#if filterEnabled}
    <InspectorListFilter
      accessibleName="Filter declarations"
      {query}
      status={presentation.status}
      emptyMessage={presentation.emptyMessage}
      remainingCount={presentation.remainingCount}
      onQueryChange={updateQuery}
      onShowMore={() => (visibleLimit += INSPECTOR_CHILD_PAGE_SIZE)}
    />
  {/if}
  <ol aria-label="Global declarations">
    {#each filterEnabled ? presentation.rows : declarations as declaration (declaration.relationshipId)}
      <InspectorNodeRow
        primary={declaration.displayName}
        secondary={formatSchemaNodeKind(declaration.kind)}
        accessibleName={`Center ${declaration.displayName}, ${declaration.relationshipLabel}`}
        onActivate={() =>
          onCenterNode({
            targetNodeId: declaration.nodeId,
            relationshipContext: {
              kind: 'outgoing-structural',
              sourceNodeId,
              edgeId: declaration.relationshipId,
            },
          })}
      />
    {/each}
  </ol>
</InspectorSection>

<style>
  ol {
    display: grid;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }
</style>
