//! Read-side queries over the index: document lists, the folder tree, and the
//! hierarchical tag tree.

use std::collections::{BTreeMap, BTreeSet, HashMap};

use rusqlite::{params, Connection};

use crate::core::model::{DocumentMeta, SearchHit, TagNode, TreeNode, VaultInfo};
use crate::core::tags::ancestor_paths;
use crate::core::vault::split_parent;
use crate::error::AppResult;

/// Sentinels wrapping matched terms in snippets (kept out of normal text).
const HL_START: &str = "\u{0001}";
const HL_END: &str = "\u{0002}";

/// Turn free-text input into a safe FTS5 query. ASCII runs become quoted prefix
/// terms; CJK runs become character phrases (matching the per-character tokens
/// produced by `segment_cjk`). Quoting avoids FTS5 syntax errors on any input.
fn fts_query(input: &str) -> String {
    use crate::core::markdown::is_cjk;
    let mut parts: Vec<String> = Vec::new();
    let mut ascii = String::new();
    let mut cjk: Vec<char> = Vec::new();

    fn flush_ascii(parts: &mut Vec<String>, ascii: &mut String) {
        if !ascii.is_empty() {
            parts.push(format!("\"{}\"*", ascii.replace('"', "\"\"")));
            ascii.clear();
        }
    }
    fn flush_cjk(parts: &mut Vec<String>, cjk: &mut Vec<char>) {
        if !cjk.is_empty() {
            let phrase = cjk.iter().map(|c| c.to_string()).collect::<Vec<_>>().join(" ");
            parts.push(format!("\"{phrase}\""));
            cjk.clear();
        }
    }

    for c in input.chars() {
        if is_cjk(c) {
            flush_ascii(&mut parts, &mut ascii);
            cjk.push(c);
        } else if c.is_alphanumeric() {
            flush_cjk(&mut parts, &mut cjk);
            ascii.push(c);
        } else {
            flush_ascii(&mut parts, &mut ascii);
            flush_cjk(&mut parts, &mut cjk);
        }
    }
    flush_ascii(&mut parts, &mut ascii);
    flush_cjk(&mut parts, &mut cjk);
    parts.join(" ")
}

/// Full-text search over note bodies, ranked by bm25, optionally restricted to a
/// tag subtree. Returns snippets with matches wrapped in HL sentinels.
pub fn search(
    conn: &Connection,
    text: &str,
    tag: Option<&str>,
    limit: Option<i64>,
) -> AppResult<Vec<SearchHit>> {
    let match_q = fts_query(text);
    if match_q.is_empty() {
        return Ok(Vec::new());
    }
    let limit = limit.unwrap_or(50).clamp(1, 200);
    let snippet = format!("snippet(documents_fts, 1, '{HL_START}', '{HL_END}', '…', 12)");

    let map = |r: &rusqlite::Row| {
        let rel: String = r.get(0)?;
        Ok(SearchHit {
            id: rel.clone(),
            rel_path: rel,
            title: r.get(1)?,
            snippet: crate::core::markdown::desegment_cjk(&r.get::<_, String>(2)?),
            score: r.get(3)?,
        })
    };

    let hits = if let Some(tag) = tag {
        let sql = format!(
            "SELECT d.rel_path, d.title, {snippet}, bm25(documents_fts)
             FROM documents_fts
             JOIN documents d ON d.id = documents_fts.rowid
             JOIN document_tags dt ON dt.document_id = d.id
             JOIN tags t ON t.id = dt.tag_id
             WHERE documents_fts MATCH ?1 AND (t.path = ?2 OR t.path LIKE ?3)
             GROUP BY d.id
             ORDER BY bm25(documents_fts)
             LIMIT ?4"
        );
        let like = format!("{tag}/%");
        let mut stmt = conn.prepare(&sql)?;
        let rows: Vec<SearchHit> = stmt
            .query_map(params![match_q, tag, like, limit], map)?
            .collect::<Result<_, _>>()?;
        rows
    } else {
        let sql = format!(
            "SELECT d.rel_path, d.title, {snippet}, bm25(documents_fts)
             FROM documents_fts
             JOIN documents d ON d.id = documents_fts.rowid
             WHERE documents_fts MATCH ?1
             ORDER BY bm25(documents_fts)
             LIMIT ?2"
        );
        let mut stmt = conn.prepare(&sql)?;
        let rows: Vec<SearchHit> = stmt
            .query_map(params![match_q, limit], map)?
            .collect::<Result<_, _>>()?;
        rows
    };
    Ok(hits)
}

pub fn vault_info(conn: &Connection, root: &str) -> AppResult<VaultInfo> {
    let count = |sql: &str| -> AppResult<i64> {
        Ok(conn.query_row(sql, [], |r| r.get(0))?)
    };
    Ok(VaultInfo {
        root: root.to_string(),
        doc_count: count("SELECT COUNT(*) FROM documents")?,
        folder_count: count("SELECT COUNT(*) FROM folders")?,
        tag_count: count("SELECT COUNT(*) FROM tags")?,
    })
}

