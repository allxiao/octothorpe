// Shared workspace state (Svelte 5 runes). Holds the open vault, its file and
// tag trees, the active document, the active sidebar view, and the tag filter.

import * as ipc from "../ipc/commands";
import type { DocumentMeta, SearchHit, TagNode, TreeNode } from "../ipc/types";
import type { BlockState } from "../editor/commands";
import type { InlineState } from "../editor/commands";
import {
  getActiveTable,
  runActiveTableCommand,
  runActiveTableOp,
} from "../editor/livePreview/TableWidget";

export type ViewId = "explorer" | "tags" | "outline" | "search";

export interface OutlineItem {
  level: number;
  text: string;
  line: number; // 1-based
}

export interface EditorApi {
  gotoLine: (line: number) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  copyText: () => string;
  cutText: () => string;
  paste: (text: string) => void;
  selectionOrDoc: () => string;
  imageAtCursor: () => string | null;
  focus: () => void;
  runCommand: (id: string) => void;
  blockState: () => BlockState | null;
  inlineState: () => InlineState | null;
  tableText: () => string | null;
  codeText: () => string | null;
  insertTable: (cols: number, rows: number) => void;
}

export type PageWidth = "normal" | "medium" | "wide";

function readPref(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}
function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore (private mode, etc.)
  }
}
function readPageWidth(): PageWidth {
  const v = readPref("octothorpe:pageWidth", "normal");
  return v === "medium" || v === "wide" ? v : "normal";
}
function readSidebarWidth(): number {
  const n = Number(readPref("octothorpe:sidebarWidth", "260"));
  return Number.isFinite(n) ? Math.max(180, Math.min(560, n)) : 260;
}

class Workspace {
  root = $state<string | null>(null);
  tree = $state<TreeNode[]>([]);
  tags = $state<TagNode[]>([]);
  allDocs = $state<DocumentMeta[]>([]);
  docCount = $state(0);
  tagCount = $state(0);

  activeView = $state<ViewId>("explorer");
  /** User collapsed the sidebar (via the active activity button). */
  sidebarCollapsed = $state(false);

  /** View preferences (persisted). */
  pageWidth = $state<PageWidth>(readPageWidth());
  sourceMode = $state(readPref("octothorpe:sourceMode", "false") === "true");
  sidebarWidth = $state<number>(readSidebarWidth());

  get pageWidthPx(): number {
    return this.pageWidth === "wide" ? 1200 : this.pageWidth === "medium" ? 1024 : 860;
  }
  setPageWidth(w: PageWidth) {
    this.pageWidth = w;
    writePref("octothorpe:pageWidth", w);
  }
  toggleSourceMode() {
    this.sourceMode = !this.sourceMode;
    writePref("octothorpe:sourceMode", String(this.sourceMode));
  }
  setSidebarWidth(px: number) {
    const w = Math.max(180, Math.min(560, Math.round(px)));
    this.sidebarWidth = w;
    writePref("octothorpe:sidebarWidth", String(w));
  }

  activeRelPath = $state<string | null>(null);
  /** Absolute path when a file outside the open folder is being edited. */
  standalonePath = $state<string | null>(null);
  /** A new, never-saved buffer with no path on disk (standalone-editor mode). */
  untitled = $state(false);
  content = $state<string>("");
  dirty = $state(false);
  status = $state<string>("");

  filterTag = $state<string | null>(null);
  filteredDocs = $state<DocumentMeta[]>([]);

  searchQuery = $state<string>("");
  searchResults = $state<SearchHit[]>([]);

  /** Set when the open note changed on disk while it had unsaved edits. */
  externalChanged = $state(false);

  #editor: EditorApi | null = null;

  /** Whether any document (vault, standalone, or untitled) is open. */
  get hasDoc(): boolean {
    return this.activeRelPath !== null || this.standalonePath !== null || this.untitled;
  }

  /** The sidebar shows once a folder or document is open, unless collapsed. */
  get showSidebar(): boolean {
    return (this.root !== null || this.hasDoc) && !this.sidebarCollapsed;
  }

  /**
   * Activity-bar click: switch to `id` (revealing the sidebar), or collapse the
   * sidebar when its already-active view is clicked again.
   */
  toggleView(id: ViewId) {
    if (this.activeView === id && this.showSidebar) {
      this.sidebarCollapsed = true;
    } else {
      this.activeView = id;
      this.sidebarCollapsed = false;
    }
  }

