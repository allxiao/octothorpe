//! Vault = a root directory whose `.md` files are the source of truth. Document
//! and folder ids are vault-relative paths using POSIX separators, so they are
//! stable and debuggable across platforms.

use std::path::{Component, Path, PathBuf};

pub struct Vault {
    pub root: PathBuf,
}

impl Vault {
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }

    /// Absolute path for a vault-relative id.
    pub fn abs_path(&self, rel: &str) -> PathBuf {
        let mut p = self.root.clone();
        for seg in rel.split('/') {
            if !seg.is_empty() {
                p.push(seg);
            }
        }
        p
    }

    /// Vault-relative id for an absolute path inside the vault, or None.
    pub fn rel_path(&self, abs: &Path) -> Option<String> {
        let stripped = abs.strip_prefix(&self.root).ok()?;
        Some(
            stripped
                .components()
                .filter_map(|c| match c {
                    Component::Normal(s) => s.to_str().map(str::to_string),
                    _ => None,
                })
                .collect::<Vec<_>>()
                .join("/"),
        )
    }
}

/// Split a rel_path into (parent folder, last segment).
pub fn split_parent(rel: &str) -> (String, String) {
    match rel.rfind('/') {
        Some(i) => (rel[..i].to_string(), rel[i + 1..].to_string()),
        None => (String::new(), rel.to_string()),
    }
}

/// Document title: first ATX `# ` heading, else the provided fallback (filename).
pub fn extract_title(content: &str, fallback: &str) -> String {
    for line in content.lines() {
        if let Some(rest) = line.trim_start().strip_prefix("# ") {
            let title = rest.trim();
            if !title.is_empty() {
                return title.to_string();
            }
        }
    }
    fallback.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn title_prefers_h1_then_filename() {
        assert_eq!(extract_title("# Hello\n\nbody", "note"), "Hello");
        assert_eq!(extract_title("no heading here", "note"), "note");
        // `#tag` is not a heading (no space) and must not be taken as a title.
        assert_eq!(extract_title("#tag only", "note"), "note");
    }

    #[test]
    fn split_parent_works() {
        assert_eq!(split_parent("a/b/c.md"), ("a/b".into(), "c.md".into()));
        assert_eq!(split_parent("c.md"), ("".into(), "c.md".into()));
    }
}
