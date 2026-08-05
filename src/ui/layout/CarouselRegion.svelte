<script lang="ts">
  import SchemaCarousel from '../carousel/SchemaCarousel.svelte';
</script>

<main class="carousel-region" aria-label="Schema carousel">
  <SchemaCarousel />
</main>

<style>
  .carousel-region {
    grid-area: carousel;
    position: relative;
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    min-width: 0;
    min-height: 0;
    padding: var(--space-8);
    overflow: hidden;
    background: var(--colour-canvas);
  }

  @media (max-width: 1399px) {
    .carousel-region {
      padding: var(--space-6);
    }
  }

  @media (max-width: 699px) {
    .carousel-region {
      padding: var(--space-5) var(--space-4) var(--space-4);
    }
  }

  @media (max-width: 479px), (max-height: 699px) {
    .carousel-region {
      padding-block: var(--space-4);
    }
  }

  @media (orientation: landscape) and (max-height: 300px) {
    .carousel-region {
      padding-block: var(--space-1);
    }
  }
</style>