  /** Absolute path of the active document on disk, or null for an untitled buffer. */
  get activeAbsPath(): string | null {
    if (this.standalonePath) return this.standalonePath;
    if (this.root && this.activeRelPath) {
      const sep = this.root.includes("\\") ? "\\" : "/";
      return this.root + sep + this.activeRelPath.replace(/\//g, sep);
    }
    return null;
  }

  /** Display title for the active document (basename without extension). */
  get activeTitle(): string {
    if (this.untitled) return "Untitled";
    const p = this.activeRelPath ?? this.standalonePath;
    if (!p) return "";
    const base = p.split(/[\\/]/).pop() ?? p;
    return base.replace(/\.(md|markdown)$/i, "");
  }

  /** Absolute directory of the active document (for resolving relative images). */
  get baseDir(): string {
    if (this.standalonePath) {
      const i = Math.max(
        this.standalonePath.lastIndexOf("\\"),
        this.standalonePath.lastIndexOf("/"),
      );
      return i >= 0 ? this.standalonePath.slice(0, i) : "";
    }
    if (!this.root || !this.activeRelPath) return "";
    const slash = this.activeRelPath.lastIndexOf("/");
    const folder = slash >= 0 ? this.activeRelPath.slice(0, slash) : "";
    const sep = this.root.includes("\\") ? "\\" : "/";
    return folder ? this.root + sep + folder.replace(/\//g, sep) : this.root;
  }

  /** Headings of the active document, for the Outline view. */
  get outline(): OutlineItem[] {
    return parseOutline(this.content);
  }

  // --- editor handle -------------------------------------------------------

  registerEditor(api: EditorApi | null) {
    this.#editor = api;
  }

  gotoLine(line: number) {
    this.#editor?.gotoLine(line);
  }

  // --- edit menu -----------------------------------------------------------

  editUndo() {
    this.#editor?.undo();
  }
  editRedo() {
    this.#editor?.redo();
  }
  editCanUndo(): boolean {
    return this.#editor?.canUndo() ?? false;
  }
  editCanRedo(): boolean {
    return this.#editor?.canRedo() ?? false;
  }
  imageAtCursor(): string | null {
    return this.#editor?.imageAtCursor() ?? null;
  }

  async editCopy() {
    try {
      const text = this.#editor?.copyText() ?? "";
      if (text) await ipc.clipboardWriteText(text);
    } catch (e) {
      this.status = `Copy failed: ${e}`;
    }
    this.#editor?.focus();
  }

  async editCut() {
    try {
      const text = this.#editor?.cutText() ?? "";
      if (text) await ipc.clipboardWriteText(text);
    } catch (e) {
      this.status = `Cut failed: ${e}`;
    }
  }

  async editPaste() {
    try {
      const text = await ipc.clipboardReadText();
      if (text) this.#editor?.paste(text);
    } catch (e) {
      this.status = `Paste failed: ${e}`;
    }
  }

  async copyAsMarkdown() {
    try {
      const md = this.#editor?.selectionOrDoc() ?? "";
      if (md) await ipc.clipboardWriteText(md);
    } catch (e) {
      this.status = `Copy failed: ${e}`;
    }
    this.#editor?.focus();
  }

  async copyAsPlainText() {
    try {
      const md = this.#editor?.selectionOrDoc() ?? "";
      if (md) await ipc.clipboardWriteText(await ipc.markdownToPlaintext(md));
    } catch (e) {
      this.status = `Copy failed: ${e}`;
    }
    this.#editor?.focus();
  }

  async copyAsHtmlCode() {
    try {
      const md = this.#editor?.selectionOrDoc() ?? "";
      if (md) await ipc.clipboardWriteText(await ipc.markdownToHtml(md));
    } catch (e) {
      this.status = `Copy failed: ${e}`;
    }
    this.#editor?.focus();
  }

  async copyWithoutThemeStyling() {
    try {
      const md = this.#editor?.selectionOrDoc() ?? "";
      if (md) await ipc.clipboardWriteHtml(await ipc.markdownToHtml(md));
    } catch (e) {
      this.status = `Copy failed: ${e}`;
    }
    this.#editor?.focus();
  }

  async copyImageContent() {
    const src = this.#editor?.imageAtCursor();
    if (!src) return;
    try {
      await ipc.copyImage(src);
      this.status = "Image copied";
    } catch (e) {
      this.status = `Copy image failed: ${e}`;
    }
  }

  // --- paragraph menu ------------------------------------------------------

  paragraphCommand(id: string) {
    this.#editor?.runCommand(id);
  }
  blockState(): BlockState | null {
    return this.#editor?.blockState() ?? null;
  }

  // --- format menu ---------------------------------------------------------

  inlineState(): InlineState | null {
    return this.#editor?.inlineState() ?? null;
  }

  /** Resolve the link URL under the caret to something openable (relative → abs). */
  #resolveLinkUrl(): string | null {
    const url = this.#editor?.inlineState()?.linkUrl;
    if (!url) return null;
    if (/^[a-z]+:/i.test(url) || url.startsWith("//")) return url; // http:, mailto:, file:, …
    if (!this.baseDir) return url;
    const sep = this.baseDir.includes("\\") ? "\\" : "/";
    return this.baseDir.replace(/[\\/]+$/, "") + sep + url.replace(/\//g, sep);
  }

  async openLink() {
    const url = this.#resolveLinkUrl();
    if (!url) return;
    try {
      await ipc.openUrl(url);
    } catch (e) {
      this.status = `Open link failed: ${e}`;
    }
  }

  async copyLinkAddress() {
    const url = this.#editor?.inlineState()?.linkUrl;
    if (!url) return;
    try {
      await ipc.clipboardWriteText(url);
      this.status = "Link copied";
    } catch (e) {
      this.status = `Copy link failed: ${e}`;
    }
  }

  /** Whether a rendered table is currently the target for table menu commands. */
  hasActiveTable(): boolean {
    return getActiveTable() != null;
  }

  /** Run a Paragraph → Table structural command against the active rendered
   *  table, falling back to the caret-based command for raw tables. */
  tableCommand(id: string) {
    if (!runActiveTableCommand(id)) this.#editor?.runCommand(id);
  }

  // --- insert-table dialog -------------------------------------------------

  insertTableOpen = $state(false);

  openInsertTable() {
    this.insertTableOpen = true;
  }
  cancelInsertTable() {
    this.insertTableOpen = false;
  }
  confirmInsertTable(cols: number, rows: number) {
    this.insertTableOpen = false;
    this.#editor?.insertTable(cols, rows);
  }

  async copyTable() {
    if (runActiveTableOp("copy")) return;
    try {
      const text = this.#editor?.tableText();
      if (text) await ipc.clipboardWriteText(text);
    } catch (e) {
      this.status = `Copy table failed: ${e}`;
    }
    this.#editor?.focus();
  }

  async copyCodeContent() {
    try {
      const text = this.#editor?.codeText();
      if (text) await ipc.clipboardWriteText(text);
    } catch (e) {
      this.status = `Copy code failed: ${e}`;
    }
    this.#editor?.focus();
  }

  // --- vault ---------------------------------------------------------------

  async openVault() {
    try {
      const path = await ipc.pickVault();
      if (path) await this.loadVault(path);
    } catch (e) {
      this.status = `Open vault failed: ${e}`;
    }
  }

  async loadVault(path: string) {
    const info = await ipc.openVault(path);
    this.root = info.root;
    this.docCount = info.docCount;
    this.tagCount = info.tagCount;
    void ipc.unwatchFile();
    this.activeRelPath = null;
    this.standalonePath = null;
    this.untitled = false;
    this.content = "";
    this.clearTagFilter();
    this.activeView = "explorer";
    this.sidebarCollapsed = false;
    await this.refresh();
    this.status = "";
    try {
      localStorage.setItem("octothorpe:lastVault", path);
    } catch {
      // ignore (private mode, etc.)
    }
  }

  /** Reopen the most recently used vault on startup (Tauri only). */
  async restoreLastVault() {
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return;
    let path: string | null = null;
    try {
      path = localStorage.getItem("octothorpe:lastVault");
    } catch {
      return;
    }
    if (path) {
      try {
        await this.loadVault(path);
      } catch {
        // vault moved/removed — ignore and start empty
      }
    }
  }

  async refresh() {
    this.tree = await ipc.getTree();
    this.tags = await ipc.getTagTree();
    this.allDocs = await ipc.listDocuments();
    this.docCount = this.allDocs.length;
    this.tagCount = countTags(this.tags);
    if (this.filterTag) {
      this.filteredDocs = await ipc.documentsByTag(this.filterTag);
    }
  }

  // --- documents -----------------------------------------------------------

  async openDoc(relPath: string) {
    try {
      const doc = await ipc.readDocument(relPath);
      void ipc.unwatchFile();
      this.standalonePath = null;
      this.untitled = false;
      this.activeRelPath = relPath;
      this.content = doc.content;
      this.dirty = false;
      this.externalChanged = false;
    } catch (e) {
      this.status = `Open failed: ${e}`;
    }
  }

  /** Open an arbitrary file: a vault doc when it lives inside the open folder,
   *  otherwise a standalone (out-of-folder) document. */
  async openFile() {
    try {
      const path = await ipc.pickMarkdownPath();
      if (!path) return;
      const doc = await ipc.openPath(path);
      if (doc.relPath) {
        await this.openDoc(doc.relPath);
      } else {
        this.openStandalone(path, doc.content);
      }
    } catch (e) {
      this.status = `Open failed: ${e}`;
    }
  }

  /** Show a file from outside the open folder as a standalone document. */
  openStandalone(path: string, content: string) {
    this.activeRelPath = null;
    this.untitled = false;
    this.standalonePath = path;
    this.content = content;
    this.dirty = false;
    this.externalChanged = false;
    if (!this.root) this.activeView = "outline";
    this.sidebarCollapsed = false;
    void ipc.watchFile(path);
  }

  /** Open an empty, never-saved buffer (standalone-editor mode, no folder). */
  openUntitled() {
    void ipc.unwatchFile();
    this.activeRelPath = null;
    this.standalonePath = null;
    this.untitled = true;
    this.content = "";
    this.dirty = false;
    this.externalChanged = false;
    if (!this.root) this.activeView = "outline";
    this.sidebarCollapsed = false;
  }

  setContent(next: string) {
    this.content = next;
    this.dirty = true;
  }

  async save() {
    if (this.untitled) {
      await this.saveAs();
      return;
    }
    if (this.standalonePath) {
      try {
        await ipc.writeFile(this.standalonePath, this.content);
        this.dirty = false;
        this.externalChanged = false;
        this.status = "Saved";
      } catch (e) {
        this.status = `Save failed: ${e}`;
      }
      return;
    }
    if (!this.activeRelPath) return;
    try {
      await ipc.writeDocument(this.activeRelPath, this.content);
      this.dirty = false;
      this.externalChanged = false;
      this.status = "Saved";
      await this.refresh();
    } catch (e) {
      this.status = `Save failed: ${e}`;
    }
  }

  /** Save the active document to a chosen location and switch the editor to it. */
  async saveAs() {
    if (!this.hasDoc) return;
    try {
      const name = `${this.activeTitle || "Untitled"}.md`;
      let defaultPath = name;
      if (this.activeAbsPath) {
        defaultPath = this.activeAbsPath; // existing file: start where it lives
      } else if (this.root) {
        // New untitled buffer with a folder open: default into that folder.
        const sep = this.root.includes("\\") ? "\\" : "/";
        defaultPath = this.root + sep + name;
      }
      const target = await ipc.pickSavePath(defaultPath);
      if (!target) return;
      await ipc.writeFile(target, this.content);
      const doc = await ipc.openPath(target);
      if (doc.relPath) {
        await this.refresh();
        await this.openDoc(doc.relPath);
      } else {
        this.openStandalone(target, this.content);
      }
      this.dirty = false;
      this.status = "Saved";
    } catch (e) {
      this.status = `Save As failed: ${e}`;
    }
  }

  /** Delete the active document (after confirmation) and clear the editor. */
  async deleteActive() {
    const abs = this.activeAbsPath;
    if (!abs) return; // untitled buffer — nothing on disk
    try {
      const ok = await ipc.confirmDelete(this.activeTitle || "this file");
      if (!ok) return;
      if (this.activeRelPath) {
        await ipc.deleteDocument(this.activeRelPath);
        this.closeDoc();
        await this.refresh();
      } else {
        await ipc.deleteFile(abs);
        this.closeDoc();
      }
      this.status = "Deleted";
    } catch (e) {
      this.status = `Delete failed: ${e}`;
    }
  }

  /** Reload the active document from disk (vault or standalone). */
  async reloadActive() {
    if (this.activeRelPath) {
      await this.openDoc(this.activeRelPath);
    } else if (this.standalonePath) {
      try {
        this.content = await ipc.readFile(this.standalonePath);
        this.dirty = false;
        this.externalChanged = false;
      } catch (e) {
        this.status = `Reload failed: ${e}`;
      }
    }
  }

  /** Close the active document and clear the editor. */
  closeDoc() {
    void ipc.unwatchFile();
    this.activeRelPath = null;
    this.standalonePath = null;
    this.untitled = false;
    this.content = "";
    this.dirty = false;
    this.externalChanged = false;
  }

  /** New document. Opens a blank untitled buffer — its filename is chosen on the
   *  first Save (no file is written to disk until then). When no folder is open
   *  and a document is already being edited, opens a new window instead so the
   *  current buffer isn't replaced. */
  newFile() {
    if (this.root || !this.hasDoc) {
      this.openUntitled();
    } else {
      void ipc.newWindow(true);
    }
  }

  async newNote(folder = "") {
    try {
      const meta = await ipc.createDocument(folder, "Untitled");
      await this.refresh();
      await this.openDoc(meta.relPath);
    } catch (e) {
      this.status = `New note failed: ${e}`;
    }
  }

  /** Show the OS's native file-properties dialog for the active document. */
  async showProperties() {
    const abs = this.activeAbsPath;
    if (!abs) return;
    try {
      await ipc.showProperties(abs);
    } catch (e) {
      this.status = `Properties failed: ${e}`;
    }
  }

  /** Reveal the active document in the OS file manager. */
  async revealLocation() {
    const abs = this.activeAbsPath;
    if (!abs) return;
    try {
      await ipc.revealInDir(abs);
    } catch (e) {
      this.status = `Open file location failed: ${e}`;
    }
  }

  // --- tags ----------------------------------------------------------------

  async selectTag(path: string) {
    this.filterTag = path;
    this.activeView = "tags";
    this.sidebarCollapsed = false;
    try {
      this.filteredDocs = await ipc.documentsByTag(path);
    } catch (e) {
      this.status = `Tag filter failed: ${e}`;
    }
  }

  clearTagFilter() {
    this.filterTag = null;
    this.filteredDocs = [];
  }

  // --- search ---------------------------------------------------------------

  async runSearch(q: string) {
    this.searchQuery = q;
    if (!q.trim() || !this.root) {
      this.searchResults = [];
      return;
    }
    try {
      this.searchResults = await ipc.search(q);
    } catch (e) {
      this.status = `Search failed: ${e}`;
    }
  }

  // --- external changes (file watcher) -------------------------------------

  /** Subscribe to the backend's vault://changed events. Safe no-op in a plain
   *  browser (no Tauri). */
  async listenForChanges() {
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return;
    const { listen } = await import("@tauri-apps/api/event");
    await listen<{ updated?: string[]; removed?: string[] }>("vault://changed", (e) => {
      this.onVaultChanged(e.payload);
    });
    await listen<{ path: string; removed?: boolean }>("file://changed", (e) => {
      this.onFileChanged(e.payload);
    });
  }

  onVaultChanged(payload: { updated?: string[]; removed?: string[] }) {
    const updated = payload?.updated ?? [];
    const removed = payload?.removed ?? [];
    void this.refresh();

    const active = this.activeRelPath;
    if (!active) return;
    if (removed.includes(active)) {
      this.activeRelPath = null;
      this.content = "";
      this.status = "Note deleted on disk";
    } else if (updated.includes(active)) {
      if (this.dirty) {
        this.externalChanged = true;
        this.status = "Changed on disk — your unsaved edits are kept";
      } else {
        void this.openDoc(active); // silent reload
        this.status = "Reloaded (changed on disk)";
      }
    }
  }

  /** A standalone (out-of-folder) file changed on disk. */
  onFileChanged(payload: { path: string; removed?: boolean }) {
    if (this.standalonePath !== payload.path) return;
    if (payload.removed) {
      this.closeDoc();
      this.status = "File deleted on disk";
      return;
    }
    if (this.dirty) {
      this.externalChanged = true;
      this.status = "Changed on disk — your unsaved edits are kept";
    } else {
      void this.reloadActive();
      this.status = "Reloaded (changed on disk)";
    }
  }
}

function countTags(nodes: TagNode[]): number {
  let n = 0;
  for (const node of nodes) n += 1 + countTags(node.children);
  return n;
}

/** Parse ATX headings into an outline, skipping fenced code blocks. */
function parseOutline(content: string): OutlineItem[] {
  const items: OutlineItem[] = [];
  let inFence = false;
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = /^(#{1,6})\s+(.*\S)\s*$/.exec(line);
    if (m) {
      items.push({ level: m[1].length, text: m[2], line: i + 1 });
    }
  }
  return items;
}

export const workspace = new Workspace();

// Dev-only hook so the workspace can be driven in a browser without Tauri.
if (import.meta.env.DEV) {
  (globalThis as unknown as { __workspace?: Workspace }).__workspace = workspace;
}
