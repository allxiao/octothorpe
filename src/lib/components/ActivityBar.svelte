<script lang="ts">
  import { workspace, type ViewId } from "../stores/workspace.svelte";

  const FILES =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M13 3v5h5"/></svg>';
  const TAGS =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20.6 13.4 12 22l-8.6-8.6A2 2 0 0 1 3 12V4a1 1 0 0 1 1-1h8a2 2 0 0 1 1.4.6l7.2 7.2a2 2 0 0 1 0 2.6Z"/><circle cx="7.5" cy="7.5" r="1.3"/></svg>';
  const OUTLINE =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h12M8 12h12M8 18h12"/><path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01"/></svg>';

  const views: { id: ViewId; label: string; icon: string }[] = [
    { id: "explorer", label: "Explorer", icon: FILES },
    { id: "tags", label: "Tags", icon: TAGS },
    { id: "outline", label: "Outline", icon: OUTLINE },
  ];
</script>

<nav class="activitybar">
  {#each views as v (v.id)}
    <button
      class="item"
      class:active={workspace.activeView === v.id}
      title={v.label}
      aria-label={v.label}
      onclick={() => (workspace.activeView = v.id)}
    >
      {@html v.icon}
    </button>
  {/each}
</nav>

<style>
  .activitybar {
    width: 48px;
    flex: 0 0 auto;
    height: 100%;
    background: var(--activitybar-bg);
    display: flex;
    flex-direction: column;
    align-items: center;
    padding-top: 4px;
  }
  .item {
    width: 48px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-left: 2px solid transparent;
    background: none;
    color: var(--activitybar-fg);
    opacity: 0.55;
    cursor: pointer;
  }
  .item:hover {
    opacity: 0.9;
  }
  .item.active {
    opacity: 1;
    border-left-color: var(--accent);
  }
  .item :global(svg) {
    width: 24px;
    height: 24px;
  }
</style>
