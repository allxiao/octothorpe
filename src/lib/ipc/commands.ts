import { invoke } from "@tauri-apps/api/core";
import { ask, open, save } from "@tauri-apps/plugin-dialog";
import type {
  DocumentContent,
  DocumentMeta,
  SearchHit,
  TagNode,
  TreeNode,
  VaultInfo,
} from "./types";

const MD_FILTERS = [{ name: "Markdown", extensions: ["md", "markdown", "txt"] }];

// --- Vault & document management -----------------------------------------

/** Prompt for a folder to open as a vault. Returns null if cancelled. */
export async function pickVault(): Promise<string | null> {
  const selected = await open({ directory: true, multiple: false });
  return typeof selected === "string" ? selected : null;
}

export const openVault = (path: string) => invoke<VaultInfo>("open_vault", { path });
export const getTree = () => invoke<TreeNode[]>("get_tree");
export const getTagTree = () => invoke<TagNode[]>("get_tag_tree");
export const listDocuments = () => invoke<DocumentMeta[]>("list_documents");
export const documentsByTag = (tag: string) =>
  invoke<DocumentMeta[]>("documents_by_tag", { tag });
export const search = (query: string, opts?: { tag?: string; limit?: number }) =>
  invoke<SearchHit[]>("search", { query, tag: opts?.tag, limit: opts?.limit });
export const readDocument = (relPath: string) =>
  invoke<DocumentContent>("read_document", { relPath });
export const writeDocument = (relPath: string, content: string) =>
  invoke<DocumentMeta>("write_document", { relPath, content });
export const createDocument = (folder: string, title: string) =>
  invoke<DocumentMeta>("create_document", { folder, title });
export const deleteDocument = (relPath: string) =>
  invoke<void>("delete_document", { relPath });

// --- Standalone (out-of-folder) files -------------------------------------

export interface OpenedDoc {
  /** Vault-relative id when the file is inside the open folder, else null. */
  relPath: string | null;
  content: string;
}

export async function readFile(path: string): Promise<string> {
  return invoke<string>("read_file", { path });
}

export async function writeFile(path: string, content: string): Promise<void> {
  await invoke("write_file", { path, content });
}

/** Read a file by absolute path, tagging it as a vault doc when it lives inside
 *  the open folder (so the frontend can index/route it accordingly). */
export const openPath = (path: string) => invoke<OpenedDoc>("open_path", { path });
export const deleteFile = (path: string) => invoke<void>("delete_file", { path });
export const watchFile = (path: string) => invoke<void>("watch_file", { path });
export const unwatchFile = () => invoke<void>("unwatch_file");

// --- OS integration & windows ---------------------------------------------

/** Show the OS's native file-properties dialog. */
export const showProperties = (path: string) => invoke<void>("show_properties", { path });
/** Reveal a file in the OS file manager (Explorer/Finder), selecting it. */
export const revealInDir = (path: string) => invoke<void>("reveal_in_dir", { path });
/** Spawn a fresh Typedown window/process. `untitled` opens it on an empty buffer. */
export const newWindow = (untitled = false) => invoke<void>("new_window", { untitled });

export interface StartupOptions {
  /** Launched as a New Window — skip restoring the last folder. */
  blank: boolean;
  /** Open an empty untitled buffer on launch. */
  untitled: boolean;
}
export const startupOptions = () => invoke<StartupOptions>("startup_options");

// --- Dialogs --------------------------------------------------------------

/** Prompt for a markdown file to open. Returns its path, or null if cancelled. */
export async function pickMarkdownPath(): Promise<string | null> {
  const selected = await open({ multiple: false, directory: false, filters: MD_FILTERS });
  return typeof selected === "string" ? selected : null;
}

/** Prompt for a destination path to save to. Returns null if cancelled. */
export async function pickSavePath(defaultName: string): Promise<string | null> {
  const chosen = await save({ filters: MD_FILTERS, defaultPath: defaultName });
  return chosen ?? null;
}

/** Confirm a destructive delete. Returns true if the user agreed. */
export async function confirmDelete(name: string): Promise<boolean> {
  return await ask(`Delete “${name}”?\nThis cannot be undone.`, {
    title: "Delete file",
    kind: "warning",
  });
}
