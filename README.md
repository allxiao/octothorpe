# typedown

A fast, local-first Markdown editor that renders **while you type** (Typora-style),
with Bear-style inline tags, full-text search, and a vault-based document manager.

Built with **Tauri 2** (Rust core) + **CodeMirror 6** + **Svelte**. Your notes are
plain `.md` files on disk; a per-vault SQLite index (in `<vault>/.typedown/`) powers
the tree, tags, and search and is rebuildable at any time.

## Features

- **Live preview editing** — Markdown renders inline; put the cursor in an element
  (bold, italic, link, image, …) to reveal its raw source, element by element.
  Best-effort rendering never errors on half-typed Markdown.
- **Bear-style tags** — write `#tag`, `#tag with space#`, or `#nested/tags` anywhere
  in a note; they're collected into a hierarchical tag tree and render as pills.
- **VS Code-style shell** — menu bar, activity bar (Explorer / Search / Tags /
  Outline), resizable sidebar sections, and a status bar.
- **Full-text search** — ranked (bm25) search over note contents with highlighted
  snippets, including CJK (Chinese/Japanese/Korean).
- **External sync** — edits made outside the app (other editors, `git pull`, sync
  clients) update the tree, tags, and search live.

## Development

Prerequisites: a recent Node.js + [pnpm](https://pnpm.io), the Rust toolchain, and
the [Tauri 2 system prerequisites](https://v2.tauri.app/start/prerequisites/) for
your OS.

```bash
pnpm install
pnpm tauri dev      # run the desktop app with hot reload
```

Useful checks:

```bash
pnpm check                       # type-check the frontend (svelte-check)
cargo test --manifest-path src-tauri/Cargo.toml   # Rust unit tests
```

## Building installers

```bash
pnpm tauri build
```

Artifacts are written to `src-tauri/target/release/bundle/`:

- **Windows** — NSIS (`*-setup.exe`) and MSI
- **macOS** — `.app` and `.dmg`
- **Linux** — `.deb` and `.AppImage`

Each OS can only build its own installers locally. The GitHub Actions workflow in
`.github/workflows/release.yml` builds all platforms on a tag push (`vX.Y.Z`) and
creates a draft GitHub release with the installers attached.

> Installers are currently unsigned, so first-run may show a SmartScreen
> (Windows) or Gatekeeper (macOS) warning. Code-signing certificates and
> macOS notarization can be wired into the release workflow when available.
