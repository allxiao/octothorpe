// DTOs mirroring the Rust serde structs in src-tauri/src/core/model.rs.

export interface VaultInfo {
  root: string;
  docCount: number;
  folderCount: number;
  tagCount: number;
}

export interface DocumentMeta {
  id: string;
  relPath: string;
  title: string;
  folder: string;
  tags: string[];
  mtime: number;
  size: number;
}

export interface DocumentContent {
  relPath: string;
  content: string;
}

export interface TreeNode {
  id: string;
  kind: "folder" | "doc";
  name: string;
  relPath: string;
  children: TreeNode[];
}

export interface TagNode {
  name: string;
  path: string;
  count: number;
  children: TagNode[];
}

export interface SearchHit {
  id: string;
  relPath: string;
  title: string;
  /** Body excerpt with matches wrapped in U+0001/U+0002 sentinels. */
  snippet: string;
  score: number;
}
