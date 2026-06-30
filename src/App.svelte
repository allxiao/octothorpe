<script lang="ts">
  import { workspace } from "./lib/stores/workspace.svelte";
  import MenuBar from "./lib/components/MenuBar.svelte";
  import ActivityBar from "./lib/components/ActivityBar.svelte";
  import Sidebar from "./lib/components/Sidebar.svelte";
  import StatusBar from "./lib/components/StatusBar.svelte";
  import EditorHost from "./lib/editor/EditorHost.svelte";

  function handleSave() {
    void workspace.save();
  }

  // Global shortcuts: Ctrl/Cmd+O open vault, Ctrl/Cmd+N new note.
  function onKeydown(e: KeyboardEvent) {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    if (e.key === "o") {
      e.preventDefault();
      void workspace.openVault();
    } else if (e.key === "n") {
      e.preventDefault();
      if (workspace.root) void workspace.newNote();
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="app">
  <MenuBar />
  <div class="body">
    <ActivityBar />
    <Sidebar />
    <div class="editor-area">
      {#if workspace.activeRelPath}
        <EditorHost
          content={workspace.content}
          baseDir={workspace.baseDir}
          onchange={(v) => workspace.setContent(v)}
          onsave={handleSave}
          ontagclick={(tag) => workspace.selectTag(tag)}
          onready={(api) => workspace.registerEditor(api)}
        />
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
  <StatusBar />
</div>

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
  }
  .body {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
  }
  .editor-area {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
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