/// Leaf tag paths attached to a document, sorted.
fn doc_tags(conn: &Connection, doc_id: i64) -> AppResult<Vec<String>> {
    let mut stmt = conn.prepare(
        "SELECT t.path FROM tags t
         JOIN document_tags dt ON dt.tag_id = t.id
         WHERE dt.document_id = ?1 ORDER BY t.path",
    )?;
    let rows = stmt.query_map(params![doc_id], |r| r.get::<_, String>(0))?;
    Ok(rows.collect::<Result<_, _>>()?)
}

fn row_to_meta(conn: &Connection, id: i64, rel: String, folder: String, title: String,
               mtime: i64, size: i64) -> AppResult<DocumentMeta> {
    Ok(DocumentMeta {
        tags: doc_tags(conn, id)?,
        id: rel.clone(),
        rel_path: rel,
        folder,
        title,
        mtime,
        size,
    })
}

pub fn document_meta(conn: &Connection, rel: &str) -> AppResult<DocumentMeta> {
    let (id, folder, title, mtime, size) = conn.query_row(
        "SELECT id, folder, title, mtime, size FROM documents WHERE rel_path = ?1",
        params![rel],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
    )?;
    row_to_meta(conn, id, rel.to_string(), folder, title, mtime, size)
}

pub fn list_documents(conn: &Connection) -> AppResult<Vec<DocumentMeta>> {
    let rows = collect_docs(conn, "SELECT id, rel_path, folder, title, mtime, size FROM documents
         ORDER BY folder, title", params![])?;
    Ok(rows)
}

/// Documents tagged at `tag_path` or any descendant (e.g. tag "a" returns docs
/// tagged "a", "a/b", "a/b/c", ...).
pub fn documents_by_tag(conn: &Connection, tag_path: &str) -> AppResult<Vec<DocumentMeta>> {
    let like = format!("{tag_path}/%");
    collect_docs(
        conn,
        "SELECT DISTINCT d.id, d.rel_path, d.folder, d.title, d.mtime, d.size
         FROM documents d
         JOIN document_tags dt ON dt.document_id = d.id
         JOIN tags t ON t.id = dt.tag_id
         WHERE t.path = ?1 OR t.path LIKE ?2
         ORDER BY d.folder, d.title",
        params![tag_path, like],
    )
}

fn collect_docs(
    conn: &Connection,
    sql: &str,
    p: impl rusqlite::Params,
) -> AppResult<Vec<DocumentMeta>> {
    let mut stmt = conn.prepare(sql)?;
    let rows = stmt
        .query_map(p, |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
                r.get::<_, i64>(4)?,
                r.get::<_, i64>(5)?,
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    rows.into_iter()
        .map(|(id, rel, folder, title, mtime, size)| {
            row_to_meta(conn, id, rel, folder, title, mtime, size)
        })
        .collect()
}

/// Build the folder/document tree rooted at the vault root.
pub fn build_tree(conn: &Connection) -> AppResult<Vec<TreeNode>> {
    // folders grouped by parent
    let mut folder_children: HashMap<String, Vec<(String, String)>> = HashMap::new();
    {
        let mut stmt = conn.prepare("SELECT rel_path, parent, name FROM folders")?;
        let rows = stmt.query_map([], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?))
        })?;
        for row in rows {
            let (rel, parent, name) = row?;
            folder_children.entry(parent).or_default().push((rel, name));
        }
    }
    // docs grouped by folder
    let mut doc_children: HashMap<String, Vec<(String, String)>> = HashMap::new();
    {
        let mut stmt = conn.prepare("SELECT rel_path, folder, title FROM documents")?;
        let rows = stmt.query_map([], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?))
        })?;
        for row in rows {
            let (rel, folder, title) = row?;
            doc_children.entry(folder).or_default().push((rel, title));
        }
    }
    Ok(assemble_tree("", &folder_children, &doc_children))
}

fn assemble_tree(
    parent: &str,
    folders: &HashMap<String, Vec<(String, String)>>,
    docs: &HashMap<String, Vec<(String, String)>>,
) -> Vec<TreeNode> {
    let mut out = Vec::new();
    if let Some(children) = folders.get(parent) {
        let mut children = children.clone();
        children.sort_by(|a, b| a.1.to_lowercase().cmp(&b.1.to_lowercase()));
        for (rel, name) in children {
            out.push(TreeNode {
                id: rel.clone(),
                kind: "folder".into(),
                name,
                children: assemble_tree(&rel, folders, docs),
                rel_path: rel,
            });
        }
    }
    if let Some(children) = docs.get(parent) {
        let mut children = children.clone();
        children.sort_by(|a, b| a.1.to_lowercase().cmp(&b.1.to_lowercase()));
        for (rel, title) in children {
            out.push(TreeNode {
                id: rel.clone(),
                kind: "doc".into(),
                name: title,
                rel_path: rel,
                children: Vec::new(),
            });
        }
    }
    out
}

