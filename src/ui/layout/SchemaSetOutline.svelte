<script lang="ts">
  import type {
    SchemaSetNodePresentation,
    SchemaSetOutlinePresentation,
    SchemaSetUnresolvedReferencePresentation,
  } from '../presentation/schemaSetOutlinePresentation';
  import {
    formatPackageEntryBytes,
    formatPackageEntryKind,
    formatPackageStandardsStatus,
    formatPackageVisualizationStatus,
  } from '../presentation/schemaSetOutlinePresentation';
  import SchemaOutlineList from './SchemaOutlineList.svelte';
  import OutlineSectionHeading from './OutlineSectionHeading.svelte';

  export let projectId: string;
  export let projectRevision = 0;
  export let presentation: SchemaSetOutlinePresentation;
  export let currentFocusNodeId: string | undefined = undefined;
  export let inspectedNodeId: string | undefined = undefined;
  export let currentSourceFileId: string | undefined = undefined;
  export let onCenterNode: (node: SchemaSetNodePresentation) => void;
  export let onInspectNode: (nodeId: string) => void;
  export let onCenterUnresolvedOwner: (
    reference: SchemaSetUnresolvedReferencePresentation,
  ) => void;

  type PackageSectionId =
    'rootCandidates' | 'schemaSources' | 'ignoredEntries' | 'directories';

  type PackageDisclosureState = Record<PackageSectionId, boolean>;

  const entryGroupDisclosureIds: Partial<
    Record<
      SchemaSetOutlinePresentation['entryGroups'][number]['id'],
      PackageSectionId
    >
  > = {
    'schema-sources': 'schemaSources',
    'ignored-entries': 'ignoredEntries',
    directories: 'directories',
  };

  let trackedProjectId: string | undefined;
  let trackedProjectRevision: number | undefined;
  let trackedFocusSourceId: string | undefined;
  let expandedSourceIds: string[] = [];
  let openedSourceEntryIds: string[] = [];
  let packageDisclosureState = defaultPackageDisclosureState();

  $: synchronizeExpansion(
    projectId,
    projectRevision,
    presentation.sources[0]?.sourceFileId,
    currentSourceFileId,
  );

  function synchronizeExpansion(
    nextProjectId: string,
    nextProjectRevision: number,
    firstSourceId: string | undefined,
    focusSourceId: string | undefined,
  ): void {
    if (
      trackedProjectId !== nextProjectId ||
      trackedProjectRevision !== nextProjectRevision
    ) {
      trackedProjectId = nextProjectId;
      trackedProjectRevision = nextProjectRevision;
      trackedFocusSourceId = focusSourceId;
      openedSourceEntryIds = [];
      packageDisclosureState = defaultPackageDisclosureState();
      expandedSourceIds = [firstSourceId, focusSourceId].filter(
        (value, index, values): value is string =>
          Boolean(value) && values.indexOf(value) === index,
      );
      return;
    }

    if (trackedFocusSourceId !== focusSourceId) {
      trackedFocusSourceId = focusSourceId;
      if (focusSourceId && !expandedSourceIds.includes(focusSourceId)) {
        expandedSourceIds = [...expandedSourceIds, focusSourceId];
      }
    }
  }

  function defaultPackageDisclosureState(): PackageDisclosureState {
    return {
      rootCandidates: false,
      schemaSources: false,
      ignoredEntries: false,
      directories: false,
    };
  }

  function packageSectionDomId(
    sectionId: PackageSectionId,
    part: 'heading' | 'panel',
  ): string {
    const sectionName = sectionId.replace(
      /[A-Z]/gu,
      (letter) => `-${letter.toLocaleLowerCase()}`,
    );
    return `${projectId}-package-${sectionName}-${part}`;
  }

  function packageSectionLabel(label: string, count: number): string {
    return `${label}, ${count} ${count === 1 ? 'item' : 'items'}`;
  }

  function togglePackageSection(sectionId: PackageSectionId): void {
    packageDisclosureState = {
      ...packageDisclosureState,
      [sectionId]: !packageDisclosureState[sectionId],
    };
  }

  function toggleSource(sourceFileId: string): void {
    expandedSourceIds = expandedSourceIds.includes(sourceFileId)
      ? expandedSourceIds.filter((id) => id !== sourceFileId)
      : [...expandedSourceIds, sourceFileId];
  }

  function toggleEntrySource(entryId: string, event: Event): void {
    const open = (event.currentTarget as HTMLDetailsElement).open;
    openedSourceEntryIds = open
      ? [...new Set([...openedSourceEntryIds, entryId])]
      : openedSourceEntryIds.filter((id) => id !== entryId);
  }
