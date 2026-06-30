// Shared workspace state (Svelte 5 runes). Holds the open vault, its file and
// tag trees, the active document, the active sidebar view, and the tag filter.

import * as ipc from "../ipc/commands";
import type { DocumentMeta, TagNode, TreeNode } from "../ipc/types";

export type ViewId = "explorer" | "tags" | "outline";

export interface OutlineItem {
  level: number;
  text: string;
  line: number; // 1-based
}

export interface EditorApi {
  gotoLine: (line: number) => void;
}

class Workspace {
  root = $state<string | null>(null);
  tree = $state<TreeNode[]>([]);
  tags = $state<TagNode[]>([]);
  allDocs = $state<DocumentMeta[]>([]);
  docCount = $state(0);
  tagCount = $state(0);

  activeView = $state<ViewId>("explorer");

  activeRelPath = $state<string | null>(null);
  content = $state<string>("");
  dirty = $state(false);
  status = $state<string>("");

  filterTag = $state<string | null>(null);
  filteredDocs = $state<DocumentMeta[]>([]);

  #editor: EditorApi | null = null;

  /** Display title for the active document (basename without extension). */
  get activeTitle(): string {
    if (!this.activeRelPath) return "";
    const base = this.activeRelPath.split("/").pop() ?? this.activeRelPath;
    return base.replace(/\.(md|markdown)$/i, "");
  }

  /** Absolute directory of the active document (for resolving relative images). */
  get baseDir(): string {
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
    this.activeRelPath = null;
    this.content = "";
    this.clearTagFilter();
    await this.refresh();
    this.status = "";
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
      this.activeRelPath = relPath;
      this.content = doc.content;
      this.dirty = false;
    } catch (e) {
      this.status = `Open failed: ${e}`;
    }
  }

  setContent(next: string) {
    this.content = next;
    this.dirty = true;
  }

  async save() {
    if (!this.activeRelPath) return;
    try {
      await ipc.writeDocument(this.activeRelPath, this.content);
      this.dirty = false;
      this.status = "Saved";
      await this.refresh();
    } catch (e) {
      this.status = `Save failed: ${e}`;
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

  // --- tags ----------------------------------------------------------------

  async selectTag(path: string) {
    this.filterTag = path;
    this.activeView = "tags";
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
