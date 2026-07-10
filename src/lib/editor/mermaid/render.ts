import { StateEffect } from "@codemirror/state";

/**
 * Async Mermaid render pipeline. Unlike KaTeX (synchronous, see
 * `../math/render.ts`), `mermaid.render()` returns a Promise and the library is
 * large, so:
 *   - mermaid is imported *dynamically* the first time a diagram renders (Vite
 *     splits it into its own chunk — startup stays fast);
 *   - results are cached synchronously by `theme\0source` so the widget's
 *     `toDOM`/`estimatedHeight`/`eq` can read them without awaiting;
 *   - a caret-visible block first shows a placeholder, kicks off the async
 *     render, and once it lands dispatches `mermaidReadyEffect` to rebuild the
 *     field so a fresh (now cache-hit) widget draws the diagram.
 */

/** Dispatched after an async render lands so `mermaidField` rebuilds and the
 *  cache-hit widget replaces the "Rendering…" placeholder. */
export const mermaidReadyEffect = StateEffect.define<null>();

export type MermaidRender =
  | { status: "ok"; svg: string; height: number }
  | { status: "error"; message: string };

const cache = new Map<string, MermaidRender>();
const inflight = new Set<string>();
const MAX_CACHE = 200;

/** Debounce timers keyed by cache key, so a burst of keystrokes only renders the
 *  latest source rather than one diagram per character. */
const debounce = new Map<string, ReturnType<typeof setTimeout>>();
const DEBOUNCE_MS = 200;

let idCounter = 0;
let mermaidMod: typeof import("mermaid").default | null = null;
let lastInitTheme: string | null = null;

/** The effective mermaid theme for the current app appearance. `data-theme` is
 *  `light`/`dark` when forced, absent when following the OS. */
export function currentMermaidTheme(): "dark" | "default" {
  const forced = document.documentElement.getAttribute("data-theme");
  if (forced === "dark") return "dark";
  if (forced === "light") return "default";
  return typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "default";
}

function keyFor(source: string): string {
  return currentMermaidTheme() + "\0" + source;
}

/** Synchronous cache lookup for the current theme. */
export function getMermaidRender(source: string): MermaidRender | undefined {
  return cache.get(keyFor(source));
}

function store(key: string, value: MermaidRender) {
  if (cache.size >= MAX_CACHE) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
}

/** Measure the natural pixel height of a rendered SVG at the editor's font size,
 *  the way `measuredMathHeight` does — the block widget's height must be known up
 *  front (CM doesn't measure these into its height map) or clicks/cursor motion
 *  below the diagram misalign. */
function measureSvgHeight(svg: string): number {
  if (typeof document === "undefined") return 120;
  const scroller = document.querySelector(".cm-scroller");
  const fontSize = scroller ? getComputedStyle(scroller).fontSize : "15px";
  const probe = document.createElement("div");
  probe.style.cssText = "position:absolute;visibility:hidden;left:-9999px;top:0;";
  probe.style.fontSize = fontSize;
  probe.innerHTML = svg;
  document.body.appendChild(probe);
  const height = probe.getBoundingClientRect().height || 120;
  document.body.removeChild(probe);
  return height;
}

async function ensureMermaid(theme: "dark" | "default") {
  if (!mermaidMod) {
    mermaidMod = (await import("mermaid")).default;
  }
  if (lastInitTheme !== theme) {
    mermaidMod.initialize({ startOnLoad: false, securityLevel: "strict", theme });
    lastInitTheme = theme;
  }
  return mermaidMod;
}

async function doRender(key: string, source: string, theme: "dark" | "default") {
  const id = "typedown-mermaid-" + idCounter++;
  try {
    const mermaid = await ensureMermaid(theme);
    const { svg } = await mermaid.render(id, source);
    store(key, { status: "ok", svg, height: Math.ceil(measureSvgHeight(svg)) + 16 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    store(key, { status: "error", message });
  } finally {
    // mermaid leaves a detached probe element behind on error; clean it up.
    document.getElementById(id)?.remove();
    document.getElementById("d" + id)?.remove();
    inflight.delete(key);
  }
}

/**
 * Ensure a render for `source` exists (or is on its way). If already cached,
 * `onReady` fires immediately; otherwise the render is debounced and `onReady`
 * fires once it lands. Concurrent requests for the same key are deduped.
 */
export function renderMermaid(source: string, onReady: () => void): void {
  const key = keyFor(source);
  if (cache.has(key)) {
    onReady();
    return;
  }
  if (inflight.has(key)) return;

  const existing = debounce.get(key);
  if (existing !== undefined) clearTimeout(existing);
  debounce.set(
    key,
    setTimeout(() => {
      debounce.delete(key);
      if (cache.has(key) || inflight.has(key)) return;
      inflight.add(key);
      const theme = currentMermaidTheme();
      void doRender(key, source, theme).then(onReady);
    }, DEBOUNCE_MS),
  );
}

/** Drop all cached renders (e.g. after a theme change) so diagrams re-render with
 *  the new palette. */
export function clearMermaidCache(): void {
  cache.clear();
}
