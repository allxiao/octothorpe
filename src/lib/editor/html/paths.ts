import { convertFileSrc } from "@tauri-apps/api/core";

/**
 * Resolve a URL found in embedded HTML (an `<img>`/`<video>`/`<audio>`/`<iframe>`
 * `src`, or a `<video poster>`) to something the webview can load. Remote and
 * `data:` URLs pass through unchanged; `file:` and relative/local paths are
 * resolved against the open document's directory and routed through Tauri's
 * asset protocol. Returns null when it can't be resolved (e.g. a relative path
 * with no base dir, or outside a Tauri context).
 *
 * This mirrors the image-source resolution used for Markdown `![](…)` images —
 * both call sites share it so local media behaves the same however it's written.
 */
export function resolveHtmlSrc(url: string, baseDir: string): string | null {
  if (/^(https?:|data:)/i.test(url)) return url;
  try {
    if (/^file:/i.test(url)) return convertFileSrc(decodeURI(url.replace(/^file:\/*/i, "")));
    if (!baseDir) return null;
    const sep = baseDir.includes("\\") ? "\\" : "/";
    const joined = baseDir.replace(/[\\/]+$/, "") + sep + url.replace(/\//g, sep);
    return convertFileSrc(joined);
  } catch {
    return null;
  }
}
