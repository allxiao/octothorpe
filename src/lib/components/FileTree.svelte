<script lang="ts">
  import { workspace } from "../stores/workspace.svelte";
  import type { TreeNode } from "../ipc/types";
  import Self from "./FileTree.svelte";

  let { nodes, depth = 0 }: { nodes: TreeNode[]; depth?: number } = $props();
</script>

<ul class="tree">
  {#each nodes as node (node.id)}
    <li>
      {#if node.kind === "folder"}
        <div class="row folder" style="padding-left: {6 + depth * 12}px">
          <span class="icon">📁</span>{node.name}
        </div>
        <Self nodes={node.children} depth={depth + 1} />
      {:else}
        <div
          class="row doc"
          class:active={workspace.activeRelPath === node.relPath}
          style="padding-left: {6 + depth * 12}px"
          role="button"
          tabindex="0"
          onclick={() => workspace.openDoc(node.relPath)}
          onkeydown={(e) => e.key === "Enter" && workspace.openDoc(node.relPath)}
        >
          <span class="icon">📄</span>{node.name}
        </div>
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
    gap: 4px;
    padding-top: 3px;
    padding-bottom: 3px;
    padding-right: 6px;
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    border-radius: 4px;
    cursor: default;
  }
  .icon {
    font-size: 11px;
    opacity: 0.8;
  }
  .doc {
    cursor: pointer;
  }
  .doc:hover {
    background: var(--button-hover-bg);
  }
  .doc.active {
    background: var(--accent-soft, rgba(59, 130, 246, 0.15));
    font-weight: 600;
  }
  .folder {
    font-weight: 600;
    opacity: 0.85;
  }
</style>
