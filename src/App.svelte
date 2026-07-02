<script lang="ts">
  import { onMount } from "svelte";
  import { workspace } from "./lib/stores/workspace.svelte";
  import { ui } from "./lib/stores/ui.svelte";
  import { preferences } from "./lib/preferences/store.svelte";
  import * as ipc from "./lib/ipc/commands";
  import MenuBar from "./lib/components/MenuBar.svelte";
  import ActivityBar from "./lib/components/ActivityBar.svelte";
  import Sidebar from "./lib/components/Sidebar.svelte";
  import StatusBar from "./lib/components/StatusBar.svelte";
  import EditorHost from "./lib/editor/EditorHost.svelte";
  import InsertTableModal from "./lib/components/InsertTableModal.svelte";
  import PreferencesModal from "./lib/components/PreferencesModal.svelte";

  onMount(() => {
    void preferences.load();
    void workspace.listenForChanges();
    void initStartup();
  });

  // Apply the color theme preference. "system" removes the attribute so the
  // prefers-color-scheme media query takes over; "light"/"dark" force it.
  $effect(() => {
    const theme = preferences.get<string>("appearance.theme");
    const el = document.documentElement;
    if (theme === "light" || theme === "dark") el.dataset.theme = theme;
    else delete el.dataset.theme;
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
    } else if (k === "c" && e.shiftKey) {
      e.preventDefault();
      void workspace.copyAsMarkdown();
    } else if (k === "v" && e.shiftKey) {
      e.preventDefault();
      void workspace.editPaste();
    } else if (k === "w") {
      e.preventDefault();
      void ipc.closeWindow();
    } else if (k === ",") {
      e.preventDefault();
      ui.openPreferences();
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="app" style:--editor-max-width={workspace.pageWidthPx + "px"}>
  <MenuBar />
  <div class="body">
    <ActivityBar />
    {#if workspace.showSidebar}
      <Sidebar />
    {/if}
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
            sourceMode={workspace.sourceMode}
            onchange={(v) => workspace.setContent(v)}
            onsave={handleSave}
            ontagclick={(tag) => workspace.selectTag(tag)}
            onready={(api) => workspace.registerEditor(api)}
          />
        </main>
      {:else}
        <div class="empty">
          <p>
            {#if workspace.root}
              Select a note from the sidebar, or create one with <strong>New</strong>.
            {:else}
              Open a folder, or start a new document with <strong>New</strong> (Ctrl+N).
              Your notes are plain <code>.md</code> files on disk.
            {/if}
          </p>
        </div>
      {/if}
    </div>
  </div>
  <StatusBar />
</div>

{#if workspace.insertTableOpen}
  <InsertTableModal
    onConfirm={(cols, rows) => workspace.confirmInsertTable(cols, rows)}
    onCancel={() => workspace.cancelInsertTable()}
  />
{/if}

{#if ui.preferencesOpen}
  <PreferencesModal onClose={() => ui.closePreferences()} />
{/if}

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
    padding: 24px;
  }
  .empty p {
    margin: 0;
    max-width: 32em;
    text-align: center;
    line-height: 1.7;
    opacity: 0.6;
  }
  .empty code {
    display: inline-block;
    background: var(--button-hover-bg);
    padding: 1px 6px;
    margin: 0 0.1em;
    border-radius: 4px;
    font-size: 0.95em;
  }
</style>
