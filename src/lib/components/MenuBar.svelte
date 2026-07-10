<script lang="ts">
  import { workspace } from "../stores/workspace.svelte";
  import { ui } from "../stores/ui.svelte";
  import * as ipc from "../ipc/commands";

  let open = $state<string | null>(null);
  let sub = $state<string | null>(null);

  function toggle(menu: string) {
    open = open === menu ? null : menu;
    sub = null;
  }
  function hover(menu: string) {
    if (open) {
      open = menu;
      sub = null;
    }
  }
  function run(fn: () => void) {
    open = null;
    sub = null;
    fn();
  }

  /** A paragraph command as a menu action. */
  const pc = (id: string) => () => workspace.paragraphCommand(id);

  interface MI {
    label: string;
    act: () => void;
    key?: string;
    checked?: boolean;
    disabled?: boolean;
    /** true for items inside a submenu (so hovering them keeps it open). */
    inSub?: boolean;
  }
</script>

{#snippet mi(o: MI)}
  <button
    class="mi"
    role="menuitem"
    disabled={o.disabled}
    onmouseenter={() => {
      if (!o.inSub) sub = null;
    }}
    onclick={() => run(o.act)}
  >
    <span class="check">{o.checked ? "✓" : ""}</span>
    <span class="lbl">{o.label}</span>
    {#if o.key}<span class="key">{o.key}</span>{/if}
  </button>
{/snippet}

<svelte:window
  onclick={(e) => {
    if (!(e.target as HTMLElement).closest(".menubar")) {
      open = null;
      sub = null;
    }
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
        <button role="menuitem" onclick={() => run(() => ui.openPreferences())}>
          Preferences…<span class="key">Ctrl+,</span>
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
          onclick={() => run(() => workspace.openEmojiPicker())}
        >
          Emoji &amp; Symbols
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
      class:active={open === "paragraph"}
      onclick={() => toggle("paragraph")}
      onmouseenter={() => hover("paragraph")}
    >
      Paragraph
    </button>
    {#if open === "paragraph"}
      {@const bs = workspace.blockState()}
      {@const tbl = workspace.hasActiveTable()}
      <div class="dropdown" role="menu">
        {@render mi({ label: "Heading 1", act: pc("heading1"), key: "Ctrl+1", checked: bs?.heading === 1 })}
        {@render mi({ label: "Heading 2", act: pc("heading2"), key: "Ctrl+2", checked: bs?.heading === 2 })}
        {@render mi({ label: "Heading 3", act: pc("heading3"), key: "Ctrl+3", checked: bs?.heading === 3 })}
        {@render mi({ label: "Heading 4", act: pc("heading4"), key: "Ctrl+4", checked: bs?.heading === 4 })}
        {@render mi({ label: "Heading 5", act: pc("heading5"), key: "Ctrl+5", checked: bs?.heading === 5 })}
        {@render mi({ label: "Heading 6", act: pc("heading6"), key: "Ctrl+6", checked: bs?.heading === 6 })}
        {@render mi({ label: "Paragraph", act: pc("paragraph"), key: "Ctrl+0", checked: bs ? bs.heading === 0 : false })}
        <div class="sep"></div>
        {@render mi({ label: "Increase Heading Level", act: pc("headingIncrease"), key: "Ctrl+=" })}
        {@render mi({ label: "Decrease Heading Level", act: pc("headingDecrease"), key: "Ctrl+-" })}
        <div class="sep"></div>

        <div class="submenu-anchor">
          <button class="mi has-sub" role="menuitem" onmouseenter={() => (sub = "table")}>
            <span class="check"></span><span class="lbl">Table</span><span class="arrow">›</span>
          </button>
          {#if sub === "table"}
            <div class="dropdown submenu" role="menu">
              {@render mi({ label: "Insert Table", act: () => workspace.openInsertTable(), key: "Ctrl+T", inSub: true })}
              <div class="sep"></div>
              {@render mi({ label: "Add Row Above", act: () => workspace.tableCommand("tableAddRowAbove"), disabled: !bs?.inTable && !tbl, inSub: true })}
              {@render mi({ label: "Add Row Below", act: () => workspace.tableCommand("tableAddRowBelow"), key: "Ctrl+Enter", disabled: !bs?.inTable && !tbl, inSub: true })}
              <div class="sep"></div>
              {@render mi({ label: "Add Column Before", act: () => workspace.tableCommand("tableAddColBefore"), disabled: !bs?.inTable && !tbl, inSub: true })}
              {@render mi({ label: "Add Column After", act: () => workspace.tableCommand("tableAddColAfter"), disabled: !bs?.inTable && !tbl, inSub: true })}
              <div class="sep"></div>
              {@render mi({ label: "Move Row Up", act: () => workspace.tableCommand("tableMoveRowUp"), disabled: !bs?.inTable && !tbl, inSub: true })}
              {@render mi({ label: "Move Row Down", act: () => workspace.tableCommand("tableMoveRowDown"), disabled: !bs?.inTable && !tbl, inSub: true })}
              {@render mi({ label: "Move Column Left", act: () => workspace.tableCommand("tableMoveColLeft"), key: "Alt+←", disabled: !bs?.inTable && !tbl, inSub: true })}
              {@render mi({ label: "Move Column Right", act: () => workspace.tableCommand("tableMoveColRight"), key: "Alt+→", disabled: !bs?.inTable && !tbl, inSub: true })}
              <div class="sep"></div>
              {@render mi({ label: "Delete Row", act: () => workspace.tableCommand("tableDeleteRow"), key: "Ctrl+Shift+Backspace", disabled: !bs?.inTable && !tbl, inSub: true })}
              {@render mi({ label: "Delete Column", act: () => workspace.tableCommand("tableDeleteCol"), disabled: !bs?.inTable && !tbl, inSub: true })}
              <div class="sep"></div>
              {@render mi({ label: "Copy Table", act: () => workspace.copyTable(), disabled: !bs?.inTable && !tbl, inSub: true })}
              {@render mi({ label: "Prettify Source Code", act: () => workspace.tableCommand("tablePrettify"), disabled: !bs?.inTable && !tbl, inSub: true })}
              <div class="sep"></div>
              {@render mi({ label: "Delete Table", act: () => workspace.tableCommand("tableDelete"), disabled: !bs?.inTable && !tbl, inSub: true })}
            </div>
          {/if}
        </div>

        {@render mi({ label: "Math Block", act: pc("mathBlock"), key: "Ctrl+Shift+M" })}
        {@render mi({ label: "Code Fences", act: pc("codeFence"), key: "Ctrl+Shift+K" })}

        <div class="submenu-anchor">
          <button class="mi has-sub" role="menuitem" onmouseenter={() => (sub = "code")}>
            <span class="check"></span><span class="lbl">Code Tools</span><span class="arrow">›</span>
          </button>
          {#if sub === "code"}
            <div class="dropdown submenu" role="menu">
              {@render mi({ label: "Copy Code Content", act: () => workspace.copyCodeContent(), disabled: !bs?.inCode, inSub: true })}
              {@render mi({ label: "Auto Indent Selected Code", act: pc("autoIndentSelected"), disabled: !bs?.inCode, inSub: true })}
              {@render mi({ label: "Auto Indent Whole Code", act: pc("autoIndentWhole"), disabled: !bs?.inCode, inSub: true })}
            </div>
          {/if}
        </div>

        <div class="submenu-anchor">
          <button class="mi has-sub" role="menuitem" onmouseenter={() => (sub = "alert")}>
            <span class="check"></span><span class="lbl">Alert</span><span class="arrow">›</span>
          </button>
          {#if sub === "alert"}
            <div class="dropdown submenu" role="menu">
              {@render mi({ label: "Note Block", act: pc("alertNote"), inSub: true })}
              {@render mi({ label: "Tip Block", act: pc("alertTip"), inSub: true })}
              {@render mi({ label: "Important Block", act: pc("alertImportant"), inSub: true })}
              {@render mi({ label: "Warning Block", act: pc("alertWarning"), inSub: true })}
              {@render mi({ label: "Caution Block", act: pc("alertCaution"), inSub: true })}
            </div>
          {/if}
        </div>
        <div class="sep"></div>

        {@render mi({ label: "Quote", act: pc("quote"), key: "Ctrl+Shift+Q" })}
        <div class="sep"></div>

        {@render mi({ label: "Ordered List", act: pc("listOrdered"), key: "Ctrl+Shift+[", checked: bs?.orderedList })}
        {@render mi({ label: "Unordered List", act: pc("listUnordered"), key: "Ctrl+Shift+]", checked: bs?.bulletList })}
        {@render mi({ label: "Task List", act: pc("listTask"), key: "Ctrl+Shift+X", checked: bs?.taskList })}

        <div class="submenu-anchor">
          <button class="mi has-sub" role="menuitem" onmouseenter={() => (sub = "task")}>
            <span class="check"></span><span class="lbl">Task Status</span><span class="arrow">›</span>
          </button>
          {#if sub === "task"}
            <div class="dropdown submenu" role="menu">
              {@render mi({ label: "Toggle Task Status", act: pc("taskToggle"), disabled: !bs?.taskList, inSub: true })}
              <div class="sep"></div>
              {@render mi({ label: "Mark as Complete", act: pc("taskComplete"), disabled: !bs?.taskList, checked: bs?.taskChecked === true, inSub: true })}
              {@render mi({ label: "Mark as Incomplete", act: pc("taskIncomplete"), disabled: !bs?.taskList, checked: bs?.taskChecked === false, inSub: true })}
            </div>
          {/if}
        </div>

        <div class="submenu-anchor">
          <button class="mi has-sub" role="menuitem" onmouseenter={() => (sub = "indent")}>
            <span class="check"></span><span class="lbl">List Indentation</span><span class="arrow">›</span>
          </button>
          {#if sub === "indent"}
            <div class="dropdown submenu" role="menu">
              {@render mi({ label: "Indent", act: pc("indent"), key: "Ctrl+]", inSub: true })}
              {@render mi({ label: "Outdent", act: pc("outdent"), key: "Ctrl+[", inSub: true })}
            </div>
          {/if}
        </div>
        <div class="sep"></div>

        {@render mi({ label: "Insert Paragraph Before", act: pc("insertParagraphBefore") })}
        {@render mi({ label: "Insert Paragraph After", act: pc("insertParagraphAfter") })}
        <div class="sep"></div>

        {@render mi({ label: "Link Reference", act: pc("linkReference") })}
        {@render mi({ label: "Footnotes", act: pc("footnote") })}
        <div class="sep"></div>

        {@render mi({ label: "Horizontal Line", act: pc("horizontalRule") })}
        {@render mi({ label: "Table of Contents", act: pc("tableOfContents") })}
        {@render mi({ label: "YAML Front Matter", act: pc("yamlFrontMatter") })}
      </div>
    {/if}
  </div>

  <div class="menu">
    <button
      class="menu-title"
      class:active={open === "format"}
      onclick={() => toggle("format")}
      onmouseenter={() => hover("format")}
    >
      Format
    </button>
    {#if open === "format"}
      {@const is = workspace.inlineState()}
      <div class="dropdown" role="menu">
        {@render mi({ label: "Strong", act: pc("toggleBold"), key: "Ctrl+B", checked: is?.bold })}
        {@render mi({ label: "Emphasis", act: pc("toggleItalic"), key: "Ctrl+I", checked: is?.italic })}
        {@render mi({ label: "Underline", act: pc("toggleUnderline"), key: "Ctrl+U" })}
        {@render mi({ label: "Code", act: pc("toggleCode"), key: "Ctrl+Shift+`", checked: is?.code })}
        <div class="sep"></div>
        {@render mi({ label: "Inline Math", act: pc("toggleMath") })}
        {@render mi({ label: "Strike", act: pc("toggleStrike"), key: "Alt+Shift+5", checked: is?.strike })}
        {@render mi({ label: "Comment", act: pc("toggleComment") })}
        <div class="sep"></div>
        {@render mi({ label: "Hyperlink", act: pc("toggleLink"), key: "Ctrl+K", checked: is?.link })}
        <div class="submenu-anchor">
          <button class="mi has-sub" role="menuitem" onmouseenter={() => (sub = "hyperlink")}>
            <span class="check"></span><span class="lbl">Hyperlink Actions</span><span class="arrow">›</span>
          </button>
          {#if sub === "hyperlink"}
            <div class="dropdown submenu" role="menu">
              {@render mi({ label: "Open Link", act: () => workspace.openLink(), disabled: !is?.link, inSub: true })}
              {@render mi({ label: "Copy Link Address", act: () => workspace.copyLinkAddress(), disabled: !is?.link, inSub: true })}
            </div>
          {/if}
        </div>
        <div class="sep"></div>
        {@render mi({ label: "Clear Format", act: pc("clearFormat"), key: "Ctrl+\\" })}
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

  <div class="toolbar">
    <div class="tb-group" role="group" aria-label="Page width">
      <button
        class="tb-btn"
        class:active={workspace.pageWidth === "normal"}
        title="Normal width"
        aria-label="Normal width"
        onclick={() => workspace.setPageWidth("normal")}
      >
        <svg viewBox="0 0 22 16">
          <rect x="1.5" y="2" width="19" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.2" />
          <rect x="8" y="5" width="6" height="6" rx="1" fill="currentColor" />
        </svg>
      </button>
      <button
        class="tb-btn"
        class:active={workspace.pageWidth === "wide"}
        title="Wide width"
        aria-label="Wide width"
        onclick={() => workspace.setPageWidth("wide")}
      >
        <svg viewBox="0 0 22 16">
          <rect x="1.5" y="2" width="19" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.2" />
          <rect x="6" y="5" width="10" height="6" rx="1" fill="currentColor" />
        </svg>
      </button>
      <button
        class="tb-btn"
        class:active={workspace.pageWidth === "full"}
        title="Full width"
        aria-label="Full width"
        onclick={() => workspace.setPageWidth("full")}
      >
        <svg viewBox="0 0 22 16">
          <rect x="1.5" y="2" width="19" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.2" />
          <rect x="4" y="5" width="14" height="6" rx="1" fill="currentColor" />
        </svg>
      </button>
    </div>
    <div class="tb-group" role="group" aria-label="Source code mode">
      <button
        class="tb-btn"
        class:active={workspace.sourceMode}
        title="Source code mode"
        aria-label="Source code mode"
        onclick={() => workspace.toggleSourceMode()}
      >
        <svg viewBox="0 0 22 16">
          <path
            d="M8 4 L4 8 L8 12 M14 4 L18 8 L14 12"
            fill="none"
            stroke="currentColor"
            stroke-width="1.4"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
    </div>
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
  .toolbar {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 8px;
  }
  .tb-group {
    display: flex;
    gap: 1px;
  }
  .tb-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 22px;
    padding: 0;
    border: none;
    background: none;
    color: inherit;
    border-radius: 4px;
    cursor: pointer;
  }
  .tb-btn:hover {
    background: var(--button-hover-bg);
  }
  .tb-btn.active {
    background: var(--accent-soft);
    color: var(--accent);
  }
  .tb-btn svg {
    width: 17px;
    height: 13px;
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
    white-space: nowrap;
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

  /* Paragraph menu: checkmark column, labels, submenu flyouts. */
  .dropdown button.mi {
    gap: 8px;
    justify-content: flex-start;
  }
  .mi .check {
    flex: 0 0 16px;
    text-align: center;
    font-size: 12px;
  }
  .mi .lbl {
    flex: 1 1 auto;
  }
  .mi .arrow {
    flex: 0 0 auto;
    opacity: 0.6;
    font-size: 14px;
  }
  .dropdown button.mi:hover:not(:disabled) .arrow {
    opacity: 0.9;
  }
  .submenu-anchor {
    position: relative;
  }
  .dropdown.submenu {
    top: -5px;
    left: 100%;
    border-radius: 6px;
    z-index: 60;
  }
</style>
