// Dev-only: seed the workspace with representative data when running in a plain
// browser (no Tauri). Lets the UI be designed/inspected without a backend.
// Stripped from production builds (guarded by import.meta.env.DEV) and never
// runs inside the real app (which has Tauri internals).

import { workspace, type ViewId } from "../stores/workspace.svelte";
import type { DocumentMeta, TagNode, TreeNode } from "../ipc/types";

const tree: TreeNode[] = [
  {
    id: "Projects",
    kind: "folder",
    name: "Projects",
    relPath: "Projects",
    children: [
      { id: "Projects/typedown.md", kind: "doc", name: "typedown", relPath: "Projects/typedown.md", children: [] },
      { id: "Projects/side-quest.md", kind: "doc", name: "Side project", relPath: "Projects/side-quest.md", children: [] },
    ],
  },
  {
    id: "Recipes",
    kind: "folder",
    name: "Recipes",
    relPath: "Recipes",
    children: [
      { id: "Recipes/pad-thai.md", kind: "doc", name: "Pad Thai", relPath: "Recipes/pad-thai.md", children: [] },
      { id: "Recipes/pasta.md", kind: "doc", name: "Pasta", relPath: "Recipes/pasta.md", children: [] },
    ],
  },
  { id: "Welcome.md", kind: "doc", name: "Welcome to typedown", relPath: "Welcome.md", children: [] },
];

const leaf = (name: string, path: string, count: number): TagNode => ({ name, path, count, children: [] });
const tags: TagNode[] = [
  leaf("dinner", "dinner", 2),
  leaf("getting-started", "getting-started", 1),
  { name: "project", path: "project", count: 2, children: [leaf("side", "project/side", 1), leaf("typedown", "project/typedown", 1)] },
  { name: "recipes", path: "recipes", count: 2, children: [leaf("italian", "recipes/italian", 1), leaf("thai", "recipes/thai", 1)] },
  { name: "status", path: "status", count: 2, children: [leaf("active", "status/active", 1), leaf("idea", "status/idea", 1)] },
  leaf("welcome", "welcome", 1),
];

const doc = (relPath: string, title: string, folder: string, t: string[]): DocumentMeta => ({
  id: relPath, relPath, title, folder, tags: t, mtime: 0, size: 0,
});
const allDocs: DocumentMeta[] = [
  doc("Welcome.md", "Welcome to typedown", "", ["welcome", "getting-started"]),
  doc("Projects/typedown.md", "typedown", "Projects", ["project/typedown", "status/active"]),
  doc("Projects/side-quest.md", "Side project", "Projects", ["project/side", "status/idea"]),
  doc("Recipes/pasta.md", "Pasta", "Recipes", ["recipes/italian", "dinner"]),
  doc("Recipes/pad-thai.md", "Pad Thai", "Recipes", ["recipes/thai", "dinner"]),
];

const welcome = `# Welcome to typedown

A markdown editor that renders **while you type**. #welcome #getting-started

## Features

- Live preview with element-level reveal
- **Bold**, *italic*, ~~strike~~, \`code\`
- [ ] a task, [x] done

## Tags

Use Bear-style tags like #project/typedown and #my first note#.

> Tip: pick a view from the activity bar on the left.
`;

export function seedIfBrowser() {
  const hasTauri = "__TAURI_INTERNALS__" in window;
  if (hasTauri) return;

  workspace.root = "C:/Code/typedown-sample-vault";
  workspace.tree = tree;
  workspace.tags = tags;
  workspace.allDocs = allDocs;
  workspace.docCount = allDocs.length;
  workspace.tagCount = 10;
  workspace.activeRelPath = "Welcome.md";
  workspace.content = welcome;

  // Pick the view from the URL hash so screenshots can target each one.
  const hash = window.location.hash.replace("#", "");
  if (hash === "tags" || hash === "explorer" || hash === "outline") {
    workspace.activeView = hash as ViewId;
  }
  if (hash === "tags") {
    workspace.filterTag = "recipes";
    workspace.filteredDocs = allDocs.filter((d) => d.tags.some((t) => t.startsWith("recipes")));
  }
}