/// Build the hierarchical tag tree. A document tagged `a/b/c` counts toward
/// nodes `a`, `a/b`, and `a/b/c`.
pub fn build_tag_tree(conn: &Connection) -> AppResult<Vec<TagNode>> {
    let mut stmt = conn.prepare(
        "SELECT t.path, dt.document_id FROM tags t
         JOIN document_tags dt ON dt.tag_id = t.id",
    )?;
    let rows = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))?;

    let mut node_docs: BTreeMap<String, BTreeSet<i64>> = BTreeMap::new();
    for row in rows {
        let (path, doc) = row?;
        for anc in ancestor_paths(&path) {
            node_docs.entry(anc).or_default().insert(doc);
        }
    }

    // group node paths by their parent path
    let mut children_by_parent: BTreeMap<String, Vec<String>> = BTreeMap::new();
    for path in node_docs.keys() {
        let (parent, _) = split_parent(path);
        children_by_parent.entry(parent).or_default().push(path.clone());
    }
    Ok(assemble_tags("", &children_by_parent, &node_docs))
}

fn assemble_tags(
    parent: &str,
    children_by_parent: &BTreeMap<String, Vec<String>>,
    node_docs: &BTreeMap<String, BTreeSet<i64>>,
) -> Vec<TagNode> {
    let mut out = Vec::new();
    if let Some(children) = children_by_parent.get(parent) {
        for path in children {
            let name = split_parent(path).1;
            out.push(TagNode {
                name,
                count: node_docs.get(path).map(|s| s.len() as i64).unwrap_or(0),
                children: assemble_tags(path, children_by_parent, node_docs),
                path: path.clone(),
            });
        }
    }
    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::index::{db, scan};
    use crate::core::vault::Vault;

    #[test]
    fn indexes_docs_folders_and_tag_hierarchy() {
        let dir = std::env::temp_dir().join("octothorpe_index_test");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("notes")).unwrap();
        std::fs::write(
            dir.join("notes/a.md"),
            "# Alpha\n\nbody #recipes/italian and #work",
        )
        .unwrap();
        std::fs::write(dir.join("notes/b.md"), "# Beta\n\n#recipes/thai").unwrap();

        let vault = Vault::new(dir.clone());
        let mut conn = db::open_in_memory().unwrap();
        scan::rescan(&mut conn, &vault).unwrap();

        let info = vault_info(&conn, "root").unwrap();
        assert_eq!(info.doc_count, 2);
        assert_eq!(info.folder_count, 1);

        // tag tree: recipes (2 docs) -> {italian (1), thai (1)}, work (1)
        let tags = build_tag_tree(&conn).unwrap();
        let recipes = tags.iter().find(|t| t.path == "recipes").unwrap();
        assert_eq!(recipes.count, 2);
        assert_eq!(recipes.children.len(), 2);

        // documents_by_tag is subtree-aware
        assert_eq!(documents_by_tag(&conn, "recipes").unwrap().len(), 2);
        assert_eq!(documents_by_tag(&conn, "recipes/italian").unwrap().len(), 1);

        // a document carries only its as-written (leaf) tags
        let meta = document_meta(&conn, "notes/a.md").unwrap();
        assert_eq!(meta.title, "Alpha");
        assert_eq!(meta.tags, vec!["recipes/italian", "work"]);

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn full_text_search_matches_prose_with_snippets() {
        let dir = std::env::temp_dir().join("octothorpe_search_test");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("a.md"), "# Risotto\n\nCreamy **risotto** with saffron.").unwrap();
        std::fs::write(dir.join("b.md"), "# Salad\n\nGreen salad, no rice here.").unwrap();

        let vault = Vault::new(dir.clone());
        let mut conn = db::open_in_memory().unwrap();
        scan::rescan(&mut conn, &vault).unwrap();

        // Matches body prose (syntax stripped), not markdown punctuation.
        let hits = search(&conn, "risotto", None, None).unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].rel_path, "a.md");
        assert!(hits[0].snippet.contains('\u{0001}')); // highlighted

        // Prefix matching.
        assert_eq!(search(&conn, "saff", None, None).unwrap().len(), 1);
        // No match.
        assert_eq!(search(&conn, "pizza", None, None).unwrap().len(), 0);
        // Empty query -> no results, no error.
        assert_eq!(search(&conn, "   ", None, None).unwrap().len(), 0);

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn full_text_search_chinese() {
        let dir = std::env::temp_dir().join("octothorpe_cjk_test");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("a.md"), "# 笔记\n\n这是一个关于中文搜索的测试。").unwrap();
        std::fs::write(dir.join("b.md"), "# 美食\n\n红烧肉是经典中国菜。").unwrap();

        let vault = Vault::new(dir.clone());
        let mut conn = db::open_in_memory().unwrap();
        scan::rescan(&mut conn, &vault).unwrap();

        // multi-character phrase
        let hits = search(&conn, "中文搜索", None, None).unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].rel_path, "a.md");
        // two-character word inside a longer run
        assert_eq!(search(&conn, "搜索", None, None).unwrap().len(), 1);
        // a different note
        assert_eq!(search(&conn, "红烧肉", None, None).unwrap().len(), 1);
        // snippet reads naturally (no inter-character spaces)
        assert!(search(&conn, "搜索", None, None).unwrap()[0].snippet.contains("搜索"));

        std::fs::remove_dir_all(&dir).ok();
    }
}
