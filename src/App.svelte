<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { workspace } from "./lib/stores/workspace.svelte";
  import { ui } from "./lib/stores/ui.svelte";
  import { preferences } from "./lib/preferences/store.svelte";
  import { initDragDrop } from "./lib/dragdrop";
  import * as ipc from "./lib/ipc/commands";
  import MenuBar from "./lib/components/MenuBar.svelte";
  import ActivityBar from "./lib/components/ActivityBar.svelte";
  import Sidebar from "./lib/components/Sidebar.svelte";
  import StatusBar from "./lib/components/StatusBar.svelte";
  import EditorHost from "./lib/editor/EditorHost.svelte";
  import InsertTableModal from "./lib/components/InsertTableModal.svelte";
  import PreferencesModal from "./lib/components/PreferencesModal.svelte";
  import ContextMenu from "./lib/components/ContextMenu.svelte";

  let unlistenDrop: (() => void) | null = null;

  onMount(() => {
    void boot();
    window.addEventListener("wheel", onWheel, { passive: false });
  });
  onDestroy(() => {
    unlistenDrop?.();
    window.removeEventListener("wheel", onWheel);
  });

  async function boot() {
    await preferences.load();
    void workspace.listenForChanges();
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        unlistenDrop = await initDragDrop();
      } catch (e) {
        console.error("[dragdrop] failed to initialize", e);
      }
    }
    await initStartup();
  }

  // Apply the color theme preference. "system" removes the attribute so the
  // prefers-color-scheme media query takes over; "light"/"dark" force it.
  $effect(() => {
    const theme = preferences.get<string>("appearance.theme");
    const el = document.documentElement;
    if (theme === "light" || theme === "dark") el.dataset.theme = theme;
    else delete el.dataset.theme;
  });

  // Apply the whole-app zoom preference.
  $effect(() => {
    const pct = Number(preferences.get<string>("appearance.zoom")) || 100;
    (document.documentElement.style as CSSStyleDeclaration & { zoom: string }).zoom = String(pct / 100);
  });

  // Ctrl + mouse-wheel steps the zoom preset (when appearance.zoomWithCtrlWheel is on).
  const ZOOM_LEVELS = ["50", "67", "75", "80", "90", "100", "110", "125", "150", "175", "200"];
  function onWheel(e: WheelEvent) {
    if (!e.ctrlKey || !preferences.get<boolean>("appearance.zoomWithCtrlWheel")) return;
    e.preventDefault();
    const i = ZOOM_LEVELS.indexOf(preferences.get<string>("appearance.zoom"));
    if (i < 0) return;
    const next = e.deltaY < 0 ? Math.min(ZOOM_LEVELS.length - 1, i + 1) : Math.max(0, i - 1);
    if (next !== i) preferences.set("appearance.zoom", ZOOM_LEVELS[next]);
  }

  // New Window launches a fresh process; those skip restoring the last folder
  // (and may open straight onto an empty buffer). The main process applies the
  // files.onLaunch preference.
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
        await applyOnLaunch();
      }
    } catch {
      void workspace.restoreLastVault();
    }
  }

  /** Honor the files.onLaunch preference on a fresh (non-New-Window) start. */
  async function applyOnLaunch() {
    const mode = preferences.get<string>("files.onLaunch");
    if (mode === "openNewFile") {
      workspace.openUntitled();
      return;
    }
    // Nothing to restore if recent tracking is off.
    if (!preferences.get<boolean>("files.recordRecent")) return;
    // "restoreFolders" reopens just the folder; the others also reopen the last file.
    // (openCustomFolder falls back to full restore until a custom-folder path exists.)
    const reopenFile = mode !== "restoreFolders";
    await workspace.restoreLastVault(reopenFile);
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

<div class="app" style:--editor-max-width={workspace.pageWidthCss}>
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
  {#if preferences.get("appearance.showStatusBar")}
    <StatusBar />
  {/if}
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

{#if ui.dragOver}
  <div class="drop-overlay">
    <div class="drop-hint">Drop files to open or insert</div>
  </div>
{/if}

<ContextMenu />

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
  /* Full-window hint while OS files are dragged over. pointer-events:none so it
     never interferes with the native (OS-level) drop target. */
  .drop-overlay {
    position: fixed;
    inset: 0;
    z-index: 200;
    pointer-events: none;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--accent-soft);
    border: 2px dashed var(--accent);
  }
  .drop-hint {
    padding: 10px 18px;
    border-radius: 8px;
    background: var(--menu-bg, #fff);
    border: 1px solid var(--border);
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.25);
    font-size: 14px;
    font-weight: 500;
  }
</style>
