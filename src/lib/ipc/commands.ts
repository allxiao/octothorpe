import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
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

// --- Ad-hoc single-file open/save (outside a vault) -----------------------

export interface OpenedFile {
  path: string;
  content: string;
}

export async function readFile(path: string): Promise<string> {
  return invoke<string>("read_file", { path });
}

export async function writeFile(path: string, content: string): Promise<void> {
  await invoke("write_file", { path, content });
}

export async function openMarkdownFile(): Promise<OpenedFile | null> {
  const selected = await open({ multiple: false, directory: false, filters: MD_FILTERS });
  if (typeof selected !== "string") return null;
  const content = await readFile(selected);
  return { path: selected, content };
}

export async function saveMarkdownFile(
  currentPath: string | null,
  content: string,
): Promise<string | null> {
  let path = currentPath;
  if (!path) {
    const chosen = await save({ filters: MD_FILTERS, defaultPath: "Untitled.md" });
    if (!chosen) return null;
    path = chosen;
  }
  await writeFile(path, content);
  return path;
}
