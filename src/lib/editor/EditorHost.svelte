<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { EditorView } from "@codemirror/view";
  import { EditorState, Compartment, Annotation } from "@codemirror/state";
  import { baseExtensions } from "./setup";
  import { imageBaseDir, onTagClick } from "./livePreview/config";

  let {
    content = "",
    baseDir = "",
    onchange,
    onsave,
    ontagclick,
    onready,
  }: {
    content: string;
    baseDir?: string;
    onchange?: (value: string) => void;
    onsave?: () => void;
    ontagclick?: (tag: string) => void;
    onready?: (api: { gotoLine: (line: number) => void } | null) => void;
  } = $props();

  let host: HTMLDivElement;
  let view: EditorView | undefined;
  const baseDirComp = new Compartment();
  // Marks a programmatic document reset (opening a file / new buffer) so it
  // isn't reported as a user edit.
  const External = Annotation.define<boolean>();

  function gotoLine(line: number) {
    if (!view) return;
    const target = view.state.doc.line(Math.max(1, Math.min(line, view.state.doc.lines)));
    view.dispatch({
      selection: { anchor: target.from },
      effects: EditorView.scrollIntoView(target.from, { y: "start" }),
    });
    view.focus();
  }

  onMount(() => {
    const state = EditorState.create({
      doc: content,
      extensions: [
        ...baseExtensions(() => onsave?.()),
        baseDirComp.of(imageBaseDir.of(baseDir)),
        onTagClick.of((tag) => ontagclick?.(tag)),
        EditorView.updateListener.of((u) => {
          if (u.docChanged && !u.transactions.some((t) => t.annotation(External))) {
            onchange?.(u.state.doc.toString());
          }
        }),
      ],
    });
    view = new EditorView({ state, parent: host });
    view.focus();
    onready?.({ gotoLine });
    // Dev-only hook so the live preview can be driven/inspected in a browser.
    if (import.meta.env.DEV) {
      (window as unknown as { __cmView?: EditorView }).__cmView = view;
    }
  });

  onDestroy(() => {
    onready?.(null);
    view?.destroy();
  });

  // Reset the document only when `content` changes externally (e.g. a file is
  // opened). The External annotation keeps this from being reported as a user
  // edit; echoes from the user's own typing already match the doc (no-op).
  $effect(() => {
    const incoming = content;
    if (view && incoming !== view.state.doc.toString()) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: incoming },
        annotations: External.of(true),
      });
    }
  });

  // Keep the image base directory in sync with the open document's folder.
  $effect(() => {
    const dir = baseDir;
    if (view) {
      view.dispatch({ effects: baseDirComp.reconfigure(imageBaseDir.of(dir)) });
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
