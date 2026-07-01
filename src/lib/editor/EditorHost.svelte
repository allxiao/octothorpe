<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { EditorView } from "@codemirror/view";
  import { EditorState, Compartment, Annotation } from "@codemirror/state";
  import { undo, redo, undoDepth, redoDepth } from "@codemirror/commands";
  import { syntaxTree } from "@codemirror/language";
  import { baseExtensions } from "./setup";
  import { imageBaseDir, onTagClick } from "./livePreview/config";
  import { resolveImageFsPath } from "./livePreview/build";
  import {
    COMMANDS,
    blockState as computeBlockState,
    tableText as computeTableText,
    codeText as computeCodeText,
    tableSkeleton,
  } from "./commands";
  import { focusTableCell } from "./commands/table";
  import type { EditorApi } from "../stores/workspace.svelte";

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
    onready?: (api: EditorApi | null) => void;
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

  // --- Edit-menu operations (driven from the menu / shortcuts) -------------

  function canUndo() {
    return view ? undoDepth(view.state) > 0 : false;
  }
  function canRedo() {
    return view ? redoDepth(view.state) > 0 : false;
  }

  /** Selected text (joined across ranges), or the current line if nothing is selected. */
  function copyText(): string {
    if (!view) return "";
    const { state } = view;
    const ranges = state.selection.ranges.filter((r) => !r.empty);
    if (ranges.length) return ranges.map((r) => state.sliceDoc(r.from, r.to)).join("\n");
    return state.doc.lineAt(state.selection.main.head).text;
  }

  /** Like copyText, but removes it from the document (the whole line if no selection). */
  function cutText(): string {
    if (!view) return "";
    const { state } = view;
    const ranges = state.selection.ranges.filter((r) => !r.empty);
    if (ranges.length) {
      const text = ranges.map((r) => state.sliceDoc(r.from, r.to)).join("\n");
      view.dispatch(state.replaceSelection(""));
      view.focus();
      return text;
    }
    const line = state.doc.lineAt(state.selection.main.head);
    const to = Math.min(line.to + 1, state.doc.length); // include the trailing newline
    view.dispatch({ changes: { from: line.from, to }, selection: { anchor: line.from } });
    view.focus();
    return line.text;
  }

  function paste(text: string) {
    if (!view) return;
    view.dispatch(view.state.replaceSelection(text));
    view.focus();
  }

  /** Selected text, or the whole document if nothing is selected (for "Copy as…"). */
  function selectionOrDoc(): string {
    if (!view) return "";
    const { state } = view;
    const ranges = state.selection.ranges.filter((r) => !r.empty);
    if (ranges.length) return ranges.map((r) => state.sliceDoc(r.from, r.to)).join("\n");
    return state.doc.toString();
  }

  /** Filesystem path/URL of the image under the caret, or null. */
  function imageAtCursor(): string | null {
    if (!view) return null;
    const { state } = view;
    const pos = state.selection.main.head;
    let src: string | null = null;
    syntaxTree(state).iterate({
      from: pos,
      to: pos,
      enter: (node) => {
        if (node.name === "Image") {
          const m = /^!\[([^\]]*)\]\(([^)\s]+)[^)]*\)$/.exec(state.sliceDoc(node.from, node.to));
          if (m) src = resolveImageFsPath(m[2], baseDir);
        }
      },
    });
    return src;
  }

  function focusEditor() {
    view?.focus();
  }

  // Before saving, commit any in-progress table cell edit by blurring it
  // (the table widget commits to the document on focusout).
  function saveWithFlush() {
    const active = document.activeElement as HTMLElement | null;
    if (active?.closest(".cm-md-table-wrap")) active.blur();
    onsave?.();
  }

  function runCommand(id: string) {
    const cmd = COMMANDS[id];
    if (cmd && view) cmd(view);
  }

  function insertTable(cols: number, rows: number) {
    if (!view) return;
    const { state } = view;
    const sel = state.selection.main;
    const line = state.doc.lineAt(sel.head);
    const prefix = line.text.trim() === "" ? "" : "\n\n";
    const skeleton = prefix + tableSkeleton(cols, rows);
    const atEnd = sel.to === state.doc.length;
    const insert = skeleton + (atEnd ? "\n" : "");
    // Leave the caret on the line after the table (outside the block widget).
    const anchor = Math.min(sel.from + skeleton.length + 1, sel.from + insert.length);
    view.dispatch({
      changes: { from: sel.from, to: sel.to, insert },
      selection: { anchor },
      scrollIntoView: true,
    });
    view.focus();
    focusTableCell(view, sel.from + prefix.length, "thead th");
  }

  onMount(() => {
    const state = EditorState.create({
      doc: content,
      extensions: [
        ...baseExtensions(saveWithFlush),
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
    onready?.({
      gotoLine,
      undo: () => view && undo(view),
      redo: () => view && redo(view),
      canUndo,
      canRedo,
      copyText,
      cutText,
      paste,
      selectionOrDoc,
      imageAtCursor,
      focus: focusEditor,
      runCommand,
      blockState: () => (view ? computeBlockState(view.state) : null),
      tableText: () => (view ? computeTableText(view.state) : null),
      codeText: () => (view ? computeCodeText(view.state) : null),
      insertTable,
    });
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
