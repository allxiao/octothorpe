<script lang="ts">
  import { workspace } from "../stores/workspace.svelte";
</script>

{#if workspace.outline.length === 0}
  <div class="hint">
    {workspace.activeRelPath ? "No headings in this note." : "Open a note to see its outline."}
  </div>
{:else}
  <div class="outline">
    {#each workspace.outline as item, i (i)}
      <button
        class="item"
        style="padding-left: {8 + (item.level - 1) * 12}px"
        onclick={() => workspace.gotoLine(item.line)}
        title={item.text}
      >
        {item.text}
      </button>
    {/each}
  </div>
{/if}

<style>
  .outline {
    display: flex;
    flex-direction: column;
  }
  .item {
    border: none;
    background: none;
    color: inherit;
    font: inherit;
    font-size: 13px;
    text-align: left;
    padding: 3px 6px;
    border-radius: 4px;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .item:hover {
    background: var(--button-hover-bg);
  }
  .hint {
    font-size: 12px;
    opacity: 0.6;
    padding: 8px;
    line-height: 1.5;
  }
</style>
