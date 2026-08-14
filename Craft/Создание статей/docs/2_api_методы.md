# 2. Методы External API Craft-Talk

Базовый URL: `https://cloud.craft-talk.ru/api/external`

Авторизация: заголовок `Authorization: Bearer <token>`, `Content-Type: application/json`.
Токен передавать через env `CRAFTTALK_TOKEN` (см. `scripts/crafttalk_client.py`).

> Полные схемы всех типов — в `reference/external_v0_swagger.json`.
> Официальное описание (curl-примеры) — в `reference/официальная_документация_API.md`.

## POST /article/update — создать/обновить статью

Идемпотентность по `ExtId`+`ExtSourceId`: если статья с таким `ExtId` уже есть — обновляется; иначе создаётся.

Обязательные поля: `ParentItemId`, `ParentCategoryCode`, `GrandParentCategoryCode`,
`ParentHasChildren`, `Permissions`, `ProjectId`, `CatalogCode`, `Expanded`.

### Тело (корневая статья-тема)
```json
{
  "ExtId": "21vek-1e-t1",
  "ExtSourceId": "21vek",
  "ParentItemId": "classifier-19d9ad70-4cbc-4857-87e7-258c0af93eff",
  "ParentCategoryCode": "root",
  "GrandParentCategoryCode": "root",
  "ParentHasChildren": true,
  "Permissions": [{"Type": "All", "Action": "Edit", "Value": "All", "ProjectId": "asopov"}],
  "NextItem": null,
  "ProjectId": "asopov",
  "CatalogCode": "classifier-19d9ad70-4cbc-4857-87e7-258c0af93eff",
  "Title": "Бонусные баллы",
  "Answers": [],
  "Type": "",
  "Tags": [],
  "Parameters": [],
  "Questions": [],
  "Survey": [],
  "Expanded": false
}
```

### Тело (вложенная статья-вопрос)
```json
{
  "ExtId": "21vek-1e-q2",
  "ExtSourceId": "21vek",
  "ParentItemId": "7fe18d7a-a939-4dc3-a92c-1b42977b3a7b",        // Id категории родителя из дерева
  "ParentCategoryCode": "article-40dc0c05-2362-4d53-9b16-62b453b46bf6",
  "GrandParentCategoryCode": "root",
  "ParentHasChildren": false,
  "Permissions": [{"Type": "All", "Action": "Edit", "Value": "All", "ProjectId": "asopov"}],
  "NextItem": null,
  "ProjectId": "asopov",
  "CatalogCode": "classifier-19d9ad70-4cbc-4857-87e7-258c0af93eff",
  "Title": "Как применять бонусные баллы?",
  "Answers": [{"Id": "<uuid5>", "Text": "текст ответа", "Slots": []}],
  "Type": "",
  "Tags": [],
  "Parameters": [],
  "Questions": [],
  "Survey": [],
  "Expanded": false
}
```

Ответ: `{"Article": {...}, "Categories": [...]}`. `Article.Id`/`Article.SymbolCode` — **версия**, для вложений брать Id категории из `GET /catalog/categories`.

⚠️ Не отправляйте непустой `Questions` — продакшен падает с 500 (см. docs/3). Примеры вопросов добавляются через `/markup/add`.

## POST /article/publish — опубликовать (Draft → Active)

```json
{"ProjectId": "asopov", "ExtId": "21vek-1e-t1", "ExtSourceId": "21vek"}
```
Ответ 200 → `Article.Status = "Active"`.

## POST /article/search — поиск статей

```json
{"ProjectId": "asopov", "ExtSourceId": "21vek", "EnableRemoved": true, "EnablePayload": true}
```
Поля: `Text` (полнотекст), `ExtId`, `ExtSourceId`, `EnableRemoved`, `EnablePayload`.

⚠️ Возвращает ТОЛЬКО опубликованные (Active) статьи. Черновики проверять через дерево `GET /catalog/categories`.

## POST /article/remove — удалить (в «корзину»)

```json
{"ProjectId": "asopov", "ExtId": "...", "ExtSourceId": "21vek"}
```
или по `"Id"`. Ответ 200 → `Article.Status = "Removed"`. Повторное обновление удалённой статьи по ExtId → 400 (обновлять по `Id`).

## POST /article/deactivate — снять с публикации (Active → Inactive)

```json
{"ProjectId": "asopov", "ExtId": "...", "ExtSourceId": "21vek"}
```

## GET /catalog/catalogs — список каталогов

```json
{"ProjectId": "asopov"}   // (в реальности работает и без body)
```
Ответ — список каталогов (с `Id`, `SymbolCode`, `Name`). Пример: `reference/catalogs.json`.

## GET /catalog/categories — категории (дерево) каталога

```json
{"ProjectId": "asopov", "CatalogCode": "classifier-...", "ParentCategoryCode": "root"}
```
- `ParentCategoryCode="root"` → корневые категории.
- `ParentCategoryCode="article-<GUID>"` → вложенные в эту статью.
- Из ответа берём `Id` (для `ParentItemId` вложенных) и `SymbolCode` (для `ParentCategoryCode` вложенных).

## POST /markup/add — добавить разметку (примеры вопросов) в статью

«Примеры вопросов» = разметка интентов (подтверждено заказчиком). Добавляется к статье по её `SymbolCode`.

```json
{
  "ProjectId": "asopov",
  "Markups": [
    {"MarkupText": "как применять бонусные баллы", "IntentSymbolCode": "article-2965a1a0-658b-4ad0-b94b-f2ea0cc42e64"},
    {"MarkupText": "сколько баллов у меня накопилось", "IntentSymbolCode": "article-2965a1a0-658b-4ad0-b94b-f2ea0cc42e64"}
  ]
}
```
Ответ: `{"MarkupBatchId": "..."}`.

⚠️ Не идемпотентно: каждый вызов создаёт новый батч. При повторном прогоне импорта разметка продублируется — при необходимости удалять батчи через `markup/delete-batch` или не повторять.

## POST /markup/delete-batch — удалить батч разметки

```json
{"MarkupBatchId": "052cbc4e-5333-466a-b991-6da2ccf7fc99"}
```
Ответ: `{"Success": true}`.
