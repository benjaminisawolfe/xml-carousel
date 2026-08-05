<script lang="ts">
  import InspectorSection from './InspectorSection.svelte';
  import type { InspectorCommentSummary } from './inspectorSummary';

  export let comments: readonly InspectorCommentSummary[];
</script>

<InspectorSection title="DTD comments">
  <ol aria-label="DTD comments" data-inspector-comments>
    {#each comments as comment (comment.commentId)}
      <li data-inspector-comment-row>
        <p class="comment-text">{comment.text}</p>
      </li>
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

  li {
    display: grid;
    min-width: 0;
    padding: var(--space-3);
    border: 1px solid var(--colour-border-subtle);
    border-radius: var(--radius-medium);
    background: var(--colour-panel-subtle);
  }

  p {
    margin: 0;
  }

  .comment-text {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    color: var(--colour-text);
    font-size: var(--font-size-sm);
    line-height: 1.5;
  }
</style>
