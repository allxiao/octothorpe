<script lang="ts">
  import { onMount } from "svelte";
  import { workspace } from "./lib/stores/workspace.svelte";
  import * as ipc from "./lib/ipc/commands";
  import MenuBar from "./lib/components/MenuBar.svelte";
  import ActivityBar from "./lib/components/ActivityBar.svelte";
  import Sidebar from "./lib/components/Sidebar.svelte";
  import StatusBar from "./lib/components/StatusBar.svelte";
  import EditorHost from "./lib/editor/EditorHost.svelte";

  onMount(() => {
    void workspace.listenForChanges();
    void initStartup();
  });

  // New Window launches a fresh process; those skip restoring the last folder
  // (and may open straight onto an empty buffer). The main process restores.
  async function initStartup() {
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
      void workspace.restoreLastVault();
      return;
    }
    try {
      const opts = await ipc.startupOptions();
      if (opts.blank) {
        if (opts.untitled) workspace.openUntitled();
      } else {
        await workspace.restoreLastVault();
      }
    } catch {
      void workspace.restoreLastVault();
    }
  }

  function handleSave() {
    void workspace.save();
  }

  // Global File-menu shortcuts. Plain Ctrl/Cmd+S is handled by the editor keymap.
  function onKeydown(e: KeyboardEvent) {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    const k = e.key.toLowerCase();
    if (k === "o") {
      e.preventDefault();
      if (e.shiftKey) void workspace.openVault();
      else void workspace.openFile();
    } else if (k === "n") {
      e.preventDefault();
      if (e.shiftKey) void ipc.newWindow();
      else workspace.newFile();
    } else if (k === "s" && e.shiftKey) {
      e.preventDefault();
      void workspace.saveAs();
    } else if (k === "w") {
      e.preventDefault();
      void ipc.closeWindow();
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
      {#if workspace.hasDoc}
        <main class="editor-pane">
          {#if workspace.externalChanged}
            <div class="ext-banner">
              <span>This note changed on disk while you have unsaved edits.</span>
              <span class="actions">
                <button onclick={() => workspace.reloadActive()}>
                  Reload from disk
                </button>
                <button onclick={() => (workspace.externalChanged = false)}>Keep mine</button>
              </span>
            </div>
          {/if}
          <EditorHost
            content={workspace.content}
            baseDir={workspace.baseDir}
            onchange={(v) => workspace.setContent(v)}
            onsave={handleSave}
            ontagclick={(tag) => workspace.selectTag(tag)}
            onready={(api) => workspace.registerEditor(api)}
          />
        </main>
      {:else}
        <div class="empty">
          {#if workspace.root}
            Select a note from the sidebar, or create one with <strong>New</strong>.
          {:else}
            Open a folder, or start a new document with <strong>New</strong> (Ctrl+N).
            Your notes are plain <code>.md</code> files on disk.
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
  .editor-pane {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .ext-banner {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 6px 12px;
    font-size: 13px;
    background: #fde68a;
    color: #4a3a00;
  }
  .ext-banner .actions {
    display: flex;
    gap: 6px;
  }
  .ext-banner button {
    font: inherit;
    font-size: 12px;
    padding: 3px 10px;
    border: 1px solid rgba(0, 0, 0, 0.25);
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.6);
    color: inherit;
    cursor: pointer;
  }
  .ext-banner button:hover {
    background: rgba(255, 255, 255, 0.9);
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
