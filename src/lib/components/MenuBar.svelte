<script lang="ts">
  import { workspace } from "../stores/workspace.svelte";
  import * as ipc from "../ipc/commands";

  let open = $state<string | null>(null);

  function toggle(menu: string) {
    open = open === menu ? null : menu;
  }
  function hover(menu: string) {
    if (open) open = menu;
  }
  function run(fn: () => void) {
    open = null;
    fn();
  }
</script>

<svelte:window
  onclick={(e) => {
    if (!(e.target as HTMLElement).closest(".menubar")) open = null;
  }}
/>

<div class="menubar" role="menubar" tabindex="-1">
  <div class="menu">
    <button
      class="menu-title"
      class:active={open === "file"}
      onclick={() => toggle("file")}
      onmouseenter={() => hover("file")}
    >
      File
    </button>
    {#if open === "file"}
      <div class="dropdown" role="menu">
        <button role="menuitem" onclick={() => run(() => workspace.newFile())}>
          New<span class="key">Ctrl+N</span>
        </button>
        <button role="menuitem" onclick={() => run(() => ipc.newWindow())}>
          New Window<span class="key">Ctrl+Shift+N</span>
        </button>
        <div class="sep"></div>
        <button role="menuitem" onclick={() => run(() => workspace.openFile())}>
          Open…<span class="key">Ctrl+O</span>
        </button>
        <button role="menuitem" onclick={() => run(() => workspace.openVault())}>
          Open Folder…<span class="key">Ctrl+Shift+O</span>
        </button>
        <div class="sep"></div>
        <button
          role="menuitem"
          disabled={!workspace.hasDoc || (!workspace.dirty && !workspace.untitled)}
          onclick={() => run(() => workspace.save())}
        >
          Save<span class="key">Ctrl+S</span>
        </button>
        <button
          role="menuitem"
          disabled={!workspace.hasDoc}
          onclick={() => run(() => workspace.saveAs())}
        >
          Save As…<span class="key">Ctrl+Shift+S</span>
        </button>
        <div class="sep"></div>
        <button
          role="menuitem"
          disabled={!workspace.activeAbsPath}
          onclick={() => run(() => workspace.showProperties())}
        >
          Properties…
        </button>
        <button
          role="menuitem"
          disabled={!workspace.activeAbsPath}
          onclick={() => run(() => workspace.revealLocation())}
        >
          Open File Location…
        </button>
        <button
          role="menuitem"
          disabled={!workspace.activeAbsPath}
          onclick={() => run(() => workspace.deleteActive())}
        >
          Delete…
        </button>
        <div class="sep"></div>
        <button role="menuitem" onclick={() => run(() => ipc.closeWindow())}>
          Close<span class="key">Ctrl+W</span>
        </button>
      </div>
    {/if}
  </div>

  <div class="menu">
    <button
      class="menu-title"
      class:active={open === "edit"}
      onclick={() => toggle("edit")}
      onmouseenter={() => hover("edit")}
    >
      Edit
    </button>
    {#if open === "edit"}
      <div class="dropdown" role="menu">
        <button
          role="menuitem"
          disabled={!workspace.editCanUndo()}
          onclick={() => run(() => workspace.editUndo())}
        >
          Undo<span class="key">Ctrl+Z</span>
        </button>
        <button
          role="menuitem"
          disabled={!workspace.editCanRedo()}
          onclick={() => run(() => workspace.editRedo())}
        >
          Redo<span class="key">Ctrl+Y</span>
        </button>
        <div class="sep"></div>
        <button
          role="menuitem"
          disabled={!workspace.hasDoc}
          onclick={() => run(() => workspace.editCut())}
        >
          Cut<span class="key">Ctrl+X</span>
        </button>
        <button
          role="menuitem"
          disabled={!workspace.hasDoc}
          onclick={() => run(() => workspace.editCopy())}
        >
          Copy<span class="key">Ctrl+C</span>
        </button>
        <button
          role="menuitem"
          disabled={!workspace.imageAtCursor()}
          onclick={() => run(() => workspace.copyImageContent())}
        >
          Copy Image Content
        </button>
        <button
          role="menuitem"
          disabled={!workspace.hasDoc}
          onclick={() => run(() => workspace.editPaste())}
        >
          Paste<span class="key">Ctrl+V</span>
        </button>
        <div class="sep"></div>
        <button
          role="menuitem"
          disabled={!workspace.hasDoc}
          onclick={() => run(() => workspace.copyAsPlainText())}
        >
          Copy as Plain Text
        </button>
        <button
          role="menuitem"
          disabled={!workspace.hasDoc}
          onclick={() => run(() => workspace.copyAsMarkdown())}
        >
          Copy as Markdown<span class="key">Ctrl+Shift+C</span>
        </button>
        <button
          role="menuitem"
          disabled={!workspace.hasDoc}
          onclick={() => run(() => workspace.copyAsHtmlCode())}
        >
          Copy as HTML Code
        </button>
        <button
          role="menuitem"
          disabled={!workspace.hasDoc}
          onclick={() => run(() => workspace.copyWithoutThemeStyling())}
        >
          Copy without Theme Styling
        </button>
        <div class="sep"></div>
        <button
          role="menuitem"
          disabled={!workspace.hasDoc}
          onclick={() => run(() => workspace.editPaste())}
        >
          Paste as Plain Text<span class="key">Ctrl+Shift+V</span>
        </button>
      </div>
    {/if}
  </div>

  <div class="menu">
    <button
      class="menu-title"
      class:active={open === "view"}
      onclick={() => toggle("view")}
      onmouseenter={() => hover("view")}
    >
      View
    </button>
    {#if open === "view"}
      <div class="dropdown" role="menu">
        <button role="menuitem" onclick={() => run(() => (workspace.activeView = "explorer"))}>
          Explorer
        </button>
        <button role="menuitem" onclick={() => run(() => (workspace.activeView = "tags"))}>
          Tags
        </button>
        <button role="menuitem" onclick={() => run(() => (workspace.activeView = "outline"))}>
          Outline
        </button>
      </div>
    {/if}
  </div>
</div>

<style>
  .menubar {
    display: flex;
    align-items: stretch;
    height: 30px;
    background: var(--toolbar-bg);
    border-bottom: 1px solid var(--border);
    flex: 0 0 auto;
    -webkit-user-select: none;
    user-select: none;
  }
  .menu {
    position: relative;
    display: flex;
  }
  .menu-title {
    border: none;
    background: none;
    color: inherit;
    font: inherit;
    font-size: 13px;
    padding: 0 10px;
    cursor: pointer;
  }
  .menu-title:hover,
  .menu-title.active {
    background: var(--button-hover-bg);
  }
  .dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    min-width: 200px;
    z-index: 50;
    background: var(--menu-bg, var(--button-bg));
    border: 1px solid var(--border);
    border-radius: 0 0 6px 6px;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
    padding: 4px;
  }
  .dropdown button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    width: 100%;
    border: none;
    background: none;
    color: inherit;
    font: inherit;
    font-size: 13px;
    text-align: left;
    padding: 5px 10px;
    border-radius: 4px;
    cursor: pointer;
  }
  .dropdown button:hover:not(:disabled) {
    background: var(--accent);
    color: #fff;
  }
  .dropdown button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .key {
    opacity: 0.6;
    font-size: 11px;
  }
  .dropdown button:hover:not(:disabled) .key {
    opacity: 0.85;
  }
  .sep {
    height: 1px;
    background: var(--border);
    margin: 4px 6px;
  }
</style>
