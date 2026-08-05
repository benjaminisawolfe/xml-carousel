<script lang="ts">
  import InspectorPropertyList from './InspectorPropertyList.svelte';
  import InspectorSection from './InspectorSection.svelte';
  import type { InspectorPropertySummary } from './inspectorSummary';

  export let properties: readonly InspectorPropertySummary[];
</script>

<InspectorSection title="Overview">
  <InspectorPropertyList items={properties} />
</InspectorSection>
