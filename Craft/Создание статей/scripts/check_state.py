# -*- coding: utf-8 -*-
"""Проверка состояния базы знаний после импорта.

Использование:
    $env:CRAFTTALK_TOKEN='<token>'
    python check_state.py config_21vek.json
    python check_state.py config_21vek.json --tree      # подробно по каждой теме
    python check_state.py config_21vek.json --report out.csv   # сгенерировать отчёт по состоянию

Отчёт `--report` пересобирает CSV по факту системы (темы из корня, статьи из дерева,
строки/ответы/примеры — из Excel). MarkupBatchId не восстанавливается (батчи разметки
API не отдаёт), при импорте он есть только в отчёте самого импорта.
"""
import csv
import json
import sys

from crafttalk_client import api, get_catalog_categories, norm

import import_from_excel as im


def load_config(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def write_state_report(cfg, out_path):
    project, catalog, src = cfg["project"], cfg["catalog_code"], cfg["ext_source"]
    excel_rows = {r["question"]: r for r in im.load_rows(cfg)}
    theme_order = {t: i for i, t in enumerate(im.ordered_themes(im.load_rows(cfg)), start=1)}
    roots_by_title = {c["Title"]: c for c in get_catalog_categories(project, catalog, "root")}

    def row_num(title):
        r = excel_rows.get(title)
        return r["row"] if r else ""

    def answer(title):
        r = excel_rows.get(title)
        return (r["answer"] or "")[:60] if r else ""

    def examples(title):
        r = excel_rows.get(title)
        return len(r["examples"]) if r else ""

    report = []
    for t, n in sorted(theme_order.items(), key=lambda kv: kv[1]):
        cat = roots_by_title.get(t)
        if not cat:
            print("!! тема не найдена в дереве:", t)
            continue
        report.append(["", t, t, "theme",
                       im.make_ext(cfg, "theme", n=n), "200",
                       cat.get("Id"), cat.get("SymbolCode"), "", "", cat.get("Status"), ""])
        kids = get_catalog_categories(project, catalog, cat["SymbolCode"])
        for k in kids:
            kt = k["Title"]
            report.append([row_num(kt), t, kt, "question",
                           im.make_ext(cfg, "question", row=row_num(kt)), "200",
                           k.get("Id"), k.get("SymbolCode"), answer(kt), examples(kt),
                           "", k.get("Status")])

    with open(out_path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["Row", "Theme", "Title", "Type", "ExtId", "HTTP", "ArticleId",
                    "SymbolCode", "Answer", "Examples", "MarkupBatchId/Status", "Error"])
        w.writerows(report)
    print("STATE REPORT: %s (%d строк)" % (out_path, len(report)))


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    cfg = load_config(sys.argv[1])
    args = sys.argv[2:]
    tree = "--tree" in args
    project, catalog, src = cfg["project"], cfg["catalog_code"], cfg["ext_source"]

    if "--report" in args:
        out = args[args.index("--report") + 1]
        write_state_report(cfg, out)

    roots = get_catalog_categories(project, catalog, "root")
    print("Корневых категорий (тем): %d" % len(roots))
    print("  из них Active: %d" % sum(1 for c in roots if c.get("Status") == "Active"))

    total_children = 0
    for c in roots:
        kids = get_catalog_categories(project, catalog, c["SymbolCode"])
        total_children += len(kids)
        if tree:
            print("  %-42s %s  детей: %d" % (c["Title"][:42], c.get("Status"), len(kids)))
    print("Вложенных статей суммарно: %d" % total_children)

    st, body = api("POST", "/article/search",
                   {"ProjectId": project, "ExtSourceId": src, "EnableRemoved": True})
    if st == 200 and isinstance(body, dict):
        arts = body.get("Articles") or []
        active = [a for a in arts if a.get("Status") == "Active"]
        draft = [a for a in arts if a.get("Status") == "Draft"]
        print("article/search по ExtSourceId=%s: всего %d (Active %d, Draft %d, прочие %d)" %
              (src, len(arts), len(active), len(draft), len(arts) - len(active) - len(draft)))
        print("  (напоминание: в поиск попадают только опубликованные статьи)")


if __name__ == "__main__":
    main()
