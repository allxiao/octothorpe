//! Bear-style inline tag extraction.
//!
//! Tags live in the note body (not frontmatter). Supported forms, mirroring
//! Bear (<https://bear.app/faq/how-to-use-tags-in-bear/>):
//! - Bare:    `#tag`, `#this_is_a_tag`, `#my-tag`
//! - Nested:  `#recipes/italian`, `#journal/2024/01#`
//! - Wrapped (allows spaces): `#vacation plans#`, `#school projects/biology 101#`
//! - Escaped: `\#not-a-tag`
//!
//! A `#` is only a tag start when it is at a boundary (start of text or preceded
//! by a non-word, non-escape character) and is followed by a non-space, non-`#`
//! character. `# heading` (space after `#`) is a heading, not a tag. Tags do not
//! span line breaks. Bare purely-numeric names (e.g. `#123`) are ignored.

/// Characters allowed in a bare tag name (besides Unicode letters/digits).
fn is_tag_char(c: char) -> bool {
    c.is_alphanumeric() || c == '_' || c == '-' || c == '/'
}

/// Extract the unique tag paths from note text, in first-seen order.
/// Each path uses `/` to separate hierarchy levels (e.g. `recipes/italian`).
pub fn extract_tags(text: &str) -> Vec<String> {
    let chars: Vec<char> = text.chars().collect();
    let n = chars.len();
    let mut tags: Vec<String> = Vec::new();
    let mut i = 0;

    while i < n {
        if chars[i] != '#' {
            i += 1;
            continue;
        }
        // Boundary / escape check on the preceding character.
        if i > 0 {
            let prev = chars[i - 1];
            if prev == '\\' || prev == '#' || is_tag_char(prev) {
                i += 1;
                continue;
            }
        }
        // The character after '#' must start a tag.
        if i + 1 >= n || chars[i + 1] == '#' || chars[i + 1].is_whitespace() {
            i += 1;
            continue;
        }

        // Tags never cross a line break.
        let mut line_end = i + 1;
        while line_end < n && chars[line_end] != '\n' {
            line_end += 1;
        }

        // Wrapped form: a closing '#' on the same line whose content has spaces.
        let close = (i + 1..line_end).find(|&k| chars[k] == '#');
        let mut name: Option<String> = None;
        let mut wrapped = false;
        let mut next_i = i + 1;

        if let Some(c) = close {
            let content: String = chars[i + 1..c].iter().collect();
            if content.contains(' ')
                && !content.starts_with(char::is_whitespace)
                && !content.ends_with(char::is_whitespace)
            {
                name = Some(content);
                wrapped = true;
                next_i = c + 1; // consume the closing '#'
            }
        }

        if name.is_none() {
            // Bare form: longest run of tag characters.
            let mut j = i + 1;
            while j < line_end && is_tag_char(chars[j]) {
                j += 1;
            }
            if j > i + 1 {
                name = Some(chars[i + 1..j].iter().collect());
                // Consume an optional trailing '#' (e.g. `#a/b/c#`).
                next_i = if j < line_end && chars[j] == '#' { j + 1 } else { j };
            }
        }

        match name.and_then(|raw| normalize_tag(&raw, wrapped)) {
            Some(tag) => {
                if !tags.iter().any(|t| t.eq_ignore_ascii_case(&tag)) {
                    tags.push(tag);
                }
                i = next_i;
            }
            None => i += 1,
        }
    }

    tags
}

/// Clean and validate a raw tag name. Returns None for invalid tags.
fn normalize_tag(raw: &str, wrapped: bool) -> Option<String> {
    let trimmed = raw.trim().trim_matches('/');
    if trimmed.is_empty() {
        return None;
    }
    // Must contain at least one alphanumeric character.
    if !trimmed.chars().any(|c| c.is_alphanumeric()) {
        return None;
    }
    // Bear ignores bare purely-numeric tags like `#123`.
    if !wrapped && trimmed.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    // Collapse runs of whitespace (wrapped tags only contain meaningful spaces).
    let normalized = trimmed.split_whitespace().collect::<Vec<_>>().join(" ");
    Some(normalized)
}

/// Expand a tag path into itself plus all ancestor paths.
/// `a/b/c` -> [`a`, `a/b`, `a/b/c`]. Empty segments are dropped.
pub fn ancestor_paths(tag: &str) -> Vec<String> {
    let segments: Vec<&str> = tag.split('/').filter(|s| !s.is_empty()).collect();
    let mut out = Vec::with_capacity(segments.len());
    let mut acc = String::new();
    for seg in segments {
        if !acc.is_empty() {
            acc.push('/');
        }
        acc.push_str(seg);
        out.push(acc.clone());
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tags(s: &str) -> Vec<String> {
        extract_tags(s)
    }

    #[test]
    fn bare_tags() {
        assert_eq!(tags("#tag"), vec!["tag"]);
        assert_eq!(tags("#this_is_a_tag"), vec!["this_is_a_tag"]);
        assert_eq!(tags("#my-tag"), vec!["my-tag"]);
        assert_eq!(tags("a #tag in text"), vec!["tag"]);
    }

    #[test]
    fn wrapped_multiword_tags() {
        assert_eq!(tags("#vacation plans#"), vec!["vacation plans"]);
        assert_eq!(
            tags("#school projects/biology 101#"),
            vec!["school projects/biology 101"]
        );
    }

    #[test]
    fn nested_tags() {
        assert_eq!(tags("#recipes/italian"), vec!["recipes/italian"]);
        assert_eq!(tags("#journal/2024/01#"), vec!["journal/2024/01"]);
    }

    #[test]
    fn escaped_and_headings_are_not_tags() {
        assert_eq!(tags("\\#this_is_not_a_tag"), Vec::<String>::new());
        assert_eq!(tags("# heading"), Vec::<String>::new());
        assert_eq!(tags("## H2 heading"), Vec::<String>::new());
        assert_eq!(tags("C# is a language"), Vec::<String>::new());
    }

    #[test]
    fn terminators_and_boundaries() {
        assert_eq!(tags("#tag, and #more."), vec!["tag", "more"]);
        assert_eq!(tags("(#tag)"), vec!["tag"]);
        assert_eq!(tags("#tag#extra"), vec!["tag"]);
        assert_eq!(tags("see http://x.com#frag"), Vec::<String>::new());
    }

    #[test]
    fn numeric_bare_tags_ignored() {
        assert_eq!(tags("#123"), Vec::<String>::new());
        assert_eq!(tags("#v2 release"), vec!["v2"]);
    }

    #[test]
    fn multiline_and_dedup() {
        assert_eq!(tags("#one\n#two\n#one"), vec!["one", "two"]);
        assert_eq!(tags("#Tag and #tag"), vec!["Tag"]); // case-insensitive dedup
    }

    #[test]
    fn ancestors() {
        assert_eq!(ancestor_paths("a/b/c"), vec!["a", "a/b", "a/b/c"]);
        assert_eq!(ancestor_paths("single"), vec!["single"]);
        assert_eq!(ancestor_paths("a//b"), vec!["a", "a/b"]);
    }
}
