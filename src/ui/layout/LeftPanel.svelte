<script lang="ts">
  import { tick } from 'svelte';
  import { activeProjectStore } from '../../app/stores/projectStore';
  import {
    getNodesByKind,
    getRootNodes,
    getSchemaNode,
    type SchemaNode,
  } from '../../schema/model';
  import { navigationStore } from '../../app/stores/navigationStore';
  import { inspectorStore } from '../../app/stores/inspectorStore';
  import { projectSessionResetStore } from '../../app/stores/projectSessionResetStore';
  import { formatSchemaNodeKind } from '../carousel/nodePresentation';
  import { selectXsdNavigationGroups } from '../presentation/xsdMetadataPresentation';
  import {
    buildSchemaSetOutlinePresentation,
    type SchemaSetNodePresentation,
    type SchemaSetUnresolvedReferencePresentation,
  } from '../presentation/schemaSetOutlinePresentation';
  import SchemaSetOutline from './SchemaSetOutline.svelte';
  import OutlineSectionHeading from './OutlineSectionHeading.svelte';
  import SchemaOutlineList from './SchemaOutlineList.svelte';
  import type { SchemaOutlineListRow } from '../presentation/schemaOutlineListPresentation';
  import {
    formatReachabilityActionLabel,
    schemaNodeReachability,
  } from '../presentation/schemaReachability';

  export let isOverlayOpen = false;
  export let onRequestClose: (restoreToggleFocus: boolean) => void = () => {};
  export let onOverlayAction: (kind: 'center' | 'inspect') => void = () => {};

  const { currentFocusNodeId } = navigationStore;
  const { inspectedNodeId } = inspectorStore;
  $: dtdElements = getNodesByKind($activeProjectStore.project, 'dtdElement');
  $: dtdElementRows = outlineRows(dtdElements);
  $: dtdAttributeLists = getNodesByKind(
    $activeProjectStore.project,
    'dtdAttributeList',
  );
  $: dtdAttributeListRows = outlineRows(dtdAttributeLists);
  $: dtdRootNodes = getRootNodes($activeProjectStore.project).filter(
    ({ kind }) => kind === 'dtdElement',
  );
  $: dtdRootRows = outlineRows(dtdRootNodes);
  $: dtdAuxiliaryGroups = [
    ['attributes', 'DTD attributes', 'dtdAttribute'],
    ['content-models', 'Content-model structures', 'dtdContentModel'],
    ['name-references', 'DTD element references', 'dtdElementReference'],
    ['general-entities', 'General entities', 'dtdEntity'],
    ['parameter-entities', 'Parameter entities', 'dtdParameterEntity'],
    ['notations', 'Notations', 'dtdNotation'],
    ['conditional-sections', 'Conditional sections', 'dtdConditionalSection'],
    ['comments', 'Comments and source notes', 'dtdComment'],
    [
      'processing-instructions',
      'Processing instructions',
      'dtdProcessingInstruction',
    ],
    ['dependencies', 'External sources and dependencies', 'dtdDependency'],
  ]
    .map(([key, label, kind]) => ({
      key,
      label,
      rows: outlineRows(
        getNodesByKind(
          $activeProjectStore.project,
          kind as Parameters<typeof getNodesByKind>[1],
        ),
      ),
    }))
    .filter(({ rows }) => rows.length > 0);
  $: xsdGroups = selectXsdNavigationGroups(
    $activeProjectStore.project,
    $activeProjectStore.xsdMetadataByNodeId,
  );
  $: documentElementRows = outlineRows(xsdGroups.documentElements, true);
  $: otherGlobalElementRows = outlineRows(xsdGroups.otherGlobalElements, true);
  $: globalElementRows = outlineRows(xsdGroups.globalElements, true);
  $: complexTypeRows = outlineRows(xsdGroups.complexTypes, true);
  $: simpleTypeRows = outlineRows(xsdGroups.simpleTypes, true);
  $: globalAttributeRows = outlineRows(xsdGroups.globalAttributes, true);
  $: modelGroupRows = outlineRows(xsdGroups.modelGroups, true);
  $: attributeGroupRows = outlineRows(xsdGroups.attributeGroups, true);
  $: identityConstraintRows = outlineRows(xsdGroups.identityConstraints, true);
  $: xsdNotationRows = outlineRows(xsdGroups.notations, true);
  $: builtInTypeRows = outlineRows(xsdGroups.builtInTypes, true);
  $: currentSourceFileId = getSchemaNode(
    $activeProjectStore.project,
    $currentFocusNodeId,
  )?.sourceFileId;
  $: packagePresentation =
    $activeProjectStore.origin === 'package' &&
    $activeProjectStore.schemaPackageManifest &&
    $activeProjectStore.schemaPackageSources &&
    $activeProjectStore.schemaPackageEntries &&
    $activeProjectStore.schemaPackageSummary &&
    $activeProjectStore.unresolvedReferences
      ? buildSchemaSetOutlinePresentation({
          archiveFilename:
            $activeProjectStore.schemaPackageManifest?.archiveFilename ??
            $activeProjectStore.sourceFilename,
          project: $activeProjectStore.project,
          manifest: $activeProjectStore.schemaPackageManifest,
          sources: $activeProjectStore.schemaPackageSources,
          entries: $activeProjectStore.schemaPackageEntries,
          summary: $activeProjectStore.schemaPackageSummary,
          unresolvedReferences: $activeProjectStore.unresolvedReferences,
          xsdMetadataByNodeId: $activeProjectStore.xsdMetadataByNodeId,
        })
      : undefined;

  function outlineRows(
    nodes: readonly SchemaNode[],
    beginNewJourney = false,
  ): readonly SchemaOutlineListRow[] {
    return nodes.map((node) => {
      const contract = schemaNodeReachability(node.kind);
      const action =
        contract.navigation.action === 'inspect' ? 'inspect' : 'center';
      return {
        nodeId: node.id,
        displayName: node.name,
        kindLabel: formatSchemaNodeKind(node.kind),
        beginNewJourney,
        activationAction: action,
        activationLabel: formatReachabilityActionLabel(
          action,
          node.name,
          contract.kindLabel,
        ),
      };
    });
  }

  function centerOutlineRow(
    row: SchemaOutlineListRow,
    origin: HTMLButtonElement,
  ): void {
    if (row.activationAction === 'inspect') {
      inspectNode(row.nodeId);
      return;
    }
    void centerNode(row.nodeId, origin, row.beginNewJourney);
  }

  async function centerNode(
    nodeId: string,
    origin: HTMLButtonElement,
    beginNewJourney = false,
  ): Promise<void> {
    const section = origin.closest('section');
    const result = navigationStore.centerNode({
      targetNodeId: nodeId,
      origin: 'navigation',
      beginNewJourney,
    });
    if (!result.applied) return;

    if (isOverlayOpen) {
      onOverlayAction('center');
      return;
    }

    await tick();
    section
      ?.querySelector<HTMLElement>('[data-navigation-current-node]')
      ?.focus({ preventScroll: true });
  }

  function centerSchemaOverview(origin: HTMLButtonElement): void {
    const schemaOverview = xsdGroups.schemaOverview;
    if (schemaOverview) void centerNode(schemaOverview.id, origin, true);
  }

  function centerPackageNode(node: SchemaSetNodePresentation): void {
    const result = navigationStore.centerNode({
      targetNodeId: node.nodeId,
      origin: 'navigation',
      beginNewJourney: node.beginNewJourney,
    });
    if (result.applied && isOverlayOpen) onOverlayAction('center');
  }

  function centerUnresolvedOwner(
    reference: SchemaSetUnresolvedReferencePresentation,
  ): void {
    const result = navigationStore.centerNode({
      targetNodeId: reference.sourceNodeId,
      origin: 'navigation',
      beginNewJourney: false,
    });
    if (result.applied && isOverlayOpen) onOverlayAction('center');
  }

  function inspectNode(nodeId: string): void {
    const result = inspectorStore.inspect(nodeId);
    if (result.applied && isOverlayOpen) onOverlayAction('inspect');
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || !isOverlayOpen) return;
    event.preventDefault();
    event.stopPropagation();
    onRequestClose(true);
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<nav
  id="schema-navigation-panel"
  class:overlay-open={isOverlayOpen}
  class="left-panel"
  aria-label="Schema navigation"
