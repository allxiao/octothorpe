// Shared state for the editor's right-click context menu (Svelte 5 runes). A
// module-level store so both the Svelte main editor (EditorHost) and the
// vanilla-DOM table widget (TableWidget) can open the same menu, and the single
// <ContextMenu> instance rendered in App can read from it.

import type { BlockState, InlineState } from "../editor/commands";

/** A snapshot of where the right-click landed, captured when the menu opens.
 *  Snapshotting (rather than querying live) keeps the menu deterministic: opening
 *  it blurs the editor and — inside a table — triggers a focusout commit that can
 *  shift the editor state out from under a live read. */
export interface CtxMenuContext {
  /** "doc" = main document; "tableCell" = right-click inside a rendered table cell. */
  scope: "doc" | "tableCell";
  /** Block context at the click (doc scope only; null in a table cell). */
  block: BlockState | null;
  /** Inline context at the click (doc scope only; null in a table cell). */
  inline: InlineState | null;
  /** Whether the click landed on a list item (bullet / ordered / task). */
  isListItem: boolean;
  /** The selected text (for the Search Web query and its enablement). */
  selectedText: string;
}

class ContextMenuStore {
  open = $state(false);
  x = $state(0);
  y = $state(0);
  ctx = $state<CtxMenuContext | null>(null);

  openAt(x: number, y: number, ctx: CtxMenuContext) {
    this.x = x;
    this.y = y;
    this.ctx = ctx;
    this.open = true;
  }

  close() {
    this.open = false;
    this.ctx = null;
  }
}

export const contextMenu = new ContextMenuStore();
