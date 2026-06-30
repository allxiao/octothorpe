<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    title,
    children,
    collapsed = $bindable(false),
  }: {
    title: string;
    children: Snippet;
    collapsed?: boolean;
  } = $props();
</script>

<section class="panel" class:collapsed>
  <button class="header" onclick={() => (collapsed = !collapsed)}>
    <span class="chev" class:open={!collapsed}>▶</span>
    <span class="title">{title}</span>
  </button>
  {#if !collapsed}
    <div class="body">{@render children()}</div>
  {/if}
</section>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .panel:not(.collapsed) {
    flex: 1 1 0;
  }
  .panel.collapsed {
    flex: 0 0 auto;
  }
  .header {
    display: flex;
    align-items: center;
    gap: 4px;
    width: 100%;
    padding: 4px 8px;
    border: none;
    background: none;
    color: inherit;
    font: inherit;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    opacity: 0.7;
    cursor: pointer;
    flex: 0 0 auto;
  }
  .header:hover {
    opacity: 1;
  }
  .chev {
    display: inline-block;
    font-size: 8px;
    transition: transform 0.1s ease;
    transform: rotate(0deg);
  }
  .chev.open {
    transform: rotate(90deg);
  }
  .title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .body {
    overflow-y: auto;
    min-height: 0;
    flex: 1 1 auto;
    padding-bottom: 6px;
  }
</style>
