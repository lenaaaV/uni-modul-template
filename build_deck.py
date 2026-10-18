import hashlib
import re
from pathlib import Path
import genanki
import markdown
import yaml

OUTPUT_DIR = Path("docs/downloads")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

ANKI_CSS = """
.card {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 18px;
    line-height: 1.6;
    text-align: left;
    color: #1e293b;
    background-color: #f8fafc;
    padding: 24px;
}
.card-box {
    background: #ffffff;
    border-radius: 12px;
    padding: 22px;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.06);
    border-top: 4px solid #2563eb;
    max-width: 680px;
    margin: 0 auto;
}
.meta-header {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #64748b;
    font-weight: 700;
    margin-bottom: 10px;
}
.module-name { color: #2563eb; }
.question { font-weight: 600; font-size: 20px; }
hr#answer { border: none; border-top: 1px solid #e2e8f0; margin: 18px 0; }

/* Img in Anki */
.card img {
    max-width: 100%;
    height: auto;
    border-radius: 8px;
    display: block;
    margin: 12px auto;
}

/* Lückentext-Hervorhebung in Anki */
.cloze {
    font-weight: 700;
    color: #2563eb;
    background-color: rgba(37, 99, 235, 0.12);
    padding: 2px 6px;
    border-radius: 4px;
}

.nightMode.card { background-color: #0f172a; color: #f1f5f9; }
.nightMode .card-box { background: #1e293b; border-top-color: #60a5fa; box-shadow: none; }
.nightMode .module-name { color: #60a5fa; }
.nightMode .cloze { color: #60a5fa; background-color: rgba(96, 165, 250, 0.15); }
.nightMode hr#answer { border-top-color: #334155; }
"""

# Model for classic question-answer cards
QA_MODEL = genanki.Model(
    1938475610,
    "Classic Q&A Model",
    fields=[
        {"name": "Module"},
        {"name": "Chapter"},
        {"name": "Question"},
        {"name": "Answer"},
    ],
    templates=[
        {
            "name": "Standard Card",
            "qfmt": """
            <div class="card-box">
                <div class="meta-header">
                    <span class="module-name">{{Module}}</span>
                    <span>{{Chapter}}</span>
                </div>
                <div class="question">{{Question}}</div>
            </div>
            """,
            "afmt": """
            <div class="card-box">
                <div class="meta-header">
                    <span class="module-name">{{Module}}</span>
                    <span>{{Chapter}}</span>
                </div>
                <div class="question">{{Question}}</div>
                <hr id="answer">
                <div class="answer">{{Answer}}</div>
            </div>
            """,
        }
    ],
    css=ANKI_CSS,
)

# Model for Cloze cards
CLOZE_MODEL = genanki.Model(
    1938475611,
    "Cloze Model",
    fields=[
        {"name": "Module"},
        {"name": "Chapter"},
        {"name": "Title"},
        {"name": "Text"},
    ],
    templates=[
        {
            "name": "Cloze Card",
            "qfmt": """
            <div class="card-box">
                <div class="meta-header">
                    <span class="module-name">{{Module}}</span>
                    <span>{{Chapter}}</span>
                </div>
                <div class="question">{{Title}}</div>
                <hr id="answer">
                <div class="answer">{{cloze:Text}}</div>
            </div>
            """,
            "afmt": """
            <div class="card-box">
                <div class="meta-header">
                    <span class="module-name">{{Module}}</span>
                    <span>{{Chapter}}</span>
                </div>
                <div class="question">{{Title}}</div>
                <hr id="answer">
                <div class="answer">{{cloze:Text}}</div>
            </div>
            """,
        }
    ],
    css=ANKI_CSS,
)

def get_module_name():
    """Extract the module name from mkdocs.yml"""
    with open("mkdocs.yml", "r", encoding="utf-8") as f:
        config = yaml.safe_load(f)
    return config.get("site_name", "Module")

def get_chapter_title(filepath: Path, content: str) -> str:
    """Extract the chapter title from the markdown content or use the filename."""
    match = re.search(r"^#\s+(.+)$", content, re.MULTILINE)
    if match:
        return match.group(1).strip()
    return filepath.stem.replace("-", " ").title()

def convert_latex_for_anki(text: str) -> str:
    """Convert LaTeX math expressions to a format suitable for Anki."""
    text = re.sub(r"\$\$(.+?)\$\$", r"\\[\1\\]", text, flags=re.DOTALL)
    text = re.sub(r"\$(.+?)\$", r"\\(\1\\)", text)
    return text 

