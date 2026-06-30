<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    title,
    children,
    collapsed = false,
    first = false,
    resizable = false,
    weight = 1,
    ontoggle,
    onsash,
  }: {
    title: string;
    children: Snippet;
    collapsed?: boolean;
    first?: boolean;
    resizable?: boolean;
    weight?: number;
    ontoggle?: () => void;
    onsash?: (deltaPx: number) => void;
  } = $props();

  let dragging = $state(false);
  let lastY = 0;

  function onSashDown(e: MouseEvent) {
    e.preventDefault();
    dragging = true;
    lastY = e.clientY;
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }
  function onMove(e: MouseEvent) {
    const d = e.clientY - lastY;
    lastY = e.clientY;
    if (d !== 0) onsash?.(d);
  }
  function onUp() {
    dragging = false;
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
  }
</script>

<section class="panel" class:collapsed style="flex: {collapsed ? '0 0 auto' : `${weight} 1 0`}">
  {#if resizable}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="sash" class:dragging onmousedown={onSashDown}></div>
  {/if}
  <button class="header" class:bordered={!first} onclick={() => ontoggle?.()}>
    <span class="chev" class:open={!collapsed}>▶</span>
    <span class="title">{title}</span>
  </button>
  {#if !collapsed}
    <div class="body">{@render children()}</div>
  {/if}
</section>

<style>
  .panel {
    position: relative;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .panel:not(.collapsed) {
    min-height: 56px;
  }
  /* Draggable resize handle straddling the divider above this panel. */
  .sash {
    position: absolute;
    top: -3px;
    left: 0;
    right: 0;
    height: 6px;
    cursor: ns-resize;
    z-index: 5;
  }
  .sash:hover,
  .sash.dragging {
    background: var(--accent);
    opacity: 0.5;
  }
  .header {
    display: flex;
    align-items: center;
    gap: 4px;
    width: 100%;
    padding: 5px 8px;
    border: none;
    background: var(--panel-header-bg, transparent);
    color: inherit;
    font: inherit;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    opacity: 0.85;
    cursor: pointer;
    flex: 0 0 auto;
  }
  .header.bordered {
    border-top: 1px solid var(--border);
  }
  .header:hover {
    opacity: 1;
  }
  .chev {
    display: inline-block;
    font-size: 8px;
    opacity: 0.7;
    transition: transform 0.1s ease;
  }
  .chev.open {
    transform: rotate(90deg);
  }
  .title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .body {
    overflow-y: auto;
    min-height: 0;
    flex: 1 1 auto;
    padding-bottom: 6px;
  }
</style>
