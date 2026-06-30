<script lang="ts">
  import { workspace } from "../stores/workspace.svelte";
</script>

<footer class="statusbar">
  <div class="left">
    {#if workspace.root}
      <span class="item">{workspace.docCount} notes</span>
      <span class="item">{workspace.tagCount} tags</span>
      {#if workspace.filterTag}
        <span class="item">filter: #{workspace.filterTag}</span>
      {/if}
    {:else}
      <span class="item">No vault open</span>
    {/if}
  </div>
  <div class="right">
    {#if workspace.status}<span class="item">{workspace.status}</span>{/if}
    {#if workspace.hasDoc}
      <span class="item">{workspace.activeTitle}{workspace.dirty ? " ●" : ""}</span>
    {/if}
  </div>
</footer>

<style>
  .statusbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 22px;
    flex: 0 0 auto;
    background: var(--accent);
    color: #fff;
    font-size: 12px;
    padding: 0 8px;
  }
  .left,
  .right {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .item {
    white-space: nowrap;
  }
</style>
