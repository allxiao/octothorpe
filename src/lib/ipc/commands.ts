import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";

const MD_FILTERS = [
  { name: "Markdown", extensions: ["md", "markdown", "txt"] },
];

export interface OpenedFile {
  path: string;
  content: string;
}

/** Read a UTF-8 file from disk via the Rust core. */
export async function readFile(path: string): Promise<string> {
  return invoke<string>("read_file", { path });
}

/** Write content to a file atomically via the Rust core. */
export async function writeFile(path: string, content: string): Promise<void> {
  await invoke("write_file", { path, content });
}

/** Prompt for a Markdown file and read it. Returns null if cancelled. */
export async function openMarkdownFile(): Promise<OpenedFile | null> {
  const selected = await open({
    multiple: false,
    directory: false,
    filters: MD_FILTERS,
  });
  if (typeof selected !== "string") return null;
  const content = await readFile(selected);
  return { path: selected, content };
}

/**
 * Save content. If there is no current path, prompt with a save dialog.
 * Returns the path written, or null if the dialog was cancelled.
 */
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
