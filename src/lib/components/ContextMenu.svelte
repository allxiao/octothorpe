<script lang="ts">
  import { tick } from "svelte";
  import { contextMenu } from "../stores/contextMenu.svelte";
  import { workspace } from "../stores/workspace.svelte";
  import { icons, type IconName } from "./contextMenuIcons";

  // --- menu model ----------------------------------------------------------

  interface IconBtn {
    icon: IconName;
    title: string;
    act: () => void;
    active?: boolean;
    disabled?: boolean;
  }
  interface LabelItem {
    label: string;
    icon?: IconName;
    act?: () => void;
    key?: string;
    checked?: boolean;
    disabled?: boolean;
    submenu?: LabelItem[];
    /** Render as a separator line instead of a clickable row. */
    sep?: boolean;
  }
  type Row =
    | { kind: "icons"; icons: IconBtn[]; ni: number }
    | { kind: "item"; item: LabelItem; ni: number }
    | { kind: "sep"; ni: -1 };

  const pc = (id: string) => () => workspace.paragraphCommand(id);
  const tc = (id: string) => () => workspace.tableCommand(id);

  /** Build the rows for the current context, assigning a nav index (`ni`) to each
   *  navigable (non-separator) row. */
  function buildRows(): Row[] {
    const ctx = contextMenu.ctx;
    if (!ctx) return [];
    const b = ctx.block;
    const i = ctx.inline;
    const raw: Array<
      | { kind: "icons"; icons: IconBtn[] }
      | { kind: "item"; item: LabelItem }
      | { kind: "sep" }
    > = [];

    const hasSel = !!ctx.selectedText.trim();
    raw.push({
      kind: "item",
      item: {
        label: "Search Web",
        icon: "search",
        disabled: !hasSel,
        act: () => workspace.searchWeb(ctx.selectedText),
      },
    });
    raw.push({ kind: "sep" });

    // Cut / Copy / Paste / Delete
    raw.push({
      kind: "icons",
      icons: [
        { icon: "cut", title: "Cut", act: () => workspace.editCut() },
        { icon: "copy", title: "Copy", act: () => workspace.editCopy() },
        { icon: "paste", title: "Paste", act: () => workspace.editPaste() },
        { icon: "delete", title: "Delete", act: () => workspace.deleteSelection() },
      ],
    });

    // Copy / Paste As…
    raw.push({
      kind: "item",
      item: {
        label: "Copy / Paste As…",
        submenu: [
          { label: "Copy as Plain Text", act: () => workspace.copyAsPlainText() },
          { label: "Copy as Markdown", key: "Ctrl+Shift+C", act: () => workspace.copyAsMarkdown() },
          { label: "Copy as HTML Code", act: () => workspace.copyAsHtmlCode() },
          { label: "Copy without Theme Styling", act: () => workspace.copyWithoutThemeStyling() },
          { label: "Paste as Plain Text", key: "Ctrl+Shift+V", act: () => workspace.editPaste() },
        ],
      },
    });
    raw.push({ kind: "sep" });

    // Inline formatting
    raw.push({
      kind: "icons",
      icons: [
        { icon: "bold", title: "Bold", act: pc("toggleBold"), active: i?.bold },
        { icon: "italic", title: "Italic", act: pc("toggleItalic"), active: i?.italic },
        { icon: "code", title: "Code", act: pc("toggleCode"), active: i?.code },
        { icon: "link", title: "Link", act: pc("toggleLink"), active: i?.link },
      ],
    });

    // Block formatting
    raw.push({
      kind: "icons",
      icons: [
        { icon: "quote", title: "Quote", act: pc("quote") },
        { icon: "orderedList", title: "Ordered List", act: pc("listOrdered"), active: b?.orderedList },
        { icon: "unorderedList", title: "Unordered List", act: pc("listUnordered"), active: b?.bulletList },
        { icon: "taskList", title: "Task List", act: pc("listTask"), active: b?.taskList },
      ],
    });

    // Indent / outdent (list items only)
    if (ctx.isListItem) {
      raw.push({
        kind: "icons",
        icons: [
          { icon: "outdent", title: "Outdent", act: pc("outdent") },
          { icon: "indent", title: "Indent", act: pc("indent") },
        ],
      });
    }
    raw.push({ kind: "sep" });

    if (ctx.scope === "tableCell") {
      raw.push({ kind: "item", item: { label: "Table", submenu: tableSubmenu() } });
      raw.push({ kind: "item", item: { label: "Insert", submenu: tableInsertSubmenu() } });
    } else {
      const h = b?.heading ?? 0;
      raw.push({
        kind: "item",
        item: { label: h >= 1 ? `Heading ${h}` : "Paragraph", submenu: paragraphSubmenu(h) },
      });
      raw.push({ kind: "item", item: { label: "Insert", submenu: docInsertSubmenu() } });
    }

    // Assign nav indices.
    let ni = 0;
    return raw.map((r) =>
      r.kind === "sep" ? { ...r, ni: -1 as const } : { ...r, ni: ni++ },
    ) as Row[];
  }

  function paragraphSubmenu(h: number): LabelItem[] {
    const out: LabelItem[] = [];
    for (let n = 1; n <= 6; n++)
      out.push({ label: `Heading ${n}`, key: `Ctrl+${n}`, checked: h === n, act: pc(`heading${n}`) });
    out.push({ label: "", sep: true });
    out.push({ label: "Paragraph", key: "Ctrl+0", checked: h === 0, act: pc("paragraph") });
    return out;
  }

  function docInsertSubmenu(): LabelItem[] {
    return [
      { label: "Image", key: "Ctrl+Shift+I", act: () => workspace.insertImageFromPicker() },
      { label: "Footnotes", act: pc("footnote") },
      { label: "Link Reference", act: pc("linkReference") },
      { label: "Horizontal Line", act: pc("horizontalRule") },
      { label: "Table", key: "Ctrl+T", act: () => workspace.openInsertTable() },
      { label: "Code Fences", key: "Ctrl+Shift+K", act: pc("codeFence") },
      { label: "Math Block", key: "Ctrl+Shift+M", act: pc("mathBlock") },
      { label: "Table of Contents", act: pc("tableOfContents") },
      { label: "YAML Front Matter", act: pc("yamlFrontMatter") },
      { label: "Paragraph (before)", act: pc("insertParagraphBefore") },
      { label: "Paragraph (after)", act: pc("insertParagraphAfter") },
    ];
  }

  function tableInsertSubmenu(): LabelItem[] {
    return [
      { label: "Image", key: "Ctrl+Shift+I", act: () => workspace.tableInsertImage() },
      { label: "Paragraph (before)", act: () => workspace.tableInsertParagraph("before") },
      { label: "Paragraph (after)", act: () => workspace.tableInsertParagraph("after") },
    ];
  }

  function tableSubmenu(): LabelItem[] {
    return [
      { label: "Add Row Above", act: tc("tableAddRowAbove") },
      { label: "Add Row Below", key: "Ctrl+Enter", act: tc("tableAddRowBelow") },
      { label: "Add Column Before", act: tc("tableAddColBefore") },
      { label: "Add Column After", act: tc("tableAddColAfter") },
      { label: "Move Row Up", key: "Alt+↑", act: tc("tableMoveRowUp") },
      { label: "Move Row Down", key: "Alt+↓", act: tc("tableMoveRowDown") },
      { label: "Move Column Left", key: "Alt+←", act: tc("tableMoveColLeft") },
      { label: "Move Column Right", key: "Alt+→", act: tc("tableMoveColRight") },
      { label: "Delete Row", key: "Ctrl+Shift+⌫", act: tc("tableDeleteRow") },
      { label: "Delete Column", act: tc("tableDeleteCol") },
      { label: "Copy Table", act: () => workspace.copyTable() },
      { label: "Prettify Source Code", act: tc("tablePrettify") },
      { label: "Delete Table", act: tc("tableDelete") },
    ];
  }

  // --- reactive state ------------------------------------------------------

  let rows = $derived(contextMenu.open ? buildRows() : []);
  let navCount = $derived(rows.filter((r) => r.ni >= 0).length);

  let menuEl = $state<HTMLDivElement | null>(null);
  let px = $state(0);
  let py = $state(0);
  let subFlip = $state(false);
  // Vertical offset (px) of the open submenu relative to its anchor, so a tall
  // submenu near the bottom edge shifts up to stay in the viewport.
  let subTop = $state(-5);

  // Keyboard/hover focus: `active` = nav index of the focused row, `activeCol` =
  // button index within an icon row, `openSub` = nav index whose submenu is open,
  // `subActive` = index within that submenu.
  let active = $state(-1);
  let activeCol = $state(0);
  let openSub = $state(-1);
  let subActive = $state(-1);

  function rowByNi(n: number): Row | undefined {
    return rows.find((r) => r.ni === n);
  }

  // Position + clamp whenever the menu (re)opens.
  $effect(() => {
    if (!contextMenu.open) return;
    // Reset nav + reposition on each open (depend on x/y/ctx).
    px = contextMenu.x;
    py = contextMenu.y;
    active = -1;
    activeCol = 0;
    openSub = -1;
    subActive = -1;
    subFlip = false;
    void tick().then(() => {
      const el = menuEl;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const pad = 8;
      if (contextMenu.x + r.width > window.innerWidth - pad)
        px = Math.max(pad, window.innerWidth - r.width - pad);
      if (contextMenu.y + r.height > window.innerHeight - pad)
        py = Math.max(pad, window.innerHeight - r.height - pad);
      // Flip submenus to the left when the menu sits near the right edge.
      subFlip = px + r.width + 220 > window.innerWidth - pad;
    });
  });

  // Vertically clamp the open submenu so it stays within the viewport (a tall
  // submenu opened near the bottom edge shifts up instead of being cropped).
  $effect(() => {
    if (openSub < 0) {
      subTop = -5;
      return;
    }
    void tick().then(() => {
      const sub = menuEl?.querySelector(".ctx-submenu") as HTMLElement | null;
      const anchor = sub?.parentElement;
      if (!sub || !anchor) return;
      const arect = anchor.getBoundingClientRect();
      const h = sub.getBoundingClientRect().height;
      const pad = 8;
      let vtop = arect.top - 5; // default viewport top (matches CSS top: -5px)
      if (vtop + h > window.innerHeight - pad) vtop = window.innerHeight - pad - h;
      if (vtop < pad) vtop = pad;
      subTop = vtop - arect.top;
    });
  });

  function run(fn?: () => void) {
    contextMenu.close();
    fn?.();
  }

  function openSubmenu(ni: number) {
    openSub = ni;
    subActive = -1;
  }

  // --- keyboard navigation -------------------------------------------------

  function firstEnabledSub(items: LabelItem[], from: number, dir: number): number {
    let n = items.length;
    let idx = from;
    for (let step = 0; step < n; step++) {
      idx = (idx + dir + n) % n;
      if (!items[idx].disabled && !items[idx].sep) return idx;
    }
    return from;
  }
  function nextEnabledRow(from: number, dir: number): number {
    // Icon rows are always enabled; item rows may be disabled.
    let idx = from;
    for (let step = 0; step < navCount; step++) {
      idx = (idx + dir + navCount) % navCount;
      const r = rowByNi(idx);
      if (r && (r.kind === "icons" || (r.kind === "item" && !r.item.disabled))) return idx;
    }
    return from;
  }

  function onKeydown(e: KeyboardEvent) {
    if (!contextMenu.open) return;
    const key = e.key;
    if (key === "Escape") {
      e.preventDefault();
      if (openSub >= 0) {
        openSub = -1;
        subActive = -1;
      } else {
        run();
        workspace.focusEditor?.();
      }
      return;
    }

    // Submenu navigation.
    if (openSub >= 0) {
      const r = rowByNi(openSub);
      const items = r && r.kind === "item" ? r.item.submenu ?? [] : [];
      if (key === "ArrowDown") {
        e.preventDefault();
        subActive = firstEnabledSub(items, subActive < 0 ? -1 : subActive, 1);
      } else if (key === "ArrowUp") {
        e.preventDefault();
        subActive = firstEnabledSub(items, subActive < 0 ? 0 : subActive, -1);
      } else if (key === "ArrowLeft") {
        e.preventDefault();
        openSub = -1;
        subActive = -1;
      } else if (key === "Enter" || key === " ") {
        e.preventDefault();
        const it = items[subActive];
        if (it && !it.disabled) run(it.act);
      }
      return;
    }

    // Top-level navigation.
    if (key === "ArrowDown") {
      e.preventDefault();
      active = nextEnabledRow(active < 0 ? -1 : active, 1);
      activeCol = 0;
    } else if (key === "ArrowUp") {
      e.preventDefault();
      active = nextEnabledRow(active < 0 ? 0 : active, -1);
      activeCol = 0;
    } else if (key === "ArrowRight") {
      e.preventDefault();
      const r = rowByNi(active);
      if (r?.kind === "icons") {
        activeCol = Math.min(activeCol + 1, r.icons.length - 1);
      } else if (r?.kind === "item" && r.item.submenu) {
        openSubmenu(active);
        subActive = firstEnabledSub(r.item.submenu, -1, 1);
      }
    } else if (key === "ArrowLeft") {
      e.preventDefault();
      const r = rowByNi(active);
      if (r?.kind === "icons") activeCol = Math.max(activeCol - 1, 0);
    } else if (key === "Enter" || key === " ") {
      e.preventDefault();
      const r = rowByNi(active);
      if (r?.kind === "icons") {
        const btn = r.icons[activeCol];
        if (btn && !btn.disabled) run(btn.act);
      } else if (r?.kind === "item") {
        if (r.item.submenu) {
          openSubmenu(active);
          subActive = firstEnabledSub(r.item.submenu, -1, 1);
        } else if (!r.item.disabled) {
          run(r.item.act);
        }
      }
    }
  }

  function onWindowPointer(e: MouseEvent) {
    if (!contextMenu.open) return;
    if (menuEl && e.target instanceof Node && menuEl.contains(e.target)) return;
    run();
  }
