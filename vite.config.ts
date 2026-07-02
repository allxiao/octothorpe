import { defineConfig, type Plugin } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { execFileSync } from "node:child_process";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// Regenerate the preferences types/descriptor/defaults whenever a bundled schema
// file changes, so editing schema.json during dev is picked up without a restart.
function preferencesCodegen(): Plugin {
  const regen = () => {
    try {
      execFileSync("node", ["scripts/gen-preferences.mjs"], { stdio: "inherit" });
    } catch (e) {
      console.error("[preferences] codegen failed", e);
    }
  };
  return {
    name: "preferences-codegen",
    configureServer(server) {
      server.watcher.add("src/lib/preferences/schema/**/*.json");
      server.watcher.on("change", (file) => {
        if (file.replace(/\\/g, "/").includes("/preferences/schema/")) regen();
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [preferencesCodegen(), svelte()],

  // Vite options tailored for Tauri development
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? { protocol: "ws", host, port: 1421 }
      : undefined,
    // 3. tell Vite to ignore watching `src-tauri`
    watch: { ignored: ["**/src-tauri/**"] },
  },
});
