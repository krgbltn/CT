import argparse
import glob
import io
import os
import sys

import openpyxl

OUT_DIR = os.path.join(os.environ.get("TEMP", "."), "opencode")
SIGURD_ANCHOR = "d:/*/parsed_legal"


def find_sigurd():
    hits = glob.glob(SIGURD_ANCHOR)
    if not hits:
        sys.exit("ERROR: sigurd folder not found")
    return os.path.dirname(hits[0])


def list_files(sigurd):
    files = []
    for root, _dirs, names in os.walk(sigurd):
        for name in sorted(names):
            full = os.path.join(root, name)
            rel = os.path.relpath(full, sigurd)
            files.append((full, rel))
    files.sort(key=lambda x: x[1])
    return files


def write_out(name, text):
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, name)
    with io.open(path, "w", encoding="utf-8") as fh:
        fh.write(text)
    return path


def cmd_list(args):
    sigurd = find_sigurd()
    files = list_files(sigurd)
    lines = ["TOTAL=%d" % len(files), "ROOT=%s" % sigurd]
    for i, (_full, rel) in enumerate(files):
        lines.append("[%d] %s" % (i, rel))
    path = write_out("sigurd_files.txt", "\n".join(lines) + "\n")
    print("ok files=%d out=%s" % (len(files), path))


def clean(value):
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


def dump_xlsx(path, sheet_name, max_rows):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    try:
        out = []
        sheets = wb.worksheets
        out.append("FILE=%s" % os.path.basename(path))
        out.append("SHEETS=%s" % ", ".join(s.title for s in sheets))
        for ws in sheets:
            if sheet_name and ws.title != sheet_name:
                continue
            out.append("")
            out.append("=== SHEET: %s ===" % ws.title)
            seen = 0
            for row in ws.iter_rows(values_only=True):
                seen += 1
                cells = " || ".join(clean(c).replace("\n", "\\n").replace("\r", "") for c in row)
                out.append("[%d] %s" % (seen, cells))
                if max_rows and seen >= max_rows:
                    out.append("... (truncated at %d rows)" % max_rows)
                    break
            out.append("ROWS=%d" % seen)
        path = write_out("sigurd_dump.txt", "\n".join(out) + "\n")
        print("ok out=%s" % path)
    finally:
        wb.close()


def cmd_dump(args):
    sigurd = find_sigurd()
    files = list_files(sigurd)
    idx = args.index
    if idx < 0 or idx >= len(files):
        sys.exit("ERROR: bad index %d (files=%d)" % (idx, len(files)))
    full, _rel = files[idx]
    if not full.lower().endswith((".xlsx", ".xlsm")):
        sys.exit("ERROR: not an xlsx: %s" % full)
    dump_xlsx(full, args.sheet, args.max_rows)


def main():
    parser = argparse.ArgumentParser(description="Read Excel files from d:\\sigurd without console encoding issues.")
    sub = parser.add_subparsers(dest="cmd", required=True)
    p_list = sub.add_parser("list", help="list all files under d:\\sigurd")
    p_list.set_defaults(func=cmd_list)
    p_dump = sub.add_parser("dump", help="dump xlsx by index from --list")
    p_dump.add_argument("index", type=int)
    p_dump.add_argument("--sheet", default=None)
    p_dump.add_argument("--max-rows", type=int, default=1000)
    p_dump.set_defaults(func=cmd_dump)
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
