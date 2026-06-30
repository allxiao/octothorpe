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
