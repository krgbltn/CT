import glob
import io
import os
import re
import sys

import openpyxl

OUT_DIR = os.path.join(os.environ.get("TEMP", "."), "opencode")
ROOT = os.path.dirname(glob.glob("d:/*/parsed_legal")[0])
SCRIPTS_DIR = os.path.join(ROOT, "готовые скрипты")

MARKER = re.compile(
    r"запрос|интеграц|Get[A-Za-z]+Info|Find[A-Za-z]+|проверяем|проверки|"
    r"идентифиц|лицевой счет|ЛС |наряд|баланс|долг|задолж|оплач|платеж|"
    r"показания|прибор|АСУСЭ|API|СМС|номер договора|номер ЛС",
    re.IGNORECASE,
)


def clean(value):
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


def dump_all():
    os.makedirs(OUT_DIR, exist_ok=True)
    index = []
    for root, _dirs, names in os.walk(SCRIPTS_DIR):
        for name in sorted(names):
            if not name.lower().endswith(".xlsx"):
                continue
            path = os.path.join(root, name)
            wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
            base = re.sub(r"[^\w\-.]+", "_", name)[:60]
            dump_name = "dump_%s.txt" % base
            hits_name = "hits_%s.txt" % base
            dump_path = os.path.join(OUT_DIR, dump_name)
            hits_path = os.path.join(OUT_DIR, hits_name)
            lines = []
            hits = []
            for ws in wb.worksheets:
                lines.append("")
                lines.append("=== SHEET: %s ===" % ws.title)
                seen = 0
                for row in ws.iter_rows(values_only=True):
                    seen += 1
                    cells = " || ".join(clean(c).replace("\n", "\\n").replace("\r", "") for c in row)
                    lines.append("[%d] %s" % (seen, cells))
                    if MARKER.search(cells):
                        hits.append("%s | [%d] %s" % (ws.title, seen, cells[:600]))
                lines.append("ROWS=%d" % seen)
            wb.close()
            with io.open(dump_path, "w", encoding="utf-8") as fh:
                fh.write("\n".join(lines) + "\n")
            with io.open(hits_path, "w", encoding="utf-8") as fh:
                fh.write("\n".join(hits) + "\n")
            index.append("%s\t%d\t%s\t%s" % (name, len(lines), dump_path, hits_path))
            print("ok %s dump_lines=%d hits=%d" % (name, len(lines), len(hits)))
    with io.open(os.path.join(OUT_DIR, "dump_index.txt"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(index) + "\n")
    print("index=%d" % len(index))


if __name__ == "__main__":
    dump_all()
