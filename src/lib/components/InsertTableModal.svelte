<script lang="ts">
  let {
    onConfirm,
    onCancel,
  }: {
    onConfirm: (cols: number, rows: number) => void;
    onCancel: () => void;
  } = $props();

  let cols = $state(3);
  let rows = $state(3);

  function clamp(n: number): number {
    if (!Number.isFinite(n)) return 1;
    return Math.min(50, Math.max(1, Math.round(n)));
  }

  function confirm() {
    onConfirm(clamp(cols), clamp(rows));
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      confirm();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  }

  // Autofocus the first field when mounted.
  function autofocus(node: HTMLInputElement) {
    node.focus();
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div
  class="backdrop"
  role="presentation"
  onclick={(e) => {
    if (e.target === e.currentTarget) onCancel();
  }}
>
  <div class="modal" role="dialog" aria-modal="true" aria-label="Insert Table">
    <h2>Insert Table</h2>
    <div class="fields">
      <label>
        <span>Columns</span>
        <input type="number" min="1" max="50" bind:value={cols} use:autofocus />
      </label>
      <label>
        <span>Rows</span>
        <input type="number" min="1" max="50" bind:value={rows} />
      </label>
    </div>
    <div class="actions">
      <button class="btn" onclick={onCancel}>Cancel</button>
      <button class="btn primary" onclick={confirm}>OK</button>
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
    min-width: 420px;
    background: var(--menu-bg, #fff);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
    padding: 18px 20px 16px;
  }
  h2 {
    margin: 0 0 16px;
    font-size: 16px;
    font-weight: 600;
  }
  .fields {
    display: flex;
    gap: 20px;
  }
  label {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 13px;
  }
  input {
    width: 72px;
    font: inherit;
    padding: 5px 8px;
    border: 1px solid var(--border);
    border-radius: 5px;
    background: var(--button-bg);
    color: inherit;
  }
  input:focus {
    outline: 2px solid var(--accent);
    outline-offset: -1px;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 22px;
  }
  .btn {
    font: inherit;
    font-size: 13px;
    padding: 6px 16px;
    border: 1px solid var(--border);
    border-radius: 5px;
    background: var(--button-bg);
    color: inherit;
    cursor: pointer;
  }
  .btn:hover {
    background: var(--button-hover-bg);
  }
  .btn.primary {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }
  .btn.primary:hover {
    filter: brightness(1.05);
  }
</style>
