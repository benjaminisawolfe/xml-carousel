<script lang="ts">
  import type { NodeCenterRequest } from '../../app/stores/navigationCentering';
  import type { FocusCardSummary } from './focusCardSummary';
  import NodeKindBadge from './NodeKindBadge.svelte';
  import { formatSchemaNodeKind } from './nodePresentation';

  export let summary: FocusCardSummary;
  export let isInspected: boolean;
  export let onToggleInspection: (nodeId: string) => void;
  export let onCenterNode: (request: NodeCenterRequest) => void;
  export let motionKey: string;

  let heading: HTMLHeadingElement;
  let summaryScrollPointerId: number | undefined;
  let summaryScrollPointerY = 0;

  export function focusHeading(): void {
    heading?.focus({ preventScroll: true });
  }

  function beginSummaryPointerScroll(event: PointerEvent): void {
    event.stopPropagation();
    if (event.pointerType !== 'touch') return;

    summaryScrollPointerId = event.pointerId;
    summaryScrollPointerY = event.clientY;
    const target = event.currentTarget as HTMLDivElement;
    target.setPointerCapture?.(event.pointerId);
  }

  function moveSummaryPointerScroll(event: PointerEvent): void {
    event.stopPropagation();
    if (event.pointerId !== summaryScrollPointerId) return;

    const target = event.currentTarget as HTMLDivElement;
    target.scrollTop += summaryScrollPointerY - event.clientY;
    summaryScrollPointerY = event.clientY;
    event.preventDefault();
  }

  function endSummaryPointerScroll(event: PointerEvent): void {
    event.stopPropagation();
    if (event.pointerId !== summaryScrollPointerId) return;

    const target = event.currentTarget as HTMLDivElement;
    if (target.hasPointerCapture?.(event.pointerId)) {
      target.releasePointerCapture(event.pointerId);
    }
    summaryScrollPointerId = undefined;
  }
</script>

<article
  class="focus-card"
  aria-label={summary.displayName}
  data-carousel-gesture-origin
  data-carousel-motion-key={motionKey}
  data-focus-card-information-layout
