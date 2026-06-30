<script lang="ts">
  import type { Snippet } from "svelte";
  import { workspace } from "../stores/workspace.svelte";
  import Panel from "./Panel.svelte";
  import FileTree from "./FileTree.svelte";
  import TagTree from "./TagTree.svelte";
  import Outline from "./Outline.svelte";

  const titles = { explorer: "Explorer", tags: "Tags", outline: "Outline" } as const;

  let notes = $derived(workspace.filterTag ? workspace.filteredDocs : workspace.allDocs);
  let notesTitle = $derived(workspace.filterTag ? `#${workspace.filterTag}` : "All Notes");

  interface PanelDef {
    id: string;
    title: string;
    snip: Snippet;
    collapsed?: boolean;
  }

  let panelsEl = $state<HTMLElement>();
  // Persisted per-section sizes (flex weights) and collapse, keyed by panel id.
  let weights = $state<Record<string, number>>({});
  let collapsedMap = $state<Record<string, boolean>>({});

  let panels = $derived.by<PanelDef[]>(() => {
    switch (workspace.activeView) {
      case "explorer":
        return [
          { id: "files", title: "Files", snip: filesSnip },
          { id: "outline", title: "Outline", snip: outlineSnip, collapsed: true },
        ];
      case "tags":
        return [
          { id: "tags", title: "Tags", snip: tagsSnip },
          { id: "notes", title: notesTitle, snip: notesSnip },
        ];
      default:
        return [{ id: "outline-only", title: "Outline", snip: outlineSnip }];
    }
  });

  const isCollapsed = (p: PanelDef) => collapsedMap[p.id] ?? p.collapsed ?? false;
  const weightOf = (id: string) => weights[id] ?? 1;

  function toggle(p: PanelDef) {
    collapsedMap[p.id] = !isCollapsed(p);
  }

  /** Show a drag sash when this panel and some panel above are both expanded. */
  function resizable(list: PanelDef[], i: number): boolean {
    if (i === 0 || isCollapsed(list[i])) return false;
    for (let j = i - 1; j >= 0; j--) if (!isCollapsed(list[j])) return true;
    return false;
  }

  function resize(list: PanelDef[], i: number, deltaPx: number) {
    let above = -1;
    for (let j = i - 1; j >= 0; j--) {
      if (!isCollapsed(list[j])) {
        above = j;
        break;
      }
    }
    if (above < 0 || !panelsEl) return;

    const h = panelsEl.clientHeight;
    let total = 0;
    for (const p of list) if (!isCollapsed(p)) total += weightOf(p.id);
    const pxPerWeight = h / total;

    const aId = list[above].id;
    const bId = list[i].id;
    const dw = deltaPx / pxPerWeight;
    const na = weightOf(aId) + dw;
    const nb = weightOf(bId) - dw;
    if (na * pxPerWeight < 50 || nb * pxPerWeight < 50) return; // keep a 50px min
    weights[aId] = na;
    weights[bId] = nb;
  }
</script>

<aside class="sidebar">
  <div class="view-header">{titles[workspace.activeView]}</div>

  {#if !workspace.root}
    <div class="hint">No vault open. Use <strong>File ▸ Open Vault</strong>.</div>
  {:else}
    <div class="panels" bind:this={panelsEl}>
      {#each panels as p, i (p.id)}
        <Panel
          title={p.title}
          first={i === 0}
          collapsed={isCollapsed(p)}
          resizable={resizable(panels, i)}
          weight={weightOf(p.id)}
          ontoggle={() => toggle(p)}
          onsash={(d) => resize(panels, i, d)}
        >
          {@render p.snip()}
        </Panel>
      {/each}
    </div>
  {/if}
</aside>

{#snippet filesSnip()}
  <FileTree nodes={workspace.tree} />
{/snippet}

{#snippet outlineSnip()}
  <Outline />
{/snippet}

{#snippet tagsSnip()}
  {#if workspace.tags.length}
    <TagTree nodes={workspace.tags} />
  {:else}
    <div class="hint">No tags yet — add <code>#tags</code> to your notes.</div>
  {/if}
{/snippet}

{#snippet notesSnip()}
  {#if workspace.filterTag}
    <button class="clear" onclick={() => workspace.clearTagFilter()}>✕ clear filter</button>
  {/if}
  <div class="notes">
    {#each notes as doc (doc.id)}
      <button
        class="note"
        class:active={workspace.activeRelPath === doc.relPath}
        onclick={() => workspace.openDoc(doc.relPath)}
      >
        📄 {doc.title}
      </button>
    {/each}
    {#if notes.length === 0}
      <div class="hint">No notes.</div>
    {/if}
  </div>
{/snippet}

<style>
  .sidebar {
    width: 260px;
    flex: 0 0 auto;
    height: 100%;
    overflow: hidden;
    border-right: 1px solid var(--border);
    background: var(--sidebar-bg);
    display: flex;
    flex-direction: column;
  }
  .view-header {
    flex: 0 0 auto;
    padding: 8px 10px 6px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    opacity: 0.6;
    font-weight: 700;
  }
  .panels {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .notes {
    display: flex;
    flex-direction: column;
  }
  .note {
    border: none;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    padding: 3px 8px;
    font-size: 13px;
    border-radius: 4px;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .note:hover {
    background: var(--button-hover-bg);
  }
  .note.active {
    background: var(--accent-soft);
    font-weight: 600;
  }
  .clear {
    border: none;
    background: none;
    color: inherit;
    cursor: pointer;
    opacity: 0.7;
    font-size: 12px;
    padding: 2px 8px 6px;
  }
  .clear:hover {
    opacity: 1;
  }
  .hint {
    font-size: 12px;
    opacity: 0.6;
    padding: 8px 10px;
    line-height: 1.5;
  }
  .hint :global(code) {
    background: var(--button-hover-bg);
    padding: 0 3px;
    border-radius: 3px;
  }
</style>