</script>

<div class="package-summary">
  <h3>Package summary</h3>
  <strong>{presentation.archiveFilename}</strong>
  <span>{presentation.packageType} · {presentation.packageId}</span>
  <span>{presentation.statusText}</span>
  <dl>
    <div>
      <dt>All entries</dt>
      <dd>{presentation.summary.entryCount}</dd>
    </div>
    <div>
      <dt>Schema sources</dt>
      <dd>{presentation.summary.schemaSourceCount}</dd>
    </div>
    <div>
      <dt>XSD sources</dt>
      <dd>{presentation.summary.xsdSourceCount}</dd>
    </div>
    <div>
      <dt>DTD sources</dt>
      <dd>{presentation.summary.dtdSourceCount}</dd>
    </div>
    <div>
      <dt>Auxiliary entries</dt>
      <dd>{presentation.summary.auxiliaryCount}</dd>
    </div>
    <div>
      <dt>Ignored entries</dt>
      <dd>{presentation.summary.ignoredCount}</dd>
    </div>
    <div>
      <dt>Directories</dt>
      <dd>{presentation.summary.directoryCount}</dd>
    </div>
    <div>
      <dt>Blocked relationships</dt>
      <dd>{presentation.summary.blockedCount}</dd>
    </div>
    <div>
      <dt>Root candidates</dt>
      <dd>{presentation.summary.rootCandidateCount}</dd>
    </div>
    <div>
      <dt>Complete files</dt>
      <dd>{presentation.summary.completeFileCount}</dd>
    </div>
    <div>
      <dt>Zero-node sources</dt>
      <dd>{presentation.summary.zeroNodeSourceCount}</dd>
    </div>
    <div>
      <dt>Unresolved relationships</dt>
      <dd>{presentation.summary.unresolvedRelationshipCount}</dd>
    </div>
  </dl>
  <p><strong>Package root:</strong> <code>{presentation.packageRoot}</code></p>
  <p><strong>Common root:</strong> <code>{presentation.commonRoot}</code></p>
  {#if presentation.rootCandidates.length > 0}
    <section
      class="root-candidates package-disclosure-section"
      aria-labelledby={packageSectionDomId('rootCandidates', 'heading')}
    >
      <h4 id={packageSectionDomId('rootCandidates', 'heading')}>
        <button
          class="package-section-toggle"
          type="button"
          aria-label={packageSectionLabel(
            'Root schema candidates',
            presentation.rootCandidates.length,
          )}
          aria-expanded={packageDisclosureState.rootCandidates}
          aria-controls={packageSectionDomId('rootCandidates', 'panel')}
          data-package-section="root-candidates"
          onclick={() => togglePackageSection('rootCandidates')}
        >
          <span class="package-section-label">Root schema candidates</span>
          <span class="package-section-count" aria-hidden="true">
            {presentation.rootCandidates.length}
          </span>
          <span class="disclosure-chevron" aria-hidden="true"></span>
        </button>
      </h4>
      <div
        class="package-section-panel"
        id={packageSectionDomId('rootCandidates', 'panel')}
        hidden={!packageDisclosureState.rootCandidates}
      >
        <ul>
          {#each presentation.rootCandidates as entry (entry.id)}
            <li class="root-candidate-card">
              <code class="root-candidate-path"
                >{entry.packageRelativePath}</code
              >
              <p class="root-candidate-reason">{entry.rootCandidateReason}</p>
            </li>
          {/each}
        </ul>
      </div>
    </section>
  {/if}
  {#if presentation.unresolvedReferenceCount > 0}
    <span class="warning-count">
      {presentation.unresolvedReferenceCount} unresolved
      {presentation.unresolvedReferenceCount === 1 ? 'reference' : 'references'}
      {presentation.unresolvedReferenceCount === 1 ? 'remains' : 'remain'}
    </span>
    <p>
      The package loaded successfully. Unresolved references remain available
      for review.
    </p>
  {/if}
</div>

<div class="package-inventory">
  <h3>Complete package inventory</h3>
  <p>
    {presentation.summary.entryCount} supplied entries, in deterministic path order.
  </p>
  {#each presentation.entryGroups as group (group.id)}
    {@const disclosureId = entryGroupDisclosureIds[group.id]}
    {@const headingId = disclosureId
      ? packageSectionDomId(disclosureId, 'heading')
      : `${projectId}-package-entry-group-${group.id}`}
    <section
      class:package-disclosure-section={disclosureId !== undefined}
      aria-labelledby={headingId}
    >
      <h4 id={headingId}>
        {#if disclosureId}
          <button
            class="package-section-toggle"
            type="button"
            aria-label={packageSectionLabel(group.label, group.entries.length)}
            aria-expanded={packageDisclosureState[disclosureId]}
            aria-controls={packageSectionDomId(disclosureId, 'panel')}
            data-package-section={group.id}
            onclick={() => togglePackageSection(disclosureId)}
          >
            <span class="package-section-label">{group.label}</span>
            <span class="package-section-count" aria-hidden="true">
              {group.entries.length}
            </span>
            <span class="disclosure-chevron" aria-hidden="true"></span>
          </button>
        {:else}
          {group.label} ({group.entries.length})
        {/if}
      </h4>
      <div
        class="entry-list"
        class:package-section-panel={disclosureId !== undefined}
        id={disclosureId
          ? packageSectionDomId(disclosureId, 'panel')
          : undefined}
        hidden={disclosureId
          ? !packageDisclosureState[disclosureId]
          : undefined}
      >
        {#each group.entries as entry (entry.id)}
          <details class="package-entry" data-package-entry-id={entry.id}>
            <summary>
              <span class="entry-path">{entry.archivePath}</span>
              <span class="entry-summary-status">
                {formatPackageEntryKind(entry.kind)} · {formatPackageVisualizationStatus(
                  entry.visualizationStatus,
                )}
              </span>
            </summary>
            <div class="entry-details">
              <p class="entry-classification">{entry.classificationReason}</p>
              <dl class="package-entry-metadata">
                <div>
                  <dt>Archive path</dt>
                  <dd><code>{entry.archivePath}</code></dd>
                </div>
                <div>
                  <dt>Normalized project path</dt>
                  <dd><code>{entry.normalizedPath}</code></dd>
                </div>
                <div>
                  <dt>Path relative to project root</dt>
                  <dd><code>{entry.packageRelativePath}</code></dd>
                </div>
                <div>
                  <dt>Entry kind</dt>
                  <dd>{formatPackageEntryKind(entry.kind)}</dd>
                </div>
                <div>
                  <dt>Size</dt>
                  <dd>{formatPackageEntryBytes(entry.byteLength)}</dd>
                </div>
                {#if entry.compressedByteLength !== undefined}
                  <div>
                    <dt>Compressed size</dt>
                    <dd>
                      {formatPackageEntryBytes(entry.compressedByteLength)}
                    </dd>
                  </div>
                {/if}
                <div>
                  <dt>Original ZIP order</dt>
                  <dd>{entry.originalOrder + 1}</dd>
                </div>
                <div>
                  <dt>Deterministic order</dt>
                  <dd>{entry.deterministicOrder + 1}</dd>
                </div>
                <div>
                  <dt>Text state</dt>
                  <dd>{entry.textStatus}</dd>
                </div>
                <div>
                  <dt>Standards status</dt>
                  <dd>{formatPackageStandardsStatus(entry.standardsStatus)}</dd>
                </div>
                <div>
                  <dt>Visualization status</dt>
                  <dd>
                    {formatPackageVisualizationStatus(
                      entry.visualizationStatus,
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Normalized nodes</dt>
                  <dd>{entry.nodeCount}</dd>
                </div>
                <div>
                  <dt>Search documents</dt>
                  <dd>{entry.searchDocumentCount}</dd>
                </div>
                <div>
                  <dt>Source-markup records</dt>
                  <dd>{entry.sourceMarkupCount}</dd>
                </div>
                <div>
                  <dt>Dependencies</dt>
                  <dd>{entry.dependencyCount}</dd>
                </div>
                <div>
                  <dt>Dependents</dt>
                  <dd>{entry.dependentCount}</dd>
                </div>
                <div>
                  <dt>Missing relationships</dt>
                  <dd>{entry.unresolvedRelationshipCount}</dd>
                </div>
                <div>
                  <dt>Blocked relationships</dt>
                  <dd>{entry.blockedRelationshipCount}</dd>
                </div>
                <div>
                  <dt>Root candidate</dt>
                  <dd>
                    {entry.rootCandidate ? entry.rootCandidateReason : 'No'}
                  </dd>
                </div>
                <div>
                  <dt>Selected entry</dt>
                  <dd>{entry.selectedEntry ? 'Yes' : 'No'}</dd>
                </div>
                <div>
                  <dt>Shared dependency</dt>
                  <dd>{entry.sharedDependency ? 'Yes' : 'No'}</dd>
                </div>
              </dl>

              {#if entry.dependencies.length > 0}
                <div class="relationships">
                  <strong>Dependencies</strong>
                  <ul>
                    {#each entry.dependencies as relationship (relationship.id)}
                      <li>
                        <span>{relationship.kind} · {relationship.status}</span>
                        <code
                          >{relationship.sourcePath} → {relationship.targetPath ??
                            relationship.rawTarget}</code
                        >
                      </li>
                    {/each}
                  </ul>
                </div>
              {/if}
              {#if entry.dependents.length > 0}
                <div class="relationships">
                  <strong>Dependents</strong>
                  <ul>
                    {#each entry.dependents as relationship (relationship.id)}
                      <li>
                        <span>{relationship.kind} · {relationship.status}</span>
                        <code
                          >{relationship.sourcePath} → {relationship.targetPath ??
                            relationship.rawTarget}</code
                        >
                      </li>
                    {/each}
                  </ul>
                </div>
              {/if}

              {#if entry.sourceViewAvailable && entry.sourceText !== undefined}
                <details
                  class="source-view"
                  ontoggle={(event) => toggleEntrySource(entry.id, event)}
                >
                  <summary>View source: {entry.archivePath}</summary>
                  {#if openedSourceEntryIds.includes(entry.id)}
                    <p>
                      {entry.encoding ?? 'Encoding unavailable'} · escaped text source
                    </p>
                    <pre><code>{entry.sourceText}</code></pre>
                  {/if}
                </details>
              {:else if entry.textStatus === 'binary'}
                <p class="source-unavailable">
                  Binary content is not rendered as text.
                </p>
              {:else}
                <p class="source-unavailable">
                  Source view is not available for this entry.
                </p>
              {/if}
            </div>
          </details>
        {/each}
      </div>
    </section>
  {/each}
</div>

<div class="source-sections">
  <h3>Schema declaration outlines</h3>
  {#each presentation.sources as source (source.sourceFileId)}
    <section class:current-source={source.sourceFileId === currentSourceFileId}>
      <button
        class="source-toggle"
        type="button"
        aria-expanded={expandedSourceIds.includes(source.sourceFileId)}
        onclick={() => toggleSource(source.sourceFileId)}
      >
        <span class="source-name">{source.filename}</span>
        <span class="source-meta">
          {source.formatLabel} · {source.nodeCount}
          {source.nodeCount === 1 ? 'node' : 'nodes'}
          {#if source.unresolvedReferenceCount > 0}
            · {source.unresolvedReferenceCount} unresolved
            {source.unresolvedReferenceCount === 1 ? 'reference' : 'references'}
          {/if}
        </span>
      </button>

      {#if expandedSourceIds.includes(source.sourceFileId)}
        <div class="source-content">
          {#each source.groups as group (group.id)}
            <div class="node-group">
              <OutlineSectionHeading
                label={group.label}
                count={group.nodes.length}
              />
              <SchemaOutlineList
                groupId={`${projectId}:${group.id}`}
                label={group.label.toLocaleLowerCase()}
                rows={group.nodes}
                {currentFocusNodeId}
                {inspectedNodeId}
                onCenterNode={(node) =>
                  onCenterNode(node as SchemaSetNodePresentation)}
                {onInspectNode}
              />
            </div>
          {/each}

          {#if source.unresolvedReferences.length > 0}
            <div class="unresolved-group">
              <OutlineSectionHeading
                label="Unresolved references"
                count={source.unresolvedReferences.length}
              />
              <ul>
                {#each source.unresolvedReferences as reference (reference.id)}
                  <li>
                    <code>{reference.raw}</code>
                    <strong
                      >{reference.kindLabel} · {reference.reasonLabel}</strong
                    >
                    <p>{reference.explanation}</p>
                    <p>Owner: {reference.ownerDisplayName}</p>
                    {#if reference.candidateSummary}
                      <p>{reference.candidateSummary}</p>
                    {/if}
                    <div class="unresolved-actions">
                      <button
                        type="button"
                        onclick={() => onCenterUnresolvedOwner(reference)}
                      >
                        Centre owner
                      </button>
                      <button
                        type="button"
                        onclick={() => onInspectNode(reference.sourceNodeId)}
                      >
                        Inspect owner
                      </button>
                    </div>
                  </li>
                {/each}
              </ul>
            </div>
          {/if}
        </div>
      {/if}
    </section>
  {/each}
</div>

<style>
  .package-summary {
    display: grid;
    gap: var(--space-2);
    margin: var(--space-4) var(--space-5) 0;
    padding: var(--space-4);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-medium);
    background: var(--colour-panel-subtle);
  }

  .package-summary h3,
  .package-inventory h3,
  .source-sections > h3,
  .package-inventory h4,
  .root-candidates h4 {
    margin: 0;
    color: var(--colour-text);
    font-size: var(--font-size-sm);
    line-height: 1.35;
  }

  .package-disclosure-section,
  .package-disclosure-section h4,
  .package-section-panel {
    min-width: 0;
  }

  .package-section-toggle {
    box-sizing: border-box;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: center;
    width: 100%;
    min-width: 0;
    min-height: var(--control-min-size);
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--colour-border-subtle);
    border-radius: var(--radius-medium);
    background: var(--colour-panel);
    color: var(--colour-text);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .package-section-toggle:hover {
    border-color: var(--colour-border);
    background: var(--colour-panel-subtle);
  }

  .package-section-label {
    min-width: 0;
    color: var(--colour-text);
    font-size: var(--font-size-sm);
    font-weight: 700;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }

  .package-section-count {
    min-width: 2ch;
    padding: 1px var(--space-2);
    border: 1px solid var(--colour-border-subtle);
    border-radius: 999px;
    background: var(--colour-panel-subtle);
    color: var(--colour-text-secondary);
    font-size: var(--font-size-xs);
    font-weight: 700;
    line-height: 1.5;
    text-align: center;
  }

  .disclosure-chevron {
    box-sizing: border-box;
    width: 0.55rem;
    height: 0.55rem;
    margin: 0 var(--space-1);
    border-right: 2px solid currentColor;
    border-bottom: 2px solid currentColor;
    color: var(--colour-text-secondary);
    transform: rotate(-45deg);
    transition: transform 120ms ease;
  }

  .package-section-toggle[aria-expanded='true'] .disclosure-chevron {
    transform: rotate(45deg);
  }

  .package-section-panel[hidden] {
    display: none;
  }

  .package-summary dl {
    display: grid;
    gap: var(--space-1);
    margin: 0;
  }

  .package-summary dl > div {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--space-2);
    align-items: start;
  }

  .package-summary dt {
    color: var(--colour-text-secondary);
  }

  .package-summary dd {
    min-width: 0;
    margin: 0;
    text-align: right;
    overflow-wrap: anywhere;
  }

  code {
    font-family: var(--font-code);
    overflow-wrap: anywhere;
  }

  .package-summary strong,
  .package-summary span,
  .package-summary p {
    overflow-wrap: anywhere;
  }

  .root-candidates {
    display: grid;
    gap: var(--space-2);
    min-width: 0;
    border-bottom: 0;
  }

  .root-candidates ul {
    display: grid;
    gap: var(--space-2);
    min-width: 0;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .root-candidate-card {
    box-sizing: border-box;
    min-width: 0;
    width: 100%;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--colour-border-subtle);
    border-radius: var(--radius-medium);
    background: var(--colour-panel);
  }

  .root-candidate-path {
    display: block;
    min-width: 0;
    color: var(--colour-text);
    font-family: var(--font-code);
    font-size: var(--font-size-xs);
    font-style: italic;
    line-height: 1.45;
    overflow-wrap: anywhere;
  }

  .root-candidate-reason {
    margin: var(--space-1) 0 0;
    color: var(--colour-text-muted);
    font-size: var(--font-size-xs);
    font-style: normal;
    line-height: 1.5;
    overflow-wrap: anywhere;
  }

  .relationships ul {
    display: grid;
    gap: var(--space-1);
    margin: 0;
    padding-left: var(--space-5);
  }

  .package-inventory {
    display: grid;
    gap: var(--space-4);
    padding: var(--space-5);
  }

  .package-inventory > p {
    margin: calc(-1 * var(--space-2)) 0 0;
    color: var(--colour-text-secondary);
    font-size: var(--font-size-xs);
  }

  .package-inventory section {
    display: grid;
    gap: var(--space-2);
  }

  .entry-list {
    display: grid;
    gap: var(--space-2);
  }

  .package-entry {
    min-width: 0;
    border: 1px solid var(--colour-border-subtle);
    border-radius: var(--radius-medium);
    background: var(--colour-panel-subtle);
  }

  .package-entry > summary,
  .source-view > summary {
    min-height: var(--control-min-size);
    padding: var(--space-3);
    cursor: pointer;
    overflow-wrap: anywhere;
  }

  .package-entry > summary {
    display: grid;
    gap: var(--space-1);
  }

  .entry-path {
    display: block;
    min-width: 0;
    color: var(--colour-text);
    font-family: var(--font-code);
    font-size: var(--font-size-xs);
    font-weight: 600;
    line-height: 1.35;
    text-align: left;
    overflow-wrap: anywhere;
    word-break: normal;
  }

  .entry-summary-status {
    color: var(--colour-text-muted);
    font-size: 0.7rem;
    line-height: 1.3;
    text-align: left;
    overflow-wrap: anywhere;
  }

  .entry-details {
    display: grid;
    gap: var(--space-3);
    min-width: 0;
    padding: 0 var(--space-3) var(--space-3);
  }

  .entry-classification,
  .source-view p {
    margin: 0;
    color: var(--colour-text-secondary);
    font-size: 0.7rem;
    line-height: 1.4;
    overflow-wrap: anywhere;
  }

  .package-entry-metadata {
    display: grid;
    gap: var(--space-3);
    min-width: 0;
    margin: 0;
  }

  .package-entry-metadata > div {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 2px;
    min-width: 0;
  }

  .package-entry-metadata dt {
    min-width: 0;
    color: var(--colour-text-muted);
    font-size: 0.7rem;
    font-weight: 600;
    line-height: 1.25;
    text-align: left;
    overflow-wrap: anywhere;
  }

  .package-entry-metadata dd {
    min-width: 0;
    margin: 0;
    color: var(--colour-text-secondary);
    font-size: 0.72rem;
    font-weight: 400;
    line-height: 1.35;
    text-align: left;
    overflow-wrap: anywhere;
    word-break: normal;
  }

  .package-entry-metadata code {
    display: block;
    min-width: 0;
    white-space: normal;
    overflow-wrap: anywhere;
    word-break: normal;
  }

  .relationships {
    display: grid;
    gap: var(--space-2);
  }

  .relationships li {
    min-width: 0;
    font-size: var(--font-size-xs);
  }

  .relationships span,
  .relationships code {
    display: block;
    overflow-wrap: anywhere;
  }

  .source-view {
    min-width: 0;
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-medium);
    background: var(--colour-panel);
  }

  .source-view p {
    padding: 0 var(--space-3) var(--space-2);
  }

  .source-view pre {
    max-width: 100%;
    max-height: min(50vh, 32rem);
    margin: 0;
    padding: var(--space-3);
    overflow: auto;
    border-top: 1px solid var(--colour-border-subtle);
    white-space: pre;
    tab-size: 2;
  }

  .source-view pre code {
    overflow-wrap: normal;
  }

  .source-unavailable {
    padding: var(--space-2);
    border-radius: var(--radius-small);
    background: var(--colour-panel);
  }

  .package-summary span {
    color: var(--colour-text-secondary);
    font-size: var(--font-size-sm);
  }

  .package-summary .warning-count {
    color: var(--colour-warning);
    font-weight: 700;
  }

  .package-summary p {
    margin: 0;
    color: var(--colour-text-secondary);
    font-size: var(--font-size-sm);
    line-height: 1.5;
  }

  .source-sections {
    padding: var(--space-3) var(--space-5) var(--space-6);
  }

  .source-sections > h3 {
    margin-bottom: var(--space-2);
  }

  section {
    border-bottom: 1px solid var(--colour-border-subtle);
  }

  section.current-source {
    box-shadow: inset 3px 0 0 var(--colour-accent);
  }

  .source-toggle {
    display: grid;
    width: 100%;
    min-height: var(--control-min-size);
    gap: var(--space-1);
    padding: var(--space-3);
    border: 0;
    border-radius: var(--radius-medium);
    background: transparent;
    color: var(--colour-text);
    text-align: left;
    cursor: pointer;
  }

  .source-toggle:hover {
    background: var(--colour-accent-soft);
  }

  .source-toggle::before {
    content: '▸';
    grid-row: 1 / span 2;
    margin-right: var(--space-2);
    align-self: center;
  }

  .source-toggle[aria-expanded='true']::before {
    content: '▾';
  }

  .source-name,
  .source-meta {
    grid-column: 2;
    overflow-wrap: anywhere;
  }

  .source-name {
    font-weight: 700;
  }

  .source-meta {
    color: var(--colour-text-muted);
    font-size: var(--font-size-xs);
  }

  .source-content {
    padding: 0 var(--space-2) var(--space-4) var(--space-4);
  }

  .node-group,
  .unresolved-group {
    margin-top: var(--space-3);
  }

  ul {
    display: grid;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .unresolved-actions button {
    min-height: var(--control-min-size);
    border-radius: var(--radius-medium);
    font: inherit;
    cursor: pointer;
  }

  .unresolved-actions button {
    padding: 0 var(--space-2);
    border: 1px solid var(--colour-border);
    background: var(--colour-panel);
    color: var(--colour-text-secondary);
    font-size: var(--font-size-xs);
    font-weight: 700;
  }

  .unresolved-group > ul > li {
    padding: var(--space-3);
    border: 1px solid var(--colour-warning);
    border-radius: var(--radius-medium);
    background: var(--colour-warning-soft);
  }

  .unresolved-group code {
    display: block;
    margin-bottom: var(--space-2);
    font-family: var(--font-code);
    font-weight: 700;
    overflow-wrap: anywhere;
  }

  .unresolved-group strong,
  .unresolved-group p {
    display: block;
    margin: var(--space-1) 0 0;
    font-size: var(--font-size-xs);
    line-height: 1.5;
    overflow-wrap: anywhere;
  }

  .unresolved-group p {
    color: var(--colour-text-secondary);
  }

  .unresolved-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-2);
    margin-top: var(--space-2);
  }

  @media (prefers-reduced-motion: reduce) {
    .disclosure-chevron {
      transition: none;
    }
  }
</style>
