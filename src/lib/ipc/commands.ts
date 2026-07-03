import { invoke } from "@tauri-apps/api/core";
import { ask, open, save } from "@tauri-apps/plugin-dialog";
import { writeText, readText, writeHtml } from "@tauri-apps/plugin-clipboard-manager";
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
export const createDocument = (folder: string, title: string, eol: "lf" | "crlf" = "lf") =>
  invoke<DocumentMeta>("create_document", { folder, title, eol });
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
/** Open a URL (or file path) with the OS default handler. */
export const openUrl = (url: string) => invoke<void>("open_url", { url });
/** Spawn a fresh Octothorpe window/process. `untitled` opens it on an empty buffer. */
export const newWindow = (untitled = false) => invoke<void>("new_window", { untitled });

/** Classify a filesystem path for drag-and-drop: "folder" | "markdown" | "image" | "other". */
export const pathKind = (path: string) =>
  invoke<"folder" | "markdown" | "image" | "other">("path_kind", { path });

export interface StartupOptions {
  /** Launched as a New Window — skip restoring the last folder. */
  blank: boolean;
  /** Open an empty untitled buffer on launch. */
  untitled: boolean;
}
export const startupOptions = () => invoke<StartupOptions>("startup_options");

/** Close the current window (and, since each window is its own process, exit it). */
export async function closeWindow(): Promise<void> {
  const { getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  await getCurrentWebviewWindow().close();
}

// --- Dialogs --------------------------------------------------------------

/** Prompt for a markdown file to open. Returns its path, or null if cancelled. */
export async function pickMarkdownPath(): Promise<string | null> {
  const selected = await open({ multiple: false, directory: false, filters: MD_FILTERS });
  return typeof selected === "string" ? selected : null;
}

/** Prompt for a destination path to save to. Returns null if cancelled. */
export async function pickSavePath(defaultPath: string): Promise<string | null> {
  const chosen = await save({ filters: MD_FILTERS, defaultPath });
  return chosen ?? null;
}

/** Confirm a destructive delete. Returns true if the user agreed. */
export async function confirmDelete(name: string): Promise<boolean> {
  return await ask(`Delete “${name}”?\nThis cannot be undone.`, {
    title: "Delete file",
    kind: "warning",
  });
}

// --- Clipboard & Markdown conversions (Edit menu) -------------------------

export const clipboardWriteText = (text: string) => writeText(text);
export const clipboardReadText = () => readText();
export const clipboardWriteHtml = (html: string) => writeHtml(html);

export const markdownToHtml = (markdown: string) =>
  invoke<string>("markdown_to_html", { markdown });
export const markdownToPlaintext = (markdown: string) =>
  invoke<string>("markdown_to_plaintext", { markdown });
/** Copy a local image file's pixels to the system clipboard. */
export const copyImage = (src: string) => invoke<void>("copy_image", { src });

// --- Preferences ----------------------------------------------------------

/** Read the raw ~/.octothorpe/preferences.json (or a default when absent). */
export const readPreferences = () => invoke<string>("read_preferences");
/** Write the raw preferences JSON to ~/.octothorpe/preferences.json. */
export const writePreferences = (content: string) =>
  invoke<void>("write_preferences", { content });
