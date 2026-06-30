<script lang="ts">
  import { workspace } from "../stores/workspace.svelte";
  import type { TagNode } from "../ipc/types";
  import Self from "./TagTree.svelte";

  let { nodes, depth = 0 }: { nodes: TagNode[]; depth?: number } = $props();
</script>

<ul class="tree">
  {#each nodes as node (node.path)}
    <li>
      <div
        class="row"
        class:active={workspace.filterTag === node.path}
        style="padding-left: {6 + depth * 12}px"
        role="button"
        tabindex="0"
        onclick={() => workspace.selectTag(node.path)}
        onkeydown={(e) => e.key === "Enter" && workspace.selectTag(node.path)}
      >
        <span class="hash">#</span><span class="name">{node.name}</span>
        <span class="count">{node.count}</span>
      </div>
      {#if node.children.length > 0}
        <Self nodes={node.children} depth={depth + 1} />
      {/if}
    </li>
  {/each}
</ul>

<style>
  .tree {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 3px 6px;
    font-size: 13px;
    border-radius: 4px;
    cursor: pointer;
  }
  .row:hover {
    background: var(--button-hover-bg);
  }
  .row.active {
    background: var(--accent-soft, rgba(59, 130, 246, 0.15));
    font-weight: 600;
  }
  .hash {
    color: var(--accent, #3b82f6);
    font-weight: 700;
  }
  .name {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .count {
    opacity: 0.5;
    font-size: 11px;
  }
</style>
