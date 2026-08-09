<script lang="ts">
  import type { NodeCenterRequest } from '../../app/stores/navigationCentering';
  import InspectorHeader from './InspectorHeader.svelte';
  import NodeAppInfo from './NodeAppInfo.svelte';
  import NodeAttributes from './NodeAttributes.svelte';
  import NodeComments from './NodeComments.svelte';
  import NodeDeclarations from './NodeDeclarations.svelte';
  import NodeDocumentation from './NodeDocumentation.svelte';
  import NodeEnumerationValues from './NodeEnumerationValues.svelte';
  import NodeOverview from './NodeOverview.svelte';
  import NodeRelationships from './NodeRelationships.svelte';
  import NodeRelatedDefinitions from './NodeRelatedDefinitions.svelte';
  import NodeStructure from './NodeStructure.svelte';
  import NodeSummaryCopyAction from './NodeSummaryCopyAction.svelte';
  import NodeUnresolvedReferences from './NodeUnresolvedReferences.svelte';
  import type { InspectorSummary } from './inspectorSummary';
  import { formatSchemaNodeKind } from '../carousel/nodePresentation';
  import { schemaNodeReachability } from '../presentation/schemaReachability';
  import type { SourceViewPresentation } from '../presentation/sourceMarkupPresentation';
  import SourceOrientation from '../source/SourceOrientation.svelte';

  export let summary: InspectorSummary;
  export let isCurrentFocus: boolean;
  export let onCenter: () => void;
  export let onCenterNode: (request: NodeCenterRequest) => void;
  export let onClose: () => void;
  export let childListResetKey = summary.nodeId;
  export let sourcePresentation: SourceViewPresentation | undefined = undefined;
  export let nodeSummaryText: string | undefined = undefined;
  export let nodeSummaryTargetKey = childListResetKey;
  export let onViewSource: (origin: HTMLButtonElement) => void = () => {};

  $: overviewProperties = summary.overviewProperties.filter(
    ({ id }) => id !== 'source-file',
  );
</script>

<div class="node-inspector" data-node-inspector>
  <InspectorHeader
    nodeName={summary.displayName}
    nodeKindLabel={formatSchemaNodeKind(summary.kind)}
    sourceFilename={sourcePresentation?.sourceIdentity?.label}
    showCenterAction={!isCurrentFocus &&
      schemaNodeReachability(summary.kind).carousel.action === 'center'}
    {onCenter}
    {onClose}
  />

  <div class="inspector-content" data-inspector-scroll-body>
    <NodeSummaryCopyAction
      summaryText={nodeSummaryText}
      targetKey={nodeSummaryTargetKey}
    />
    {#if sourcePresentation && (sourcePresentation.sourceIdentity || sourcePresentation.sourceAvailable)}
      <SourceOrientation
        presentation={sourcePresentation}
        {onViewSource}
        compact
      />
    {/if}
    {#if overviewProperties.length > 0}
      <NodeOverview properties={overviewProperties} />
    {/if}
    <NodeUnresolvedReferences references={summary.unresolvedReferences} />
    {#if summary.isSchemaOverview}
      {#if summary.declarations.length > 0}
        <NodeDeclarations
          sourceNodeId={summary.nodeId}
          declarations={summary.declarations}
          resetKey={childListResetKey}
          {onCenterNode}
        />
      {/if}
      {#if summary.globalAttributes.length > 0}
        <NodeAttributes
          attributes={summary.globalAttributes}
          title="Global attributes"
        />
      {/if}
    {:else}
      <NodeStructure
        {summary}
        showNodeKinds={summary.showRelatedNodeKinds}
        resetKey={childListResetKey}
        {onCenterNode}
      />
    {/if}
    {#if summary.attributes.length > 0}
      <NodeAttributes attributes={summary.attributes} />
    {/if}
    {#if summary.relatedDefinitions.length > 0}
      <NodeRelatedDefinitions
        sourceNodeId={summary.nodeId}
        relationships={summary.relatedDefinitions}
        showNodeKinds={summary.showRelatedNodeKinds}
        {onCenterNode}
      />
    {/if}
    {#if summary.enumerationValues.length > 0}
      <NodeEnumerationValues values={summary.enumerationValues} />
    {/if}
    {#if summary.documentation.length > 0}
      <NodeDocumentation documentation={summary.documentation} />
    {/if}
    {#if summary.appInfo.length > 0}
      <NodeAppInfo appInfo={summary.appInfo} />
    {/if}
    {#if summary.comments.length > 0}
      <NodeComments comments={summary.comments} />
    {/if}
    {#if summary.incomingRelationships.length > 0}
      <NodeRelationships
        inspectedNodeId={summary.nodeId}
        relationships={summary.incomingRelationships}
        showNodeKinds={summary.showRelatedNodeKinds}
        {onCenterNode}
      />
    {/if}
  </div>
</div>

<style>
  .node-inspector {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    height: 100%;
    min-height: 0;
  }

  .inspector-content {
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: var(--space-5);
  }
</style>