</script>

<svelte:window
  onkeydown={onKeydown}
  onmousedown={onWindowPointer}
  onresize={() => contextMenu.close()}
  onscrollcapture={() => contextMenu.close()}
/>

{#if contextMenu.open}
  <div
    class="ctx-menu"
    role="menu"
    tabindex="-1"
    bind:this={menuEl}
    style="left: {px}px; top: {py}px;"
    oncontextmenu={(e) => e.preventDefault()}
  >
    {#each rows as row, idx (idx)}
      {#if row.kind === "sep"}
        <div class="ctx-sep"></div>
      {:else if row.kind === "icons"}
        <div class="ctx-icon-row">
          {#each row.icons as btn, ci}
            <button
              type="button"
              class="ctx-icon"
              class:active={btn.active}
              class:focused={active === row.ni && activeCol === ci}
              title={btn.title}
              aria-label={btn.title}
              disabled={btn.disabled}
              onmouseenter={() => {
                active = row.ni;
                activeCol = ci;
                openSub = -1;
              }}
              onclick={() => run(btn.act)}
            >
              {@html icons[btn.icon]}
            </button>
          {/each}
        </div>
      {:else if row.kind === "item"}
        <div class="ctx-anchor">
          <button
            type="button"
            class="ctx-item"
            class:focused={active === row.ni}
            class:has-sub={!!row.item.submenu}
            role="menuitem"
            disabled={row.item.disabled}
            onmouseenter={() => {
              active = row.ni;
              openSub = row.item.submenu ? row.ni : -1;
              subActive = -1;
            }}
            onclick={() => (row.item.submenu ? openSubmenu(row.ni) : run(row.item.act))}
          >
            {#if row.item.icon}<span class="ctx-lead">{@html icons[row.item.icon]}</span>{:else}<span class="ctx-check">{row.item.checked ? "✓" : ""}</span>{/if}
            <span class="ctx-lbl">{row.item.label}</span>
            {#if row.item.key}<span class="ctx-key">{row.item.key}</span>{/if}
            {#if row.item.submenu}<span class="ctx-arrow">›</span>{/if}
          </button>
          {#if row.item.submenu && openSub === row.ni}
            <div class="ctx-menu ctx-submenu" class:flip={subFlip} role="menu" style="top: {subTop}px;">
              {#each row.item.submenu as si, sidx}
                {#if si.sep}
                  <div class="ctx-sep"></div>
                {:else}
                  <button
                    type="button"
                    class="ctx-item"
                    class:focused={subActive === sidx}
                    role="menuitem"
                    disabled={si.disabled}
                    onmouseenter={() => (subActive = sidx)}
                    onclick={() => run(si.act)}
                  >
                    <span class="ctx-check">{si.checked ? "✓" : ""}</span>
                    <span class="ctx-lbl">{si.label}</span>
                    {#if si.key}<span class="ctx-key">{si.key}</span>{/if}
                  </button>
                {/if}
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    {/each}
  </div>
{/if}

<style>
  .ctx-menu {
    position: fixed;
    min-width: 220px;
    z-index: 300;
    background: var(--menu-bg, var(--button-bg));
    border: 1px solid var(--border);
    border-radius: 6px;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
    padding: 4px;
    -webkit-user-select: none;
    user-select: none;
    font-size: 13px;
  }
  .ctx-sep {
    height: 1px;
    background: var(--border);
    margin: 4px 6px;
  }
  .ctx-icon-row {
    display: flex;
    gap: 2px;
    padding: 2px 2px;
  }
  .ctx-icon {
    flex: 1 1 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 30px;
    border: none;
    background: none;
    color: inherit;
    border-radius: 4px;
    cursor: pointer;
  }
  .ctx-icon :global(svg) {
    width: 18px;
    height: 18px;
  }
  .ctx-icon:hover:not(:disabled),
  .ctx-icon.focused:not(:disabled) {
    background: var(--accent);
    color: #fff;
  }
  .ctx-icon.active {
    background: var(--accent-soft);
    color: var(--accent);
  }
  .ctx-icon:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .ctx-anchor {
    position: relative;
  }
  .ctx-item {
    display: flex;
    align-items: center;
    gap: 8px;
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
  .ctx-item:hover:not(:disabled),
  .ctx-item.focused:not(:disabled) {
    background: var(--accent);
    color: #fff;
  }
  .ctx-item:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .ctx-check {
    flex: 0 0 16px;
    text-align: center;
    font-size: 12px;
  }
  .ctx-lead {
    flex: 0 0 18px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .ctx-lead :global(svg) {
    width: 16px;
    height: 16px;
  }
  .ctx-lbl {
    flex: 1 1 auto;
  }
  .ctx-key {
    flex: 0 0 auto;
    opacity: 0.6;
    font-size: 11px;
  }
  .ctx-item:hover:not(:disabled) .ctx-key,
  .ctx-item.focused:not(:disabled) .ctx-key {
    opacity: 0.85;
  }
  .ctx-arrow {
    flex: 0 0 auto;
    opacity: 0.6;
    font-size: 14px;
  }
  .ctx-submenu {
    position: absolute;
    top: -5px;
    left: 100%;
    margin-left: 2px;
  }
  .ctx-submenu.flip {
    left: auto;
    right: 100%;
    margin-left: 0;
    margin-right: 2px;
  }
</style>
