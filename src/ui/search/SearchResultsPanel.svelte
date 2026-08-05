<script lang="ts">
  import type { SchemaNodeId } from '../../schema/model';
  import type {
    ProjectSearchResultPresentation,
    SearchPresentationState,
  } from '../presentation/projectSearchPresentation';

  export let panelId: string;
  export let presentation: SearchPresentationState;
  export let currentFocusNodeId: SchemaNodeId;
  export let inspectedNodeId: SchemaNodeId | undefined;
  export let actionError: string | undefined;
  export let onCenterResult: (result: ProjectSearchResultPresentation) => void;
  export let onInspectResult: (result: ProjectSearchResultPresentation) => void;
  export let onOpenPackageEntry: (
    result: ProjectSearchResultPresentation,
  ) => void;
  export let onClose: () => void;
</script>

<section
  id={panelId}
  class="search-results-panel"
  aria-labelledby={`${panelId}-heading`}
  data-search-results-panel
>
  <header class="search-results-header">
    <h2 id={`${panelId}-heading`}>Search results</h2>
    <button
      class="close-search"
      type="button"
      aria-label="Close search"
      onclick={onClose}
    >
      Close
    </button>
  </header>

  <p
    class:visually-hidden={presentation.status !== 'results'}
    class="search-status"
    role="status"
    aria-live="polite"
    aria-atomic="true"
  >
    {presentation.statusText}
  </p>

  {#if actionError}
    <p
      class="search-action-error"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {actionError}
    </p>
  {/if}

  {#if presentation.status === 'guidance'}
    <p class="search-guidance">{presentation.guidanceText}</p>
  {:else if presentation.status === 'empty'}
    <section class="search-empty" aria-labelledby={`${panelId}-empty-heading`}>
      <h3 id={`${panelId}-empty-heading`}>{presentation.heading}</h3>
      <p>{presentation.helpText}</p>
    </section>
  {:else}
    <div class="search-groups">
      {#each presentation.groups as group (group.id)}
        <section
          class="search-group"
          aria-labelledby={group.headingId}
          data-search-group={group.id}
        >
          <h3 id={group.headingId}>
            {group.label} <span>({group.resultCount})</span>
          </h3>
          <ul aria-labelledby={group.headingId}>
            {#each group.results as result (result.id)}
              <li>
                <article
                  class:current-focus={result.nodeId !== undefined &&
                    result.nodeId === currentFocusNodeId}
                  class:inspected={result.nodeId !== undefined &&
                    result.nodeId === inspectedNodeId}
                  class="search-result"
                  data-search-result-node-id={result.nodeId}
                  data-search-result-package-entry-id={result.packageEntryId}
                  data-current-focus={result.nodeId === currentFocusNodeId
                    ? 'true'
                    : undefined}
                  data-inspected={result.nodeId === inspectedNodeId
                    ? 'true'
                    : undefined}
                >
                  <button
                    class="center-result"
                    type="button"
                    aria-label={result.primaryActionLabel}
                    aria-current={result.nodeId !== undefined &&
                    result.nodeId === currentFocusNodeId
                      ? 'true'
                      : undefined}
                    data-center-search-result={result.primaryAction === 'center'
                      ? true
                      : undefined}
                    data-inspect-search-result={result.primaryAction ===
                    'inspect'
                      ? true
                      : undefined}
                    data-open-package-result={result.primaryAction ===
                    'open-package-entry'
                      ? true
                      : undefined}
                    onclick={() =>
                      result.primaryAction === 'open-package-entry'
                        ? onOpenPackageEntry(result)
                        : result.primaryAction === 'inspect'
                          ? onInspectResult(result)
                          : onCenterResult(result)}
                  >
                    <span
                      class="search-result-name"
                      role="heading"
                      aria-level="4"
                      aria-label={result.name}
                    >
                      {#each result.nameSegments as segment, segmentIndex (segmentIndex)}
                        {#if segment.highlighted}
                          <mark>{segment.text}</mark>
                        {:else}
                          {segment.text}
                        {/if}
                      {/each}
                    </span>
                    <p class="search-result-metadata">
                      {result.kindLabel}{#if result.sourceFilename}
                        <span aria-hidden="true"> · </span><span
                          >{result.sourceFilename}</span
                        >
                      {/if}
                    </p>
                    {#if result.contextLabel && result.contextSegments}
                      <p class="search-result-context">
                        <strong>{result.contextLabel}:</strong>
                        {#each result.contextSegments as segment, segmentIndex (segmentIndex)}
                          {#if segment.highlighted}
                            <mark>{segment.text}</mark>
                          {:else}
                            {segment.text}
                          {/if}
                        {/each}
                      </p>
                    {/if}
                    {#if result.additionalMatchText}
                      <p class="additional-matches">
                        {result.additionalMatchText}
                      </p>
                    {/if}
                  </button>
                  {#if result.secondaryAction === 'inspect'}
                    <button
                      class="inspect-result"
                      type="button"
                      aria-label={result.nodeId === inspectedNodeId
                        ? `${result.secondaryActionLabel}, currently inspected`
                        : result.secondaryActionLabel}
                      data-inspect-search-result
                      onclick={() => onInspectResult(result)}
                    >
                      Inspect
                    </button>
                  {/if}
                </article>
              </li>
            {/each}
          </ul>
        </section>
      {/each}
    </div>

    {#if presentation.truncationNotice}
      <p class="truncation-notice">{presentation.truncationNotice}</p>
    {/if}
  {/if}
</section>

<style>
  .search-results-panel {
    position: absolute;
    top: calc(100% + var(--space-2));
    right: 0;
    z-index: 30;
    display: flex;
    width: min(44rem, calc(100vw - (2 * var(--space-4))));
    max-width: 44rem;
    max-height: calc(100dvh - var(--top-bar-height) - var(--space-4));
    flex-direction: column;
    overflow: hidden;
    border: 1px solid var(--colour-border-strong);
    border-radius: var(--radius-large);
    background: var(--colour-panel-raised);
    box-shadow: var(--shadow-medium);
    color: var(--colour-text);
  }

  .search-results-header {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    min-height: calc(var(--control-min-size) + var(--space-2));
    padding: var(--space-2) var(--space-3) var(--space-2) var(--space-4);
    border-bottom: 1px solid var(--colour-border);
  }

  h2,
  h3,
  p {
    margin: 0;
  }

  h2 {
    font-size: var(--font-size-lg);
  }

  .close-search {
    min-width: var(--control-min-size);
    min-height: var(--control-min-size);
    padding-inline: var(--space-3);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-medium);
    background: var(--colour-panel);
    color: var(--colour-text);
    font-weight: 600;
    cursor: pointer;
  }

  .close-search:hover {
    border-color: var(--colour-accent);
    color: var(--colour-accent);
  }

  .close-search:active {
    background: var(--colour-accent-soft);
  }

  .close-search:focus-visible {
    outline: 3px solid var(--colour-focus-ring);
    outline-offset: 2px;
  }

  .search-status {
    flex: 0 0 auto;
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--colour-border-subtle);
    color: var(--colour-text-secondary);
    font-size: var(--font-size-sm);
  }

  .search-action-error {
    flex: 0 0 auto;
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--colour-border);
    background: var(--colour-error-soft);
    color: var(--colour-error);
    font-size: var(--font-size-sm);
    font-weight: 600;
  }

  .search-guidance,
  .search-empty {
    padding: var(--space-5);
    line-height: 1.55;
  }

  .search-guidance {
    color: var(--colour-text-secondary);
  }

  .search-empty {
    display: grid;
    gap: var(--space-2);
  }

  .search-empty h3 {
    font-size: var(--font-size-md);
  }

  .search-empty p {
    color: var(--colour-text-secondary);
  }

  .search-groups {
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .search-group {
    padding: var(--space-4);
    border-bottom: 1px solid var(--colour-border);
  }

  .search-group:last-child {
    border-bottom: 0;
  }

  .search-group h3 {
    margin-bottom: var(--space-2);
    color: var(--colour-text-secondary);
    font-size: var(--font-size-sm);
    letter-spacing: 0.01em;
  }

  .search-group h3 span {
    font-weight: 500;
  }

  ul {
    display: grid;
    gap: 0;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    min-width: 0;
    border-top: 1px solid var(--colour-border-subtle);
  }

  li:first-child {
    border-top: 0;
  }

  .search-result {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--space-2);
    min-width: 0;
    padding: var(--space-1);
    border: 1px solid transparent;
    border-radius: var(--radius-medium);
  }

  .search-result.inspected {
    border-color: var(--colour-info);
  }

  .center-result,
  .inspect-result {
    min-width: var(--control-min-size);
    min-height: var(--control-min-size);
    border-radius: var(--radius-medium);
    font: inherit;
    cursor: pointer;
  }

  .center-result {
    display: grid;
    gap: var(--space-1);
    width: 100%;
    padding: var(--space-3);
    border: 0;
    background: transparent;
    color: var(--colour-text);
    text-align: left;
  }

  .center-result:hover {
    background: var(--colour-panel-subtle);
  }

  .center-result:active {
    background: var(--colour-accent-soft);
  }

  .current-focus .center-result {
    background: var(--colour-accent-soft);
    box-shadow: inset 4px 0 0 var(--colour-accent);
  }

  .inspect-result {
    align-self: stretch;
    padding-inline: var(--space-3);
    border: 1px solid var(--colour-accent);
    background: var(--colour-panel);
    color: var(--colour-accent);
    font-size: var(--font-size-sm);
    font-weight: 700;
  }

  .inspect-result:hover {
    background: var(--colour-accent-soft);
  }

  .inspect-result:active {
    border-color: var(--colour-accent-active);
    color: var(--colour-accent-active);
  }

  .center-result:focus-visible,
  .inspect-result:focus-visible {
    position: relative;
    z-index: 1;
    outline: 3px solid var(--colour-focus-ring);
    outline-offset: 2px;
  }

  .search-result-name {
    overflow-wrap: anywhere;
    font-family: var(--font-code);
    font-size: var(--font-size-base);
    line-height: 1.35;
  }

  .search-result-metadata {
    overflow-wrap: anywhere;
    color: var(--colour-text-secondary);
    font-size: var(--font-size-xs);
    font-weight: 600;
  }

  .search-result-context {
    display: -webkit-box;
    overflow: hidden;
    color: var(--colour-text-secondary);
    font-size: var(--font-size-sm);
    line-height: 1.45;
    overflow-wrap: anywhere;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    line-clamp: 3;
  }

  .search-result-context strong {
    margin-right: var(--space-1);
    color: var(--colour-text);
  }

  mark {
    border-radius: 2px;
    background: var(--colour-accent-soft);
    color: inherit;
    font-weight: 700;
  }

  .additional-matches {
    color: var(--colour-text-muted);
    font-size: var(--font-size-xs);
  }

  .truncation-notice {
    flex: 0 0 auto;
    padding: var(--space-3) var(--space-4);
    border-top: 1px solid var(--colour-border);
    background: var(--colour-info-soft);
    color: var(--colour-text-secondary);
    font-size: var(--font-size-sm);
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  @media (min-width: 900px) and (max-width: 959px) {
    .search-results-panel {
      position: fixed;
      top: calc(var(--top-bar-height) + var(--space-1));
      right: var(--space-4);
    }
  }

  @media (max-width: 899px) {
    .search-results-panel {
      position: fixed;
      top: calc(
        var(--top-bar-height) + var(--control-min-size) + var(--space-4)
      );
      right: var(--space-2);
      bottom: var(--space-2);
      left: var(--space-2);
      width: auto;
      max-width: none;
      max-height: none;
      border-radius: var(--radius-medium);
    }

    .search-result-context {
      -webkit-line-clamp: 2;
      line-clamp: 2;
    }
  }

  @media (max-width: 479px) {
    .search-result {
      grid-template-columns: minmax(0, 1fr);
    }

    .inspect-result {
      width: 100%;
    }
  }

  @media (max-height: 320px) {
    .search-results-panel {
      top: calc(
        var(--top-bar-height) + var(--control-min-size) + var(--space-2)
      );
      bottom: var(--space-1);
    }

    .search-results-header {
      min-height: var(--control-min-size);
      padding-block: 0;
    }

    .search-status {
      padding-block: var(--space-2);
    }

    .search-group {
      padding-block: var(--space-2);
    }
  }
</style>
