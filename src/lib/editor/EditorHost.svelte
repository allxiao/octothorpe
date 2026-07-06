<script lang="ts">
  import { onMount, onDestroy, untrack } from "svelte";
  import { EditorView, keymap } from "@codemirror/view";
  import { EditorState, Compartment, Annotation } from "@codemirror/state";
  import { undo, redo, undoDepth, redoDepth } from "@codemirror/commands";
  import { syntaxTree, indentUnit } from "@codemirror/language";
  import { closeBrackets, closeBracketsKeymap, autocompletion } from "@codemirror/autocomplete";
  import { baseExtensions } from "./setup";
  import { livePreview } from "./livePreview";
  import { imageBaseDir, onTagClick, revealSimpleSource, inlineMathRender, inlineMathDisplayStyle, renderHtml, renderSubscript, renderSuperscript, renderHighlight } from "./livePreview/config";
  import { resolveImageFsPath } from "./livePreview/build";
  import { emojiCompletions } from "./emoji";
  import * as ipc from "../ipc/commands";
  import {
    COMMANDS,
    blockState as computeBlockState,
    inlineState as computeInlineState,
    tableText as computeTableText,
    codeText as computeCodeText,
    tableSkeleton,
  } from "./commands";
  import { focusTableCell } from "./commands/table";
  import type { EditorApi } from "../stores/workspace.svelte";
  import { preferences } from "../preferences/store.svelte";

  let {
    content = "",
    baseDir = "",
    sourceMode = false,
    onchange,
    onsave,
    ontagclick,
    onready,
  }: {
    content: string;
    baseDir?: string;
    sourceMode?: boolean;
    onchange?: (value: string) => void;
    onsave?: () => void;
    ontagclick?: (tag: string) => void;
    onready?: (api: EditorApi | null) => void;
  } = $props();

  let host: HTMLDivElement;
  let view: EditorView | undefined;
  const baseDirComp = new Compartment();
  // Toggles the live-preview layer for source-code mode.
  const livePreviewComp = new Compartment();
  // Editor typography (font size / line height) driven by preferences.
  const typographyComp = new Compartment();
  // Word-wrap toggle driven by preferences.
  const wrapComp = new Compartment();
  // Indent unit / tab size (editor.indentSize).
  const indentComp = new Compartment();
  // Auto-pairing of brackets / Markdown syntax (editor.autoPair*).
  const autoPairComp = new Compartment();
  // Autocomplete sources, e.g. emoji (editor.emojiAutocomplete).
  const autocompleteComp = new Compartment();
  // "Reveal source on focus" facet for simple blocks (editor.revealSourceOnFocus).
  const revealComp = new Compartment();
  // Inline math rendering toggle (markdown.inlineMath).
  const mathComp = new Compartment();
  // Inline math display-style toggle (markdown.inlineMathDisplay).
  const mathDisplayComp = new Compartment();
  // Embedded HTML rendering toggle (markdown.renderHtml).
  const htmlComp = new Compartment();
  // Sub/superscript and highlight toggles (markdown.subscript/superscript/highlight).
  const subComp = new Compartment();
  const supComp = new Compartment();
  const highlightComp = new Compartment();
  // Spell-check content attribute (editor.spellCheck).
  const spellComp = new Compartment();

  const editorPrefs = preferences.scope("editor");
  const appearancePrefs = preferences.scope("appearance");
  const markdownPrefs = preferences.scope("markdown");

  /** A CodeMirror theme carrying the preference-driven editor typography. */
  function typographyTheme() {
    const size =
      appearancePrefs.get<string>("fontSizeMode") === "custom"
        ? appearancePrefs.get<number>("fontSize")
        : 15;
    return EditorView.theme({
      ".cm-scroller": {
        fontSize: `${size}px`,
        lineHeight: String(appearancePrefs.get<number>("lineHeight")),
      },
    });
  }

  /** Spaces-per-indent from preferences (indentation is always spaces). */
  function indentSizeNum() {
    const n = Number(editorPrefs.get<string>("indentSize"));
    return Number.isFinite(n) ? Math.max(2, Math.min(8, Math.round(n))) : 4;
  }
  function indentExt() {
    const n = indentSizeNum();
    return [indentUnit.of(" ".repeat(n)), EditorState.tabSize.of(n)];
  }

  /** Close-brackets extension whose bracket set depends on the auto-pair prefs. */
  function autoPairExt() {
    const brackets: string[] = [];
    if (editorPrefs.get<boolean>("autoPairBrackets")) brackets.push("(", "[", "{", "'", '"');
    if (editorPrefs.get<boolean>("autoPairMarkdown")) brackets.push("*", "_", "`", "~");
    if (!brackets.length) return [];
    return [
      closeBrackets(),
      keymap.of(closeBracketsKeymap),
      EditorState.languageData.of(() => [{ closeBrackets: { brackets } }]),
    ];
  }

  function autocompleteExt() {
    return editorPrefs.get<boolean>("emojiAutocomplete")
      ? autocompletion({ override: [emojiCompletions] })
      : [];
  }

  function spellAttrs() {
    const on = editorPrefs.get<string>("spellCheck") !== "off";
    return EditorView.contentAttributes.of({ spellcheck: on ? "true" : "false" });
  }
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

  /** Selected text (joined across ranges), or the current line if nothing is
   *  selected — unless `editor.copyWholeLine` is off, in which case empty. */
  function copyText(): string {
    if (!view) return "";
    const { state } = view;
    const ranges = state.selection.ranges.filter((r) => !r.empty);
    if (ranges.length) return ranges.map((r) => state.sliceDoc(r.from, r.to)).join("\n");
    if (!editorPrefs.get<boolean>("copyWholeLine")) return "";
    return state.doc.lineAt(state.selection.main.head).text;
  }

  /** Like copyText, but removes it from the document. Cuts the whole line when
   *  nothing is selected, unless `editor.copyWholeLine` is off (then a no-op). */
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
    if (!editorPrefs.get<boolean>("copyWholeLine")) return "";
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
        livePreviewComp.of(sourceMode ? [] : livePreview()),
        typographyComp.of(typographyTheme()),
        wrapComp.of(editorPrefs.get<boolean>("wordWrap") ? EditorView.lineWrapping : []),
        indentComp.of(indentExt()),
        autoPairComp.of(autoPairExt()),
        autocompleteComp.of(autocompleteExt()),
        revealComp.of(revealSimpleSource.of(editorPrefs.get<boolean>("revealSourceOnFocus"))),
        mathComp.of(inlineMathRender.of(markdownPrefs.get<boolean>("inlineMath"))),
        mathDisplayComp.of(inlineMathDisplayStyle.of(markdownPrefs.get<boolean>("inlineMathDisplay"))),
        htmlComp.of(renderHtml.of(markdownPrefs.get<boolean>("renderHtml"))),
        subComp.of(renderSubscript.of(markdownPrefs.get<boolean>("subscript"))),
        supComp.of(renderSuperscript.of(markdownPrefs.get<boolean>("superscript"))),
        highlightComp.of(renderHighlight.of(markdownPrefs.get<boolean>("highlight"))),
        spellComp.of(spellAttrs()),
        // Copy/cut behavior (editor.copyWholeLine / copyMarkdownAsPlain). Only
        // intercept when a preference diverges from CodeMirror's native default.
        EditorView.domEventHandlers({
          copy: (event, v) => {
            const empty = v.state.selection.ranges.every((r) => r.empty);
            const plain = editorPrefs.get<boolean>("copyMarkdownAsPlain");
            const noWhole = empty && !editorPrefs.get<boolean>("copyWholeLine");
            if (!plain && !noWhole) return false;
            event.preventDefault();
            const src = copyText();
            if (plain && src) {
              void ipc.markdownToPlaintext(src).then((t) => ipc.clipboardWriteText(t)).catch(() => {});
            } else {
              event.clipboardData?.setData("text/plain", src);
            }
            return true;
          },
          cut: (event, v) => {
            const empty = v.state.selection.ranges.every((r) => r.empty);
            if (!(empty && !editorPrefs.get<boolean>("copyWholeLine"))) return false;
            event.preventDefault(); // nothing selected + whole-line off → cut nothing
            event.clipboardData?.setData("text/plain", "");
            return true;
          },
        }),
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
      inlineState: () => (view ? computeInlineState(view.state) : null),
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

  // Toggle the live-preview layer for source-code mode.
  let appliedSource = untrack(() => sourceMode);
  $effect(() => {
    const sm = sourceMode;
    if (view && sm !== appliedSource) {
      appliedSource = sm;
      view.dispatch({ effects: livePreviewComp.reconfigure(sm ? [] : livePreview()) });
    }
  });

  // Live-refresh editor typography when the appearance font preferences change.
  $effect(() => {
    appearancePrefs.get<string>("fontSizeMode");
    appearancePrefs.get<number>("fontSize");
    appearancePrefs.get<number>("lineHeight");
    if (view) view.dispatch({ effects: typographyComp.reconfigure(typographyTheme()) });
  });

  // Live-refresh word wrap when the preference changes.
  $effect(() => {
    const wrap = editorPrefs.get<boolean>("wordWrap");
    if (view) {
      view.dispatch({ effects: wrapComp.reconfigure(wrap ? EditorView.lineWrapping : []) });
    }
  });

  // Live-refresh indent size (always spaces).
  $effect(() => {
    editorPrefs.get<string>("indentSize");
    if (view) view.dispatch({ effects: indentComp.reconfigure(indentExt()) });
  });

  // Live-refresh auto-pairing (brackets / Markdown syntax).
  $effect(() => {
    editorPrefs.get<boolean>("autoPairBrackets");
    editorPrefs.get<boolean>("autoPairMarkdown");
    if (view) view.dispatch({ effects: autoPairComp.reconfigure(autoPairExt()) });
  });

  // Live-refresh emoji autocomplete.
  $effect(() => {
    editorPrefs.get<boolean>("emojiAutocomplete");
    if (view) view.dispatch({ effects: autocompleteComp.reconfigure(autocompleteExt()) });
  });

  // Live-refresh "reveal source on focus" for simple blocks.
  $effect(() => {
    const reveal = editorPrefs.get<boolean>("revealSourceOnFocus");
    if (view) view.dispatch({ effects: revealComp.reconfigure(revealSimpleSource.of(reveal)) });
  });

  // Live-refresh inline math rendering (markdown.inlineMath).
  $effect(() => {
    const on = markdownPrefs.get<boolean>("inlineMath");
    if (view) view.dispatch({ effects: mathComp.reconfigure(inlineMathRender.of(on)) });
  });

  // Live-refresh inline math display style (markdown.inlineMathDisplay).
  $effect(() => {
    const on = markdownPrefs.get<boolean>("inlineMathDisplay");
    if (view) view.dispatch({ effects: mathDisplayComp.reconfigure(inlineMathDisplayStyle.of(on)) });
  });

  // Live-refresh embedded HTML rendering (markdown.renderHtml).
  $effect(() => {
    const on = markdownPrefs.get<boolean>("renderHtml");
    if (view) view.dispatch({ effects: htmlComp.reconfigure(renderHtml.of(on)) });
  });

  // Live-refresh sub/superscript and highlight rendering.
  $effect(() => {
    const on = markdownPrefs.get<boolean>("subscript");
    if (view) view.dispatch({ effects: subComp.reconfigure(renderSubscript.of(on)) });
  });
  $effect(() => {
    const on = markdownPrefs.get<boolean>("superscript");
    if (view) view.dispatch({ effects: supComp.reconfigure(renderSuperscript.of(on)) });
  });
  $effect(() => {
    const on = markdownPrefs.get<boolean>("highlight");
    if (view) view.dispatch({ effects: highlightComp.reconfigure(renderHighlight.of(on)) });
  });

  // Live-refresh the spell-check content attribute.
  $effect(() => {
    editorPrefs.get<string>("spellCheck");
    if (view) view.dispatch({ effects: spellComp.reconfigure(spellAttrs()) });
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
    /* font-size and line-height are driven by preferences via typographyComp. */
  }
  .editor :global(.cm-content) {
    max-width: var(--editor-max-width, 860px);
    margin: 0 auto;
    padding: 24px 16px 40vh;
  }
</style>
