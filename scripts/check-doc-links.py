#!/usr/bin/env python3
"""Comprueba que los enlaces locales de Markdown apunten a destinos existentes."""

import re
import sys
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parent.parent
LINK = re.compile(r"(?<!!)\[[^\]]*\]\(([^\s)]+)(?:\s+[^)]*)?\)")
HEADING = re.compile(r"^#{1,6}\s+(.+?)\s*#*\s*$", re.MULTILINE)


def slug(heading: str) -> str:
    """Genera el ancla común de GitHub para encabezados Markdown."""
    value = re.sub(r"[^\w -]", "", heading.lower(), flags=re.UNICODE)
    return re.sub(r"\s+", "-", value.strip())


def check_file(path: Path) -> list[str]:
    text = path.read_text(encoding="utf-8")
    anchors = {slug(match) for match in HEADING.findall(text)}
    errors = []
    for target in LINK.findall(text):
        parsed = urlsplit(target)
        if parsed.scheme or parsed.netloc:
            continue
        raw_path = unquote(parsed.path)
        destination = (path.parent / raw_path).resolve() if raw_path else path
        try:
            destination.relative_to(ROOT)
        except ValueError:
            errors.append(f"{path.relative_to(ROOT)}: destino fuera del repositorio: {target}")
            continue
        if not destination.exists():
            errors.append(f"{path.relative_to(ROOT)}: destino inexistente: {target}")
        elif parsed.fragment and destination == path and parsed.fragment not in anchors:
            errors.append(f"{path.relative_to(ROOT)}: ancla inexistente: {target}")
    return errors


def main() -> int:
    files = sorted([*ROOT.glob("*.md"), *ROOT.glob("docs/**/*.md"), *ROOT.glob("evidence/**/*.md")])
    errors = [error for path in files for error in check_file(path)]
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    print(f"Enlaces locales válidos en {len(files)} archivos Markdown.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
