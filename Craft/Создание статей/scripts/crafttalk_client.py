# -*- coding: utf-8 -*-
"""Клиент External API Craft-Talk.

Единая точка доступа к API: токен из env CRAFTTALK_TOKEN, urllib (GET с body работает),
helpers для построения payload статей и парсинга ответов.

Использование:
    from crafttalk_client import api, article_payload, parse_article, norm
    status, body = api("POST", "/article/update", payload)
"""
import json
import os
import sys

from urllib import request, error

HOST = os.environ.get("CRAFTTALK_HOST", "https://cloud.craft-talk.ru/api/external")


def get_token():
    t = os.environ.get("CRAFTTALK_TOKEN", "")
    if not t:
        sys.exit("ERROR: CRAFTTALK_TOKEN env var is not set")
    return t


def _parse(raw):
    if not raw:
        return ""
    try:
        return json.loads(raw)
    except Exception:
        return raw


def api(method, path, body=None, timeout=120):
    """Отправка запроса. Возвращает (status, body).

    body распарсен из JSON (dict/list) или строка, если JSON не парсится.
    GET с телом работает (нужно для /catalog/categories).
    """
    token = get_token()
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = request.Request(
        HOST + path,
        data=data,
        method=method,
        headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"},
    )
    try:
        r = request.urlopen(req, timeout=timeout)
        return r.status, _parse(r.read().decode("utf-8"))
    except error.HTTPError as e:
        return e.code, _parse(e.read().decode("utf-8"))


def norm(s):
    """Нормализация текста: сжатие пробелов и переносов строк."""
    if s is None:
        return ""
    return " ".join(str(s).split())


def article_payload(project, catalog, ext_id, ext_source, title, parent_item_id,
                    parent_code, grand_code="root", has_children=False, answers=None,
                    questions=None, article_id=None, next_item=None):
    """Собирает тело POST /article/update.

    parent_item_id: для корневой статьи — SymbolCode каталога (classifier-...);
                    для вложенной — Id категории родителя из /catalog/categories.
    parent_code:    "root" для корневой; SymbolCode родителя (article-...) для вложенной.
    """
    payload = {
        "ExtId": ext_id,
        "ExtSourceId": ext_source,
        "ParentItemId": parent_item_id,
        "ParentCategoryCode": parent_code,
        "GrandParentCategoryCode": grand_code,
        "ParentHasChildren": bool(has_children),
        "Permissions": [{"Type": "All", "Action": "Edit", "Value": "All", "ProjectId": project}],
        "NextItem": next_item,
        "ProjectId": project,
        "CatalogCode": catalog,
        "Title": title,
        "Answers": answers or [],
        "Type": "",
        "Tags": [],
        "Parameters": [],
        "Questions": questions or [],
        "Survey": [],
        "Expanded": False,
    }
    if article_id:
        payload["Id"] = article_id
    return payload


def parse_article(body):
    """Из ответа article/update|publish достаёт (Article.Id, Article.SymbolCode)."""
    if not isinstance(body, dict):
        return None, None
    art = body.get("Article") or {}
    return art.get("Id"), art.get("SymbolCode")


def get_catalog_categories(project, catalog_code, parent_category_code="root"):
    """GET /catalog/categories. Возвращает список категорий."""
    st, body = api("GET", "/catalog/categories", {
        "ProjectId": project, "CatalogCode": catalog_code, "ParentCategoryCode": parent_category_code})
    if st != 200 or not isinstance(body, dict):
        return []
    return body.get("Categories") or []


def find_category_by_title(project, catalog_code, title, status=None):
    """Ищет категорию среди корневых по Title (опционально по Status)."""
    for cat in get_catalog_categories(project, catalog_code, "root"):
        if (cat.get("Title") or "").strip() == title:
            if status and cat.get("Status") != status:
                continue
            return cat
    return None


def find_article_by_ext(project, ext_id, ext_source, enable_removed=True):
    """Ищет статью по ExtId через search (включая удалённые)."""
    st, body = api("POST", "/article/search", {
        "ProjectId": project, "ExtId": ext_id, "ExtSourceId": ext_source, "EnableRemoved": enable_removed})
    if st != 200 or not isinstance(body, dict):
        return None
    for a in body.get("Articles") or []:
        if a.get("ExtId") == ext_id:
            return a
    return None
