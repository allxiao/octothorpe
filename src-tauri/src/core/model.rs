//! Serde DTOs shared between the IPC commands and the index queries.

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultInfo {
    pub root: String,
    pub doc_count: i64,
    pub folder_count: i64,
    pub tag_count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentMeta {
    /// Stable id = vault-relative path (POSIX separators).
    pub id: String,
    pub rel_path: String,
    pub title: String,
    /// Parent folder rel_path ("" = vault root).
    pub folder: String,
    pub tags: Vec<String>,
    pub mtime: i64,
    pub size: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentContent {
    pub rel_path: String,
    pub content: String,
}

/// Result of opening an arbitrary path: `rel_path` is set when the file lives
/// inside the open vault (so it can be treated as a normal vault doc); `None`
/// means it is edited standalone (outside the vault).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenedDoc {
    pub rel_path: Option<String>,
    pub content: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TreeNode {
    pub id: String,
    /// "folder" or "doc".
    pub kind: String,
    pub name: String,
    pub rel_path: String,
    pub children: Vec<TreeNode>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TagNode {
    /// Last path segment (display label).
    pub name: String,
    /// Full tag path, e.g. "recipes/italian".
    pub path: String,
    /// Distinct documents tagged at this path or any descendant.
    pub count: i64,
    pub children: Vec<TagNode>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub id: String,
    pub rel_path: String,
    pub title: String,
    /// Body excerpt with matches wrapped in U+0001/U+0002 sentinels.
    pub snippet: String,
    /// bm25 relevance (lower is a better match).
    pub score: f64,
}
