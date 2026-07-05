import DOMPurify, { type Config } from "dompurify";
import { resolveHtmlSrc } from "./paths";

/**
 * Sanitize + render helpers for embedded HTML in Markdown (Typora-style). The
 * live-preview layer drops the rendered output into a widget via `innerHTML`, so
 * every string that reaches the DOM passes through DOMPurify first.
 *
 * DOMPurify's default allowlist already does most of what we want: it renders a
 * broad, safe set of HTML/SVG, strips `<script>` and `on*=` handlers and
 * `javascript:`/`vbscript:` URIs, and removes unknown/custom tags (keeping their
 * text) — which matches Typora's "custom tags are ignored in render". We layer a
 * few project-specific rules on top (below), and a hook that hardens `<iframe>`
 * and rewrites relative media paths to the Tauri asset protocol.
 */

// Rendering runs inside the Tauri webview, which has a real DOM. Under vitest /
// SSR there's no window; callers get an escaped-text fallback instead (we never
// reach DOMPurify there).
const hasDOM = typeof window !== "undefined" && typeof document !== "undefined";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// The base dir for the *current* sanitize call. DOMPurify hooks are stateless
// and global, so we stash it here immediately before each `sanitize` and read it
// back inside the hook. JS is single-threaded and `sanitize` is synchronous, so
// there's no interleaving.
let currentBaseDir = "";

const COMMON: Config = {
  // Drop id/class/data-* from the render (kept on disk) — Typora does the same
  // for rendering consistency; `data-*` off via ALLOW_DATA_ATTR.
  FORBID_ATTR: ["id", "class"],
  ALLOW_DATA_ATTR: false,
  // Scripts/handlers are already stripped by default; also refuse interactive
  // form/embedding controls and page-affecting tags that make no sense inline.
  FORBID_TAGS: [
    "script",
    "style",
    "object",
    "embed",
    "form",
    "input",
    "button",
    "textarea",
    "select",
    "option",
    "link",
    "meta",
    "base",
  ],
};

// Block context: allow media + iframes (opted in — DOMPurify forbids <iframe> by
// default) on top of the broad default allowlist, plus the attributes those tags
// need. The `afterSanitizeAttributes` hook forces a sandbox and resolves paths.
const BLOCK_CONFIG: Config = {
  ...COMMON,
  ADD_TAGS: ["iframe"],
  ADD_ATTR: [
    "sandbox",
    "allow",
    "allowfullscreen",
    "referrerpolicy",
    "loading",
    "controls",
    "poster",
    "preload",
    "target",
  ],
};

let hookInstalled = false;
function installHook() {
  if (hookInstalled || !hasDOM) return;
  hookInstalled = true;
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    const el = node as Element;
    const tag = el.tagName?.toLowerCase();

    // Harden iframes: a restrictive sandbox WITHOUT allow-same-origin (so the
    // frame can't reach app storage/cookies or the parent), no inline document,
    // no referrer, lazy-loaded. Typora runs embeds in a sandboxed iframe too.
    if (tag === "iframe") {
      el.setAttribute("sandbox", "allow-scripts allow-popups allow-forms allow-presentation");
      el.removeAttribute("srcdoc");
      el.setAttribute("referrerpolicy", "no-referrer");
      el.setAttribute("loading", "lazy");
      const src = el.getAttribute("src");
      // Only remote https(+http) iframes; a relative iframe src has no meaning.
      if (src && !/^https?:/i.test(src)) el.removeAttribute("src");
    }

    // Resolve relative/local media paths against the document's folder so a
    // `<img src="pic.png">` / `<video src="clip.mp4">` loads like a Markdown image.
    if (tag === "img" || tag === "video" || tag === "audio" || tag === "source") {
      const src = el.getAttribute("src");
      if (src) {
        const resolved = resolveHtmlSrc(src, currentBaseDir);
        if (resolved) el.setAttribute("src", resolved);
        else el.removeAttribute("src");
      }
    }
    if (tag === "video") {
      const poster = el.getAttribute("poster");
      if (poster) {
        const resolved = resolveHtmlSrc(poster, currentBaseDir);
        if (resolved) el.setAttribute("poster", resolved);
        else el.removeAttribute("poster");
      }
    }

    // Rendered links open externally (handled by the editor's click handler);
    // make plain new-tab opens safe regardless.
    if (tag === "a" && el.getAttribute("target") === "_blank") {
      el.setAttribute("rel", "noopener noreferrer");
    }
  });
}

// Sanitizing re-runs on every keystroke (the decoration builds are synchronous
// and viewport-scoped), so memoize by base dir + raw source. A small FIFO cap
// keeps the map bounded, matching the KaTeX render cache.
const MAX_CACHE = 500;
const blockCache = new Map<string, string>();

function cachePut(cache: Map<string, string>, key: string, value: string) {
  if (cache.size >= MAX_CACHE) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
}

function run(raw: string, baseDir: string, config: Config): string {
  if (!hasDOM) return escapeHtml(raw);
  installHook();
  currentBaseDir = baseDir;
  const out = DOMPurify.sanitize(raw, config) as string;
  currentBaseDir = "";
  return out;
}

/** Sanitize embedded HTML (allows media + sandboxed iframes, drops scripts/
 *  handlers/`javascript:`/`id`/`class`/`data-*`). Used for both block widgets and
 *  the inline widget fallback. Memoized by base dir + raw source. */
export function sanitizeHtml(raw: string, baseDir: string): string {
  const key = baseDir + "\0" + raw;
  const cached = blockCache.get(key);
  if (cached !== undefined) return cached;
  const out = run(raw, baseDir, BLOCK_CONFIG);
  cachePut(blockCache, key, out);
  return out;
}

/**
 * Measured pixel height of a block of rendered HTML, at the editor's font size
 * and content width. Block HTML is drawn with `Decoration.replace({block:true})`
 * widgets, whose heights CodeMirror does NOT measure into its height map — it
 * relies on `WidgetType.estimatedHeight`. A wrong estimate desyncs the height
 * map (which drives `posAtCoords` and vertical cursor motion), so we measure the
 * real render once offscreen, cached by font size + width + source. Async media
 * (images/iframes) still settles later — the widget re-measures on load.
 */
const heightCache = new Map<string, number>();

export function measuredHtmlHeight(raw: string, baseDir: string): number {
  if (!hasDOM) return 22;
  const content = document.querySelector(".cm-content");
  const width = content ? (content as HTMLElement).clientWidth : 700;
  const scroller = document.querySelector(".cm-scroller");
  const fontSize = scroller ? getComputedStyle(scroller).fontSize : "15px";
  const key = fontSize + "\0" + width + "\0" + baseDir + "\0" + raw;
  const cached = heightCache.get(key);
  if (cached !== undefined) return cached;

  const probe = document.createElement("div");
  probe.style.cssText = `position:absolute;visibility:hidden;left:-9999px;top:0;width:${width}px;`;
  probe.style.fontSize = fontSize;
  probe.innerHTML = sanitizeHtml(raw, baseDir);
  document.body.appendChild(probe);
  const height = probe.getBoundingClientRect().height || 22;
  document.body.removeChild(probe);

  if (heightCache.size >= MAX_CACHE) {
    const oldest = heightCache.keys().next().value;
    if (oldest !== undefined) heightCache.delete(oldest);
  }
  heightCache.set(key, height);
  return height;
}
