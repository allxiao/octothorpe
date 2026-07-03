// Native file drag-and-drop (Tauri). When OS files/folders are dropped on the
// window, each dropped path is classified (folder / markdown / image / other)
// and routed according to the files.onDrop* preferences: open it, or insert a
// Markdown link/image at the cursor.

import { getCurrentWebview } from "@tauri-apps/api/webview";
import * as ipc from "./ipc/commands";
import { preferences } from "./preferences/store.svelte";
import { workspace } from "./stores/workspace.svelte";
import { ui } from "./stores/ui.svelte";

/** Start listening for window drag-drop events. Returns an unlisten function. */
export async function initDragDrop(): Promise<() => void> {
  return getCurrentWebview().onDragDropEvent(async (event) => {
    const p = event.payload;
    if (p.type === "over") {
      ui.dragOver = true;
    } else if (p.type === "leave") {
      ui.dragOver = false;
    } else if (p.type === "drop") {
      ui.dragOver = false;
      for (const path of p.paths) {
        await handleDrop(path);
      }
    }
  });
}

async function handleDrop(path: string) {
  let kind: "folder" | "markdown" | "image" | "other";
  try {
    kind = await ipc.pathKind(path);
  } catch (e) {
    workspace.status = `Drop failed: ${e}`;
    return;
  }

  if (kind === "folder") {
    if (preferences.get<string>("files.onDropFolder") === "open") await workspace.openFolder(path);
    else workspace.insertLink(path);
    return;
  }

  if (kind === "markdown") {
    if (preferences.get<string>("files.onDropMarkdown") === "open") await workspace.openByPath(path);
    else workspace.insertLink(path);
    return;
  }

  // image / other → files.onDropImportable. "Import" embeds images; anything
  // else we can't import, so fall back to inserting a link.
  const action = preferences.get<string>("files.onDropImportable");
  if (action === "import" && kind === "image") await workspace.insertImage(path);
  else workspace.insertLink(path);
}