>
  <div class="card-topline">
    {#if summary.kind !== 'schema'}
      <NodeKindBadge kind={summary.kind} />
    {:else}
      <span aria-hidden="true"></span>
    {/if}
    <button
      class:close-inspection={isInspected}
      type="button"
      aria-label={isInspected
        ? `Close inspection for ${summary.displayName}`
        : `Inspect ${summary.displayName}`}
      aria-pressed={isInspected}
      data-inspect-node-id={summary.nodeId}
      data-carousel-gesture-ignore
      onclick={() => onToggleInspection(summary.nodeId)}
    >
      {isInspected ? 'Close Inspection' : 'Inspect'}
    </button>
  </div>

  <h2 bind:this={heading} tabindex="-1" data-focus-card-heading>
    {summary.displayName}
  </h2>

  <!-- svelte-ignore a11y_no_noninteractive_tabindex (the bounded overflow region must be keyboard-scrollable) -->
  <div
    class="focus-card-summary"
    role="region"
    aria-label={`Scrollable summary details for ${summary.displayName}`}
    tabindex="0"
    data-carousel-gesture-ignore
    data-focus-card-scroll-region
    onwheel={(event) => event.stopPropagation()}
    onpointerdown={beginSummaryPointerScroll}
    onpointermove={moveSummaryPointerScroll}
    onpointerup={endSummaryPointerScroll}
    onpointercancel={endSummaryPointerScroll}
  >
    <section
      class="structure"
      aria-label={summary.kind === 'schema' ? 'Declarations' : 'Structure'}
    >
      {#if summary.contentModelParts.length > 0}
        <p class="content-model" aria-label="Content model">
          {#each summary.contentModelParts as part (part.id)}
            {#if part.kind === 'text'}
              <span>{part.text}</span>
            {:else if part.disposition === 'terminalCycleClosure'}
              <span class="recursive-static">
                <strong>{part.relationshipLabel ?? 'Recursive child'}:</strong>
                {part.displayName}{part.occurrence}
                <small>{part.terminalLabel}</small>
              </span>
            {:else}
              <button
                class="node-reference"
                type="button"
                aria-label={`Center ${part.displayName}${part.occurrence}`}
                data-carousel-gesture-ignore
                onclick={() =>
                  onCenterNode({
                    targetNodeId: part.nodeId,
                    relationshipContext: {
                      kind: 'outgoing-structural',
                      sourceNodeId: summary.nodeId,
                      edgeId: part.id,
                    },
                  })}
              >
                {part.displayName}{part.occurrence}
              </button>
            {/if}
          {/each}
        </p>
      {/if}

      {#if summary.hasXsdPresentation && summary.visibleRelationshipSummaries.length > 0}
        <ul
          class="relationship-list"
          aria-label={summary.kind === 'schema'
            ? 'Global declarations'
            : 'Structural destinations'}
          data-focus-card-relationships
        >
          {#each summary.visibleRelationshipSummaries as relationship (relationship.edgeId)}
            <li>
              {#if relationship.disposition === 'terminalCycleClosure'}
                <span class="relationship-static">
                  <strong>{relationship.relationshipLabel}:</strong>
                  <span>
                    {relationship.displayName}{relationship.occurrence}
                    {#if relationship.terminalLabel}
                      <small>{relationship.terminalLabel}</small>
                    {/if}
                  </span>
                </span>
              {:else}
                <button
                  class="relationship-action"
                  type="button"
                  aria-label={`Navigate leafward through ${relationship.relationshipLabel} to ${relationship.displayName}, ${formatSchemaNodeKind(relationship.kind)}`}
                  data-carousel-gesture-ignore
                  onclick={() =>
                    onCenterNode({
                      targetNodeId: relationship.nodeId,
                      relationshipContext: {
                        kind: 'outgoing-structural',
                        sourceNodeId: summary.nodeId,
                        edgeId: relationship.edgeId,
                      },
                    })}
                >
                  <strong>{relationship.relationshipLabel}:</strong>
                  <span>
                    {relationship.displayName}{relationship.occurrence}
                    {#if relationship.terminalLabel}
                      <small>{relationship.terminalLabel}</small>
                    {/if}
                  </span>
                </button>
              {/if}
            </li>
          {/each}
        </ul>
        {#if summary.hiddenRelationshipCount > 0}
          <p class="relationship-more">
            +{summary.hiddenRelationshipCount} more destinations
          </p>
        {/if}
      {/if}

      {#if summary.isStructuralLeaf}
        <p class="leaf-state" data-focus-card-leaf-state>
          {summary.leafStateLabel}
        </p>
      {/if}
    </section>

    {#if summary.xsdProperties.length > 0}
      <dl class="xsd-metadata" aria-label="XSD orientation">
        {#each summary.xsdProperties as property (property.id)}
          <div title={`${property.label}: ${property.value}`}>
            <dt>{property.label}</dt>
            <dd>{property.value}</dd>
          </div>
        {/each}
      </dl>
    {/if}

    {#if summary.documentation}
      <section
        class="documentation-summary"
        aria-label="Documentation"
        data-focus-card-documentation
      >
        <p class="documentation-label">
          {summary.documentation.language
            ? `Documentation · ${summary.documentation.language}`
            : 'Documentation'}
        </p>
        <p class="documentation-excerpt">{summary.documentation.excerpt}</p>
        {#if summary.documentation.additionalDocumentationCount > 0}
          <p class="documentation-more">
            {`+${summary.documentation.additionalDocumentationCount} ${
              summary.documentation.additionalDocumentationCount === 1
                ? 'more documentation block'
                : 'more documentation blocks'
            }`}
          </p>
        {/if}
      </section>
    {/if}

    {#if summary.annotationContent}
      <section
        class="documentation-summary"
        aria-label={summary.annotationContent.label}
        data-focus-card-annotation-content
      >
        <p class="documentation-label">{summary.annotationContent.label}</p>
        <p class="documentation-excerpt">{summary.annotationContent.excerpt}</p>
      </section>
    {/if}

    {#if summary.commentCount > 0 && summary.commentExcerpt}
      <section
        class="comment-summary"
        aria-label={`${summary.commentCount} ${summary.commentCount === 1 ? 'comment' : 'comments'}`}
        data-focus-card-comments
      >
        <p class="comment-label">
          {summary.commentCount === 1 ? 'Comment' : 'Comments'}
        </p>
        <p class="comment-excerpt">{summary.commentExcerpt}</p>
        {#if summary.commentCount > 1}
          <p class="comment-more">+{summary.commentCount - 1} more</p>
        {/if}
      </section>
    {/if}

    {#if summary.annotationCount > 0 || summary.attributeCount > 0 || summary.incomingUseCount > 0 || summary.showSourceFilename}
      <div class="card-metadata" aria-label="Node context">
        {#if summary.annotationCount > 0}
          <span data-focus-card-annotation-count>
            {summary.annotationCount}
            {summary.annotationCount === 1 ? 'annotation' : 'annotations'}
          </span>
        {/if}
        {#if summary.attributeCount > 0}
          <span data-focus-card-attribute-count>
            {summary.attributeCount}
            {summary.attributeCount === 1
              ? summary.attributeCountKind
              : `${summary.attributeCountKind}s`}
          </span>
        {/if}
        {#if summary.incomingUseCount > 0}
          <span>Used by {summary.incomingUseCount}</span>
        {/if}
        {#if summary.showSourceFilename && summary.sourceFilename}
          <span>{summary.sourceFilename}</span>
        {/if}
      </div>
    {/if}
  </div>
</article>

<style>
  .focus-card {
    position: relative;
    z-index: 1;
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
    width: 100%;
    max-height: 100%;
    min-width: 0;
    min-height: min(244px, 100%);
    padding: var(--space-6);
    border: 2px solid var(--colour-border-strong);
    border-top: 4px solid var(--colour-element);
    border-radius: var(--radius-card);
    background: var(--colour-panel-raised);
    box-shadow: var(--shadow-focus);
  }

  .focus-card-summary {
    min-width: 0;
    min-height: 0;
    padding: 3px;
    margin: -3px;
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-gutter: stable;
    touch-action: none;
  }

  .focus-card-summary:focus-visible {
    border-radius: var(--radius-small);
    outline: 3px solid var(--colour-focus-ring);
    outline-offset: -3px;
  }

  .card-topline {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-3);
    margin-bottom: var(--space-5);
  }

  h2 {
    max-width: 100%;
    min-width: 0;
    margin-bottom: var(--space-3);
    overflow-wrap: anywhere;
    font-size: var(--font-size-2xl);
    line-height: 1.2;
    word-break: normal;
  }

  h2:focus {
    border-radius: var(--radius-small);
    outline: none;
  }

  .structure {
    margin-bottom: var(--space-4);
  }

  .content-model {
    margin: 0;
    overflow-wrap: anywhere;
    color: var(--colour-text-secondary);
    font-family: var(--font-code);
    font-size: var(--font-size-sm);
    line-height: 1.55;
  }

  .leaf-state {
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--colour-border-subtle);
    border-radius: var(--radius-medium);
    background: var(--colour-panel-subtle);
    color: var(--colour-text-secondary);
    font-size: var(--font-size-sm);
    line-height: 1.4;
  }

  .comment-summary {
    display: grid;
    gap: var(--space-1);
    margin: 0 0 var(--space-4);
    padding: var(--space-3);
    border: 1px solid var(--colour-border-subtle);
    border-radius: var(--radius-medium);
    background: var(--colour-panel-subtle);
  }

  .documentation-summary {
    display: grid;
    gap: var(--space-1);
    margin: 0 0 var(--space-4);
    padding: var(--space-3);
    border: 1px solid var(--colour-border-subtle);
    border-left: 3px solid var(--colour-metadata);
    border-radius: var(--radius-medium);
    background: var(--colour-panel-subtle);
  }

  .documentation-summary p {
    margin: 0;
  }

  .documentation-label {
    color: var(--colour-text);
    font-size: var(--font-size-xs);
    font-weight: 700;
  }

  .documentation-excerpt {
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    overflow-wrap: anywhere;
    color: var(--colour-text-secondary);
    font-size: var(--font-size-sm);
    line-height: 1.4;
  }

  .documentation-more {
    color: var(--colour-text-muted);
    font-size: var(--font-size-xs);
    font-weight: 600;
  }

  .comment-summary p {
    margin: 0;
  }

  .comment-label {
    color: var(--colour-text);
    font-size: var(--font-size-xs);
    font-weight: 700;
  }

  .comment-excerpt {
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    color: var(--colour-text-secondary);
    font-size: var(--font-size-sm);
    line-height: 1.4;
  }

  .comment-more {
    color: var(--colour-text-muted);
    font-size: var(--font-size-xs);
    font-weight: 600;
  }

  .node-reference {
    display: inline;
    padding: 0;
    border: 0;
    border-radius: var(--radius-small);
    background: transparent;
    color: var(--colour-accent);
    font: inherit;
    font-weight: 700;
    cursor: pointer;
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 0.16em;
  }

  .node-reference:hover {
    color: var(--colour-accent-hover);
    text-decoration-thickness: 2px;
  }

  .node-reference:active {
    color: var(--colour-accent-active);
  }

  .recursive-static {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 0 var(--space-1);
    color: var(--colour-text-secondary);
  }

  .recursive-static strong {
    color: var(--colour-metadata);
  }

  .recursive-static small,
  .relationship-list small {
    display: block;
    width: 100%;
    color: var(--colour-text-muted);
    font-size: var(--font-size-xs);
    font-weight: 600;
  }

  .relationship-list {
    display: grid;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .relationship-action,
  .relationship-static {
    display: flex;
    min-width: 0;
    min-height: var(--control-min-size);
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--colour-border-subtle);
    border-radius: var(--radius-medium);
    overflow-wrap: anywhere;
    font-size: var(--font-size-sm);
    text-align: left;
  }

  .relationship-action {
    width: 100%;
    background: var(--colour-panel-subtle);
    color: var(--colour-text);
    cursor: pointer;
  }

  .relationship-action:hover {
    border-color: var(--colour-accent);
    background: var(--colour-accent-soft);
  }

  .relationship-action strong,
  .relationship-static strong {
    flex: 0 0 auto;
    color: var(--colour-text-secondary);
  }

  .relationship-more {
    margin: var(--space-2) 0 0;
    color: var(--colour-text-muted);
    font-size: var(--font-size-xs);
    font-weight: 600;
  }

  .xsd-metadata {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin: 0 0 var(--space-4);
  }

  .xsd-metadata div {
    display: flex;
    min-width: 0;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-medium);
    background: var(--colour-panel-subtle);
    color: var(--colour-text-secondary);
    font-size: var(--font-size-xs);
    line-height: 1.4;
  }

  .xsd-metadata dt {
    font-weight: 700;
  }

  .xsd-metadata dd {
    min-width: 0;
    margin: 0;
    overflow-wrap: anywhere;
  }

  .leaf-state {
    display: inline-block;
    margin: var(--space-2) 0 0;
  }

  .card-metadata {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .card-metadata span {
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-medium);
    background: var(--colour-panel-subtle);
    color: var(--colour-text-secondary);
    font-size: var(--font-size-xs);
    font-weight: 600;
    line-height: 1.4;
  }

  .card-topline button {
    min-height: var(--control-min-size);
    padding: 0 var(--space-4);
    border: 1px solid var(--colour-accent);
    border-radius: var(--radius-medium);
    background: var(--colour-accent);
    color: var(--colour-text-inverse);
    font-size: var(--font-size-sm);
    font-weight: 700;
    cursor: pointer;
  }

  .card-topline button:hover {
    background: var(--colour-accent-hover);
  }

  .card-topline button:active {
    background: var(--colour-accent-active);
  }

  .card-topline button.close-inspection {
    border-color: var(--colour-danger-action);
    background: var(--colour-danger-action);
    color: var(--colour-danger-action-text);
  }

  .card-topline button.close-inspection:hover {
    border-color: var(--colour-danger-action-hover);
    background: var(--colour-danger-action-hover);
  }

  .card-topline button.close-inspection:active {
    border-color: var(--colour-danger-action-active);
    background: var(--colour-danger-action-active);
  }

  .card-topline button.close-inspection:disabled {
    border-color: var(--colour-danger-action-disabled);
    background: var(--colour-danger-action-disabled);
    color: var(--colour-danger-action-disabled-text);
    cursor: not-allowed;
  }

  @media (max-width: 479px), (max-height: 699px) {
    .focus-card {
      min-height: 0;
      padding: var(--space-5);
    }

    .card-topline {
      margin-bottom: var(--space-4);
    }

    h2 {
      font-size: var(--font-size-xl);
    }

    .structure {
      margin-bottom: var(--space-3);
    }

    .comment-summary {
      margin-bottom: var(--space-3);
    }
  }

  @media (max-width: 700px), (max-height: 699px) {
    .documentation-summary {
      margin-bottom: var(--space-3);
    }

    .documentation-excerpt {
      -webkit-line-clamp: 2;
      line-clamp: 2;
    }
  }

  @media (orientation: landscape) and (max-height: 520px) {
    .focus-card {
      max-height: 100%;
      padding: var(--space-3) var(--space-4);
    }

    .card-topline {
      margin-bottom: var(--space-2);
    }

    h2 {
      margin-bottom: var(--space-2);
      font-size: var(--font-size-xl);
    }

    .content-model {
      margin-bottom: var(--space-2);
      font-size: var(--font-size-sm);
      line-height: 1.4;
    }

    .structure {
      margin-bottom: var(--space-2);
    }

    .comment-summary,
    .documentation-summary {
      margin-bottom: var(--space-2);
      padding: var(--space-2);
    }

    .comment-excerpt,
    .documentation-excerpt {
      -webkit-line-clamp: 1;
      line-clamp: 1;
    }

    .card-metadata {
      gap: var(--space-2);
    }

    .leaf-state,
    .card-metadata span {
      padding: var(--space-1) var(--space-2);
      font-size: var(--font-size-xs);
    }
  }

  @media (orientation: landscape) and (max-height: 300px) {
    .focus-card {
      max-height: 100%;
      padding-block: var(--space-2);
    }

    .card-topline,
    h2,
    .structure {
      margin-bottom: var(--space-1);
    }

    .content-model {
      margin-bottom: 0;
      font-size: var(--font-size-xs);
      line-height: 1.25;
    }
  }
</style>
