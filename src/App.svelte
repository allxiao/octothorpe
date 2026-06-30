<script lang="ts">
  import EditorHost from "./lib/editor/EditorHost.svelte";
  import { openMarkdownFile, saveMarkdownFile } from "./lib/ipc/commands";

  let content = $state(
    "# Welcome to typedown\n\nA Markdown editor that renders **while you type** — put your cursor on a line to edit its raw source, move away to see it rendered.\n\n## Try it\n\n- Make text **bold**, *italic*, or ~~struck through~~\n- Add `inline code` or a [link](https://example.com)\n- [ ] check off a task\n- [x] this one is done\n\n> Tip: broken or half-typed Markdown still renders, best-effort.\n",
  );
  let currentPath = $state<string | null>(null);
  let dirty = $state(false);
  let status = $state("");

  async function handleOpen() {
    try {
      const result = await openMarkdownFile();
      if (result) {
        content = result.content;
        currentPath = result.path;
        dirty = false;
        status = `Opened ${result.path}`;
      }
    } catch (err) {
      status = `Open failed: ${err}`;
    }
  }

  async function handleSave() {
    try {
      const path = await saveMarkdownFile(currentPath, content);
      if (path) {
        currentPath = path;
        dirty = false;
        status = `Saved ${path}`;
      }
    } catch (err) {
      status = `Save failed: ${err}`;
    }
  }

  function handleChange(next: string) {
    content = next;
    dirty = true;
  }
</script>

<div class="app">
  <header class="toolbar">
    <button onclick={handleOpen}>Open</button>
    <button onclick={handleSave}>Save</button>
    <span class="path">{currentPath ?? "Untitled"}{dirty ? " •" : ""}</span>
    <span class="status">{status}</span>
  </header>
  <main class="editor-pane">
    <EditorHost {content} onchange={handleChange} onsave={handleSave} />
  </main>
</div>

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
  }
  .toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border-bottom: 1px solid var(--border);
    background: var(--toolbar-bg);
    flex: 0 0 auto;
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
  .toolbar button:hover {
    background: var(--button-hover-bg);
  }
  .path {
    margin-left: 8px;
    font-weight: 600;
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
</style>
