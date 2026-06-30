<script lang="ts">
  import { workspace } from "./lib/stores/workspace.svelte";
  import Sidebar from "./lib/components/Sidebar.svelte";
  import EditorHost from "./lib/editor/EditorHost.svelte";

  function handleSave() {
    void workspace.save();
  }
</script>

<div class="app">
  <Sidebar />
  <div class="main">
    <header class="toolbar">
      <span class="title">
        {workspace.activeRelPath ? workspace.activeTitle : "typedown"}
        {#if workspace.dirty}<span class="dot">•</span>{/if}
      </span>
      <button onclick={handleSave} disabled={!workspace.activeRelPath || !workspace.dirty}>
        Save
      </button>
      <span class="status">{workspace.status}</span>
    </header>

    {#if workspace.activeRelPath}
      <main class="editor-pane">
        <EditorHost
          content={workspace.content}
          baseDir={workspace.baseDir}
          onchange={(v) => workspace.setContent(v)}
          onsave={handleSave}
          ontagclick={(tag) => workspace.selectTag(tag)}
        />
      </main>
    {:else}
      <div class="empty">
        {#if workspace.root}
          Select a note from the sidebar, or create one with <strong>New Note</strong>.
        {:else}
          Open a vault to start. Your notes are plain <code>.md</code> files on disk.
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .app {
    display: flex;
    height: 100vh;
  }
  .main {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .toolbar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 12px;
    border-bottom: 1px solid var(--border);
    background: var(--toolbar-bg);
    flex: 0 0 auto;
  }
  .title {
    font-weight: 600;
  }
  .dot {
    color: var(--accent, #3b82f6);
  }
  .toolbar button {
    font: inherit;
    padding: 4px 12px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--button-bg);
    color: inherit;
    cursor: pointer;
  }
  .toolbar button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .status {
    margin-left: auto;
    opacity: 0.6;
    font-size: 0.85em;
  }
  .editor-pane {
    flex: 1 1 auto;
    min-height: 0;
    overflow: hidden;
  }
  .empty {
    flex: 1 1 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    opacity: 0.6;
    padding: 24px;
    line-height: 1.6;
  }
  .empty code {
    background: var(--button-hover-bg);
    padding: 0 4px;
    border-radius: 3px;
  }
</style>
