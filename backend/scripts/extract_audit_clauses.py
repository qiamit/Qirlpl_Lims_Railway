"""Extract ISO 17025 audit checklist clauses from DOCX into a TypeScript constant."""
from __future__ import annotations

import json
import re
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

DOCX = Path(r"c:\Users\qeisw\Downloads\Audit Check list - Copy.docx")
OUT_TS = Path(r"E:\Qirlpl_Lims_Demo\frontend\src\features\audit-mrm\audit-checklist\iso17025Clauses.ts")
OUT_JSON = Path(r"E:\Qirlpl_Lims_Demo\scripts\iso17025_clauses.json")

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
CLAUSE_RE = re.compile(r"^(\d+(?:\.\d+)+)$")
LETTER_RE = re.compile(r"^[a-z]$")
CHAPTER_RE = re.compile(r"^(\d+)$")


def cell_texts(tr: ET.Element) -> list[str]:
    cells: list[str] = []
    for tc in tr.findall(W + "tc"):
        texts: list[str] = []
        for t in tc.iter(W + "t"):
            texts.append(t.text or "")
        cells.append("".join(texts).strip())
    return [c for c in cells if c]


def extract_items() -> list[dict[str, str]]:
    with zipfile.ZipFile(DOCX) as z:
        root = ET.fromstring(z.read("word/document.xml"))

    tbl = list(root.iter(W + "tbl"))[0]
    items: list[dict[str, str]] = []
    current: dict[str, str] | None = None

    def flush() -> None:
        nonlocal current
        if current and current.get("clause_matter", "").strip():
            items.append(current)
        current = None

    for tr in tbl.findall(W + "tr"):
        nonempty = cell_texts(tr)
        if not nonempty:
            continue

        upper_cells = [c.upper() for c in nonempty]
        # Skip title/header rows only (exact labels), not clause text that mentions "implementation"
        if upper_cells == ["DOCUMENTATION"] or upper_cells == ["", "IMPLEMENTATION"] or upper_cells == [
            "IMPLEMENTATION"
        ]:
            continue
        if any(c.startswith("REQUIREMENTS OF ISO") for c in upper_cells):
            continue
        if CHAPTER_RE.match(nonempty[0]) and len(nonempty) >= 2 and nonempty[1].isupper():
            flush()
            continue

        clause_idx = next((i for i, c in enumerate(nonempty) if CLAUSE_RE.match(c)), None)
        if clause_idx is not None:
            flush()
            num = nonempty[clause_idx]
            matter = " ".join(nonempty[clause_idx + 1 :]).strip()
            matter = re.sub(r"(General)(The)", r"\1. \2", matter)
            current = {"clause_no": num, "clause_matter": matter}
            continue

        letter_idx = next((i for i, c in enumerate(nonempty) if LETTER_RE.match(c)), None)
        if letter_idx is not None and current is not None:
            letter = nonempty[letter_idx]
            text = " ".join(nonempty[letter_idx + 1 :]).strip()
            add = f"{letter}) {text}" if text else f"{letter})"
            if current["clause_matter"]:
                current["clause_matter"] = current["clause_matter"].rstrip(";:, ") + "; " + add
            else:
                current["clause_matter"] = add
            continue

        if current is not None and nonempty:
            extra = " ".join(nonempty).strip()
            if extra and not extra.isupper():
                current["clause_matter"] = (current["clause_matter"] + " " + extra).strip()

    flush()

    for it in items:
        it["clause_matter"] = re.sub(r"\s+", " ", it["clause_matter"]).strip()

    return items


def ts_escape(value: str) -> str:
    return (
        value.replace("\\", "\\\\")
        .replace("'", "\\'")
        .replace("\r", " ")
        .replace("\n", " ")
    )


def main() -> None:
    items = extract_items()
    nos = [it["clause_no"] for it in items]
    dupes = sorted({n for n in nos if nos.count(n) > 1})
    print("COUNT", len(items))
    print("UNIQUE", len(set(nos)))
    print("DUPES", dupes)
    print("FIRST", items[0]["clause_no"], items[0]["clause_matter"][:80])
    print("LAST", items[-1]["clause_no"], items[-1]["clause_matter"][:80])

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")

    lines = [
        "/** ISO/IEC 17025:2017 audit checklist clause template — seeded from Audit Check list DOCX. */",
        "",
        "export type Iso17025ClauseTemplate = {",
        "  clauseNo: string",
        "  clauseMatter: string",
        "}",
        "",
        "export const ISO_17025_AUDIT_CLAUSES: Iso17025ClauseTemplate[] = [",
    ]
    for it in items:
        lines.append(
            f"  {{ clauseNo: '{ts_escape(it['clause_no'])}', clauseMatter: '{ts_escape(it['clause_matter'])}' }},"
        )
    lines.extend(
        [
            "]",
            "",
            f"export const ISO_17025_AUDIT_CLAUSE_COUNT = {len(items)}",
            "",
        ]
    )
    OUT_TS.parent.mkdir(parents=True, exist_ok=True)
    OUT_TS.write_text("\n".join(lines), encoding="utf-8")
    print("WROTE", OUT_TS)


if __name__ == "__main__":
    main()
