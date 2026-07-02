<script lang="ts">
  import { preferences } from "../preferences/store.svelte";
  import { DESCRIPTOR } from "../preferences/generated/descriptor";
  import type { PrefEntry } from "../preferences/types";

  let { onClose }: { onClose: () => void } = $props();

  let activeCat = $state(DESCRIPTOR[0]?.id ?? "");
  const current = $derived(DESCRIPTOR.find((c) => c.id === activeCat) ?? DESCRIPTOR[0]);

  // Last validation error, shown inline (set() rejects out-of-range/invalid values).
  let error = $state<string | null>(null);

  function apply(entry: PrefEntry, value: unknown) {
    const res = preferences.set(entry.key, value);
    error = res.ok ? null : `${entry.label}: ${res.error}`;
  }

  function onNumber(entry: PrefEntry, raw: string) {
    const n = Number(raw);
    if (raw.trim() === "" || !Number.isFinite(n)) return;
    apply(entry, n);
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div
  class="backdrop"
  role="presentation"
  onclick={(e) => {
    if (e.target === e.currentTarget) onClose();
  }}
>
  <div class="modal" role="dialog" aria-modal="true" aria-label="Preferences">
    <header>
      <h2>Preferences</h2>
      <button class="close" aria-label="Close" onclick={onClose}>✕</button>
    </header>

    <div class="cols">
      <nav class="cats" aria-label="Categories">
        {#each DESCRIPTOR as cat (cat.id)}
          <button
            class="cat"
            class:active={cat.id === activeCat}
            onclick={() => (activeCat = cat.id)}
          >
            {cat.label}
          </button>
        {/each}
      </nav>

      <div class="pane">
        <h3 class="pane-title">{current.label}</h3>
        {#each current.sections as section (section.label)}
          <section>
            <h4>{section.label}</h4>
            {#each section.entries as entry (entry.key)}
              <div class="row">
                <div class="meta">
                  <label class="lbl" for={`pref-${entry.key}`}>{entry.label}</label>
                  {#if entry.description}<p class="desc">{entry.description}</p>{/if}
                </div>
                <div class="control">
                  {#if entry.control === "toggle"}
                    <input
                      id={`pref-${entry.key}`}
                      type="checkbox"
                      checked={preferences.get<boolean>(entry.key)}
                      onchange={(e) => apply(entry, e.currentTarget.checked)}
                    />
                  {:else if entry.control === "select"}
                    <select
                      id={`pref-${entry.key}`}
                      value={preferences.get<string>(entry.key)}
                      onchange={(e) => apply(entry, e.currentTarget.value)}
                    >
                      {#each entry.options ?? [] as opt (opt.value)}
                        <option value={opt.value}>{opt.label}</option>
                      {/each}
                    </select>
                  {:else if entry.control === "number"}
                    <input
                      id={`pref-${entry.key}`}
                      type="number"
                      min={entry.min}
                      max={entry.max}
                      step={entry.step ?? 1}
                      value={preferences.get<number>(entry.key)}
                      onchange={(e) => onNumber(entry, e.currentTarget.value)}
                    />
                  {:else}
                    <input
                      id={`pref-${entry.key}`}
                      type="text"
                      value={preferences.get<string>(entry.key)}
                      onchange={(e) => apply(entry, e.currentTarget.value)}
                    />
                  {/if}
                  {#if preferences.isSet(entry.key)}
                    <button
                      class="reset"
                      title="Reset to default"
                      onclick={() => {
                        preferences.reset(entry.key);
                        error = null;
                      }}>Reset</button
                    >
                  {/if}
                </div>
              </div>
            {/each}
          </section>
        {/each}
        {#if error}<p class="err">{error}</p>{/if}
      </div>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.35);
  }
  .modal {
    display: flex;
    flex-direction: column;
    width: min(860px, 92vw);
    height: min(600px, 86vh);
    background: var(--menu-bg, #fff);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
    overflow: hidden;
  }
  header {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 18px;
    border-bottom: 1px solid var(--border);
  }
  h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
  }
  .close {
    font: inherit;
    font-size: 15px;
    line-height: 1;
    padding: 4px 8px;
    border: none;
    border-radius: 5px;
    background: transparent;
    color: inherit;
    cursor: pointer;
    opacity: 0.6;
  }
  .close:hover {
    opacity: 1;
    background: var(--button-hover-bg);
  }
  .cols {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
  }
  .cats {
    flex: 0 0 180px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 10px 8px;
    border-right: 1px solid var(--border);
    background: var(--sidebar-bg, transparent);
    overflow-y: auto;
  }
  .cat {
    font: inherit;
    font-size: 13px;
    text-align: left;
    padding: 7px 12px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }
  .cat:hover {
    background: var(--button-hover-bg);
  }
  .cat.active {
    background: var(--accent);
    color: #fff;
  }
  .pane {
    flex: 1 1 auto;
    min-width: 0;
    padding: 18px 24px 24px;
    overflow-y: auto;
  }
  .pane-title {
    margin: 0 0 4px;
    font-size: 22px;
    font-weight: 500;
  }
  section {
    margin-top: 18px;
  }
  h4 {
    margin: 0 0 4px;
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    opacity: 0.55;
  }
  .row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 24px;
    padding: 12px 0;
    border-bottom: 1px solid var(--border);
  }
  .meta {
    min-width: 0;
  }
  .lbl {
    font-size: 14px;
    font-weight: 500;
  }
  .desc {
    margin: 3px 0 0;
    font-size: 12px;
    line-height: 1.4;
    opacity: 0.6;
  }
  .control {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 8px;
    padding-top: 2px;
  }
  .control input[type="number"],
  .control input[type="text"],
  .control select {
    font: inherit;
    font-size: 13px;
    padding: 5px 8px;
    border: 1px solid var(--border);
    border-radius: 5px;
    background: var(--button-bg);
    color: inherit;
  }
  .control input[type="number"] {
    width: 84px;
  }
  .control input:focus,
  .control select:focus {
    outline: 2px solid var(--accent);
    outline-offset: -1px;
  }
  .control input[type="checkbox"] {
    width: 16px;
    height: 16px;
    cursor: pointer;
  }
  .reset {
    font: inherit;
    font-size: 11px;
    padding: 3px 8px;
    border: 1px solid var(--border);
    border-radius: 5px;
    background: var(--button-bg);
    color: inherit;
    cursor: pointer;
    opacity: 0.75;
  }
  .reset:hover {
    opacity: 1;
    background: var(--button-hover-bg);
  }
  .err {
    margin-top: 16px;
    font-size: 13px;
    color: #b91c1c;
  }
</style>
