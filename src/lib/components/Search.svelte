<script lang="ts">
  import { workspace } from "../stores/workspace.svelte";

  const HL_START = String.fromCharCode(1);
  const HL_END = String.fromCharCode(2);

  let q = $state(workspace.searchQuery);
  let timer: ReturnType<typeof setTimeout> | undefined;

  function onInput() {
    clearTimeout(timer);
    timer = setTimeout(() => void workspace.runSearch(q), 220);
  }

  interface Part {
    text: string;
    hit: boolean;
  }
  // Split a snippet on the highlight sentinels into plain/highlighted parts.
  function parts(snippet: string): Part[] {
    const out: Part[] = [];
    let i = 0;
    while (i < snippet.length) {
      const s = snippet.indexOf(HL_START, i);
      if (s === -1) {
        out.push({ text: snippet.slice(i), hit: false });
        break;
      }
      if (s > i) out.push({ text: snippet.slice(i, s), hit: false });
      const e = snippet.indexOf(HL_END, s + 1);
      if (e === -1) {
        out.push({ text: snippet.slice(s + 1), hit: true });
        break;
      }
      out.push({ text: snippet.slice(s + 1, e), hit: true });
      i = e + 1;
    }
    return out;
  }
</script>

<div class="search">
  <input
    class="box"
    type="text"
    placeholder="Search notes…"
    bind:value={q}
    oninput={onInput}
  />
  <div class="results">
    {#each workspace.searchResults as hit (hit.id)}
      <button
        class="hit"
        class:active={workspace.activeRelPath === hit.relPath}
        onclick={() => workspace.openDoc(hit.relPath)}
      >
        <span class="title">{hit.title}</span>
        <span class="snippet"
          >{#each parts(hit.snippet) as p}{#if p.hit}<mark>{p.text}</mark>{:else}{p.text}{/if}{/each}</span
        >
      </button>
    {/each}
    {#if q.trim() && workspace.searchResults.length === 0}
      <div class="hint">No matches.</div>
    {:else if !q.trim()}
      <div class="hint">Type to search note contents.</div>
    {/if}
  </div>
</div>

<style>
  .search {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }
  .box {
    flex: 0 0 auto;
    margin: 8px;
    padding: 5px 8px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--button-bg);
    color: inherit;
    font: inherit;
    font-size: 13px;
  }
  .box:focus {
    outline: 1px solid var(--accent);
    border-color: var(--accent);
  }
  .results {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
  }
  .hit {
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: 100%;
    text-align: left;
    border: none;
    background: none;
    color: inherit;
    font: inherit;
    padding: 6px 10px;
    cursor: pointer;
    border-bottom: 1px solid var(--border);
  }
  .hit:hover {
    background: var(--button-hover-bg);
  }
  .hit.active {
    background: var(--accent-soft);
  }
  .title {
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .snippet {
    font-size: 12px;
    opacity: 0.75;
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .snippet :global(mark) {
    background: var(--accent-soft);
    color: inherit;
    border-radius: 2px;
    padding: 0 1px;
  }
  .hint {
    font-size: 12px;
    opacity: 0.6;
    padding: 8px 10px;
  }
</style>