>
  <div class="panel-heading">
    <div>
      <p class="eyebrow">Navigation</p>
      <h2>
        {$activeProjectStore.origin === 'package'
          ? 'Schema package outline'
          : 'Schema outline'}
      </h2>
    </div>
    {#if isOverlayOpen}
      <button
        class="navigation-close"
        type="button"
        data-navigation-close
        onclick={() => onRequestClose(true)}
      >
        Close
      </button>
    {/if}
  </div>

  {#if packagePresentation}
    <SchemaSetOutline
      projectId={$activeProjectStore.project.id}
      projectRevision={$projectSessionResetStore.revision}
      presentation={packagePresentation}
      currentFocusNodeId={$currentFocusNodeId}
      inspectedNodeId={$inspectedNodeId}
      {currentSourceFileId}
      onCenterNode={centerPackageNode}
      onInspectNode={inspectNode}
      onCenterUnresolvedOwner={centerUnresolvedOwner}
    />
  {:else}
    <div class="panel-content">
      <section>
        <OutlineSectionHeading label="Schema files" count={1} />
        <p>{$activeProjectStore.sourceFilename || 'No source file'}</p>
      </section>

      {#if dtdRootNodes.length > 0 && dtdElements.length < 50}
        <section>
          <OutlineSectionHeading
            label="Root elements"
            count={dtdRootRows.length}
          />
          <SchemaOutlineList
            groupId={`${$activeProjectStore.project.id}:root-elements`}
            label="root elements"
            rows={dtdRootRows}
            currentFocusNodeId={$currentFocusNodeId}
            inspectedNodeId={$inspectedNodeId}
            onCenterNode={centerOutlineRow}
            includeKindInCenterName={false}
          />
        </section>
      {/if}

      {#if xsdGroups.schemaOverview}
        <section aria-labelledby="schema-overview-heading">
          <OutlineSectionHeading
            id="schema-overview-heading"
            label="Schema overview"
            count={1}
          />
          <ul class="schema-list compact-list">
            <li>
              {#if xsdGroups.schemaOverview.id === $currentFocusNodeId}
                <span
                  aria-current="true"
                  data-navigation-current-node
                  tabindex="-1">Overview</span
                >
              {:else}
                <button
                  type="button"
                  aria-label="Center Schema overview"
                  onclick={(event) => centerSchemaOverview(event.currentTarget)}
                >
                  Overview
                </button>
              {/if}
            </li>
          </ul>
        </section>
      {/if}

      {#if xsdGroups.documentElements.length > 0}
        <section aria-labelledby="document-elements-heading">
          <OutlineSectionHeading
            id="document-elements-heading"
            label="Document elements"
            count={documentElementRows.length}
          />
          <SchemaOutlineList
            groupId={`${$activeProjectStore.project.id}:document-elements`}
            label="document elements"
            rows={documentElementRows}
            currentFocusNodeId={$currentFocusNodeId}
            inspectedNodeId={$inspectedNodeId}
            onCenterNode={centerOutlineRow}
          />
        </section>
      {/if}

      {#if xsdGroups.otherGlobalElements.length > 0}
        <section aria-labelledby="other-global-elements-heading">
          <OutlineSectionHeading
            id="other-global-elements-heading"
            label="Other global elements"
            count={otherGlobalElementRows.length}
          />
          <SchemaOutlineList
            groupId={`${$activeProjectStore.project.id}:other-global-elements`}
            label="other global elements"
            rows={otherGlobalElementRows}
            currentFocusNodeId={$currentFocusNodeId}
            inspectedNodeId={$inspectedNodeId}
            onCenterNode={centerOutlineRow}
            includeKindInCenterName={false}
          />
        </section>
      {/if}

      {#if xsdGroups.globalElements.length > 0}
        <section aria-labelledby="global-elements-heading">
          <OutlineSectionHeading
            id="global-elements-heading"
            label="Global elements"
            count={globalElementRows.length}
          />
          <SchemaOutlineList
            groupId={`${$activeProjectStore.project.id}:global-elements`}
            label="global elements"
            rows={globalElementRows}
            currentFocusNodeId={$currentFocusNodeId}
            inspectedNodeId={$inspectedNodeId}
            onCenterNode={centerOutlineRow}
          />
        </section>
      {/if}

      {#if dtdElements.length > 0}
        <section aria-labelledby="dtd-elements-heading">
          <OutlineSectionHeading
            id="dtd-elements-heading"
            label="DTD elements"
            count={dtdElementRows.length}
          />
          <SchemaOutlineList
            groupId={`${$activeProjectStore.project.id}:dtd-elements`}
            label="DTD elements"
            rows={dtdElementRows}
            currentFocusNodeId={$currentFocusNodeId}
            inspectedNodeId={$inspectedNodeId}
            onCenterNode={centerOutlineRow}
            includeKindInCenterName={false}
          />
        </section>
      {/if}

      {#if dtdAttributeLists.length > 0}
        <section aria-labelledby="dtd-attribute-lists-heading">
          <OutlineSectionHeading
            id="dtd-attribute-lists-heading"
            label="DTD attribute lists"
            count={dtdAttributeListRows.length}
          />
          <SchemaOutlineList
            groupId={`${$activeProjectStore.project.id}:dtd-attribute-lists`}
            label="DTD attribute lists"
            rows={dtdAttributeListRows}
            currentFocusNodeId={$currentFocusNodeId}
            inspectedNodeId={$inspectedNodeId}
            onCenterNode={centerOutlineRow}
            includeKindInCenterName={false}
          />
        </section>
      {/if}

      {#each dtdAuxiliaryGroups as group (group.key)}
        <section aria-labelledby={`dtd-${group.key}-heading`}>
          <OutlineSectionHeading
            id={`dtd-${group.key}-heading`}
            label={group.label}
            count={group.rows.length}
          />
          <SchemaOutlineList
            groupId={`${$activeProjectStore.project.id}:dtd-${group.key}`}
            label={group.label}
            rows={group.rows}
            currentFocusNodeId={$currentFocusNodeId}
            inspectedNodeId={$inspectedNodeId}
            onCenterNode={centerOutlineRow}
          />
        </section>
      {/each}

      {#if xsdGroups.complexTypes.length > 0}
        <section aria-labelledby="complex-types-heading">
          <OutlineSectionHeading
            id="complex-types-heading"
            label="Complex types"
            count={complexTypeRows.length}
          />
          <SchemaOutlineList
            groupId={`${$activeProjectStore.project.id}:complex-types`}
            label="complex types"
            rows={complexTypeRows}
            currentFocusNodeId={$currentFocusNodeId}
            inspectedNodeId={$inspectedNodeId}
            onCenterNode={centerOutlineRow}
          />
        </section>
      {/if}

      {#if xsdGroups.simpleTypes.length > 0}
        <section aria-labelledby="simple-types-heading">
          <OutlineSectionHeading
            id="simple-types-heading"
            label="Simple types"
            count={simpleTypeRows.length}
          />
          <SchemaOutlineList
            groupId={`${$activeProjectStore.project.id}:simple-types`}
            label="simple types"
            rows={simpleTypeRows}
            currentFocusNodeId={$currentFocusNodeId}
            inspectedNodeId={$inspectedNodeId}
            onCenterNode={centerOutlineRow}
          />
        </section>
      {/if}

      {#if xsdGroups.globalAttributes.length > 0}
        <section aria-labelledby="global-attributes-heading">
          <OutlineSectionHeading
            id="global-attributes-heading"
            label="Global attributes"
            count={globalAttributeRows.length}
          />
          <SchemaOutlineList
            groupId={`${$activeProjectStore.project.id}:global-attributes`}
            label="global attributes"
            rows={globalAttributeRows}
            currentFocusNodeId={$currentFocusNodeId}
            inspectedNodeId={$inspectedNodeId}
            onCenterNode={centerOutlineRow}
          />
        </section>
      {/if}

      {#if xsdGroups.modelGroups.length > 0}
        <section aria-labelledby="model-groups-heading">
          <OutlineSectionHeading
            id="model-groups-heading"
            label="Model groups"
            count={modelGroupRows.length}
          />
          <SchemaOutlineList
            groupId={`${$activeProjectStore.project.id}:model-groups`}
            label="model groups"
            rows={modelGroupRows}
            currentFocusNodeId={$currentFocusNodeId}
            inspectedNodeId={$inspectedNodeId}
            onCenterNode={centerOutlineRow}
          />
        </section>
      {/if}

      {#if xsdGroups.attributeGroups.length > 0}
        <section aria-labelledby="attribute-groups-heading">
          <OutlineSectionHeading
            id="attribute-groups-heading"
            label="Attribute groups"
            count={attributeGroupRows.length}
          />
          <SchemaOutlineList
            groupId={`${$activeProjectStore.project.id}:attribute-groups`}
            label="attribute groups"
            rows={attributeGroupRows}
            currentFocusNodeId={$currentFocusNodeId}
            inspectedNodeId={$inspectedNodeId}
            onCenterNode={centerOutlineRow}
          />
        </section>
      {/if}

      {#if xsdGroups.identityConstraints.length > 0}
        <section aria-labelledby="identity-constraints-heading">
          <OutlineSectionHeading
            id="identity-constraints-heading"
            label="Identity constraints"
            count={identityConstraintRows.length}
          />
          <SchemaOutlineList
            groupId={`${$activeProjectStore.project.id}:identity-constraints`}
            label="identity constraints"
            rows={identityConstraintRows}
            currentFocusNodeId={$currentFocusNodeId}
            inspectedNodeId={$inspectedNodeId}
            onCenterNode={centerOutlineRow}
          />
        </section>
      {/if}

      {#if xsdGroups.notations.length > 0}
        <section aria-labelledby="xsd-notations-heading">
          <OutlineSectionHeading
            id="xsd-notations-heading"
            label="XSD notations"
            count={xsdNotationRows.length}
          />
          <SchemaOutlineList
            groupId={`${$activeProjectStore.project.id}:xsd-notations`}
            label="XSD notations"
            rows={xsdNotationRows}
            currentFocusNodeId={$currentFocusNodeId}
            inspectedNodeId={$inspectedNodeId}
            onCenterNode={centerOutlineRow}
          />
        </section>
      {/if}

      {#if xsdGroups.builtInTypes.length > 0}
        <section aria-labelledby="built-in-types-heading">
          <OutlineSectionHeading
            id="built-in-types-heading"
            label="Built-in type references"
            count={builtInTypeRows.length}
          />
          <SchemaOutlineList
            groupId={`${$activeProjectStore.project.id}:built-in-types`}
            label="built-in type references"
            rows={builtInTypeRows}
            currentFocusNodeId={$currentFocusNodeId}
            inspectedNodeId={$inspectedNodeId}
            onCenterNode={centerOutlineRow}
          />
        </section>
      {/if}

      <section>
        <OutlineSectionHeading label="Recent paths" />
        <p>Your recent navigation paths will appear here.</p>
      </section>
    </div>
  {/if}
</nav>

<style>
  .left-panel {
    grid-area: left;
    min-width: 0;
    min-height: 0;
    overflow-y: auto;
    border-right: 1px solid var(--colour-border);
    background: var(--colour-panel);
  }

  .panel-heading {
    display: flex;
    min-height: var(--panel-header-height);
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-4) var(--space-5);
    border-bottom: 1px solid var(--colour-border-subtle);
  }

  .navigation-close {
    min-width: var(--control-min-size);
    min-height: var(--control-min-size);
    padding: 0 var(--space-3);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-medium);
    background: var(--colour-panel-subtle);
    color: var(--colour-text);
    font-weight: 700;
    cursor: pointer;
  }

  .eyebrow {
    margin-bottom: var(--space-1);
    color: var(--colour-text-muted);
    font-size: var(--font-size-xs);
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  h2 {
    margin: 0;
    font-size: var(--font-size-lg);
    line-height: 1.25;
  }

  .panel-content {
    padding: var(--space-2) var(--space-5) var(--space-6);
  }

  section {
    padding: var(--space-5) 0;
    border-bottom: 1px solid var(--colour-border-subtle);
  }

  section:last-child {
    border-bottom: 0;
  }

  section p {
    margin-bottom: 0;
    color: var(--colour-text-muted);
    font-size: var(--font-size-sm);
    line-height: 1.55;
  }

  .schema-list {
    display: grid;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .schema-list li {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-3);
    min-width: 0;
    padding: 0;
    color: var(--colour-text-secondary);
    font-size: var(--font-size-sm);
  }

  .compact-list li {
    color: var(--colour-text);
    font-weight: 600;
  }

  .schema-list button {
    min-width: var(--control-min-size);
    flex: 1 1 auto;
    min-height: var(--control-min-size);
    padding: var(--space-2);
    border: 0;
    border-radius: var(--radius-medium);
    background: transparent;
    color: var(--colour-accent);
    font: inherit;
    font-weight: 700;
    text-align: left;
    overflow-wrap: anywhere;
    cursor: pointer;
  }

  .schema-list button:hover {
    background: var(--colour-accent-soft);
  }

  .schema-list button:active {
    background: var(--colour-border-subtle);
  }

  .schema-list [aria-current='true'] {
    min-width: 0;
    padding: var(--space-2);
    border-radius: var(--radius-medium);
    background: var(--colour-accent-soft);
    box-shadow: inset 3px 0 0 var(--colour-accent);
    color: var(--colour-text);
    font-weight: 700;
    overflow-wrap: anywhere;
  }

  @media (max-width: 1279px) {
    .left-panel {
      position: fixed;
      z-index: 25;
      top: var(--top-bar-height);
      bottom: 0;
      left: 0;
      display: none;
      width: min(92vw, var(--left-panel-width));
      max-width: 92vw;
      overscroll-behavior: contain;
      border-top: 1px solid var(--colour-border);
      box-shadow: var(--shadow-medium);
    }

    .left-panel.overlay-open {
      display: block;
    }
  }
</style>
