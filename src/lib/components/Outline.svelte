<script lang="ts">
  import { workspace } from "../stores/workspace.svelte";
  import { preferences } from "../preferences/store.svelte";

  const collapsible = $derived(preferences.get<boolean>("files.collapsibleOutline"));

  // For each heading, its parent index (nearest earlier heading of a lower level)
  // and whether it has any nested children — derived from the flat outline levels.
  const layout = $derived.by(() => {
    const items = workspace.outline;
    const parent: number[] = [];
    const hasChildren: boolean[] = [];
    const stack: number[] = [];
    for (let i = 0; i < items.length; i++) {
      while (stack.length && items[stack[stack.length - 1]].level >= items[i].level) stack.pop();
      parent[i] = stack.length ? stack[stack.length - 1] : -1;
      stack.push(i);
    }
    for (let i = 0; i < items.length; i++) {
      hasChildren[i] = i + 1 < items.length && items[i + 1].level > items[i].level;
    }
    return { parent, hasChildren };
  });

  // Indices whose direct children are hidden. Keyed by heading index into the
  // current outline; reset when the document (and thus its outline) changes.
  let collapsed = $state<Set<number>>(new Set());
  $effect(() => {
    workspace.activeRelPath;
    workspace.standalonePath;
    collapsed = new Set();
  });

  function toggle(i: number) {
    const next = new Set(collapsed);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    collapsed = next;
  }

  /** Hidden when any ancestor is collapsed. */
  function hidden(i: number): boolean {
    let p = layout.parent[i];
    while (p !== -1) {
      if (collapsed.has(p)) return true;
      p = layout.parent[p];
    }
    return false;
  }
</script>

{#if workspace.outline.length === 0}
  <div class="hint">
    {workspace.activeRelPath ? "No headings in this note." : "Open a note to see its outline."}
  </div>
{:else}
  <div class="outline">
    {#each workspace.outline as item, i (i)}
      {#if !collapsible || !hidden(i)}
        <div class="row" style="padding-left: {8 + (item.level - 1) * 12}px">
          {#if collapsible && layout.hasChildren[i]}
            <button
              class="twisty"
              aria-label={collapsed.has(i) ? "Expand" : "Collapse"}
              onclick={() => toggle(i)}
            >
              {collapsed.has(i) ? "▸" : "▾"}
            </button>
          {:else if collapsible}
            <span class="twisty spacer"></span>
          {/if}
          <button class="item" onclick={() => workspace.gotoLine(item.line)} title={item.text}>
            {item.text}
          </button>
        </div>
      {/if}
    {/each}
  </div>
{/if}

<style>
  .outline {
    display: flex;
    flex-direction: column;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .twisty {
    flex: 0 0 auto;
    width: 16px;
    height: 20px;
    border: none;
    background: none;
    color: inherit;
    font-size: 10px;
    line-height: 1;
    padding: 0;
    cursor: pointer;
    opacity: 0.6;
  }
  .twisty:hover {
    opacity: 1;
  }
  .twisty.spacer {
    cursor: default;
  }
  .item {
    flex: 1 1 auto;
    min-width: 0;
    border: none;
    background: none;
    color: inherit;
    font: inherit;
    font-size: 13px;
    text-align: left;
    padding: 3px 6px;
    border-radius: 4px;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .item:hover {
    background: var(--button-hover-bg);
  }
  .hint {
    font-size: 12px;
    opacity: 0.6;
    padding: 8px;
    line-height: 1.5;
  }
</style>
