import { mount } from "svelte";
import "./styles/global.css";
import App from "./App.svelte";

if (import.meta.env.DEV) {
  void import("./lib/dev/mockSeed").then((m) => m.seedIfBrowser());
}

const app = mount(App, {
  target: document.getElementById("app")!,
});

export default app;
