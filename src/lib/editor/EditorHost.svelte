<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { EditorView } from "@codemirror/view";
  import { EditorState } from "@codemirror/state";
  import { baseExtensions } from "./setup";

  let {
    content = "",
    onchange,
    onsave,
  }: {
    content: string;
    onchange?: (value: string) => void;
    onsave?: () => void;
  } = $props();

  let host: HTMLDivElement;
  let view: EditorView | undefined;

  onMount(() => {
    const state = EditorState.create({
      doc: content,
      extensions: [
        ...baseExtensions(() => onsave?.()),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) {
            onchange?.(u.state.doc.toString());
          }
        }),
      ],
    });
    view = new EditorView({ state, parent: host });
    view.focus();
    // Dev-only hook so the live preview can be driven/inspected in a browser.
    if (import.meta.env.DEV) {
      (window as unknown as { __cmView?: EditorView }).__cmView = view;
    }
  });

  onDestroy(() => view?.destroy());

  // Reset the document only when `content` changes externally (e.g. a file is
  // opened). Echoes from the user's own typing match the current doc, so this
  // is a no-op for them and avoids a feedback loop.
  $effect(() => {
    const incoming = content;
    if (view && incoming !== view.state.doc.toString()) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: incoming },
      });
    }
  });
</script>

<div class="editor" bind:this={host}></div>

<style>
  .editor {
    height: 100%;
    overflow: auto;
  }
  .editor :global(.cm-editor) {
    height: 100%;
  }
  .editor :global(.cm-scroller) {
    font-family: var(--editor-font);
    font-size: 15px;
    line-height: 1.6;
  }
  .editor :global(.cm-content) {
    max-width: 860px;
    margin: 0 auto;
    padding: 24px 16px 40vh;
  }
</style>
