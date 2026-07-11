import { mount } from "svelte";
import "./styles/global.css";
import "katex/dist/katex.min.css";
import App from "./App.svelte";
import { preloadMathFonts } from "./lib/editor/math/fonts";

// Warm KaTeX's (locally-bundled) web fonts after startup so the first math
// render — e.g. a bold `\mathbf{…}` — doesn't wait on a lazy font fetch.
preloadMathFonts();

if (import.meta.env.DEV) {
  void import("./lib/dev/mockSeed").then((m) => m.seedIfBrowser());
}

const app = mount(App, {
  target: document.getElementById("app")!,
});

export default app;
