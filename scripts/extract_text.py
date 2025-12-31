#!/usr/bin/env python3
import argparse
import os
import platform
import subprocess
import tempfile
import zipfile
import xml.etree.ElementTree as ET


WORD_NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
DRAWING_NS = {"a": "http://schemas.openxmlformats.org/drawingml/2006/main"}


def _run(cmd: list[str]) -> str:
    completed = subprocess.run(
        cmd,
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    return completed.stdout.decode("utf-8", errors="replace")


def extract_pdf(path: str) -> str:
    # Prefer pypdf (modern). Fall back to PyPDF2 if needed.
    reader = None
    try:
        from pypdf import PdfReader  # type: ignore

        reader = PdfReader(path)
    except Exception:
        try:
            from PyPDF2 import PdfReader  # type: ignore

            reader = PdfReader(path)
        except Exception as e:
            raise RuntimeError(
                "Unable to extract .pdf: missing Python PDF library (pypdf / PyPDF2)"
            ) from e

    pages_text: list[str] = []
    for page in reader.pages:
        try:
            text = page.extract_text() or ""
        except Exception:
            text = ""
        text = text.strip()
        if text:
            pages_text.append(text)

    return "\n\n".join(pages_text).strip()


def extract_docx(path: str) -> str:
    with zipfile.ZipFile(path) as zf:
        xml = zf.read("word/document.xml")

    root = ET.fromstring(xml)
    paragraphs: list[str] = []

    for p in root.findall(".//w:p", WORD_NS):
        parts: list[str] = []
        for node in p.iter():
            if node.tag == f"{{{WORD_NS['w']}}}t" and node.text:
                parts.append(node.text)
            elif node.tag == f"{{{WORD_NS['w']}}}tab":
                parts.append("\t")
            elif node.tag in (
                f"{{{WORD_NS['w']}}}br",
                f"{{{WORD_NS['w']}}}cr",
            ):
                parts.append("\n")
        paragraph_text = "".join(parts).strip()
        if paragraph_text:
            paragraphs.append(paragraph_text)

    return "\n".join(paragraphs).strip()


def extract_pptx(path: str) -> str:
    with zipfile.ZipFile(path) as zf:
        slide_names = [
            name
            for name in zf.namelist()
            if name.startswith("ppt/slides/slide") and name.endswith(".xml")
        ]

        def slide_index(name: str) -> int:
            # ppt/slides/slide12.xml -> 12
            base = os.path.basename(name)
            digits = "".join(ch for ch in base if ch.isdigit())
            return int(digits) if digits else 0

        slide_names.sort(key=slide_index)

        slide_texts: list[str] = []
        for slide_name in slide_names:
            xml = zf.read(slide_name)
            root = ET.fromstring(xml)
            texts = [t.text for t in root.findall(".//a:t", DRAWING_NS) if t.text]
            if texts:
                slide_texts.append("\n".join(texts).strip())

    return "\n\n".join(slide_texts).strip()


def extract_doc_via_system_tools(path: str) -> str:
    # Prefer macOS textutil when available.
    if platform.system() == "Darwin" and os.path.exists("/usr/bin/textutil"):
        return _run(["/usr/bin/textutil", "-convert", "txt", "-stdout", path]).strip()

    # Try antiword if present.
    if subprocess.call(["/usr/bin/env", "which", "antiword"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL) == 0:
        return _run(["antiword", path]).strip()

    # Try LibreOffice/soffice if present.
    soffice = None
    for candidate in ("soffice", "libreoffice"):
        if subprocess.call(
            ["/usr/bin/env", "which", candidate],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        ) == 0:
            soffice = candidate
            break

    if soffice:
        with tempfile.TemporaryDirectory() as td:
            _run([soffice, "--headless", "--convert-to", "txt:Text", "--outdir", td, path])
            outputs = [p for p in os.listdir(td) if p.lower().endswith(".txt")]
            if outputs:
                out_path = os.path.join(td, outputs[0])
                with open(out_path, "rb") as f:
                    return f.read().decode("utf-8", errors="replace").strip()

    raise RuntimeError(
        "Unable to extract .doc on this system. Convert to .docx, or install 'antiword' or LibreOffice."
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract plain text from documents.")
    parser.add_argument("--path", required=True)
    parser.add_argument("--mime", required=False, default="")
    args = parser.parse_args()

    path = args.path
    _, ext = os.path.splitext(path.lower())

    if ext == ".docx":
        print(extract_docx(path))
        return

    if ext == ".pdf":
        print(extract_pdf(path))
        return

    if ext == ".pptx":
        print(extract_pptx(path))
        return

    if ext == ".doc":
        print(extract_doc_via_system_tools(path))
        return

    raise SystemExit(f"Unsupported file extension for python extraction: {ext} (mime={args.mime})")


if __name__ == "__main__":
    main()
