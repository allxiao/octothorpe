<script lang="ts">
  import { workspace } from "../stores/workspace.svelte";
  import FileTree from "./FileTree.svelte";
  import TagTree from "./TagTree.svelte";
</script>

<aside class="sidebar">
  <div class="actions">
    <button onclick={() => workspace.openVault()}>Open Vault</button>
    <button onclick={() => workspace.newNote()} disabled={!workspace.root}>New Note</button>
  </div>

  {#if workspace.root}
    {#if workspace.filterTag}
      <div class="section-title">
        <span>#{workspace.filterTag}</span>
        <button class="clear" onclick={() => workspace.clearTagFilter()}>✕</button>
      </div>
      <div class="doc-list">
        {#each workspace.filteredDocs as doc (doc.id)}
          <div
            class="doc"
            class:active={workspace.activeRelPath === doc.relPath}
            role="button"
            tabindex="0"
            onclick={() => workspace.openDoc(doc.relPath)}
            onkeydown={(e) => e.key === "Enter" && workspace.openDoc(doc.relPath)}
          >
            📄 {doc.title}
          </div>
        {/each}
      </div>
    {:else}
      <div class="section-title">Files</div>
      <FileTree nodes={workspace.tree} />
    {/if}

    <div class="section-title">Tags</div>
    {#if workspace.tags.length > 0}
      <TagTree nodes={workspace.tags} />
    {:else}
      <div class="hint">No tags yet — add <code>#tags</code> to your notes.</div>
    {/if}
  {:else}
    <div class="hint">No vault open. Click <strong>Open Vault</strong> to choose a folder.</div>
  {/if}
</aside>

<style>
  .sidebar {
    width: 260px;
    flex: 0 0 auto;
    height: 100%;
    overflow-y: auto;
    border-right: 1px solid var(--border);
    background: var(--toolbar-bg);
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .actions {
    display: flex;
    gap: 6px;
    margin-bottom: 4px;
  }
  .actions button {
    flex: 1;
    font: inherit;
    font-size: 12px;
    padding: 5px 8px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--button-bg);
    color: inherit;
    cursor: pointer;
  }
  .actions button:hover:not(:disabled) {
    background: var(--button-hover-bg);
  }
  .actions button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .section-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 10px;
    padding: 0 6px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    opacity: 0.55;
    font-weight: 700;
  }
  .clear {
    border: none;
    background: none;
    color: inherit;
    cursor: pointer;
    opacity: 0.7;
    font-size: 11px;
  }
  .doc-list {
    display: flex;
    flex-direction: column;
  }
  .doc {
    padding: 3px 6px;
    font-size: 13px;
    border-radius: 4px;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .doc:hover {
    background: var(--button-hover-bg);
  }
  .doc.active {
    background: var(--accent-soft, rgba(59, 130, 246, 0.15));
    font-weight: 600;
  }
  .hint {
    font-size: 12px;
    opacity: 0.6;
    padding: 8px 6px;
    line-height: 1.5;
  }
  .hint code {
    background: var(--button-hover-bg);
    padding: 0 3px;
    border-radius: 3px;
  }
</style>
