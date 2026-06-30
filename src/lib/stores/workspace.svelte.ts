// Shared workspace state (Svelte 5 runes). Holds the open vault, its file and
// tag trees, the active document, and the current tag filter.

import * as ipc from "../ipc/commands";
import type { DocumentMeta, TagNode, TreeNode } from "../ipc/types";

class Workspace {
  root = $state<string | null>(null);
  tree = $state<TreeNode[]>([]);
  tags = $state<TagNode[]>([]);

  activeRelPath = $state<string | null>(null);
  content = $state<string>("");
  dirty = $state(false);
  status = $state<string>("");

  filterTag = $state<string | null>(null);
  filteredDocs = $state<DocumentMeta[]>([]);

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
    this.activeRelPath = null;
    this.content = "";
    this.clearTagFilter();
    await this.refresh();
    this.status = `${info.docCount} notes, ${info.tagCount} tags`;
  }

  async refresh() {
    this.tree = await ipc.getTree();
    this.tags = await ipc.getTagTree();
    if (this.filterTag) {
      this.filteredDocs = await ipc.documentsByTag(this.filterTag);
    }
  }

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
      await this.refresh(); // tags/title may have changed
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

  async selectTag(path: string) {
    this.filterTag = path;
    this.filteredDocs = await ipc.documentsByTag(path);
  }

  clearTagFilter() {
    this.filterTag = null;
    this.filteredDocs = [];
  }
}

export const workspace = new Workspace();
