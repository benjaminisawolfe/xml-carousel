<script lang="ts">
  import type { SchemaNodeKind } from '../../schema/model';
  import { formatSchemaNodeKind } from './nodePresentation';

  export let kind: SchemaNodeKind;
</script>

<span class="kind-badge">{formatSchemaNodeKind(kind)}</span>

<style>
  .kind-badge {
    display: inline-flex;
    align-items: center;
    min-height: 28px;
    padding: 0 var(--space-3);
    border-radius: var(--radius-large);
    background: var(--colour-accent-soft);
    color: var(--colour-accent-active);
    font-size: var(--font-size-sm);
    font-weight: 700;
  }
</style>
