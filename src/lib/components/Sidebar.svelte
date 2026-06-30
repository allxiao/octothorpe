<script lang="ts">
  import { workspace } from "../stores/workspace.svelte";
  import Panel from "./Panel.svelte";
  import FileTree from "./FileTree.svelte";
  import TagTree from "./TagTree.svelte";
  import Outline from "./Outline.svelte";

  const titles = { explorer: "Explorer", tags: "Tags", outline: "Outline" } as const;

  let notes = $derived(workspace.filterTag ? workspace.filteredDocs : workspace.allDocs);
  let notesTitle = $derived(workspace.filterTag ? `#${workspace.filterTag}` : "All Notes");
</script>

<aside class="sidebar">
  <div class="view-header">{titles[workspace.activeView]}</div>

  {#if !workspace.root}
    <div class="hint">No vault open. Use <strong>File ▸ Open Vault</strong>.</div>
  {:else if workspace.activeView === "explorer"}
    <Panel title="Files">
      <FileTree nodes={workspace.tree} />
    </Panel>
    <Panel title="Outline" collapsed>
      <Outline />
    </Panel>
  {:else if workspace.activeView === "tags"}
    <Panel title="Tags">
      {#if workspace.tags.length}
        <TagTree nodes={workspace.tags} />
      {:else}
        <div class="hint">No tags yet — add <code>#tags</code> to your notes.</div>
      {/if}
    </Panel>
    <Panel title={notesTitle}>
      {#if workspace.filterTag}
        <button class="clear" onclick={() => workspace.clearTagFilter()}>✕ clear filter</button>
      {/if}
      <div class="notes">
        {#each notes as doc (doc.id)}
          <button
            class="note"
            class:active={workspace.activeRelPath === doc.relPath}
            onclick={() => workspace.openDoc(doc.relPath)}
          >
            📄 {doc.title}
          </button>
        {/each}
        {#if notes.length === 0}
          <div class="hint">No notes.</div>
        {/if}
      </div>
    </Panel>
  {:else}
    <Panel title="Outline">
      <Outline />
    </Panel>
  {/if}
</aside>

<style>
  .sidebar {
    width: 260px;
    flex: 0 0 auto;
    height: 100%;
    overflow: hidden;
    border-right: 1px solid var(--border);
    background: var(--sidebar-bg);
    display: flex;
    flex-direction: column;
  }
  .view-header {
    flex: 0 0 auto;
    padding: 8px 10px 4px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    opacity: 0.6;
    font-weight: 700;
  }
  .notes {
    display: flex;
    flex-direction: column;
  }
  .note {
    border: none;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    padding: 3px 8px;
    font-size: 13px;
    border-radius: 4px;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .note:hover {
    background: var(--button-hover-bg);
  }
  .note.active {
    background: var(--accent-soft);
    font-weight: 600;
  }
  .clear {
    border: none;
    background: none;
    color: inherit;
    cursor: pointer;
    opacity: 0.7;
    font-size: 12px;
    padding: 2px 8px 6px;
  }
  .clear:hover {
    opacity: 1;
  }
  .hint {
    font-size: 12px;
    opacity: 0.6;
    padding: 8px 10px;
    line-height: 1.5;
  }
  .hint :global(code) {
    background: var(--button-hover-bg);
    padding: 0 3px;
    border-radius: 3px;
  }
</style>