def convert_cloze_syntax(text: str) -> tuple[str, bool]:
    """Convert ==cloze== syntax to Anki's {{c1::cloze}} format."""
    has_native_cloze = bool(re.search(r"\{\{c\d+::.+?\}\}", text))
    counter = 0
    
    def replacer(match):
        nonlocal counter
        counter += 1
        inner = match.group(1).strip()
        if "|" in inner:
            ans, hint = inner.split("|", 1)
            return f"{{{{c{counter}::{ans.strip()}::{hint.strip()}}}}}"
        return f"{{{{c{counter}::{inner}}}}}"
    
    converted = re.sub(r"==([^=\n]+)==", replacer, text)
    is_cloze = has_native_cloze or (counter > 0)
    return converted, is_cloze

def process_images(html_text: str, md_file_dir: Path, media_files: set) -> str:
    """
    Process <img> tags in the HTML text, replacing their src attributes with the correct filenames
    and adding the image files to the media_files set for Anki.
    """
    def img_replacer(match):
        prefix, src, suffix = match.group(1), match.group(2), match.group(3)
        # ignore external URLs and data URIs
        if src.startswith(("http://", "https://", "data:")):
            return match.group(0)

        # resolve the image path relative to the markdown file directory and the docs directory
        clean_src = src.split("?")[0].split("#")[0]
        candidate_paths = [
            (md_file_dir / clean_src).resolve(),
            (Path("docs") / clean_src.lstrip("/")).resolve(),
        ]

        for img_path in candidate_paths:
            if img_path.exists() and img_path.is_file():
                media_files.add(str(img_path))
                return f'{prefix}{img_path.name}{suffix}'

        print(f"[!] Warning: Image not found: {src}")
        return match.group(0)

    return re.sub(r'(<img\s+[^>]*src=["\'])([^"\']+)(["\'][^>]*>)', img_replacer, html_text)

def md_to_html(md_text: str, md_file_dir: Path, media_files: set) -> str:
    """Convert markdown text to HTML, process LaTeX and images, and return the HTML string."""
    html = markdown.markdown(
        convert_latex_for_anki(md_text), extensions=["fenced_code", "tables"]
    )
    return process_images(html, md_file_dir, media_files)

def extract_cards(content: str):
    """
    Extract question and tip cards from the markdown content.
    """
    pattern = re.compile(
        r'^\?\?\?\+?\s+(?:question|tip)\s+"([^"]+)"\s*\n((?:^(?:    |\t).*$\n?|\s*\n)*)',
        re.MULTILINE,
    )
    cards = []
    for match in pattern.finditer(content):
        title = match.group(1).strip()
        raw_body = match.group(2)
        body_lines = [re.sub(r"^(?:    |\t)", "", line) for line in raw_body.splitlines()]
        body = "\n".join(body_lines).strip()
        if title and body:
            cards.append((title, body))
    return cards

def stable_id(name: str) -> int:
    return int(hashlib.sha256(name.encode("utf-8")).hexdigest()[:8], 16)

def main():
    module_name = get_module_name()
    docs_dir = Path("docs")
    all_decks = []
    media_files = set()
    total_qa = 0
    total_cloze = 0

    for md_file in sorted(docs_dir.rglob("*.md")):
        if md_file.name == "index.md":
            continue

        content = md_file.read_text(encoding="utf-8")
        cards = extract_cards(content)
        if not cards:
            continue

        chapter_title = get_chapter_title(md_file, content)
        full_deck_name = f"{module_name}::{chapter_title}"
        deck = genanki.Deck(stable_id(full_deck_name), full_deck_name)

        for title_md, body_md in cards:
            body_processed, is_cloze = convert_cloze_syntax(body_md)

            title_html = md_to_html(title_md, md_file.parent, media_files)
            body_html = md_to_html(body_processed, md_file.parent, media_files)

            if is_cloze:
                note = genanki.Note(
                    model=CLOZE_MODEL,
                    fields=[module_name, chapter_title, title_html, body_html],
                    guid=genanki.guid_for(module_name, "cloze", title_md, body_md),
                )
                total_cloze += 1
            else:
                note = genanki.Note(
                    model=QA_MODEL,
                    fields=[module_name, chapter_title, title_html, body_html],
                    guid=genanki.guid_for(module_name, "qa", title_md),
                )
                total_qa += 1

            deck.add_note(note)

        all_decks.append(deck)

    if all_decks:
        out_file = OUTPUT_DIR / "cards.apkg"
        package = genanki.Package(all_decks)
        package.media_files = list(media_files)
        package.write_to_file(out_file)
        print(
            f"[✓] {out_file} erstellt: {total_qa} Standard-Karten, "
            f"{total_cloze} Lückentext-Karten, {len(media_files)} Bilder eingebettet."
        )


if __name__ == "__main__":
    main()