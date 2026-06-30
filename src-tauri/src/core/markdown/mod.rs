//! Markdown helpers. For the index we only need a plaintext rendering of a
//! document's prose so full-text search matches words, not syntax.

use pulldown_cmark::{Event, Parser};

/// Extract searchable plaintext from Markdown: the visible text and code spans,
/// with breaks collapsed to spaces. Syntax markers are dropped.
pub fn to_plaintext(markdown: &str) -> String {
    let mut out = String::new();
    for event in Parser::new(markdown) {
        match event {
            Event::Text(t) | Event::Code(t) => {
                out.push_str(&t);
            }
            Event::SoftBreak | Event::HardBreak | Event::Rule => {
                out.push(' ');
            }
            Event::Start(_) | Event::End(_) => {
                // Separate block/inline boundaries so adjacent words don't merge.
                if !out.ends_with(' ') {
                    out.push(' ');
                }
            }
            _ => {}
        }
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// True for CJK characters that aren't separated by spaces in normal text and so
/// need per-character tokenization for full-text search.
pub fn is_cjk(c: char) -> bool {
    matches!(c as u32,
        0x3040..=0x30FF |   // Hiragana + Katakana
        0x3400..=0x4DBF |   // CJK Ext A
        0x4E00..=0x9FFF |   // CJK Unified Ideographs
        0xF900..=0xFAFF |   // CJK Compatibility Ideographs
        0xAC00..=0xD7AF |   // Hangul syllables
        0x20000..=0x2A6DF   // CJK Ext B
    )
}

/// Insert spaces around CJK characters so the unicode61 tokenizer indexes each
/// one as its own token. This makes substring/word search work for languages
/// without spaces (Chinese, Japanese, ...) while leaving Western text untouched.
pub fn segment_cjk(text: &str) -> String {
    let mut out = String::with_capacity(text.len() + 8);
    for c in text.chars() {
        if is_cjk(c) {
            out.push(' ');
            out.push(c);
            out.push(' ');
        } else {
            out.push(c);
        }
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Inverse of [`segment_cjk`] for display: drop a space when it sits between two
/// CJK characters (ignoring the U+0001/U+0002 highlight sentinels). Used to make
/// search-result snippets read naturally.
pub fn desegment_cjk(text: &str) -> String {
    let is_sentinel = |c: char| c == '\u{1}' || c == '\u{2}';
    let chars: Vec<char> = text.chars().collect();
    let mut out = String::with_capacity(text.len());
    for (i, &c) in chars.iter().enumerate() {
        if c == ' ' {
            let prev = chars[..i].iter().rev().copied().find(|&x| !is_sentinel(x));
            let next = chars[i + 1..].iter().copied().find(|&x| !is_sentinel(x));
            if let (Some(p), Some(n)) = (prev, next) {
                if is_cjk(p) && is_cjk(n) {
                    continue; // drop the inter-character space
                }
            }
        }
        out.push(c);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_syntax_keeps_words() {
        let md = "# Title\n\nSome **bold** and `code` with a [link](http://x).\n\n- item one\n- item two";
        let text = to_plaintext(md);
        assert!(text.contains("Title"));
        assert!(text.contains("bold"));
        assert!(text.contains("code"));
        assert!(text.contains("link"));
        assert!(text.contains("item one"));
        // no markdown punctuation leaks through
        assert!(!text.contains('#'));
        assert!(!text.contains('*'));
        assert!(!text.contains('`'));
    }
}
